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
 *   - TODO el seed del fallo 3DS (los 3 TCs) se orquesta con `RecoverySteps.setupFailedThreeDs`
 *     (@steps), que delega en el helper canónico de DOS ventanas de challenge (fix 2026-08-06):
 *     el challenge de VALIDACIÓN ("Validar" = hold real) se APRUEBA y el estado NO_AUTORIZADO
 *     nace del challenge POST-ENVÍO rechazado; el oráculo del seed es la fila "En Conflicto"
 *     del dashboard (FE v1.72.8 eliminó el detalle /travels/{id} — ver gate BLOQUEADO abajo).
 *   @atc idmap (mapeo por área — el idmap es API-level, sin 1:1 con los TS-STRIPE-TC10xx UI):
 *     challenge 3DS → área D (MG-152 success / MG-153 fail); reintento desde detalle → área D (MG-154);
 *     viaje en "Por Asignar" → área E (MG-158).
 */

import { test, expect } from '@TestFixture';
import { CarrierOperationalPreferencesPage, CarrierTravelDetailPage, CarrierTravelManagementPage } from '@ui/carrier';
import { ThreeDsChallengePage } from '@ui/ThreeDsChallengePage';
import { RecoverySteps } from '@steps/index';
import { loginAsDispatcher, TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { PASSENGERS } from '@features/gateway-pg/data/passengers';

// Datasets del seed (preservados de la versión previa): TC1057 usa cliente app pax (el pax
// auto-asignado es el mismo usuario); TC1051/TC1061 usan TEST_DATA (cliente empresa individuo).
// `apiSearchQuery` alimenta la limpieza de idempotencia BL-050 del seed (búsqueda API por lastName).
const APP_PAX_SCENARIO = {
	client: TEST_DATA.appPaxPassenger,
	passenger: TEST_DATA.appPaxPassenger,
	origin: TEST_DATA.origin,
	destination: TEST_DATA.destination,
	apiSearchQuery: PASSENGERS.appPax.apiSearchQuery
};
const DEFAULT_SCENARIO = { ...TEST_DATA, apiSearchQuery: PASSENGERS.appPax.apiSearchQuery };

// GATE 2026-08-07 — evidencia en vivo (FE v1.72.8, viajes 68228/68229/68230 = filas
// 3816/3817/3818-W): el fallo del challenge post-envío SÍ deja el viaje en NO_AUTORIZADO
// (Gestión de Viajes → pestaña "En Conflicto", estado "No Autorizado" — el seed canónico lo
// verifica), pero la SUPERFICIE que estos casos asertan YA NO EXISTE en el producto:
//   1. La ruta de detalle /#/home/carrier/travels/{id} fue ELIMINADA — un boot completo
//      (about:blank → goto) rebota a "#/"; la grilla ya no publica anclas a[href*="/travels/"]
//      (acciones = botones fa-pencil / fa-list / fa-times).
//   2. La superficie vigente (fa-list → travel/detail?travelId=X&mode=1, y modos 2/3) NO
//      contiene el red flag "Validación 3DS pendiente", el botón "Reintentar autenticación"
//      ni el badge "No autorizado": 0 ocurrencias en TODO el DOM aun expandiendo secciones
//      (probe 2026-08-07 sobre el viaje 68230).
// Asserts PRESERVADOS sin debilitar; des-skipear cuando el producto re-publique la
// recuperación 3DS en el detalle (el helper de detalle lanzará su diagnóstico si se
// des-skipea antes de tiempo).
const BLOQUEADO_DETALLE_3DS =
	'BLOQUEADO: cambio de producto FE v1.72.8 — ruta de detalle /travels/{id} eliminada (boot rebota a #/) y la superficie vigente travel/detail?travelId=X&mode=1|2|3 no publica red flag "Validación 3DS pendiente" ni botón "Reintentar autenticación" ni badge "No autorizado" (0 hits en DOM, probe 2026-08-07, viaje 68230/3818-W En Conflicto). El estado NO_AUTORIZADO sigue producible vía challenge post-envío fallido — lo que desapareció es la superficie de detalle que estos asserts necesitan.';

test.describe.configure({ mode: 'serial' });

// El fixture KATA no define la opción `role` (login explícito vía loginAsDispatcher(page)).
test.use({ storageState: undefined });

test.describe(
	'Gateway PG · Carrier · App Pax — Fallo 3DS, red flag y reintento @gateway @stripe @hold @3ds @decline @regression',
	{ annotation: [{ type: 'tms', description: 'MG-154' }] },
	() => {
		test.beforeEach(async ({ page }) => {
			await loginAsDispatcher(page);
		});

		test.describe('[TS-STRIPE-TC1057] Hold ON + 3DS recuperable (4000 0000 0000 3220) — challenge rechazado → NO_AUTORIZADO en "En conflicto" (sin pop-up MAGIIS post-fallo)', () => {
			test('tras rechazar challenge 3DS el viaje queda en NO_AUTORIZADO y fuera de "Por asignar"', async ({
				page
			}) => {
				test.skip(true, BLOQUEADO_DETALLE_3DS);

				const preferences = new CarrierOperationalPreferencesPage({ page });
				const detail = new CarrierTravelDetailPage({ page });
				const management = new CarrierTravelManagementPage({ page });
				const recovery = new RecoverySteps({ page });

				// Seed de dos ventanas: hold ON + alta 3220 + challenge de validación APROBADO +
				// challenge post-envío RECHAZADO → NO_AUTORIZADO (verificado en fila "En Conflicto").
				await recovery.setupFailedThreeDs(APP_PAX_SCENARIO);

				await test.step('Hold activo (read-back API crudo — assert preservado del seed inline)', async () => {
					await preferences.assertHoldEnabled();
				});

				await test.step('Validar estado NO_AUTORIZADO en detalle del viaje', async () => {
					await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
					const statusBadge = detail.statusBadge();
					await expect.soft(statusBadge).not.toContainText('Buscando conductor', { timeout: 10_000 });
					await expect.soft(statusBadge).toContainText(/No autorizado|NO_AUTORIZADO/i, { timeout: 10_000 });
				});

				await test.step('Validar gestión — viaje no aparece en columna "Por asignar"', async () => {
					await management.goto();
					await expect
						.soft(management.porAsignarColumn())
						.not.toContainText(TEST_DATA.appPaxPassenger, { timeout: 10_000 });
				});
			});
		});

		test.describe('[TS-STRIPE-TC1051] Hold ON + 3DS recuperable (4000 0000 0000 3220) — red flag "Validación 3DS pendiente" y botón "Reintentar" visibles en detalle, estado "No autorizado"', () => {
			test('muestra red flag "Validacion 3DS pendiente" en la sección de forma de pago', async ({ page }) => {
				test.skip(true, BLOQUEADO_DETALLE_3DS);

				const recovery = new RecoverySteps({ page });
				await recovery.setupFailedThreeDs(DEFAULT_SCENARIO);
				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

				const detail = new CarrierTravelDetailPage({ page });
				await detail.expectRedFlagVisible();
			});

			test('muestra botón "Reintentar autenticación" junto al red flag', async ({ page }) => {
				test.skip(true, BLOQUEADO_DETALLE_3DS);

				const recovery = new RecoverySteps({ page });
				await recovery.setupFailedThreeDs(DEFAULT_SCENARIO);
				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

				const detail = new CarrierTravelDetailPage({ page });
				await expect(detail.retryButton()).toBeVisible({ timeout: 10_000 });
			});

			test('estado del viaje es "No autorizado" — no aparece "Buscando conductor" mientras 3DS está pendiente', async ({
				page
			}) => {
				test.skip(true, BLOQUEADO_DETALLE_3DS);

				const recovery = new RecoverySteps({ page });
				await recovery.setupFailedThreeDs(DEFAULT_SCENARIO);
				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

				const detail = new CarrierTravelDetailPage({ page });
				await detail.expectStatus('No autorizado');
				await expect(detail.statusBadge()).not.toContainText('Buscando conductor');
			});
		});

		test.describe('[TS-STRIPE-TC1061] Hold ON + fallo 3DS inicial + reintento exitoso desde detalle — viaje pasa a "Buscando conductor", red flag y botón "Reintentar" desaparecen', () => {
			test('al reintentar exitosamente el viaje pasa a "Buscando conductor"', async ({ page }) => {
				test.skip(true, BLOQUEADO_DETALLE_3DS);

				const recovery = new RecoverySteps({ page });
				await recovery.setupFailedThreeDs(DEFAULT_SCENARIO);
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
				test.skip(true, BLOQUEADO_DETALLE_3DS);

				const recovery = new RecoverySteps({ page });
				await recovery.setupFailedThreeDs(DEFAULT_SCENARIO);
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
				test.skip(true, BLOQUEADO_DETALLE_3DS);

				const recovery = new RecoverySteps({ page });
				await recovery.setupFailedThreeDs(DEFAULT_SCENARIO);
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
	}
);
