// MP-NOHOLD-04 · portal Contractor, colaborador de empresa — alta de viaje SIN hold (ARG, TEST)
// Convertido del recording test-15.spec.ts (2026-07-22). Alcance TEST aprobado por negocio:
// llega a creación del viaje (redirect a /contractor/dashboard); el cobro desde el driver NO se
// valida aquí (no completa en TEST — gap conocido → UAT con tarjetas reales).
//
// ⚠️ DRAFT: form de tarjeta MP nativo (no Stripe). Locators FRAGILE en helpers/mercadoPago.helpers.ts.
// Precondición hold OFF: se controla desde el portal Carrier (preferencias operativas), no desde Contractor.
import { test, expect } from '@TestFixture';
import { DashboardPage } from '@pages/carrier';
import { ContractorNewTravelPage } from '@pages/contractor/NewTravelPage';
import { loginAsContractor } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { MP_TEST_CARDS } from '@fixtures/gateways/mercado-pago/cards';
import { fillMercadoPagoNativeCard, validateAndSelectMercadoPagoCard } from '@features/gateway-pg/helpers/mercadoPago.helpers';

const env = process.env.ENV ?? 'test';

// Datos TEST (colaborador de empresa): "Emanuel Restrepo" (token de búsqueda "ema", como el recorder)
const MP_COLABORADOR = 'Emanuel Restrepo';
const MP_ORIGIN = 'Ciudad de la Paz 2238, Ciudad Autónoma de Buenos Aires, Argentina';
const MP_DESTINATION = 'Reconquista 661, Ciudad Autónoma de Buenos Aires';
const APRO = MP_TEST_CARDS.approved; // holderName 'APRO' + DNI 12345678

test.describe(`[SMOKE][MP][${env.toUpperCase()}] Alta sin hold · Contractor colaborador`, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 180_000 });
	// El fixture KATA (@TestFixture) no define la opción `role` — login explícito vía loginAsContractor.
	test.use({ storageState: { cookies: [], origins: [] } });

	test('@smoke @gateway-pg @mercado-pago @contractor @no-hold @happy [MP-NOHOLD-04] Colaborador empresa · alta sin hold con tarjeta APRO → redirect dashboard', async ({ page }) => {
		const dashboard = new DashboardPage(page);
		const travel = new ContractorNewTravelPage(page);

		await test.step(`Given: contractor logueado en portal contractor (${env.toUpperCase()})`, async () => {
			await loginAsContractor(page, { gateway: 'mercado-pago' });
		});

		await test.step('When: nuevo viaje — colaborador + origen + destino', async () => {
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
			await travel.fillJourneyUntilPayment({
				client: MP_COLABORADOR,
				origin: MP_ORIGIN,
				destination: MP_DESTINATION,
			});
		});

		await test.step('And: método Preautorizada + tarjeta MP nativa (holder APRO, sin 3DS)', async () => {
			await travel.selectPaymentMethod('Preautorizada');
			// NOTE(recording): si el colaborador ya tiene tarjetas vinculadas, el recorder las eliminó primero.
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

		await test.step('Then: URL redirige a /contractor/dashboard (viaje creado)', async () => {
			await expect(page, 'Tras crear el viaje sin hold en contractor, la URL debe redirigir a /contractor/dashboard').toHaveURL(
				/contractor\/dashboard/,
				{ timeout: 20_000 },
			);
		});
	});
});
