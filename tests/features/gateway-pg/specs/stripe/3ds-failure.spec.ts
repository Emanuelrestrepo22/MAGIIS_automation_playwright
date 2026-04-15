/**
 * TCs: TS-STRIPE-TC1057, TS-STRIPE-TC1051, TS-STRIPE-TC1061
 * Feature: Carrier · App Pax · Hold ON · Fallo 3DS — pop-up, red flag y reintento
 * Tags: @regression @3ds @hold @web-only
 *
 * TC1057 – Hold ON + fail3DS (4000 0000 0000 9235): pop-up de error inmediato + estado NO_AUTORIZADO + viaje fuera de "Por asignar"
 * TC1051 – mismo flujo: red flag "Validación 3DS pendiente" + botón "Reintentar" en detalle + estado "No autorizado"
 * TC1061 – fallo inicial + reintento exitoso desde detalle: viaje pasa a "Buscando conductor", red flag y botón desaparecen
 */

import { test, expect } from '../../../../TestBase';
import { loginAsDispatcher, setupTravelWithFailed3DS, TEST_DATA, STRIPE_TEST_CARDS } from '../../fixtures/gateway.fixtures';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, ThreeDSModal, ThreeDSErrorPopup, TravelDetailPage, TravelManagementPage } from '../../../../pages/carrier';

test.describe.configure({ mode: 'serial' });

test.describe('Gateway PG · Carrier · App Pax — Fallo 3DS, pop-up, detalle y reintento', () => {
	test.use({ role: 'carrier', storageState: undefined });

	test.beforeEach(async ({ page }) => {
		await loginAsDispatcher(page);
	});

	test.describe('[TS-STRIPE-TC1057] Hold ON + fail3DS (4000 0000 0000 9235) — pop-up de error inmediato, estado NO_AUTORIZADO, viaje fuera de "Por asignar"', () => {
		test('muestra pop-up de error, detalle NO_AUTORIZADO y viaje ausente en "Por asignar" tras fallo 3DS', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const preferences = new OperationalPreferencesPage(page);
			const travel = new NewTravelPage(page);
			const threeDS = new ThreeDSModal(page);
			const popup = new ThreeDSErrorPopup(page);
			const detail = new TravelDetailPage(page);
			const management = new TravelManagementPage(page);

			await test.step('Activar hold en preferencias operativas', async () => {
				await preferences.goto();
				await preferences.ensureHoldEnabled();
				await preferences.assertHoldEnabled();
			});

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('Crear viaje con tarjeta fail3DS (4000 0000 0000 9235)', async () => {
				await travel.fillMinimum({
					client: TEST_DATA.appPaxPassenger,
					passenger: TEST_DATA.appPaxPassenger,
					origin: TEST_DATA.origin,
					destination: TEST_DATA.destination,
					cardLast4: STRIPE_TEST_CARDS.fail3DS.slice(-4), // 9235
				});
				await travel.submit();
			});

			await test.step('Completar modal 3DS con fallo', async () => {
				await threeDS.waitForVisible();
				await threeDS.completeFail();
			});

			await test.step('Validar pop-up de error por fallo de autenticación 3DS', async () => {
				await popup.waitForVisible();
				const msg = await popup.getMessage();
				expect(msg).toMatch(/autenticaci[oó]n|3ds|seguridad/i);
				await popup.accept();
			});

			await test.step('Validar estado NO_AUTORIZADO en detalle del viaje', async () => {
				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
				const statusBadge = detail.statusBadge();
				await expect.soft(statusBadge).not.toContainText('Buscando conductor', { timeout: 10_000 });
				await expect.soft(statusBadge).toContainText(/No autorizado|NO_AUTORIZADO|Error/i, { timeout: 10_000 });
			});

			await test.step('Validar gestión — viaje no aparece en columna "Por asignar"', async () => {
				await management.goto();
				// TODO: agregar expectPassengerInEnConflicto() cuando exista selector estable para esa columna.
				await expect.soft(management.porAsignarColumn()).not.toContainText(TEST_DATA.appPaxPassenger, { timeout: 10_000 });
			});
		});
	});

	test.describe('[TS-STRIPE-TC1051] Hold ON + fail3DS (4000 0000 0000 9235) — red flag "Validación 3DS pendiente" y botón "Reintentar" visibles en detalle, estado "No autorizado"', () => {
		test('muestra red flag "Validacion 3DS pendiente" en la sección de forma de pago', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new TravelDetailPage(page);
			await detail.expectRedFlagVisible();
		});

		test('muestra botón "Reintentar autenticación" junto al red flag', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new TravelDetailPage(page);
			await expect(detail.retryButton()).toBeVisible({ timeout: 10_000 });
		});

		test('estado del viaje es "No autorizado" — no aparece "Buscando conductor" mientras 3DS está pendiente', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new TravelDetailPage(page);
			await detail.expectStatus('No autorizado');
			await expect(detail.statusBadge()).not.toContainText('Buscando conductor');
		});
	});

	test.describe('[TS-STRIPE-TC1061] Hold ON + fallo 3DS inicial + reintento exitoso desde detalle — viaje pasa a "Buscando conductor", red flag y botón "Reintentar" desaparecen', () => {
		test('al reintentar exitosamente el viaje pasa a "Buscando conductor"', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new TravelDetailPage(page);
			const threeDS = new ThreeDSModal(page);

			await detail.clickRetry();
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();

			await detail.expectStatus('Buscando conductor');
		});

		test('el red flag desaparece tras el reintento exitoso de 3DS', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new TravelDetailPage(page);
			const threeDS = new ThreeDSModal(page);

			await detail.clickRetry();
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();

			await detail.expectRedFlagHidden();
		});

		test('el botón "Reintentar" desaparece tras el reintento exitoso de 3DS', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new TravelDetailPage(page);
			const threeDS = new ThreeDSModal(page);

			await detail.clickRetry();
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();

			await expect(detail.retryButton()).toBeHidden({ timeout: 10_000 });
		});
	});
});
