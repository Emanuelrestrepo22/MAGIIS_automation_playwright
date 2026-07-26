// MP-NOHOLD-02 · portal Carrier, colaborador de contractor — alta de viaje SIN hold (ARG, TEST)
// Convertido del recording test-16.spec.ts (2026-07-22). Cliente = contractor "QA Idea Flight",
// pasajero = colaborador "Restrepo, Emanuel". Alcance TEST aprobado por negocio: llega a creación
// del viaje ("Buscando chofer"); el cobro desde el driver NO se valida aquí (gap conocido → UAT).
//
// ⚠️ DRAFT: form de tarjeta MP nativo (no Stripe). Locators FRAGILE en helpers/mercadoPago.helpers.ts.
import { test } from '@TestFixture';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, TravelManagementPage } from '@pages/carrier';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { MP_TEST_CARDS } from '@fixtures/gateways/mercado-pago/cards';
import { fillMercadoPagoNativeCard, validateAndSelectMercadoPagoCard } from '@features/gateway-pg/helpers/mercadoPago.helpers';

const env = process.env.ENV ?? 'test';

// Datos TEST: cliente contractor + colaborador
const MP_CLIENT = 'QA Idea Flight'; // cliente (contractor)
const MP_COLABORADOR = 'Emanuel Restrepo'; // pasajero/colaborador → grilla muestra "Restrepo, Emanuel"
const MP_ORIGIN = 'Avenida Cabildo 990, Buenos Aires';
const MP_DESTINATION = 'Cazadores 1987, Buenos Aires';
const APRO = MP_TEST_CARDS.approved; // holderName 'APRO' + DNI 12345678

test.describe(`[SMOKE][MP][${env.toUpperCase()}] Alta sin hold · Carrier colaborador`, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 180_000 });
	// El fixture KATA (@TestFixture) no define la opción `role` — login explícito vía loginAsDispatcher.
	test.use({ storageState: { cookies: [], origins: [] } });

	test('@smoke @gateway-pg @mercado-pago @carrier @no-hold @happy [MP-NOHOLD-02] Colaborador de contractor · alta sin hold con tarjeta APRO → "Buscando chofer"', async ({ page }) => {
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

		await test.step('When: nuevo viaje — cliente contractor + colaborador + origen/destino', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
			await travel.selectClient(MP_CLIENT);
			await travel.selectPassenger(MP_COLABORADOR);
			await travel.setOrigin(MP_ORIGIN);
			await travel.setDestination(MP_DESTINATION);
		});

		await test.step('And: método Preautorizada + tarjeta MP nativa (holder APRO, sin 3DS)', async () => {
			await travel.selectPaymentMethod('Preautorizada');
			// ⚠️ En MP el holderName ES el trigger del outcome. Form nativo (no iframe Stripe).
			await fillMercadoPagoNativeCard(page, {
				holderName: APRO.holderName, // 'APRO'
				docNumber: APRO.identificationNumber, // '12345678'
			});
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
			await management.expectPassengerInPorAsignar(MP_COLABORADOR, undefined, 'Buscando chofer');
		});
	});
});
