// MP · MG-194 — la validación de tarjeta MercadoPago NO dispara challenge 3DS (carrier ARG, TEST).
//
// Re-scope TEST (2026-07-24): la validación/transacción de tarjeta MP NO completa en el sandbox de
// TEST ("Error al validar tarjeta" — ver mercadoPago.helpers.validateAndSelectMercadoPagoCard). PERO
// el AC de MG-194 es la AUSENCIA de challenge 3DS, y eso SÍ es verificable en TEST: el form MP es
// nativo Angular (sin iframe Stripe / three-ds), así que al disparar "Validar" nunca aparece un
// challenge 3DS — independientemente de si la validación de la tarjeta completa. Fuente de flujo:
// recordings test-14/15/16 (carrier ARG, TEST). Los ACs que dependen de que la validación COMPLETE
// (MG-482/483/195/160) quedan UAT-only.
import { test } from '@TestBase';
import { DashboardPage, NewTravelPage } from '@pages/carrier';
import { loginAsDispatcher, expectNoThreeDSModal } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { MP_TEST_CARDS } from '@fixtures/gateways/mercado-pago/cards';
import {
	expectValidateCardEnabled,
	fillMercadoPagoNativeCard,
	waitForMpValidationOutcome
} from '@features/gateway-pg/helpers/mercadoPago.helpers';

const env = process.env.ENV ?? 'test';
const MP_CLIENT = 'Emanuel mercadopago'; // id=10785 (cliente individuo ARG)
const MP_DESTINATION = 'Reconquista 661, Ciudad Autónoma de Buenos Aires';
const APRO = MP_TEST_CARDS.approved; // holderName 'APRO' + DNI 12345678

test.describe(`[MP][${env.toUpperCase()}] Validación de tarjeta MP sin challenge 3DS`, () => {
	test.describe.configure({ timeout: 180_000 });
	test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

	test(
		'@smoke @gateway @gateway-pg @mercadopago @carrier [MP-3DS] MercadoPago no dispara challenge 3DS al validar tarjeta',
		{ annotation: [{ type: 'tms', description: 'MG-194' }] },
		async ({ page }) => {
			const dashboard = new DashboardPage(page);
			const travel = new NewTravelPage(page);

			await test.step('Given: dispatcher logueado en carrier ARG (MercadoPago)', async () => {
				await loginAsDispatcher(page, { gateway: 'mercado-pago' });
			});

			await test.step('When: alta de viaje + método Preautorizada + form de tarjeta MP nativa (APRO)', async () => {
				await dashboard.openNewTravel();
				await travel.ensureLoaded();
				await travel.selectClient(MP_CLIENT);
				await travel.setDestination(MP_DESTINATION);
				await travel.selectPaymentMethod('Preautorizada');
				await fillMercadoPagoNativeCard(page, {
					holderName: APRO.holderName,
					docNumber: APRO.identificationNumber
				});
			});

			await test.step('And: control positivo — el form MP quedó completo y "Validar" habilitado', async () => {
				// Endurecimiento de oráculo (auditoría R2): el único oráculo era el negativo
				// (expectNoThreeDSModal via toBeHidden — pasa aunque el selector jamás exista).
				// Control positivo previo encapsulado en el helper (locator "Validar" único; la
				// premisa disabled-until-valid lleva TODO(live) ahí). La validación completa es
				// UAT-only, ver header.
				await expectValidateCardEnabled(page);
			});

			await test.step('And: se dispara la validación de la tarjeta ("Validar")', async () => {
				await travel.clickValidateCard();
			});

			await test.step('Then: MercadoPago NO dispara challenge 3DS (form nativo, sin iframe three-ds)', async () => {
				// Primer assert: ausencia de 3DS inmediatamente post-click (ventana toBeHidden 5s).
				await expectNoThreeDSModal(page);
				// Re-assert post-desenlace: esperar el desenlace de la validación (tarjeta resaltada
				// o error sandbox — el valor NO se asserta: la validación completa es UAT-only, ver
				// header) y sostener la ausencia de 3DS también DESPUÉS de ese punto — el assert
				// anterior corre post-click pero el desenlace puede tardar unos segundos más.
				await waitForMpValidationOutcome(page);
				await expectNoThreeDSModal(page);
				await page.screenshot({ path: `evidence/${env}/mp-194-no-3ds.png`, fullPage: true });
			});
		}
	);
});
