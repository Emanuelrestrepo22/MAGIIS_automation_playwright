/**
 * TCs: TS-STRIPE-TC1053–TC1056, TC1061–TC1064
 * Feature: Alta de Viaje desde Carrier — Usuario App Pax — Tarjeta Preautorizada con 3DS
 * Tags: @smoke @critical @3ds @hold @web-only
 * Fuente: tests/specs/test-3.spec.ts (flujo de referencia grabado y validado)
 *
 * Precondiciones:
 *   - Hold activo en Configuración Parámetros (ccHoldPreviousHs=2, ccHoldCoverage=10)
 *   - Cliente/pasajero app pax 'Emanuel Restrepo' disponible en TEST
 *   - Tarjeta 4000002500003155 (3DS required — success)
 *
 * Ejecución: ENV=test npx playwright test apppax-hold-3ds -c playwright.gateway-pg.config.ts --workers=1
 */
import { expect, type Page } from '@playwright/test';
import { test } from '../../../../../TestBase';
import { DashboardPage } from '../../../../../pages/DashboardPage';
import { NewTravelPage } from '../../../../../pages/NewTravelPage';
import { OperationalPreferencesPage } from '../../../../../pages/OperationalPreferencesPage';
import { ThreeDSModal, TravelDetailPage, TravelManagementPage } from '../../../../../pages/gateway-pg';
import { loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '../../../../../fixtures/gateway.fixtures';

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

test.describe('Gateway PG · Carrier · App Pax — Hold con 3DS', () => {

	test.describe('Hold ON — autenticación 3DS exitosa', () => {

		// Debería crear un viaje con hold activo, completar 3DS con éxito,
		// y dejar el viaje en estado "Buscando conductor" visible en gestión.
		test('[TS-STRIPE-TC1053] @smoke @critical @3ds @hold hold+cobro app pax 3DS success', async ({ page }) => {
			const dashboard  = new DashboardPage(page);
			const preferences = new OperationalPreferencesPage(page);
			const travel     = new NewTravelPage(page);
			const management = new TravelManagementPage(page);
			const detail     = new TravelDetailPage(page);
			const threeDS    = new ThreeDSModal(page);

			await test.step('Login carrier', async () => {
				await loginAsDispatcher(page);
			});

			await test.step('Validar que el hold esté activado en preferencias operativas', async () => {
				await preferences.goto();
				await preferences.ensureHoldEnabled();
				await preferences.assertHoldEnabled();
			});

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('Completar formulario con tarjeta 3DS', async () => {
				await travel.fillMinimum({
					client: TEST_DATA.appPaxPassenger,
					passenger: TEST_DATA.appPaxPassenger,
					origin:    TEST_DATA.origin,
					destination: TEST_DATA.destination,
					cardLast4: STRIPE_TEST_CARDS.success3DS.slice(-4), // 3155
				});
			});

			await test.step('Aprobar modal 3DS de Stripe (validación inicial)', async () => {
				await threeDS.waitForVisible();
				await threeDS.completeSuccess();
				await threeDS.waitForHidden();
			});

			await test.step('Seleccionar vehículo y enviar el viaje', async () => {
				await travel.clickSelectVehicle();
				await travel.clickSendService();
			});

			await test.step('Aprobar 3DS adicional si aparece post-envío', async () => {
				if (await threeDS.waitForOptionalVisible(60_000)) {
					await threeDS.completeSuccess();
					await threeDS.waitForHidden();
				}
			});

			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
			const createdTravelId = extractTravelId(page.url());

			await test.step('Validar viaje en gestión — columna Por asignar', async () => {
				await management.goto();
				// Debería aparecer en "Por asignar" con el pasajero y destino correctos
				await management.expectPassengerInPorAsignar(TEST_DATA.passenger, TEST_DATA.destination);
			});

			await test.step('Abrir detalle del viaje recién creado', async () => {
				await management.openDetailForPassenger(TEST_DATA.passenger, TEST_DATA.destination);
				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
				// Debería navegar al mismo travelId creado, no a otro viaje
				expect(extractTravelId(page.url())).toBe(createdTravelId);
			});

			await test.step('Validar estado del viaje — Buscando conductor', async () => {
				// Debería mostrar estado SEARCHING_DRIVER / "Buscando conductor"
				await detail.expectStatus('Buscando conductor');
			});
		});

		test('[TS-STRIPE-TC1055] @regression @3ds @hold hold+cobro app pax 3DS success variante', async () => {
			test.fixme(true, 'PENDIENTE: segunda ejecución para validar idempotencia del flujo TC1053');
		});

		test('[TS-STRIPE-TC1061] @regression @3ds @hold hold+cobro app pax 3DS success (set 2)', async () => {
			test.fixme(true, 'PENDIENTE: variante con datos de origen/destino distintos');
		});

		test('[TS-STRIPE-TC1063] @regression @3ds @hold hold+cobro app pax 3DS success variante 2', async () => {
			test.fixme(true, 'PENDIENTE: depende de TC1053 estable');
		});

	});

	test.describe('Hold OFF — sin cobro al finalizar', () => {

		test('[TS-STRIPE-TC1054] @regression @3ds sin hold app pax 3DS success', async ({ page }) => {
			const dashboard  = new DashboardPage(page);
			const preferences = new OperationalPreferencesPage(page);
			const travel     = new NewTravelPage(page);
			const management = new TravelManagementPage(page);
			const detail     = new TravelDetailPage(page);
			const threeDS    = new ThreeDSModal(page);

			await loginAsDispatcher(page);

			try {
				await test.step('Desactivar hold en preferencias operativas', async () => {
					await disableHoldAndSave(preferences);
				});

				await test.step('Ir al formulario de nuevo viaje', async () => {
					await dashboard.openNewTravel();
					await travel.ensureLoaded();
				});

				await test.step('Completar formulario con tarjeta 3DS', async () => {
					await travel.fillMinimum({
						client: TEST_DATA.appPaxPassenger,
						passenger: TEST_DATA.appPaxPassenger,
						origin:    TEST_DATA.origin,
						destination: TEST_DATA.destination,
						cardLast4: STRIPE_TEST_CARDS.success3DS.slice(-4), // 3155
					});
				});

				await test.step('Aprobar modal 3DS de Stripe (validación inicial)', async () => {
					await threeDS.waitForVisible();
					await threeDS.completeSuccess();
					await threeDS.waitForHidden();
				});

				await test.step('Seleccionar vehículo y enviar el viaje', async () => {
					await travel.clickSelectVehicle();
					await travel.clickSendService();
				});

				await test.step('Aprobar 3DS adicional si aparece post-envío', async () => {
					if (await threeDS.waitForOptionalVisible(60_000)) {
						await threeDS.completeSuccess();
						await threeDS.waitForHidden();
					}
				});

				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
				const createdTravelId = extractTravelId(page.url());

				await test.step('Validar viaje en gestión — columna Por asignar', async () => {
					await management.goto();
					await management.expectPassengerInPorAsignar(TEST_DATA.appPaxPassenger, TEST_DATA.destination);
				});

				await test.step('Abrir detalle del viaje recién creado', async () => {
					await management.openDetailForPassenger(TEST_DATA.appPaxPassenger, TEST_DATA.destination);
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

		test('[TS-STRIPE-TC1056] @regression @3ds sin hold app pax 3DS success variante', async () => {
			test.fixme(true, 'PENDIENTE: depende de TC1054');
		});

		test('[TS-STRIPE-TC1062] @regression @3ds sin hold app pax 3DS success (set 2)', async () => {
			test.fixme(true, 'PENDIENTE: depende de TC1054');
		});

		test('[TS-STRIPE-TC1064] @regression @3ds sin hold app pax 3DS success variante 2', async () => {
			test.fixme(true, 'PENDIENTE: depende de TC1054');
		});

	});

});
