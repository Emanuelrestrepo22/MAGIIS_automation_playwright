/**
 * TCs: TS-STRIPE-TC1057, TS-STRIPE-TC1051, TS-STRIPE-TC1061
 * Feature: Carrier · App Pax · Hold ON · Fallo 3DS — estado NO_AUTORIZADO, red flag y reintento
 * Tags: @regression @3ds @hold @web-only
 *
 * TC1057 – Hold ON + 3DS recuperable (threeDSRequired 4000 0000 0000 3220): challenge 3DS emerge →
 *          test rechaza con FAIL → viaje creado en "En conflicto" con NO_AUTORIZADO; no emerge pop-up de MAGIIS
 * TC1051 – mismo flujo: red flag "Validación 3DS pendiente" + botón "Reintentar" en detalle + estado "No autorizado"
 * TC1061 – fallo inicial + reintento exitoso desde detalle: viaje pasa a "Buscando conductor", red flag y botón desaparecen
 *
 * Regla de negocio card 3220 + Hold ON: Popup A (Stripe challenge) SÍ aparece → completeFail().
 * Tras el rechazo, el viaje se crea en NO_AUTORIZADO → "En conflicto". El fallo es RECUPERABLE:
 * el retry con completeSuccess recupera el viaje (TC1061). Popup B (MAGIIS error) NO aparece.
 * NOTA: 3220 (recuperable), no fail3DS/1629 (decline nativo irrecuperable) ni 9235 (sin 3DS).
 *
 * KATA conformance (feature/kata-conformance):
 *   - test/expect vienen del fixture unificado KATA (@TestFixture); los POMs del sustrato carrier
 *     se consumen vía sus componentes @ui/carrier (extends UiBase) y el modal 3DS vía @ui/ThreeDsChallengePage.
 *   - el setup del fallo 3DS se orquesta con `RecoverySteps.setupFailedThreeDs` (@steps).
 *   @atc idmap (mapeo por área — el idmap es API-level, sin 1:1 con los TS-STRIPE-TC10xx UI):
 *     challenge 3DS → área D (MG-152 success / MG-153 fail); reintento desde detalle → área D (MG-154);
 *     viaje en "Por Asignar" → área E (MG-158).
 */

import { test, expect } from '@TestFixture';
import {
	CarrierDashboardPage,
	CarrierNewTravelPage,
	CarrierOperationalPreferencesPage,
	CarrierTravelDetailPage,
	CarrierTravelManagementPage,
} from '@ui/carrier';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import { RecoverySteps } from '@steps/index';
import { loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';

test.describe.configure({ mode: 'serial' });

// El fixture KATA no define la opción `role` (login explícito vía loginAsDispatcher(page)).
test.use({ storageState: undefined });

test.describe('Gateway PG · Carrier · App Pax — Fallo 3DS, red flag y reintento @gateway @stripe @hold @3ds @decline @regression', { annotation: [{ type: 'tms', description: 'MG-154' }] }, () => {

	test.beforeEach(async ({ page }) => {
		await loginAsDispatcher(page);
	});

	test.describe('[TS-STRIPE-TC1057] Hold ON + 3DS recuperable (4000 0000 0000 3220) — challenge rechazado → NO_AUTORIZADO en "En conflicto" (sin pop-up MAGIIS post-fallo)', () => {
		test('tras rechazar challenge 3DS el viaje queda en NO_AUTORIZADO y fuera de "Por asignar"', async ({ page }) => {
			const dashboard = new CarrierDashboardPage({ page });
			const preferences = new CarrierOperationalPreferencesPage({ page });
			const travel = new CarrierNewTravelPage({ page });
			const threeDS = new ThreeDsChallengePage({ page });
			const detail = new CarrierTravelDetailPage({ page });
			const management = new CarrierTravelManagementPage({ page });

			await test.step('Activar hold en preferencias operativas', async () => {
				await preferences.goto();
				await preferences.ensureHoldEnabled();
				await preferences.assertHoldEnabled();
			});

			await test.step('Ir al formulario de nuevo viaje', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
			});

			await test.step('Crear viaje con tarjeta 3DS recuperable (4000 0000 0000 3220)', async () => {
				await travel.fillMinimum({
					client: TEST_DATA.appPaxPassenger,
					passenger: TEST_DATA.appPaxPassenger,
					origin: TEST_DATA.origin,
					destination: TEST_DATA.destination,
					cardLast4: STRIPE_TEST_CARDS.threeDSRequired.slice(-4), // 4000000000003220 (3DS requerido, recuperable)
				});
				await travel.submit();
			});

			await test.step('Rechazar challenge 3DS (Popup A Stripe/Visa) — no se espera Popup B de MAGIIS', async () => {
				await threeDS.waitForVisible();
				await threeDS.completeFail();
				await threeDS.waitForHidden();
			});

			await test.step('Validar estado NO_AUTORIZADO en detalle del viaje', async () => {
				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
				const statusBadge = detail.statusBadge();
				await expect.soft(statusBadge).not.toContainText('Buscando conductor', { timeout: 10_000 });
				await expect.soft(statusBadge).toContainText(/No autorizado|NO_AUTORIZADO/i, { timeout: 10_000 });
			});

			await test.step('Validar gestión — viaje no aparece en columna "Por asignar"', async () => {
				await management.goto();
				await expect.soft(management.porAsignarColumn()).not.toContainText(TEST_DATA.appPaxPassenger, { timeout: 10_000 });
			});
		});
	});

	test.describe('[TS-STRIPE-TC1051] Hold ON + 3DS recuperable (4000 0000 0000 3220) — red flag "Validación 3DS pendiente" y botón "Reintentar" visibles en detalle, estado "No autorizado"', () => {
		test('muestra red flag "Validacion 3DS pendiente" en la sección de forma de pago', async ({ page }) => {
			const recovery = new RecoverySteps({ page });
			await recovery.setupFailedThreeDs(TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new CarrierTravelDetailPage({ page });
			await detail.expectRedFlagVisible();
		});

		test('muestra botón "Reintentar autenticación" junto al red flag', async ({ page }) => {
			const recovery = new RecoverySteps({ page });
			await recovery.setupFailedThreeDs(TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new CarrierTravelDetailPage({ page });
			await expect(detail.retryButton()).toBeVisible({ timeout: 10_000 });
		});

		test('estado del viaje es "No autorizado" — no aparece "Buscando conductor" mientras 3DS está pendiente', async ({ page }) => {
			const recovery = new RecoverySteps({ page });
			await recovery.setupFailedThreeDs(TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new CarrierTravelDetailPage({ page });
			await detail.expectStatus('No autorizado');
			await expect(detail.statusBadge()).not.toContainText('Buscando conductor');
		});
	});

	test.describe('[TS-STRIPE-TC1061] Hold ON + fallo 3DS inicial + reintento exitoso desde detalle — viaje pasa a "Buscando conductor", red flag y botón "Reintentar" desaparecen', () => {
		test('al reintentar exitosamente el viaje pasa a "Buscando conductor"', async ({ page }) => {
			const recovery = new RecoverySteps({ page });
			await recovery.setupFailedThreeDs(TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new CarrierTravelDetailPage({ page });
			const threeDS = new ThreeDsChallengePage({ page });

			await detail.clickRetry();
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();

			await detail.expectStatus('Buscando conductor');
		});

		test('el red flag desaparece tras el reintento exitoso de 3DS', async ({ page }) => {
			const recovery = new RecoverySteps({ page });
			await recovery.setupFailedThreeDs(TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new CarrierTravelDetailPage({ page });
			const threeDS = new ThreeDsChallengePage({ page });

			await detail.clickRetry();
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();

			await detail.expectRedFlagHidden();
		});

		test('el botón "Reintentar" desaparece tras el reintento exitoso de 3DS', async ({ page }) => {
			const recovery = new RecoverySteps({ page });
			await recovery.setupFailedThreeDs(TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new CarrierTravelDetailPage({ page });
			const threeDS = new ThreeDsChallengePage({ page });

			await detail.clickRetry();
			await threeDS.waitForVisible();
			await threeDS.completeSuccess();
			await threeDS.waitForHidden();

			await expect(detail.retryButton()).toBeHidden({ timeout: 10_000 });
		});
	});
});
