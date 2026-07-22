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
 *     con `RecoverySteps.setupFailedThreeDs` (@steps); el detalle vía @ui/carrier CarrierTravelDetailPage.
 *   - los tests siguen en `test.fail(true, ...)`: el producto aún no implementa el cambio/vinculación de
 *     tarjeta en el detalle (payment-method.component). Se cablea el mapeo aunque queden en test.fail.
 *   @atc idmap (mapeo por área): cambio/vinculación de tarjeta post-fallo → área D (MG-155 / MG-156).
 */

import { test, expect } from '@TestFixture';
import { CarrierTravelDetailPage } from '@ui/carrier';
import { RecoverySteps } from '@steps/index';
import { loginAsDispatcher, TEST_DATA } from '@features/gateway-pg/fixtures/gateway.fixtures';

test.describe.configure({ mode: 'serial' });

test.use({ storageState: undefined });

test.describe('Gateway PG · Carrier · App Pax — Cambio de tarjeta post-fallo 3DS @gateway @stripe @hold @3ds @wallet @regression', () => {
	test.beforeEach(async ({ page }) => {
		await loginAsDispatcher(page);
	});

	test.describe('[TS-STRIPE-TC1063] Cambio a tarjeta vinculada existente desde detalle post-fallo 3DS — hold re-ejecutado, viaje pasa a "Buscando conductor"', () => {
		test('puede seleccionar otra tarjeta vinculada desde la sección de pago en detalle del viaje', async ({
			page
		}) => {
			const recovery = new RecoverySteps({ page });
			await recovery.setupFailedThreeDs(TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			test.fail(
				true,
				'PENDIENTE: requiere payment-method.component en travel-detail para seleccionar tarjeta guardada'
			);
		});

		test('al guardar la tarjeta existente se re-ejecuta el hold automáticamente y viaje pasa a "Buscando conductor"', async ({
			page
		}) => {
			const recovery = new RecoverySteps({ page });
			await recovery.setupFailedThreeDs(TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			test.fail(true, 'PENDIENTE: requiere payment-method.component en travel-detail');
		});
	});

	test.describe('[TS-STRIPE-TC1064] Vinculación de tarjeta nueva (success3DS 4000 0025 0000 3155) desde detalle post-fallo — 3DS aprobado, viaje pasa a "Buscando conductor"', () => {
		test('el botón de cambio/vinculación de tarjeta está disponible en el detalle del viaje en estado NO_AUTORIZADO', async ({
			page
		}) => {
			const recovery = new RecoverySteps({ page });
			await recovery.setupFailedThreeDs(TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new CarrierTravelDetailPage({ page });
			await expect(detail.changeCardButton()).toBeVisible({ timeout: 10_000 });

			test.fail(true, 'PENDIENTE: validar flujo completo de vinculación en detalle');
		});

		test('al vincular tarjeta nueva con 3DS requerido se lanza el modal de autenticación', async ({ page }) => {
			const recovery = new RecoverySteps({ page });
			await recovery.setupFailedThreeDs(TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			test.fail(true, 'PENDIENTE: requiere flujo de vinculación completo en travel-detail');
		});

		test('hold exitoso con nueva tarjeta actualiza estado del viaje a "Buscando conductor"', async ({ page }) => {
			const recovery = new RecoverySteps({ page });
			await recovery.setupFailedThreeDs(TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			test.fail(
				true,
				'PENDIENTE: depende de vinculación y hold exitoso con nueva tarjeta success3DS (4000 0025 0000 3155)'
			);
		});
	});
});
