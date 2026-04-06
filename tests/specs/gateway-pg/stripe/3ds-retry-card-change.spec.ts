/**
 * MAGIIS - gateway-pg
 * Suite: Cambio de tarjeta post-fallo 3DS
 * TCs: TC07, TC08
 * Flujo: D - Cambio de tarjeta en detalle post-fallo
 */

import { test, expect } from '../../../TestBase';
import {
	loginAsDispatcher,
	setupTravelWithFailed3DS,
	TEST_DATA,
	TravelDetailPage
} from '../../../fixtures/gateway.fixtures';

test.describe.configure({ mode: 'serial' });

test.describe('[gateway][stripe] Cambio de tarjeta post-fallo 3DS', () => {
	test.use({ role: 'carrier', storageState: undefined });

	test.beforeEach(async ({ page }) => {
		await loginAsDispatcher(page);
	});

	test.describe('[TC07] Cambio a tarjeta vinculada existente', () => {
		test('Puede seleccionar otra tarjeta vinculada desde la seccion de pago', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			test.fail(true, 'TC07 pendiente - requiere payment-method.component en travel-detail');
		});

		test('Al guardar la nueva tarjeta se ejecuta el hold automaticamente', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			test.fail(true, 'TC07 pendiente - requiere payment-method.component en travel-detail');
		});
	});

	test.describe('[TC08] Vinculacion de tarjeta nueva post-fallo', () => {
		test('El flujo de vinculacion de tarjeta nueva esta disponible en detalle', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			const detail = new TravelDetailPage(page);
			await expect(detail.changeCardButton()).toBeVisible({ timeout: 10_000 });

			test.fail(true, 'TC08 pendiente - validar flujo completo de vinculacion en detalle');
		});

		test('Al vincular nueva tarjeta con 3DS requerido se lanza el modal', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			test.fail(true, 'TC08 pendiente - requiere flujo de vinculacion completo');
		});

		test('Hold exitoso con nueva tarjeta actualiza estado a Buscando conductor', async ({ page }) => {
			await setupTravelWithFailed3DS(page, TEST_DATA);
			await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });

			test.fail(true, 'TC08 pendiente - depende de vinculacion y hold con nueva tarjeta');
		});
	});
});
