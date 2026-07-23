// MP-WALLET (web) · cliente individuo — vincular y eliminar tarjeta desde el alta de viaje (carrier ARG, TEST)
// Convertido del recording test-14.spec.ts (2026-07-22). Superficie WEB del carrier (distinta del
// wallet mobile de App Pax, Grupo A del plan). No transacciona: solo administración de la tarjeta vinculada.
//
// ⚠️ DRAFT: locators de eliminación tomados del recorder (clases Angular dinámicas ng-tns → FRAGILE).
// Confirmar en corrida viva. El form de alta de tarjeta MP es nativo (ver helpers/mercadoPago.helpers.ts).
import { test, expect } from '@TestBase';
import { DashboardPage, NewTravelPage } from '@pages/carrier';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { MP_TEST_CARDS } from '@fixtures/gateways/mercado-pago/cards';
import { fillMercadoPagoNativeCard, validateAndSelectMercadoPagoCard } from '@features/gateway-pg/helpers/mercadoPago.helpers';

const env = process.env.ENV ?? 'test';

const MP_CLIENT = 'Emanuel mercadopago'; // id=10785, emanuel.restrepo@gmail.com
const MP_DESTINATION = 'Reconquista 661, Ciudad Autónoma de Buenos Aires';
const APRO = MP_TEST_CARDS.approved;

test.describe(`[SMOKE][MP][${env.toUpperCase()}] Wallet web · cliente individuo`, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 180_000 });
	test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

	test('@smoke @gateway-pg @mercado-pago @carrier @wallet [MP-WALLET-WEB] Vincular y eliminar tarjeta MP desde el alta de viaje', async ({ page }) => {
		const dashboard = new DashboardPage(page);
		const travel = new NewTravelPage(page);
		const paymentMethods = page.locator('#add_travel_payment_methods');

		await test.step(`Given: dispatcher logueado en carrier ARG (${env.toUpperCase()})`, async () => {
			await loginAsDispatcher(page);
		});

		await test.step('When: formulario de nuevo viaje abierto con cliente y destino', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
			await travel.selectClient(MP_CLIENT);
			await travel.setDestination(MP_DESTINATION);
		});

		await test.step('And: se vincula una tarjeta MP nueva (holder APRO)', async () => {
			await travel.selectPaymentMethod('Preautorizada');
			await fillMercadoPagoNativeCard(page, {
				holderName: APRO.holderName,
				docNumber: APRO.identificationNumber,
			});
			// Vinculación satisfactoria = tarjeta resaltada seleccionada en el dropdown (recording test-15).
			const mpLink = await validateAndSelectMercadoPagoCard(page);
			test.skip(mpLink !== 'linked', 'MP: validación de tarjeta no completa en TEST (sandbox MP no transacciona) — UAT-only. Form-fill + habilitación de "Validar" verificados.');
		});

		await test.step('Then: la tarjeta queda vinculada (resaltada en métodos de pago)', async () => {
			await expect(paymentMethods.locator('.highlighted .data-with-icon-col').first()).toBeVisible({ timeout: 10_000 });
		});

		await test.step('When: se elimina la tarjeta vinculada', async () => {
			// FRAGILE: abrir el dropdown de métodos y clickear el trash de la tarjeta resaltada.
			await paymentMethods.locator('.below .single .value').first().click();
			await paymentMethods.locator('.highlighted .deselect-payment-method .fa').first().click();
			// Diálogo de confirmación "¿Quieres eliminar la tarjeta?".
			await page.getByRole('button', { name: /^Eliminar$/i }).click();
		});

		await test.step('Then: la tarjeta ya no está vinculada', async () => {
			// Tras eliminar, el trash de una tarjeta resaltada no debería seguir visible.
			await expect(paymentMethods.locator('.highlighted .deselect-payment-method')).toHaveCount(0, { timeout: 10_000 });
		});
	});
});
