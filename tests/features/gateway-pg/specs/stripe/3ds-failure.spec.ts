/**
 * MAGIIS - gateway-pg
 * Suite: Fallo 3DS + Reintento
 * TCs: TC04, TC05, TC06
 * Flujo: B - Fallo 3DS + reintento
 */

import { test, expect } from '../../../../TestBase';
import { loginAsDispatcher, setupTravelWithFailed3DS, TEST_DATA, STRIPE_TEST_CARDS } from '../../fixtures/gateway.fixtures';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, ThreeDSModal, ThreeDSErrorPopup, TravelDetailPage, TravelManagementPage } from '../../../../pages/carrier';

test.describe.configure({ mode: 'serial' });

test.describe('[gateway][stripe] Fallo 3DS - pop-up, detalle y reintento', () => {
	test.use({ role: 'carrier', storageState: undefined });

	test.beforeEach(async ({ page }) => {
		await loginAsDispatcher(page);
	});

	test.describe('[TC04] Fallo 3DS - notificacion inmediata al dispatcher', () => {
		test('Muestra pop-up de error, detalle y gestión tras el fallo del 3DS', async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const preferences = new OperationalPreferencesPage(page);
			const travel = new NewTravelPage(page);
			const threeDS = new ThreeDSModal(page);
			const popup = new ThreeDSErrorPopup(page);
			const detail = new TravelDetailPage(page);
			const management = new TravelManagementPage(page);

			await test.step('[TC04][STEP-01] Activar hold en preferencias operativas', async () => {
				await preferences.goto();
				await preferences.ensureHoldEnabled();
				await preferences.assertHoldEnabled();
			});

			await test.step('[TC04][STEP-02] Ir al formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('[TC04][STEP-03] Crear viaje con tarjeta fail3DS', async () => {
				await travel.fillMinimum({
					client: TEST_DATA.appPaxPassenger,
					passenger: TEST_DATA.appPaxPassenger,
					origin: TEST_DATA.origin,
					destination: TEST_DATA.destination,
					cardLast4: STRIPE_TEST_CARDS.fail3DS.slice(-4),
				});
				await travel.submit();
			});

			await test.step('[TC04][STEP-04] Completar el modal 3DS con fallo', async () => {
				await threeDS.waitForVisible();
				await threeDS.completeFail();
			});

			await test.step('[TC04][STEP-05] Validar pop-up de error por fallo 3DS', async () => {
				await popup.waitForVisible();
				const msg = await popup.getMessage();
				expect(msg).toMatch(/autenticaci[oó]n|3ds|seguridad/i);
				await popup.accept();
			});

			await test.step('[TC04][STEP-06] Validar detalle NO_AUTORIZADO o Error visible', async () => {
				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
				const statusBadge = detail.statusBadge();
				await expect.soft(statusBadge).not.toContainText('Buscando conductor', { timeout: 10_000 });
				await expect.soft(statusBadge).toContainText(/No autorizado|NO_AUTORIZADO|Error/i, { timeout: 10_000 });
			});

			await test.step('[TC04][STEP-07] Validar gestión: no debe quedar en Por asignar', async () => {
				await management.goto();
				// TODO: agregar expectPassengerInEnConflicto() cuando exista selector estable para esa columna.
				await expect.soft(management.porAsignarColumn()).not.toContainText(TEST_DATA.appPaxPassenger, { timeout: 10_000 });
			});
		});

	});

	test.describe('[TC05] Red flag y boton en detalle tras fallo 3DS', () => {
		test('Muestra red flag "Validacion 3DS pendiente" en forma de pago', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new TravelDetailPage(page);
			await detail.expectRedFlagVisible();
		});

		test('Muestra boton "Reintentar autenticacion" junto al red flag', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new TravelDetailPage(page);
			await expect(detail.retryButton()).toBeVisible({ timeout: 10_000 });
		});

		test('No muestra el viaje en "Buscando conductor" mientras esta NO_AUTORIZADO', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new TravelDetailPage(page);
			await detail.expectStatus('No autorizado');
			await expect(detail.statusBadge()).not.toContainText('Buscando conductor');
		});
	});

	test.describe('[TC06] Reintento exitoso de 3DS desde detalle del viaje', () => {
		test('Al reintentar exitosamente el viaje pasa a Buscando conductor', async ({ page }) => {
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

		test('El red flag desaparece tras el reintento exitoso', async ({ page }) => {
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

		test('El boton "Reintentar" desaparece tras el reintento exitoso', async ({ page }) => {
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
