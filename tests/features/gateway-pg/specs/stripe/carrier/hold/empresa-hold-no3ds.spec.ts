/**
 * TCs: TS-STRIPE-TC1013–TC1024
 * Feature: Alta de Viaje desde Carrier — Usuario Empresa Individuo — sin 3DS
 * Tags: @regression @hold @web-only
 */
import { expect, type Page } from '@playwright/test';
import { test } from '../../../../../../TestBase';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, ThreeDSModal, TravelDetailPage, TravelManagementPage } from '../../../../../../pages/carrier';
import { expectNoThreeDSModal, loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '../../../../fixtures/gateway.fixtures';
import { PASSENGERS } from '../../../../data/passengers';

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

test.use({ role: 'carrier', storageState: undefined });

test.describe('Gateway PG · Carrier · Empresa Individuo — Hold sin 3DS', () => {

	test.describe('Hold ON', () => {
		test('[TS-STRIPE-TC1013] @smoke @hold hold+cobro empresa sin 3DS', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const preferences = new OperationalPreferencesPage(page);
			const travel = new NewTravelPage(page);
			const management = new TravelManagementPage(page);
			const detail = new TravelDetailPage(page);
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
					client: PASSENGERS.empresaIndividuo.name,
					passenger: PASSENGERS.empresaIndividuo.name,
					origin: TEST_DATA.origin,
					destination: TEST_DATA.destination,
					cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4), // 4242
				});
			});

			await test.step('Seleccionar vehiculo y enviar el viaje', async () => {
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('Verificar que no aparece modal 3DS', async () => {
				await expectNoThreeDSModal(page);
			});

			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
			const createdTravelId = extractTravelId(page.url());

			await test.step('Validar viaje en gestion — columna Por asignar', async () => {
				await management.goto();
				await management.expectPassengerInPorAsignar(PASSENGERS.empresaIndividuo.name, TEST_DATA.destination);
			});

			await test.step('Abrir detalle del viaje recien creado', async () => {
				await management.openDetailForPassenger(PASSENGERS.empresaIndividuo.name, TEST_DATA.destination);
				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
				expect(extractTravelId(page.url())).toBe(createdTravelId);
			});

			await test.step('Validar estado del viaje — Buscando conductor', async () => {
				await detail.expectStatus('Buscando conductor');
			});
		});

		test('[TS-STRIPE-TC1015] @regression @hold hold+cobro empresa sin 3DS variante', async () => {
			test.fixme(true, 'PENDIENTE: depende de TC1013');
		});

		test('[TS-STRIPE-TC1017] @regression @hold hold+cobro empresa sin 3DS (set 2)', async () => {
			test.fixme(true, 'PENDIENTE: depende de TC1013');
		});

		test('[TS-STRIPE-TC1019] @regression @hold hold+cobro empresa sin 3DS variante 2', async () => {
			test.fixme(true, 'PENDIENTE: depende de TC1013');
		});

		test('[TS-STRIPE-TC1021] @regression @hold hold+cobro empresa sin 3DS variante 3', async () => {
			test.fixme(true, 'PENDIENTE: depende de TC1013');
		});

		test('[TS-STRIPE-TC1023] @regression @hold hold+cobro empresa sin 3DS variante 4', async () => {
			test.fixme(true, 'PENDIENTE: depende de TC1013');
		});
	});

	test.describe('Hold OFF', () => {
		test('[TS-STRIPE-TC1014] @regression sin hold empresa sin 3DS', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const preferences = new OperationalPreferencesPage(page);
			const travel = new NewTravelPage(page);
			const management = new TravelManagementPage(page);
			const detail = new TravelDetailPage(page);
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
						client: PASSENGERS.empresaIndividuo.name,
						passenger: PASSENGERS.empresaIndividuo.name,
						origin: TEST_DATA.origin,
						destination: TEST_DATA.destination,
						cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4), // 4242
					});
				});

				await test.step('Seleccionar vehiculo y enviar el viaje', async () => {
					await travel.clickSelectVehicle();
					await travel.clickSendService();
				});

				await test.step('Verificar que no aparece modal 3DS', async () => {
					await expectNoThreeDSModal(page);
				});

				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
				const createdTravelId = extractTravelId(page.url());

				await test.step('Validar viaje en gestion — columna Por asignar', async () => {
					await management.goto();
					await management.expectPassengerInPorAsignar(PASSENGERS.empresaIndividuo.name, TEST_DATA.destination);
				});

				await test.step('Abrir detalle del viaje recien creado', async () => {
					await management.openDetailForPassenger(PASSENGERS.empresaIndividuo.name, TEST_DATA.destination);
					await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
					expect(extractTravelId(page.url())).toBe(createdTravelId);
				});

				await test.step('Validar estado del viaje — Buscando conductor', async () => {
					await detail.expectStatus('Buscando conductor');
				});
			} finally {
				await test.step('Restaurar hold al final del test', async () => {
					await restoreHoldAndSave(page, preferences);
				});
			}
		});

		test('[TS-STRIPE-TC1016] @regression sin hold empresa sin 3DS variante', async () => {
			test.fixme(true, 'PENDIENTE: depende de TC1014');
		});

		test('[TS-STRIPE-TC1018] @regression sin hold empresa sin 3DS (set 2)', async () => {
			test.fixme(true, 'PENDIENTE: depende de TC1014');
		});

		test('[TS-STRIPE-TC1020] @regression sin hold empresa sin 3DS variante 2', async () => {
			test.fixme(true, 'PENDIENTE: depende de TC1014');
		});

		test('[TS-STRIPE-TC1022] @regression sin hold empresa sin 3DS variante 3', async () => {
			test.fixme(true, 'PENDIENTE: depende de TC1014');
		});

		test('[TS-STRIPE-TC1024] @regression sin hold empresa sin 3DS variante 4', async () => {
			test.fixme(true, 'PENDIENTE: depende de TC1014');
		});
	});

});
