/**
 * TCs: TS-STRIPE-TC1049–TC1052, TC1057–TC1060
 * Feature: Alta de Viaje desde Carrier — Usuario App Pax — Tarjeta Preautorizada sin 3DS
 * Tags: @regression @hold @web-only
 */
import { expect, type Page } from '@playwright/test';
import { test } from '../../../../../../../TestBase';
import { setHoldViaApi } from '../../../../../helpers/parameters-api';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, ThreeDSModal, TravelManagementPage } from '../../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '../../../../../fixtures/gateway.fixtures';

// BL-i18n/v1.72.8: el toggle de pre-autorización en la UI no habilita "Guardar" ni
// persiste (exploratory 2026-07-20). El setup fija el hold vía API.
async function disableHoldAndSave(preferences: OperationalPreferencesPage): Promise<void> {
	const params = await setHoldViaApi(preferences.getPage(), false);
	expect(params.enableCreditCardHold).toBe(false);
}

async function restoreHoldAndSave(page: Page, _preferences: OperationalPreferencesPage): Promise<void> {
	const params = await setHoldViaApi(page, true);
	expect(params.enableCreditCardHold).toBe(true);
	expect(params.ccHoldPreviousHs).toBe(2);
	expect(params.ccHoldCoverage).toBe(10);
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

	await test.step('Seleccionar vehículo y enviar el viaje', async () => {
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

		await test.step('Seleccionar vehículo y enviar el viaje', async () => {
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

test.describe('Gateway PG · Carrier · App Pax — Hold sin 3DS @gateway @stripe @hold @critical @smoke @regression', () => {

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

			await test.step('Seleccionar vehículo y enviar el viaje', async () => {
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

				await test.step('Seleccionar vehículo y enviar el viaje', async () => {
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
