/**
 * TCs: TS-STRIPE-TC1049–TC1052, TC1057–TC1060
 * Feature: Alta de Viaje desde Carrier — Usuario App Pax — Tarjeta Preautorizada sin 3DS
 * Tags: @regression @hold @web-only
 */
import { expect, type Page } from '@playwright/test';
import { test } from '../../../../../../TestBase';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, ThreeDSModal, TravelManagementPage } from '../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '../../../../fixtures/gateway.fixtures';

type ParametersSavePayload = {
	enableCreditCardHold?: boolean;
	ccHoldPreviousHs?: number | string;
	ccHoldCoverage?: number | string;
	[key: string]: unknown;
};

const PARAMETERS_SAVE_URL = /\/magiis-v0\.2\/carriers\/\d+\/parameters$/;

async function disableHoldAndSave(preferences: OperationalPreferencesPage): Promise<void> {
	await preferences.goto();
	const changed = await preferences.setHoldEnabled(false);

	if (changed) {
		const saveResult = await preferences.saveAndCaptureParametersPayload();
		expect(saveResult.url).toContain('/magiis-v0.2/carriers/1521/parameters');
		expect(saveResult.payload.enableCreditCardHold).toBe(false);
		expect(saveResult.payload.ccHoldPreviousHs).toBe(2);
		expect(saveResult.payload.ccHoldCoverage).toBe(10);
	}

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

type HoldNo3dsScenario = {
	client: string;
	passenger: string;
	origin: string;
	destination: string;
};

async function runHoldOnScenario(page: Page, scenario: HoldNo3dsScenario): Promise<void> {
	const dashboard = new DashboardPage(page);
	const preferences = new OperationalPreferencesPage(page);
	const travel = new NewTravelPage(page);
	const management = new TravelManagementPage(page);
	const _threeDS = new ThreeDSModal(page);

	await test.step('Login carrier', async () => {
		await loginAsDispatcher(page);
	});

	await test.step('Validar que el hold este activado en preferencias operativas', async () => {
		await preferences.goto();
		await preferences.ensureHoldEnabled();
		await preferences.assertHoldEnabled();
	});

	await test.step('Ir al formulario de nuevo viaje', async () => {
		await dashboard.openNewTravel();
		await travel.ensureLoaded();
	});

	await test.step('Completar formulario con tarjeta sin 3DS', async () => {
		await travel.fillMinimum({
			client: scenario.client,
			passenger: scenario.passenger,
			origin: scenario.origin,
			destination: scenario.destination,
			cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4),
		});
	});

	await test.step('Validar tarjeta y enviar el viaje', async () => {
		await travel.clickValidateCard();
		await travel.waitForVehicleSelectionReady();
		await travel.clickSelectVehicle();
		await travel.clickSendService();
	});

	await test.step('Verificar que no aparece modal 3DS', async () => {
		await expectNoThreeDSModal(page);
	});

	await test.step('Validar viaje en gestion - columna Por asignar', async () => {
		await management.goto();
		await management.expectPassengerInPorAsignar(scenario.passenger, undefined, 'Buscando chofer');
	});
}

async function runHoldOffScenario(page: Page, scenario: HoldNo3dsScenario): Promise<void> {
	const dashboard = new DashboardPage(page);
	const preferences = new OperationalPreferencesPage(page);
	const travel = new NewTravelPage(page);
	const management = new TravelManagementPage(page);
	const _threeDS = new ThreeDSModal(page);

	await loginAsDispatcher(page);

	try {
		await test.step('Desactivar hold en preferencias operativas', async () => {
			await disableHoldAndSave(preferences);
		});

		await test.step('Ir al formulario de nuevo viaje', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('Completar formulario con tarjeta sin 3DS', async () => {
			await travel.fillMinimum({
				client: scenario.client,
				passenger: scenario.passenger,
				origin: scenario.origin,
				destination: scenario.destination,
				cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4),
			});
		});

		await test.step('Validar tarjeta y enviar el viaje', async () => {
			await travel.clickValidateCard();
			await travel.waitForVehicleSelectionReady();
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Verificar que no aparece modal 3DS', async () => {
			await expectNoThreeDSModal(page);
		});

		await test.step('Validar viaje en gestion - columna Por asignar', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(scenario.passenger, undefined, 'Buscando chofer');
		});
	} finally {
		await test.step('Restaurar hold al final del test', async () => {
			await restoreHoldAndSave(page, preferences);
		});
	}
}

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 180_000 });

test.describe('Gateway PG · Carrier · App Pax — Hold sin 3DS', () => {

	test.describe('Hold ON', () => {
		test('[TS-STRIPE-TC1049] @smoke @hold hold+cobro app pax sin 3DS', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const preferences = new OperationalPreferencesPage(page);
			const travel = new NewTravelPage(page);
			const management = new TravelManagementPage(page);
			const _threeDS = new ThreeDSModal(page);

			await test.step('Login carrier', async () => {
				await loginAsDispatcher(page);
			});

			await test.step('Validar que el hold este activado en preferencias operativas', async () => {
				await preferences.goto();
				await preferences.ensureHoldEnabled();
				await preferences.assertHoldEnabled();
			});

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('Completar formulario con tarjeta sin 3DS', async () => {
				await travel.fillMinimum({
					client: TEST_DATA.appPaxPassenger,
					passenger: TEST_DATA.appPaxPassenger,
					origin: TEST_DATA.origin,
					destination: TEST_DATA.destination,
					cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4), // 4242
				});
			});

			await test.step('Validar tarjeta y enviar el viaje', async () => {
				await travel.clickValidateCard();
				await travel.waitForVehicleSelectionReady();
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('Verificar que no aparece modal 3DS', async () => {
				await expectNoThreeDSModal(page);
			});

				await test.step('Validar viaje en gestion — columna Por asignar', async () => {
					await management.goto();
					await management.expectPassengerInPorAsignar(TEST_DATA.passenger, undefined, 'Buscando chofer');
				});
		});

		test('[TS-STRIPE-TC1051] @regression @hold hold+cobro app pax sin 3DS variante', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: TEST_DATA.appPaxPassenger,
				passenger: TEST_DATA.appPaxPassenger,
				origin: 'Av. Corrientes 1234, Buenos Aires',
				destination: 'Av. Santa Fe 2100, Buenos Aires',
			});
		});

		test('[TS-STRIPE-TC1057] @regression @hold hold+cobro app pax sin 3DS (set 2)', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: TEST_DATA.appPaxPassenger,
				passenger: TEST_DATA.appPaxPassenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
			});
		});

		test('[TS-STRIPE-TC1059] @regression @hold hold+cobro app pax sin 3DS variante 2', async ({ page }) => {
			await runHoldOnScenario(page, {
				client: TEST_DATA.appPaxPassenger,
				passenger: TEST_DATA.appPaxPassenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
			});
		});
	});

	test.describe('Hold OFF', () => {
		test('[TS-STRIPE-TC1050] @regression sin hold app pax sin 3DS', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const preferences = new OperationalPreferencesPage(page);
			const travel = new NewTravelPage(page);
			const management = new TravelManagementPage(page);
			const _threeDS = new ThreeDSModal(page);

			await loginAsDispatcher(page);

			try {
				await test.step('Desactivar hold en preferencias operativas', async () => {
					await disableHoldAndSave(preferences);
				});

				await test.step('Ir al formulario de nuevo viaje', async () => {
					await dashboard.openNewTravel();
					await travel.ensureLoaded();
				});

				await test.step('Completar formulario con tarjeta sin 3DS', async () => {
					await travel.fillMinimum({
						client: TEST_DATA.appPaxPassenger,
						passenger: TEST_DATA.appPaxPassenger,
						origin: TEST_DATA.origin,
						destination: TEST_DATA.destination,
						cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4), // 4242
					});
				});

				await test.step('Validar tarjeta y enviar el viaje', async () => {
					await travel.clickValidateCard();
					await travel.waitForVehicleSelectionReady();
					await travel.clickSelectVehicle();
					await travel.clickSendService();
				});

				await test.step('Verificar que no aparece modal 3DS', async () => {
					await expectNoThreeDSModal(page);
				});

				await test.step('Validar viaje en gestion — columna Por asignar', async () => {
					await management.goto();
					await management.expectPassengerInPorAsignar(TEST_DATA.appPaxPassenger, undefined, 'Buscando chofer');
				});
			} finally {
				await test.step('Restaurar hold al final del test', async () => {
					await restoreHoldAndSave(page, preferences);
				});
			}
		});

		test('[TS-STRIPE-TC1052] @regression sin hold app pax sin 3DS variante', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: TEST_DATA.appPaxPassenger,
				passenger: TEST_DATA.appPaxPassenger,
				origin: 'Av. Corrientes 1234, Buenos Aires',
				destination: 'Av. Santa Fe 2100, Buenos Aires',
			});
		});

		test('[TS-STRIPE-TC1058] @regression sin hold app pax sin 3DS (set 2)', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: TEST_DATA.appPaxPassenger,
				passenger: TEST_DATA.appPaxPassenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
			});
		});

		test('[TS-STRIPE-TC1060] @regression sin hold app pax sin 3DS variante 2', async ({ page }) => {
			await runHoldOffScenario(page, {
				client: TEST_DATA.appPaxPassenger,
				passenger: TEST_DATA.appPaxPassenger,
				origin: TEST_DATA.origin,
				destination: TEST_DATA.destination,
			});
		});
	});

});
