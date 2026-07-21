/**
 * DriverCargoDeclineHarness
 * =========================
 * Orquesta la FASE DRIVER APP (Appium, dispositivo físico) del E2E híbrido
 * "Cargo a Bordo — decline/antifraud". Espeja el happy-path harness hasta el
 * checkpoint `resume`, y luego ejecuta el cobro Cargo a Bordo con una tarjeta
 * declinada, devolviendo el `PaymentOutcome` para que el spec haga el assert.
 *
 * Reutiliza los screens de flujo YA verificados en device (dumps 2026-04):
 *   DriverHomeScreen · DriverTripRequestScreen · DriverTripNavigationScreen · DriverTripSummaryScreen
 * y el screen bajo validación DriverTripPaymentScreen (modal Ionic nativo).
 *
 * La interacción específica de Cargo a Bordo en travel-resume (seleccionar el
 * método CREDIT_CARD por su icono + tap "Ingresar tarjeta") vive AQUÍ vía
 * driver.execute + click real, para NO modificar los screens verificados.
 *
 * Fuente del comportamiento (magiis-mobile-driver-v2):
 *   - travel-resume.html: `.travel-payment button.payment` (icon-only, ion-icon
 *     src=".../{VALUE}-black|white.svg"); footer `button.btn.finish` cuyo texto
 *     pasa a "Ingresar tarjeta" (travel_resume.enter_card) al elegir CREDIT_CARD.
 *   - travel-resume.ts closeTravel() → CREDIT_CARD → payTravelCreditCard() abre
 *     el modal CreditCardPaymentDataComponent.
 */

import type { AppiumDriver } from '../base/AppiumSessionBase';
import type { MobileActorConfig } from '../config/appiumRuntime';
import { DriverHomeScreen } from '../driver/DriverHomeScreen';
import { DriverTripRequestScreen } from '../driver/DriverTripRequestScreen';
import { DriverTripNavigationScreen } from '../driver/DriverTripNavigationScreen';
import { DriverTripSummaryScreen } from '../driver/DriverTripSummaryScreen';
import { DriverTripPaymentScreen, type CardData, type PaymentOutcome } from '../driver/DriverTripPaymentScreen';
import { dumpAppiumState } from '../helpers/appiumDebug';

export type DriverCargoDeclineResult = {
	outcome: PaymentOutcome;
	totalAmount: string;
	reachedPaymentModal: boolean;
};

export type DriverCargoDeclineOptions = {
	ensureDriverOnline?: boolean;
	/** Timeout para que el viaje llegue al conductor (TravelConfirmPage). */
	confirmTimeoutMs?: number;
};

const DEFAULTS = {
	confirmTimeoutMs: 90_000,
	inProgressTimeoutMs: 60_000,
	resumeTimeoutMs: 60_000,
	paymentModalTimeoutMs: 30_000,
	outcomeTimeoutMs: 30_000,
} as const;

export class DriverCargoDeclineHarness {
	private readonly home: DriverHomeScreen;
	private request: DriverTripRequestScreen | null = null;
	private navigation: DriverTripNavigationScreen | null = null;
	private summary: DriverTripSummaryScreen | null = null;
	private payment: DriverTripPaymentScreen | null = null;

	constructor(
		private readonly config: MobileActorConfig,
		driver?: AppiumDriver,
	) {
		this.home = new DriverHomeScreen(this.config, driver);
		if (driver) this.bind(driver);
	}

	async startSession(): Promise<void> {
		if (!this.hasSession()) {
			await this.home.startSession();
		}
		this.bind(this.home.getDriver());
	}

	async endSession(): Promise<void> {
		await this.home.endSession();
	}

	/**
	 * Recorre online → aceptar → navegar → finalizar → resume, y ejecuta el cobro
	 * Cargo a Bordo con la tarjeta declinada. Devuelve el outcome del cobro.
	 */
	async runDeclinePhase(card: CardData, options: DriverCargoDeclineOptions = {}): Promise<DriverCargoDeclineResult> {
		await this.startSession();
		const ensureOnline = options.ensureDriverOnline ?? true;
		const confirmTimeout = options.confirmTimeoutMs ?? DEFAULTS.confirmTimeoutMs;
		let reachedPaymentModal = false;

		try {
			// 0. Disponibilidad.
			if (ensureOnline && !(await this.home.isDriverOnline())) {
				await this.home.goOnline();
			}

			// 1. Recibir + aceptar el viaje (TravelConfirmPage → Aceptar/Buscar Pasajero).
			const confirmReached = await this.getRequest().waitForTripConfirmPage(confirmTimeout);
			if (!confirmReached) {
				throw new Error(
					`No llegó ningún viaje al conductor (TravelConfirmPage) en ${confirmTimeout}ms. ` +
					`Verificar que la fase web creó el viaje Cargo a Bordo y que el dispatch lo asignó a este driver.`,
				);
			}
			await this.getRequest().acceptTrip();

			// 2. Iniciar viaje → en progreso.
			await this.getNavigation().startTrip();
			const inProgress = await this.getNavigation().waitForTravelInProgressPage(DEFAULTS.inProgressTimeoutMs);
			if (!inProgress) throw new Error('No se alcanzó TravelInProgressPage tras iniciar el viaje.');

			// 3. Finalizar viaje → resumen.
			await this.getNavigation().endTrip();
			await this.getNavigation().confirmEndTripPopup();
			const resume = await this.getSummary().waitForSummaryScreen(DEFAULTS.resumeTimeoutMs);
			if (!resume) throw new Error('No se alcanzó TravelResumePage tras finalizar el viaje.');

			const totalAmount = await this.getSummary().getTotalAmount().catch(() => '');

			// 4. Cargo a Bordo: seleccionar método CREDIT_CARD + tap "Ingresar tarjeta".
			const selected = await this.selectCreditCardMethod();
			if (!selected) {
				throw new Error(
					'No se encontró el método de pago CREDIT_CARD (Cargo a Bordo) en el resumen. ' +
					'Revisar paymentSettings del viaje (¿CREDIT_CARD habilitado?).',
				);
			}
			await this.tapEnterCardButton();

			// 5. Modal de cobro Ionic → llenar tarjeta declinada → cobrar.
			const modalReady = await this.getPayment().waitForPaymentScreen(DEFAULTS.paymentModalTimeoutMs);
			if (!modalReady) {
				throw new Error('No apareció el modal de cobro (#cardNumber) tras "Ingresar tarjeta".');
			}
			reachedPaymentModal = true;

			const outcome = await this.getPayment().fillAndSubmit(card, DEFAULTS.outcomeTimeoutMs);
			// Cerrar el alert de decline (Salir) para dejar la app estable.
			if (outcome.status === 'declined') {
				await this.getPayment().dismissAttentionModal().catch(() => false);
			}

			return { outcome, totalAmount, reachedPaymentModal };
		} catch (error) {
			const dumpPath = await dumpAppiumState(this.home.getDriver(), 'driver-cargo-decline-failure').catch(() => null);
			const suffix = dumpPath ? ` Appium dump: ${dumpPath}` : '';
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`[DriverCargoDeclineHarness] ${message}.${suffix}`);
		}
	}

	// --- Cargo a Bordo · interacción de travel-resume (source-derived) ---------

	/**
	 * Selecciona el método de pago CREDIT_CARD (Cargo a Bordo) en el resumen.
	 * Los botones son icon-only: `.travel-payment button.payment` con
	 * `<ion-icon src=".../{VALUE}-black|white.svg">`. Elegimos el que apunta a CREDIT_CARD.
	 * Requiere click real (Angular): iteramos con WebdriverIO $$.
	 */
	private async selectCreditCardMethod(): Promise<boolean> {
		const driver = this.home.getDriver();
		await this.switchToWebView();

		const buttons = await driver.$$('app-travel-resume .travel-payment button.payment, .travel-payment button.payment');
		for (const btn of buttons) {
			const visible = await btn.isDisplayed().catch(() => false);
			if (!visible) continue;
			const iconSrc = await btn.$('ion-icon').getAttribute('src').catch(() => '');
			if (/CREDIT_CARD/i.test(iconSrc ?? '')) {
				await btn.click();
				await driver.pause(2_000); // changePaymentMethod → calculateCost (loading)
				return true;
			}
		}
		return false;
	}

	/**
	 * Tap en el botón de cierre del resumen, cuyo texto pasa a "Ingresar tarjeta"
	 * al elegir CREDIT_CARD. Abre el modal CreditCardPaymentDataComponent.
	 */
	private async tapEnterCardButton(): Promise<void> {
		const driver = this.home.getDriver();
		await this.switchToWebView();

		const ENTER_CARD_TEXTS = ['Ingresar tarjeta', 'Ingresar Tarjeta'];
		// El botón físico es footer `button.btn.finish`; su texto es labelButtonClose.
		const candidates = await driver.$$('ion-footer button.btn.finish, button.btn.finish');
		for (const btn of candidates) {
			const visible = await btn.isDisplayed().catch(() => false);
			if (!visible) continue;
			const text = (await btn.getText().catch(() => '')).trim();
			if (ENTER_CARD_TEXTS.some((t) => text.toLowerCase() === t.toLowerCase()) || /ingresar/i.test(text)) {
				await btn.click();
				await driver.pause(2_000);
				return;
			}
		}
		// Fallback: cualquier button.btn.finish visible (el único footer del resume).
		for (const btn of candidates) {
			if (await btn.isDisplayed().catch(() => false)) {
				await btn.click();
				await driver.pause(2_000);
				return;
			}
		}
		throw new Error('[DriverCargoDeclineHarness] Botón "Ingresar tarjeta" (button.btn.finish) no encontrado en el resumen.');
	}

	private async switchToWebView(): Promise<void> {
		const driver = this.home.getDriver();
		const contexts = (await driver.getContexts().catch(() => [])) as string[];
		const webview = contexts.find((c) => c.startsWith('WEBVIEW'));
		if (webview) await driver.switchContext(webview);
	}

	// --- plumbing --------------------------------------------------------------

	private hasSession(): boolean {
		try {
			this.home.getDriver();
			return true;
		} catch {
			return false;
		}
	}

	private bind(driver: AppiumDriver): void {
		this.request = new DriverTripRequestScreen(this.config, driver);
		this.navigation = new DriverTripNavigationScreen(this.config, driver);
		this.summary = new DriverTripSummaryScreen(this.config, driver);
		this.payment = new DriverTripPaymentScreen(this.config, driver);
	}

	private getRequest(): DriverTripRequestScreen {
		if (!this.request) this.bind(this.home.getDriver());
		return this.request!;
	}

	private getNavigation(): DriverTripNavigationScreen {
		if (!this.navigation) this.bind(this.home.getDriver());
		return this.navigation!;
	}

	private getSummary(): DriverTripSummaryScreen {
		if (!this.summary) this.bind(this.home.getDriver());
		return this.summary!;
	}

	private getPayment(): DriverTripPaymentScreen {
		if (!this.payment) this.bind(this.home.getDriver());
		return this.payment!;
	}
}

/**
 * Entry point para la fase driver desde un spec Playwright (mismo patrón que
 * HybridCarrierDriverHappyPathHarness). Abre sesión Appium, ejecuta la fase
 * decline y cierra la sesión.
 */
export async function runDriverCargoDeclinePhase(
	config: MobileActorConfig,
	card: CardData,
	options: DriverCargoDeclineOptions = {},
): Promise<DriverCargoDeclineResult> {
	const harness = new DriverCargoDeclineHarness(config);
	try {
		return await harness.runDeclinePhase(card, options);
	} finally {
		await harness.endSession().catch(() => undefined);
	}
}
