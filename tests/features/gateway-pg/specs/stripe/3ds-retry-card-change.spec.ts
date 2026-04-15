/**
 * TCs: TS-STRIPE-TC1063, TS-STRIPE-TC1064
 * Feature: Carrier · App Pax · Hold ON · Cambio de tarjeta desde detalle post-fallo 3DS
 * Tags: @regression @3ds @hold @web-only
 *
 * TC1063 – Cambio a tarjeta vinculada existente desde detalle post-fallo 3DS — hold re-ejecutado exitosamente
 *          PENDIENTE: requiere payment-method.component en travel-detail
 * TC1064 – Vinculación de tarjeta nueva (success3DS 4000 0025 0000 3155) desde detalle post-fallo — 3DS aprobado, viaje activo
 *          PENDIENTE: requiere flujo de vinculación completo en travel-detail
 */

import { test, expect } from '../../../../TestBase';
import { loginAsDispatcher, setupTravelWithFailed3DS, TEST_DATA } from '../../fixtures/gateway.fixtures';
import { TravelDetailPage } from '../../../../pages/carrier';

test.describe.configure({ mode: 'serial' });

test.describe('Gateway PG · Carrier · App Pax — Cambio de tarjeta post-fallo 3DS', () => {
	test.use({ role: 'carrier', storageState: undefined });

	test.beforeEach(async ({ page }) => {
		await loginAsDispatcher(page);
	});

	test.describe('[TS-STRIPE-TC1063] Cambio a tarjeta vinculada existente desde detalle post-fallo 3DS — hold re-ejecutado, viaje pasa a "Buscando conductor"', () => {
		test('puede seleccionar otra tarjeta vinculada desde la sección de pago en detalle del viaje', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			test.fail(true, 'PENDIENTE: requiere payment-method.component en travel-detail para seleccionar tarjeta guardada');
		});

		test('al guardar la tarjeta existente se re-ejecuta el hold automáticamente y viaje pasa a "Buscando conductor"', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			test.fail(true, 'PENDIENTE: requiere payment-method.component en travel-detail');
		});
	});

	test.describe('[TS-STRIPE-TC1064] Vinculación de tarjeta nueva (success3DS 4000 0025 0000 3155) desde detalle post-fallo — 3DS aprobado, viaje pasa a "Buscando conductor"', () => {
		test('el botón de cambio/vinculación de tarjeta está disponible en el detalle del viaje en estado NO_AUTORIZADO', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new TravelDetailPage(page);
			await expect(detail.changeCardButton()).toBeVisible({ timeout: 10_000 });

			test.fail(true, 'PENDIENTE: validar flujo completo de vinculación en detalle');
		});

		test('al vincular tarjeta nueva con 3DS requerido se lanza el modal de autenticación', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			test.fail(true, 'PENDIENTE: requiere flujo de vinculación completo en travel-detail');
		});

		test('hold exitoso con nueva tarjeta actualiza estado del viaje a "Buscando conductor"', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			test.fail(true, 'PENDIENTE: depende de vinculación y hold exitoso con nueva tarjeta success3DS (4000 0025 0000 3155)');
		});
	});
});
