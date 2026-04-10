import type { AppiumDriver } from '../base/AppiumSessionBase';
import type { MobileActorConfig } from '../config/appiumRuntime';
import {
	DRIVER_CHECKPOINT_SELECTORS,
	type DriverCheckpointStage,
} from '../driver/DriverFlowSelectors';
import { DriverHomeScreen } from '../driver/DriverHomeScreen';
import { DriverTripNavigationScreen } from '../driver/DriverTripNavigationScreen';
import { DriverTripRequestScreen } from '../driver/DriverTripRequestScreen';
import { DriverTripSummaryScreen } from '../driver/DriverTripSummaryScreen';
import { dumpAppiumState } from '../helpers/appiumDebug';

export type DriverCheckpointEvidence = {
	stage: DriverCheckpointStage;
	url: string;
	matchedBy: string;
	observedAt: string;
};

export type DriverTripHappyPathResult = {
	checkpoints: DriverCheckpointEvidence[];
	totalAmount: string;
	paymentMethod: string;
};

export type DriverTripHappyPathOptions = {
	ensureDriverOnline?: boolean;
	timeoutsMs?: Partial<Record<DriverCheckpointStage, number>>;
};

const DEFAULT_TIMEOUTS_MS: Record<DriverCheckpointStage, number> = {
	confirm: 60_000,
	'in-progress': 60_000,
	resume: 60_000,
	closed: 60_000,
};

export class DriverTripHappyPathHarness {
	private readonly homeScreen: DriverHomeScreen;
	private requestScreen: DriverTripRequestScreen | null = null;
	private navigationScreen: DriverTripNavigationScreen | null = null;
	private summaryScreen: DriverTripSummaryScreen | null = null;

	constructor(
		private readonly config: MobileActorConfig,
		driver?: AppiumDriver,
	) {
		this.homeScreen = new DriverHomeScreen(this.config, driver);
		if (driver) {
			this.bindScreens(driver);
		}
	}

	async startSession(): Promise<void> {
		if (!this.hasSession()) {
			await this.homeScreen.startSession();
		}
		this.bindScreens(this.homeScreen.getDriver());
	}

	async endSession(): Promise<void> {
		await this.homeScreen.endSession();
	}

	async runHappyPath(options: DriverTripHappyPathOptions = {}): Promise<DriverTripHappyPathResult> {
		await this.startSession();
		const ensureDriverOnline = options.ensureDriverOnline ?? true;
		const checkpoints: DriverCheckpointEvidence[] = [];
		const timeouts = {
			...DEFAULT_TIMEOUTS_MS,
			...(options.timeoutsMs ?? {}),
		};

		try {
			if (ensureDriverOnline && !(await this.homeScreen.isDriverOnline())) {
				await this.homeScreen.goOnline();
			}

			const confirmReached = await this.getRequestScreen().waitForTripConfirmPage(timeouts.confirm);
			if (!confirmReached) {
				throw new Error(`Checkpoint "confirm" not reached in ${timeouts.confirm}ms.`);
			}
			checkpoints.push(await this.waitForCheckpoint('confirm', 5_000));
			await this.getRequestScreen().acceptTrip();

			await this.getNavigationScreen().startTrip();
			const inProgressReached = await this.getNavigationScreen().waitForTravelInProgressPage(timeouts['in-progress']);
			if (!inProgressReached) {
				throw new Error(`Checkpoint "in-progress" not reached in ${timeouts['in-progress']}ms.`);
			}
			checkpoints.push(await this.waitForCheckpoint('in-progress', 5_000));

			await this.getNavigationScreen().endTrip();
			await this.getNavigationScreen().confirmEndTripPopup();
			const resumeReached = await this.getSummaryScreen().waitForSummaryScreen(timeouts.resume);
			if (!resumeReached) {
				throw new Error(`Checkpoint "resume" not reached in ${timeouts.resume}ms.`);
			}
			checkpoints.push(await this.waitForCheckpoint('resume', 5_000));

			const totalAmount = await this.getSummaryScreen().getTotalAmount();
			const paymentMethod = await this.getSummaryScreen().getActivePaymentMethod();

			await this.getSummaryScreen().confirmAndFinish();
			const closedReached = await this.homeScreen.waitForClosedCheckpoint(timeouts.closed);
			if (!closedReached) {
				throw new Error(`Checkpoint "closed" not reached in ${timeouts.closed}ms.`);
			}
			checkpoints.push(await this.waitForCheckpoint('closed', 5_000));

			return {
				checkpoints,
				totalAmount,
				paymentMethod,
			};
		} catch (error) {
			const dumpPath = await dumpAppiumState(this.homeScreen.getDriver(), 'driver-happy-path-failure').catch(() => null);
			const dumpMessage = dumpPath ? ` Appium dump: ${dumpPath}` : '';
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`[DriverTripHappyPathHarness] ${message}.${dumpMessage}`);
		}
	}

	private hasSession(): boolean {
		try {
			this.homeScreen.getDriver();
			return true;
		} catch {
			return false;
		}
	}

	private bindScreens(driver: AppiumDriver): void {
		this.requestScreen = new DriverTripRequestScreen(this.config, driver);
		this.navigationScreen = new DriverTripNavigationScreen(this.config, driver);
		this.summaryScreen = new DriverTripSummaryScreen(this.config, driver);
	}

	private getRequestScreen(): DriverTripRequestScreen {
		if (!this.requestScreen) {
			this.bindScreens(this.homeScreen.getDriver());
		}
		return this.requestScreen!;
	}

	private getNavigationScreen(): DriverTripNavigationScreen {
		if (!this.navigationScreen) {
			this.bindScreens(this.homeScreen.getDriver());
		}
		return this.navigationScreen!;
	}

	private getSummaryScreen(): DriverTripSummaryScreen {
		if (!this.summaryScreen) {
			this.bindScreens(this.homeScreen.getDriver());
		}
		return this.summaryScreen!;
	}

	private async waitForCheckpoint(
		stage: DriverCheckpointStage,
		timeoutMs: number,
	): Promise<DriverCheckpointEvidence> {
		const driver = this.homeScreen.getDriver();
		const checkpoint = DRIVER_CHECKPOINT_SELECTORS[stage];
		const deadline = Date.now() + timeoutMs;

		while (Date.now() < deadline) {
			const url = await this.getCurrentWebUrl();
			const matchedToken = checkpoint.urlTokens.find((token) => url.includes(token));
			if (matchedToken) {
				return {
					stage,
					url,
					matchedBy: `url:${matchedToken}`,
					observedAt: new Date().toISOString(),
				};
			}

			const matchedSelector = await this.findVisibleSelector(checkpoint.webSelectors);
			if (matchedSelector) {
				return {
					stage,
					url,
					matchedBy: `selector:${matchedSelector}`,
					observedAt: new Date().toISOString(),
				};
			}

			await driver.pause(500);
		}

		const lastUrl = await this.getCurrentWebUrl();
		throw new Error(
			`Checkpoint "${stage}" not reached in ${timeoutMs}ms. Last URL: ${lastUrl || '<unavailable>'}`
		);
	}

	private async getCurrentWebUrl(): Promise<string> {
		const driver = this.homeScreen.getDriver();
		const contexts = (await driver.getContexts().catch(() => [])) as string[];
		const webview = contexts.find((context) => context.startsWith('WEBVIEW'));

		if (!webview) {
			return '';
		}

		await driver.switchContext(webview);
		return await driver.execute<string, []>(() => window.location.href).catch(() => '');
	}

	private async findVisibleSelector(selectors: string[]): Promise<string | null> {
		const driver = this.homeScreen.getDriver();

		for (const selector of selectors) {
			const visible = await driver.$(selector).isDisplayed().catch(() => false);
			if (visible) {
				return selector;
			}
		}

		return null;
	}
}
