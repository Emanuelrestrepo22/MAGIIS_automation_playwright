/**
 * TCs: TS-STRIPE-TC1063, TS-STRIPE-TC1064
 * Feature: Carrier · App Pax · Hold ON · Cambio de tarjeta desde detalle post-fallo 3DS
 * Tags: @regression @3ds @hold @web-only
 *
 * TC1063 – Cambio a tarjeta vinculada existente desde detalle post-fallo 3DS — hold re-ejecutado exitosamente
 *          PENDIENTE: requiere payment-method.component en travel-detail
 * TC1064 – Vinculación de tarjeta nueva (success3DS 4000 0025 0000 3155) desde detalle post-fallo — 3DS aprobado, viaje activo
 *          PENDIENTE: requiere flujo de vinculación completo en travel-detail
 *
 * KATA conformance (feature/kata-conformance):
 *   - test/expect vienen del fixture unificado KATA (@TestFixture); el setup del fallo 3DS se orquesta
 *     con `RecoverySteps.setupFailedThreeDs` (@steps) — flujo canónico de DOS ventanas de challenge
 *     (validación aprobada + post-envío rechazado, fix 2026-08-06); el detalle vía @ui/carrier
 *     CarrierTravelDetailPage.
 *   - Marcadores de producto pendiente (ajuste 2026-08-07, seed reparado): los casos SIN aserción
 *     propia (solo placeholder "PENDIENTE") pasan a `test.fixme` ANTES del seed — con el seed ya
 *     funcional, `test.fail` sin aserción reportaría "passed unexpectedly" y quemaría un viaje real
 *     por corrida sin medir nada. El único caso CON aserción real (botón de cambio/vinculación en el
 *     detalle) queda gateado con `test.skip` + BLOQUEADO: la superficie de detalle donde ese botón
 *     viviría fue eliminada del producto (ver const BLOQUEADO_DETALLE_3DS) — assert preservado
 *     para el re-enable.
 *   @atc idmap (mapeo por área): cambio/vinculación de tarjeta post-fallo → área D (MG-155 / MG-156).
 */

import { test, expect } from '@TestFixture';
import { CarrierTravelDetailPage } from '@ui/carrier';
import { RecoverySteps } from '@steps/index';
import { loginAsDispatcher, TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { PASSENGERS } from '@features/gateway-pg/data/passengers';

// `apiSearchQuery` alimenta la limpieza de idempotencia BL-050 del seed (búsqueda API por lastName).
const DEFAULT_SCENARIO = { ...TEST_DATA, apiSearchQuery: PASSENGERS.appPax.apiSearchQuery };

// GATE 2026-08-07 — mismo bloqueo de producto que 3ds-failure.spec.ts (evidencia en vivo, FE
// v1.72.8): la ruta de detalle /travels/{id} fue eliminada (boot rebota a #/) y la superficie
// vigente travel/detail?travelId=X&mode=1|2|3 no publica botón de cambio/vinculación de tarjeta
// ni ninguna affordance de recuperación 3DS (0 hits en DOM, probe 2026-08-07, viaje 68230).
const BLOQUEADO_DETALLE_3DS =
	'BLOQUEADO: cambio de producto FE v1.72.8 — ruta de detalle /travels/{id} eliminada y sin superficie de recuperación 3DS (botón "Cambiar tarjeta" incluido) en travel/detail?mode=1|2|3 (probe 2026-08-07, viaje 68230/3818-W En Conflicto).';

test.describe.configure({ mode: 'serial' });

test.use({ storageState: undefined });

test.describe(
	'Gateway PG · Carrier · App Pax — Cambio de tarjeta post-fallo 3DS @gateway @stripe @hold @3ds @wallet @regression',
	{ annotation: [{ type: 'tms', description: 'MG-155' }] },
	() => {
		test.beforeEach(async ({ page }) => {
			await loginAsDispatcher(page);
		});

		test.describe('[TS-STRIPE-TC1063] Cambio a tarjeta vinculada existente desde detalle post-fallo 3DS — hold re-ejecutado, viaje pasa a "Buscando conductor"', () => {
			test('puede seleccionar otra tarjeta vinculada desde la sección de pago en detalle del viaje', async ({
				page
			}) => {
				test.fixme(
					true,
					'PENDIENTE: requiere payment-method.component en travel-detail para seleccionar tarjeta guardada (sin aserción ejecutable aún — no se corre el seed)'
				);

				const recovery = new RecoverySteps({ page });
				await recovery.setupFailedThreeDs(DEFAULT_SCENARIO);
			});

			test('al guardar la tarjeta existente se re-ejecuta el hold automáticamente y viaje pasa a "Buscando conductor"', async ({
				page
			}) => {
				test.fixme(
					true,
					'PENDIENTE: requiere payment-method.component en travel-detail (sin aserción ejecutable aún — no se corre el seed)'
				);

				const recovery = new RecoverySteps({ page });
				await recovery.setupFailedThreeDs(DEFAULT_SCENARIO);
			});
		});

		test.describe('[TS-STRIPE-TC1064] Vinculación de tarjeta nueva (success3DS 4000 0025 0000 3155) desde detalle post-fallo — 3DS aprobado, viaje pasa a "Buscando conductor"', () => {
			test('el botón de cambio/vinculación de tarjeta está disponible en el detalle del viaje en estado NO_AUTORIZADO', async ({
				page
			}) => {
				// Gate de producto (no un PENDIENTE de assert): sin superficie de detalle no hay
				// dónde publicar el botón — asserts preservados para el re-enable.
				test.skip(true, BLOQUEADO_DETALLE_3DS);

				const recovery = new RecoverySteps({ page });
				await recovery.setupFailedThreeDs(DEFAULT_SCENARIO);
				await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

				const detail = new CarrierTravelDetailPage({ page });
				await expect(detail.changeCardButton()).toBeVisible({ timeout: 10_000 });
			});

			test('al vincular tarjeta nueva con 3DS requerido se lanza el modal de autenticación', async ({ page }) => {
				test.fixme(
					true,
					'PENDIENTE: requiere flujo de vinculación completo en travel-detail (sin aserción ejecutable aún — no se corre el seed)'
				);

				const recovery = new RecoverySteps({ page });
				await recovery.setupFailedThreeDs(DEFAULT_SCENARIO);
			});

			test('hold exitoso con nueva tarjeta actualiza estado del viaje a "Buscando conductor"', async ({
				page
			}) => {
				test.fixme(
					true,
					'PENDIENTE: depende de vinculación y hold exitoso con nueva tarjeta success3DS (4000 0025 0000 3155) — sin aserción ejecutable aún, no se corre el seed'
				);

				const recovery = new RecoverySteps({ page });
				await recovery.setupFailedThreeDs(DEFAULT_SCENARIO);
			});
		});
	}
);
