// MP-NOHOLD · cliente individuo — alta de viaje SIN hold (carrier ARG, TEST)
// Convertido del recording test-14.spec.ts (2026-07-22). Alcance TEST aprobado por negocio:
// el alta sin hold llega a creación del viaje; el cobro desde el driver NO se valida aquí
// (no completa en TEST — gap conocido → UAT con tarjetas reales).
//
// ⚠️ DRAFT: el form de tarjeta MP es nativo (no Stripe). Locators FRAGILE marcados en
// helpers/mercadoPago.helpers.ts requieren confirmación en corrida viva.
import { test } from '@TestBase';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, TravelManagementPage } from '@pages/carrier';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { MP_TEST_CARDS } from '@fixtures/gateways/mercado-pago/cards';
import { fillMercadoPagoNativeCard, validateAndSelectMercadoPagoCard } from '@features/gateway-pg/helpers/mercadoPago.helpers';

const env = process.env.ENV ?? 'test';

// Datos de prueba TEST (cliente individuo): Emanuel mercadopago, id=10785, emanuel.restrepo@gmail.com
const MP_CLIENT = 'Emanuel mercadopago';
// NOTE(recording): el recorder solo cargó destino (origen auto del cliente individuo).
const MP_DESTINATION = 'Reconquista 661, Ciudad Autónoma de Buenos Aires';
const APRO = MP_TEST_CARDS.approved; // holderName 'APRO' + DNI 12345678 (trigger de pago aprobado)

test.describe(`[SMOKE][MP][${env.toUpperCase()}] Alta sin hold · cliente individuo`, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 180_000 });
	test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

	test('@smoke @gateway-pg @mercado-pago @carrier @no-hold @happy [MP-NOHOLD-CLIENTE-INDIVIDUO] Alta sin hold con tarjeta APRO → "Buscando chofer"', async ({ page }) => {
		const dashboard = new DashboardPage(page);
		const preferences = new OperationalPreferencesPage(page);
		const travel = new NewTravelPage(page);
		const management = new TravelManagementPage(page);

		await test.step(`Given: dispatcher logueado en carrier ARG (${env.toUpperCase()})`, async () => {
			await loginAsDispatcher(page, { gateway: 'mercado-pago' });
		});

		await test.step('And: precondición — hold DESACTIVADO en preferencias operativas', async () => {
			await preferences.goto();
			await preferences.setHoldEnabled(false);
			await preferences.save();
		});

		await test.step('When: formulario de nuevo viaje abierto', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
		});

		await test.step('And: cliente individuo seleccionado (Emanuel mercadopago)', async () => {
			await travel.selectClient(MP_CLIENT);
			// Cliente individuo: el pasajero se auto-asigna (campo #passenger deshabilitado).
		});

		await test.step('And: destino cargado', async () => {
			// NOTE: si en corrida viva el alta requiere origen explícito, agregar travel.setOrigin(...).
			await travel.setDestination(MP_DESTINATION);
		});

		await test.step('And: método Preautorizada + tarjeta MP nativa (holder APRO, sin 3DS)', async () => {
			await travel.selectPaymentMethod('Preautorizada');
			// ⚠️ En MP el holderName ES el trigger del outcome. Form nativo (no iframe Stripe).
			await fillMercadoPagoNativeCard(page, {
				holderName: APRO.holderName, // 'APRO'
				docNumber: APRO.identificationNumber, // '12345678'
			});
			// Vinculación satisfactoria = tarjeta resaltada en el dropdown de métodos (recording test-15).
			const mpLink = await validateAndSelectMercadoPagoCard(page);
			test.skip(mpLink !== 'linked', 'MP: validación de tarjeta no completa en TEST (sandbox MP no transacciona) — UAT-only. Form-fill + habilitación de "Validar" verificados.');
		});

		await test.step('And: vehículo seleccionado y servicio enviado', async () => {
			await travel.waitForVehicleSelectionReady();
			await travel.clickSelectVehicle();
			await travel.clickSendService();
		});

		await test.step('Then: viaje visible en gestión — "Buscando chofer" (SEARCHING_DRIVER)', async () => {
			await management.goto();
			await management.expectPassengerInPorAsignar(MP_CLIENT, undefined, 'Buscando chofer');
		});
	});
});
