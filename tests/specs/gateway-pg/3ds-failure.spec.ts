/**
 * MAGIIS - GATEWAY Suite: Flujo 3DS Fallo + Reintento
 * Fuente: STRIPE_Test_Suite.xlsx / hoja: GATEWAY_3DS
 *
 * TCs cubiertos:
 *   TC03 - Fallo 3DS en alta de viaje on demand - reintento desde detalle
 *   TC04 - Fallo 3DS - cambio de tarjeta - hold exitoso
 */

import { test, expect } from '../../TestBase';
import type { Page } from '@playwright/test';
import { loginAsDispatcher, TEST_DATA } from '../../fixtures/gateway.fixtures';
import { NewTravelPage } from '../../pages/NewTravelPage';
import { TravelDetailPage } from '../../pages/TravelDetailPage';
import { ThreeDSModal } from '../../pages/ThreeDSModal';
import { ErrorPopup } from '../../pages/ErrorPopup';
import { STRIPE_TEST_CARDS } from '../../data/stripe-cards';

const FAILED_3DS_FORM = {
	passenger: TEST_DATA.passenger,
	origin: TEST_DATA.origin,
	destination: TEST_DATA.destination,
	cardLast4: STRIPE_TEST_CARDS.visa_3ds_fail.last4
} as const;

async function openFailed3DSForm(page: Page): Promise<NewTravelPage> {
	const travel = new NewTravelPage(page);
	await travel.goto();
	await travel.fillMinimum(FAILED_3DS_FORM);
	return travel;
}

test.describe('[GATEWAY] Flujo 3DS - Fallo y reintento @regression @stripe @3ds', () => {
	test.use({ role: 'carrier', storageState: undefined });

	test.beforeEach(async ({ page }) => {
		await loginAsDispatcher(page);
	});

	test.describe('[TC03] Fallo 3DS en alta de viaje on demand', () => {
		test('TC03-validar-popup-error-al-fallar-3ds', async ({ page }) => {
			const travel = await openFailed3DSForm(page);
			const threeDS = new ThreeDSModal(page);
			const popup = new ErrorPopup(page);

			await test.step('[TC03][STEP-01] Crear viaje con tarjeta que requiere 3DS', async () => {
				await travel.submit();
			});

			await test.step('[TC03][STEP-02] Esperar modal 3DS y completar con FALLO', async () => {
				await threeDS.waitForVisible();
				await threeDS.completeFail();
			});

			await test.step('[TC03][STEP-03] Debería mostrar pop-up de error informando fallo 3DS', async () => {
				await popup.waitForVisible();
				const msg = await popup.getMessage();
				expect(msg).toMatch(/autenticaci[oó]n|3ds|seguridad/i);
			});
		});

		test('TC03-validar-redirect-a-detalle-al-aceptar-popup', async ({ page }) => {
			const travel = await openFailed3DSForm(page);
			const threeDS = new ThreeDSModal(page);
			const popup = new ErrorPopup(page);

			await travel.submit();
			await threeDS.waitForVisible();
			await threeDS.completeFail();
			await popup.waitForVisible();

			await test.step('[TC03][STEP-04] Aceptar el pop-up de error', async () => {
				await popup.accept();
			});

			await test.step('[TC03][STEP-05] Debería redirigir a la página de detalle del viaje', async () => {
				await expect(page).toHaveURL(/\/travels\/\w+/, { timeout: 15_000 });
			});
		});

		test('TC03-validar-red-flag-y-boton-reintento-en-detalle', async ({ page }) => {
			const travel = await openFailed3DSForm(page);
			const threeDS = new ThreeDSModal(page);
			const popup = new ErrorPopup(page);
			const detail = new TravelDetailPage(page);

			await travel.submit();
			await threeDS.waitForVisible();
			await threeDS.completeFail();
			await popup.waitForVisible();
			await popup.accept();
			await page.waitForURL(/\/travels\/\w+/, { timeout: 15_000 });

			await test.step('[TC03][STEP-06] Debería mostrar estado NO_AUTORIZADO', async () => {
				const statusBadge = await detail.getTravelStatus();
				await expect(statusBadge).toContainText('No autorizado', { timeout: 10_000 });
			});

			await test.step('[TC03][STEP-07] Debería mostrar red flag de 3DS pendiente', async () => {
				const redFlag = await detail.get3DSRedFlag();
				await expect(redFlag).toBeVisible();
			});

			await test.step('[TC03][STEP-08] Debería mostrar botón "Reintentar autenticación"', async () => {
				const retryBtn = await detail.getRetryButton();
				await expect(retryBtn).toBeVisible();
			});
		});

		test('TC03-validar-reintento-exitoso-cambia-estado-a-searching-driver', async ({ page }) => {
			const travel = await openFailed3DSForm(page);
			const threeDS = new ThreeDSModal(page);
			const popup = new ErrorPopup(page);
			const detail = new TravelDetailPage(page);

			await travel.submit();
			await threeDS.waitForVisible();
			await threeDS.completeFail();
			await popup.waitForVisible();
			await popup.accept();
			await page.waitForURL(/\/travels\/\w+/, { timeout: 15_000 });

			await test.step('[TC03][STEP-09] Reintentar autenticación 3DS', async () => {
				await detail.clickRetry();
				await threeDS.waitForVisible();
				await threeDS.completeSuccess();
				await threeDS.waitForHidden();
			});

			await test.step('[TC03][STEP-10] Debería actualizar estado a SEARCHING_DRIVER', async () => {
				const statusBadge = await detail.getTravelStatus();
				await expect(statusBadge).toContainText('Buscando conductor', { timeout: 15_000 });
			});

			await test.step('[TC03][STEP-11] Debería desaparecer el red flag de 3DS', async () => {
				const redFlag = await detail.get3DSRedFlag();
				await expect(redFlag).toBeHidden();
			});
		});
	});

	test.describe('[TC04] Fallo 3DS - cambio de tarjeta - hold exitoso', () => {
		test('TC04-validar-cambio-de-tarjeta-post-fallo-3ds', async ({ page }) => {
			const travel = await openFailed3DSForm(page);
			const threeDS = new ThreeDSModal(page);
			const popup = new ErrorPopup(page);
			const detail = new TravelDetailPage(page);

			await travel.submit();
			await threeDS.waitForVisible();
			await threeDS.completeFail();
			await popup.waitForVisible();
			await popup.accept();
			await page.waitForURL(/\/travels\/\w+/, { timeout: 15_000 });

			await test.step('[TC04][STEP-05] Seleccionar otra tarjeta (sin 3DS requerido)', async () => {
				test.fail(true, 'TC04 pendiente: TravelDetailPage.changeCard() requiere validación de selectores DOM');
			});

			await test.step('[TC04][STEP-06] Debería ejecutar hold con nueva tarjeta y cambiar estado', async () => {
				// TODO: assertion sobre nuevo estado
				// await expect(await detail.getTravelStatus()).toContainText('Buscando conductor');
			});
		});
	});
});
