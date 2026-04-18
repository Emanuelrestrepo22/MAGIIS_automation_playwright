import type { AppiumDriver } from '../base/AppiumSessionBase';
import type { MobileActorConfig } from '../config/appiumRuntime';
import type { PassengerProfileMode } from '../../../features/gateway-pg/contracts/gateway-pg.types';
import { PassengerHomeScreen } from '../passenger/PassengerHomeScreen';
import { PassengerNewTripScreen } from '../passenger/PassengerNewTripScreen';
import { PassengerTripStatusScreen } from '../passenger/PassengerTripStatusScreen';
import { PassengerWalletScreen, type CardInput } from '../passenger/PassengerWalletScreen';
import { dumpAppiumState } from '../helpers/appiumDebug';
import { handleThreeDsPopup } from '../helpers/threeDsChallenge';

export type PassengerTripHappyPathResult = {
	cardLast4: string;
	tripId?: string;
	tripStatus: string;
	walletState: 'added' | 'already-present';
	driverAssigned: boolean;
	tripCompleted: boolean;
	paymentProcessed: boolean;
};

type PassengerTripHappyPathHarnessOptions = {
	profileMode?: PassengerProfileMode;
};

export type PassengerTripHappyPathOptions = {
	ensureWalletCard?: boolean;
	waitForDriverAssigned?: boolean;
	waitForTripCompleted?: boolean;
	verifyPaymentProcessed?: boolean;
	timeoutsMs?: Partial<Record<'wallet' | 'trip' | 'assigned' | 'completed' | 'payment', number>>;
};

const DEFAULT_TIMEOUTS_MS = {
	wallet: 30_000,
	trip: 60_000,
	assigned: 90_000,
	completed: 120_000,
	payment: 120_000
} as const;

const DEFAULT_PASSENGER_EMAIL = process.env.PASSENGER_EMAIL ?? 'emanuel.restrepo@yopmail.com';
const DEFAULT_PASSENGER_PASSWORD = process.env.PASSENGER_PASSWORD ?? '123';

export class PassengerTripHappyPathHarness {
	private homeScreen: PassengerHomeScreen;
	private walletScreen: PassengerWalletScreen;
	private newTripScreen: PassengerNewTripScreen;
	private statusScreen: PassengerTripStatusScreen;
	private readonly profileMode: PassengerProfileMode;

	constructor(
		private readonly config: MobileActorConfig,
		driver?: AppiumDriver,
		options: PassengerTripHappyPathHarnessOptions = {}
	) {
		this.profileMode = options.profileMode ?? 'personal';
		this.homeScreen = new PassengerHomeScreen(this.config, driver);
		this.walletScreen = new PassengerWalletScreen(this.config, driver);
		this.newTripScreen = new PassengerNewTripScreen(this.config, driver);
		this.statusScreen = new PassengerTripStatusScreen(this.config, driver);

		if (driver) {
			this.bindScreens(driver);
		}
	}

	async startSession(): Promise<void> {
		if (!this.hasSession()) {
			await this.walletScreen.startSession();
		}

		this.bindScreens(this.walletScreen.getDriver());
	}

	async endSession(): Promise<void> {
		await this.walletScreen.endSession();
	}

	getDriver(): AppiumDriver {
		return this.walletScreen.getDriver();
	}

	getWalletScreen(): PassengerWalletScreen {
		return this.walletScreen;
	}

	async ensureProfileMode(mode: PassengerProfileMode): Promise<void> {
		await this.startSession();
		await this.homeScreen.ensureProfileMode(mode);
	}

	async ensurePassengerShell(): Promise<void> {
		await this.startSession();
		await this.ensureLoggedInIfNeeded();
		await this.ensureProfileMode(this.profileMode);
	}

	async ensureWalletCard(card: CardInput, timeoutMs: number = DEFAULT_TIMEOUTS_MS.wallet): Promise<'added' | 'already-present'> {
		return this.withFailureDump('passenger-wallet-setup', async () => {
			await this.ensurePassengerShell();
			await this.walletScreen.openWallet();

			const last4 = this.getCardLast4(card);
			// Use a generous look-ahead so a slow WebView load does not produce a false negative.
			const existsBeforeAdd = await this.walletScreen.hasCard(last4, Math.max(timeoutMs, 8_000));
			if (existsBeforeAdd) {
				return 'already-present';
			}

			await this.walletScreen.tapAddCard();
			await this.walletScreen.fillCardForm(card);
			await this.walletScreen.saveCard();
			const threeDsResult = await handleThreeDsPopup(this.getDriver(), label => dumpAppiumState(this.getDriver(), label), timeoutMs, 'passenger-wallet-setup');
			if (threeDsResult === 'failed') {
				throw new Error(`PassengerTripHappyPathHarness.ensureWalletCard() - 3DS challenge was not completed: ${threeDsResult}`);
			}

			// Guard: re-check before verifyCardAdded — Stripe may have already persisted the card
			// even if the 3DS modal closed before the wallet list refreshed.
			const appearedAfter3ds = await this.walletScreen.hasCard(last4, 5_000);
			if (appearedAfter3ds) {
				return 'added';
			}

			await this.walletScreen.verifyCardAdded(last4, timeoutMs);
			return 'added';
		});
	}


	async cleanWallet(maxIterations = 50): Promise<number> {
		return this.withFailureDump('passenger-wallet-cleanup', async () => {
			await this.ensurePassengerShell();
			await this.walletScreen.openWallet();
			return this.walletScreen.deleteAllVisibleCards(maxIterations);
		});
	}

	async restartApp(): Promise<void> {
		await this.startSession();

		const appPackage = this.config.appPackage?.trim();
		if (!appPackage) {
			return;
		}

		const driver = this.getDriver() as AppiumDriver & {
			terminateApp?: (appId: string) => Promise<void>;
			activateApp?: (appId: string) => Promise<void>;
			closeApp?: () => Promise<void>;
			launchApp?: () => Promise<void>;
		};

		try {
			if (typeof driver.terminateApp === 'function') {
				await driver.terminateApp(appPackage);
			} else if (typeof driver.closeApp === 'function') {
				await driver.closeApp();
			}
		} catch {
			// If the app was already closed or termination is unsupported, keep going.
		}

		await driver.pause(1_500);

		try {
			if (typeof driver.activateApp === 'function') {
				await driver.activateApp(appPackage);
			} else if (typeof driver.launchApp === 'function') {
				await driver.launchApp();
			}
		} catch {
			throw new Error(`Passenger app restart failed for package ${appPackage}`);
		}

		await driver.pause(2_000);
	}

	async deleteWalletCard(last4: string): Promise<void> {
		await this.withFailureDump('passenger-wallet-delete', async () => {
			await this.ensurePassengerShell();
			await this.walletScreen.openWallet();
			await this.walletScreen.deleteCard(last4);
		});
	}

	async selectExistingCard(last4: string): Promise<void> {
		await this.withFailureDump('passenger-wallet-select-card', async () => {
			await this.ensurePassengerShell();
			await this.walletScreen.openWallet();
			await this.walletScreen.selectCard(last4);
		});
	}

	async createTrip(origin: string, destination: string, cardLast4: string): Promise<string | undefined> {
		return this.withFailureDump('passenger-trip-create', async () => {
			await this.ensurePassengerShell();
			await this.newTripScreen.openNewTrip();
			await this.newTripScreen.setOrigin(origin);
			await this.newTripScreen.setDestination(destination);
			await this.newTripScreen.selectPaymentCard(cardLast4);

			// Guard: si el pax tiene un viaje previo activo o en NO_AUTORIZADO, la app
			// bloquea la creación con el modal "Ya tiene un viaje creado". Se lanza como
			// ENV_BLOCKER para que la pipeline distinga entre bug real y datos sucios.
			const tripConfirmResult = await this.newTripScreen.confirmTrip();

			const blocked = await this.newTripScreen.detectTripAlreadyCreatedModal(3_000);
			if (blocked) {
				await this.newTripScreen.dismissTripAlreadyCreatedModal().catch(() => {});
				const passengerEmail = process.env.PASSENGER_EMAIL?.trim() || 'unknown-passenger';
				throw new Error(
					`ENV_BLOCKER: Passenger ${passengerEmail} has an active or NO_AUTORIZADO trip that blocks new trip creation. ` +
					'Clean up via Carrier portal before re-running.'
				);
			}

			return tripConfirmResult;
		});
	}

	async waitForDriverAssigned(timeoutMs: number = DEFAULT_TIMEOUTS_MS.assigned): Promise<void> {
		await this.withFailureDump('passenger-trip-wait-assigned', async () => {
			await this.startSession();
			await this.statusScreen.waitForDriverAssigned(timeoutMs);
		});
	}

	async waitForTripCompleted(timeoutMs: number = DEFAULT_TIMEOUTS_MS.completed): Promise<void> {
		await this.withFailureDump('passenger-trip-wait-completed', async () => {
			await this.startSession();
			await this.statusScreen.waitForTripCompleted(timeoutMs);
		});
	}

	async getTripStatus(): Promise<string> {
		await this.startSession();
		return this.statusScreen.getTripStatus();
	}

	async verifyPaymentProcessed(expectedAmount?: string, timeoutMs: number = DEFAULT_TIMEOUTS_MS.payment): Promise<void> {
		await this.withFailureDump('passenger-trip-payment-processed', async () => {
			await this.startSession();
			await this.statusScreen.verifyPaymentProcessed(expectedAmount ?? undefined, timeoutMs);
		});
	}

	async runHappyPath(card: CardInput, origin: string, destination: string, options: PassengerTripHappyPathOptions = {}): Promise<PassengerTripHappyPathResult> {
		return this.withFailureDump('passenger-trip-happy-path', async () => {
			await this.startSession();

			const timeouts = {
				...DEFAULT_TIMEOUTS_MS,
				...(options.timeoutsMs ?? {})
			};

			const walletState = options.ensureWalletCard === false ? 'already-present' : await this.ensureWalletCard(card, timeouts.wallet);

			const cardLast4 = this.getCardLast4(card);
			const tripId = await this.createTrip(origin, destination, cardLast4);

			let driverAssigned = false;
			if (options.waitForDriverAssigned ?? true) {
				await this.waitForDriverAssigned(timeouts.assigned);
				driverAssigned = true;
			}

			let tripCompleted = false;
			if (options.waitForTripCompleted ?? true) {
				await this.waitForTripCompleted(timeouts.completed);
				tripCompleted = true;
			}

			let paymentProcessed = false;
			if (options.verifyPaymentProcessed ?? true) {
				await this.verifyPaymentProcessed(undefined, timeouts.payment);
				paymentProcessed = true;
			}

			return {
				cardLast4,
				tripId,
				tripStatus: await this.getTripStatus(),
				walletState,
				driverAssigned,
				tripCompleted,
				paymentProcessed
			};
		});
	}

	private bindScreens(driver: AppiumDriver): void {
		this.homeScreen = new PassengerHomeScreen(this.config, driver);
		this.walletScreen = new PassengerWalletScreen(this.config, driver);
		this.newTripScreen = new PassengerNewTripScreen(this.config, driver);
		this.statusScreen = new PassengerTripStatusScreen(this.config, driver);
	}

	private getLoginCredentials(): { email: string; password: string } {
		const email = DEFAULT_PASSENGER_EMAIL.trim();
		const password = DEFAULT_PASSENGER_PASSWORD.trim();

		if (!email || !password) {
			throw new Error('Passenger login credentials are missing. Set PASSENGER_EMAIL and PASSENGER_PASSWORD.');
		}

		return { email, password };
	}

	private isLoginUrl(url: string): boolean {
		return url.includes('/login') || url.includes('invalid_token=true');
	}

	private async switchToWebView(driver: AppiumDriver, timeoutMs = 10_000): Promise<string | null> {
		const deadline = Date.now() + timeoutMs;

		while (Date.now() < deadline) {
			const contexts = (await driver.getContexts()) as string[];
			const webview = contexts.find(context => context.startsWith('WEBVIEW'));
			if (webview) {
				await driver.switchContext(webview);
				return webview;
			}

			await driver.pause(250);
		}

		return null;
	}

	private async closeExpiredModalIfPresent(driver: AppiumDriver): Promise<string> {
		return driver
			.execute<string, []>(() => {
				const modal = Array.from(document.querySelectorAll('ion-modal')).find(el => (el.textContent ?? '').includes('Su sesión ha expirado'));
				if (!modal) {
					return 'no-modal';
				}

				const buttons = Array.from(document.querySelectorAll('button, ion-button, [role="button"]'));
				const aceptar = buttons.find(el => el.textContent?.trim() === 'Aceptar') as HTMLElement | undefined;
				if (aceptar) {
					aceptar.click();
					return 'clicked-aceptar';
				}

				return 'modal-without-aceptar';
			})
			.catch(() => 'error');
	}

	private async fillLoginAndSubmit(driver: AppiumDriver, email: string, password: string): Promise<string> {
		return driver
			.execute<string, [string, string]>(
				(loginEmail: string, loginPassword: string): string => {
					const emailInput = document.querySelector('input[type="email"], input[placeholder="Email"]') as HTMLInputElement | null;
					const passwordInput = document.querySelector('input[type="password"], input[placeholder="Contraseña"]') as HTMLInputElement | null;

					if (!emailInput || !passwordInput) {
						return 'missing-fields';
					}

					const setValue = (el: HTMLInputElement, value: string): void => {
						const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
						setter?.call(el, value);
						el.dispatchEvent(new Event('input', { bubbles: true }));
						el.dispatchEvent(new Event('change', { bubbles: true }));
					};

					setValue(emailInput, loginEmail);
					setValue(passwordInput, loginPassword);

					const buttons = Array.from(document.querySelectorAll('button, ion-button, [role="button"]'));
					const submit = buttons.find(el => {
						const text = el.textContent?.trim();
						return text === 'Ingresar' || text === 'Entrar' || text === 'Login' || text === 'Iniciar sesión';
					}) as HTMLElement | undefined;

					if (submit) {
						submit.click();
						return 'clicked-submit';
					}

					return 'fields-filled-no-button';
				},
				email,
				password
			)
			.catch((error: Error) => `error:${error.message}`);
	}

	private async waitForPassengerHomeUrl(driver: AppiumDriver, timeoutMs = 20_000): Promise<string> {
		const deadline = Date.now() + timeoutMs;
		let lastUrl = '';

		while (Date.now() < deadline) {
			await driver.pause(1_500);
			lastUrl = await driver.execute<string, []>(() => window.location.href).catch(() => '');
			if (lastUrl.includes('/navigator/HomePage')) {
				return lastUrl;
			}
		}

		return lastUrl;
	}

	private async ensureLoggedInIfNeeded(): Promise<void> {
		const driver = this.walletScreen.getDriver();
		const webview = await this.switchToWebView(driver);
		if (!webview) {
			return;
		}

		await driver.pause(1_500);
		let url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
		if (!this.isLoginUrl(url)) {
			return;
		}

		const modalResult = await this.closeExpiredModalIfPresent(driver);
		if (modalResult === 'clicked-aceptar') {
			await driver.pause(1_200);
		}

		const { email, password } = this.getLoginCredentials();
		const loginResult = await this.fillLoginAndSubmit(driver, email, password);
		if (loginResult.startsWith('error:') || loginResult === 'missing-fields') {
			throw new Error(`Passenger login bootstrap failed: ${loginResult}`);
		}

		url = await this.waitForPassengerHomeUrl(driver);
		if (this.isLoginUrl(url)) {
			throw new Error('Passenger app stayed on login after submitting credentials');
		}
	}

	private hasSession(): boolean {
		try {
			this.walletScreen.getDriver();
			return true;
		} catch {
			return false;
		}
	}

	private getCardLast4(card: CardInput): string {
		return card.number.replace(/\D/g, '').slice(-4);
	}

	private async withFailureDump<T>(label: string, run: () => Promise<T>): Promise<T> {
		try {
			return await run();
		} catch (error) {
			let driver: AppiumDriver | null = null;
			try {
				driver = this.walletScreen.getDriver();
			} catch {
				driver = null;
			}

			const dumpPath = driver ? await dumpAppiumState(driver, label).catch(() => null) : null;
			const dumpMessage = dumpPath ? ` Appium dump: ${dumpPath}` : '';
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`[PassengerTripHappyPathHarness] ${message}.${dumpMessage}`);
		}
	}
}
