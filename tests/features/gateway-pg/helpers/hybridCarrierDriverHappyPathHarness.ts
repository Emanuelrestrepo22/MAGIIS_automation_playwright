import { expect, type Page } from '@playwright/test';
import { OperationalPreferencesPage, NewTravelPage, TravelDetailPage } from '../../../pages/carrier';
import { getDriverAppConfig } from '../../../mobile/appium/config/appiumRuntime';
import {
	DriverTripHappyPathHarness,
	type DriverTripHappyPathResult,
} from '../../../mobile/appium/harness/DriverTripHappyPathHarness';
import {
	expectNoThreeDSModal,
	loginAsDispatcher,
} from '../fixtures/gateway.fixtures';
import type { CarrierDriverHappyPathScenario } from '../data/driver-happy-path-scenarios';

export type CarrierDriverWebResult = {
	tripId: string;
	statusText: string;
};

export type CarrierDriverHappyPathResult = {
	scenario: CarrierDriverHappyPathScenario;
	web: CarrierDriverWebResult;
	mobile: DriverTripHappyPathResult | null;
};

export type CarrierDriverHappyPathRunOptions = {
	loginFirst?: boolean;
	runMobile?: boolean;
};

function extractTripIdFromUrl(url: string): string | null {
	const match = url.match(/\/travels\/([^/?#]+)/);
	return match?.[1] ?? null;
}

/**
 * Harness híbrido reutilizable:
 * 1) Alta de viaje desde Carrier web
 * 2) Cierre completo desde Driver App con checkpoints estándar
 */
export class HybridCarrierDriverHappyPathHarness {
	constructor(private readonly page: Page) {}

	async runScenario(
		scenario: CarrierDriverHappyPathScenario,
		options: CarrierDriverHappyPathRunOptions = {}
	): Promise<CarrierDriverHappyPathResult> {
		const loginFirst = options.loginFirst ?? true;
		const runMobile = options.runMobile ?? true;

		if (loginFirst) {
			await loginAsDispatcher(this.page);
		}

		const web = await this.createTripFromCarrier(scenario);
		if (!runMobile) {
			return { scenario, web, mobile: null };
		}

		const mobileHarness = new DriverTripHappyPathHarness(getDriverAppConfig());
		try {
			const mobile = await mobileHarness.runHappyPath();
			return { scenario, web, mobile };
		} finally {
			await mobileHarness.endSession();
		}
	}

	async createTripFromCarrier(scenario: CarrierDriverHappyPathScenario): Promise<CarrierDriverWebResult> {
		const preferencesPage = new OperationalPreferencesPage(this.page);
		const newTravelPage = new NewTravelPage(this.page);
		const travelDetailPage = new TravelDetailPage(this.page);

		await preferencesPage.goto();
		const holdChanged = await preferencesPage.setHoldEnabled(scenario.rules.holdEnabled);
		if (holdChanged) {
			await preferencesPage.saveAndCaptureParametersPayload();
		}

		await newTravelPage.goto();
		await newTravelPage.selectClient(scenario.client);
		if (scenario.passenger !== scenario.client) {
			await newTravelPage.selectPassenger(scenario.passenger);
		}
		await newTravelPage.assertDefaultServiceTypeRegular();
		await newTravelPage.setOrigin(scenario.origin);
		await newTravelPage.setDestination(scenario.destination);
		await newTravelPage.selectCardByLast4(scenario.cardLast4);
		await newTravelPage.submit();

		if (scenario.rules.threeDSMode === 'none') {
			await expectNoThreeDSModal(this.page);
		} else {
			// TODO: automatizar challenge 3DS "Aceptar" en harness para habilitar casos active=true.
			throw new Error(
				`[HybridCarrierDriverHappyPathHarness] threeDSMode="${scenario.rules.threeDSMode}" pending automation.`
			);
		}

		await this.page.waitForURL(/\/travels\/\w+/, { timeout: 20_000 });
		const tripId = extractTripIdFromUrl(this.page.url());
		if (!tripId) {
			throw new Error(`[HybridCarrierDriverHappyPathHarness] Trip id not found in URL: ${this.page.url()}`);
		}

		const statusBadge = travelDetailPage.getTravelStatus();
		await expect(statusBadge).toContainText(/Buscando conductor|Searching/i, { timeout: 20_000 });
		const statusText = (await statusBadge.textContent())?.trim() ?? '';

		return {
			tripId,
			statusText,
		};
	}
}
