/**
 * TCs: TS-STRIPE-TC1069–TC1072, TC1077–TC1080
 * Feature: Alta de Viaje desde Carrier — Usuario Empresa Individuo — con 3DS
 * Tags: @critical @3ds @hold @web-only
 */
import { expect, type Page } from '@playwright/test';
import { test } from '../../../../../../TestBase';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, ThreeDSModal, TravelDetailPage, TravelManagementPage } from '../../../../../../pages/carrier';
import { loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '../../../../fixtures/gateway.fixtures';
import { PASSENGERS } from '../../../../data/passengers';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

function extractTravelId(url: string): string {
	const match = url.match(/\/travels\/([\w-]+)/);
	if (!match) throw new Error(`No se pudo extraer el travelId desde: ${url}`);
	return match[1];
}

type ParametersSavePayload = {
	enableCreditCardHold?: boolean;
	ccHoldPreviousHs?: number | string;
	ccHoldCoverage?: number | string;
	[key: string]: unknown;
};

const PARAMETERS_SAVE_URL = /\/magiis-v0\.2\/carriers\/\d+\/parameters$/;

async function disableHoldAndSave(preferences: OperationalPreferencesPage): Promise<void> {
	await preferences.goto();
	await preferences.setHoldEnabled(false);

	const saveResult = await preferences.saveAndCaptureParametersPayload();
	expect(saveResult.url).toContain('/magiis-v0.2/carriers/1521/parameters');
	expect(saveResult.payload.enableCreditCardHold).toBe(false);
	expect(saveResult.payload.ccHoldPreviousHs).toBe(2);
	expect(saveResult.payload.ccHoldCoverage).toBe(10);

	await preferences.assertHoldDisabled();
}

async function restoreHoldAndSave(page: Page, preferences: OperationalPreferencesPage): Promise<void> {
	await preferences.goto();
	await preferences.setHoldEnabled(true);

	const responsePromise = page.waitForResponse(
		(response) => response.request().method() === 'POST' && PARAMETERS_SAVE_URL.test(response.url()),
		{ timeout: 15_000 }
	);

	await preferences.save();

	const response = await responsePromise;
	expect(response.ok()).toBeTruthy();

	const payload = response.request().postDataJSON() as ParametersSavePayload;
	expect(payload.enableCreditCardHold).toBe(true);
	expect(payload.ccHoldPreviousHs).toBe(2);
	expect(payload.ccHoldCoverage).toBe(10);

	await preferences.assertHoldEnabled();
}

type Hold3dsScenario = {
	client: string;
	passenger: string;
	origin: string;
	destination: string;
};

async function runHoldOnScenario(page: Page, scenario: Hold3dsScenario): Promise<void> {
	const dashboard = new DashboardPage(page);
	const preferences = new OperationalPreferencesPage(page);
	const travel = new NewTravelPage(page);
	const management = new TravelManagementPage(page);
	const detail = new TravelDetailPage(page);
	const threeDS = new ThreeDSModal(page);

	await loginAsDispatcher(page);

	await preferences.goto();
	await preferences.ensureHoldEnabled();
	await preferences.assertHoldEnabled();

	await dashboard.openNewTravel();
	await travel.ensureLoaded();
	await travel.fillMinimum({
		client: scenario.client,
		passenger: scenario.passenger,
		origin: scenario.origin,
		destination: scenario.destination,
		cardLast4: STRIPE_TEST_CARDS.success3DS.slice(-4),
	});

	await threeDS.waitForVisible();
	await threeDS.completeSuccess();
	await threeDS.waitForHidden();

	await travel.clickSelectVehicle();
	await travel.clickSendService();

	if (await threeDS.waitForOptionalVisible(60_000)) {
		await threeDS.completeSuccess();
		await threeDS.waitForHidden();
	}

	await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
	const createdTravelId = extractTravelId(page.url());

	await management.goto();
	await management.expectPassengerInPorAsignar(scenario.passenger, scenario.destination);
	await management.openDetailForPassenger(scenario.passenger, scenario.destination);
	await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
	expect(extractTravelId(page.url())).toBe(createdTravelId);
	await detail.expectStatus('Buscando conductor');
}

async function runHoldOffScenario(page: Page, scenario: Hold3dsScenario): Promise<void> {
	const dashboard = new DashboardPage(page);
	const preferences = new OperationalPreferencesPage(page);
	const travel = new NewTravelPage(page);
	const management = new TravelManagementPage(page);
	const detail = new TravelDetailPage(page);
	const threeDS = new ThreeDSModal(page);

	await loginAsDispatcher(page);

	try {
		await disableHoldAndSave(preferences);
		await dashboard.openNewTravel();
		await travel.ensureLoaded();
		await travel.fillMinimum({
			client: scenario.client,
			passenger: scenario.passenger,
			origin: scenario.origin,
			destination: scenario.destination,
			cardLast4: STRIPE_TEST_CARDS.success3DS.slice(-4),
		});

		await threeDS.waitForVisible();
		await threeDS.completeSuccess();
		await threeDS.waitForHidden();

		await travel.clickSelectVehicle();
		await travel.clickSendService();

		if (await threeDS.waitForOptionalVisible(60_000)) {
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();
		}

		await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
		const createdTravelId = extractTravelId(page.url());

		await management.goto();
		await management.expectPassengerInPorAsignar(scenario.passenger, scenario.destination);
		await management.openDetailForPassenger(scenario.passenger, scenario.destination);
		await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
		expect(extractTravelId(page.url())).toBe(createdTravelId);
		await detail.expectStatus('Buscando conductor');
	} finally {
		await restoreHoldAndSave(page, preferences);
	}
}

test.describe('Gateway PG · Carrier · Empresa Individuo — Hold con 3DS', () => {

  test.describe('Hold ON', () => {
    test('[TS-STRIPE-TC1069] @critical @3ds @hold hold+cobro empresa 3DS success', async ({ page }) => {
      await runHoldOnScenario(page, {
        client: PASSENGERS.empresaIndividuo.name,
        passenger: PASSENGERS.empresaIndividuo.name,
        origin: TEST_DATA.origin,
        destination: TEST_DATA.destination,
      });
    });
    test('[TS-STRIPE-TC1071] @regression @3ds @hold hold+cobro empresa 3DS variante', async ({ page }) => {
      await runHoldOnScenario(page, {
        client: PASSENGERS.empresaIndividuo.name,
        passenger: PASSENGERS.empresaIndividuo.name,
        origin: 'Av. Corrientes 1234, Buenos Aires',
        destination: 'Av. Santa Fe 2100, Buenos Aires',
      });
    });
    test('[TS-STRIPE-TC1077] @regression @3ds @hold hold+cobro empresa 3DS (set 2)', async ({ page }) => {
      await runHoldOnScenario(page, {
        client: PASSENGERS.empresaIndividuo.name,
        passenger: PASSENGERS.empresaIndividuo.name,
        origin: TEST_DATA.origin,
        destination: TEST_DATA.destination,
      });
    });
    test('[TS-STRIPE-TC1079] @regression @3ds @hold hold+cobro empresa 3DS variante 2', async ({ page }) => {
      await runHoldOnScenario(page, {
        client: PASSENGERS.empresaIndividuo.name,
        passenger: PASSENGERS.empresaIndividuo.name,
        origin: 'Florida 100, CABA',
        destination: 'Palermo Soho, CABA',
      });
    });
  });

  test.describe('Hold OFF', () => {
    test('[TS-STRIPE-TC1070] @regression @3ds sin hold empresa 3DS', async ({ page }) => {
      await runHoldOffScenario(page, {
        client: PASSENGERS.empresaIndividuo.name,
        passenger: PASSENGERS.empresaIndividuo.name,
        origin: TEST_DATA.origin,
        destination: TEST_DATA.destination,
      });
    });
    test('[TS-STRIPE-TC1072] @regression @3ds sin hold empresa 3DS variante', async ({ page }) => {
      await runHoldOffScenario(page, {
        client: PASSENGERS.empresaIndividuo.name,
        passenger: PASSENGERS.empresaIndividuo.name,
        origin: 'Av. Corrientes 1234, Buenos Aires',
        destination: 'Av. Santa Fe 2100, Buenos Aires',
      });
    });
    test('[TS-STRIPE-TC1078] @regression @3ds sin hold empresa 3DS (set 2)', async ({ page }) => {
      await runHoldOffScenario(page, {
        client: PASSENGERS.empresaIndividuo.name,
        passenger: PASSENGERS.empresaIndividuo.name,
        origin: TEST_DATA.origin,
        destination: TEST_DATA.destination,
      });
    });
    test('[TS-STRIPE-TC1080] @regression @3ds sin hold empresa 3DS variante 2', async ({ page }) => {
      await runHoldOffScenario(page, {
        client: PASSENGERS.empresaIndividuo.name,
        passenger: PASSENGERS.empresaIndividuo.name,
        origin: 'Florida 100, CABA',
        destination: 'Palermo Soho, CABA',
      });
    });
  });

});
