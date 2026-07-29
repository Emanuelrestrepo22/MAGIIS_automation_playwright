// Authorize.Net · Widget PÚBLICO de cotización (Quote) · usuario personal · SIN Hold · Visa APPROVED
//
// TC: TS-AUTHORIZE-TC1215 (docs/gateway-pg/authorize/matriz_cases2.md §11)
//   Título matriz: "Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario
//   personal existente con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde
//   App Driver"
//   Card: AUTHORIZE_CARDS.SUCCESS
//
// ⚠️ ELECCIÓN DE ID A CONFIRMAR: la grabación completó **mail Y teléfono**, así que no discrimina
// entre TC1215 (vínculo por mail) y TC1213 (vínculo por teléfono) — los 2 son "personal + sin
// Hold". Se eligió TC1215 porque el mail es lo que la grabación verifica al final en el detalle
// del viaje. Si el eje que interesa es el teléfono, el ID correcto es TC1213.
//
// EVIDENCIA DE REFERENCIA: `tests/test-8.spec.ts` — grabación validada en PASS por QA (2026-07-27).
// Nota del viaje en la grabación: "test case quote authorize sin hold".
//
// PARTICULARIDADES DEL FLUJO QUOTE (por eso hizo falta un POM nuevo, `QuoteWidgetPage`):
//   - El widget es **público, sin login**: `#/quote?pluginKey=<base64(carrierId)>`. No se usa
//     `loginAsDispatcher` ni storageState.
//   - El **idioma sale del query param**, no de `ensureSpanishLanguage` → el widget corre en EN.
//   - El **pago vive DENTRO del widget** (botón "Payment"), no en una conversión posterior desde
//     Cotizaciones del portal.
//   - El form de tarjeta es el **mismo form nativo Angular** del portal → se reusa
//     `cardFormFor('authorize')` + `expectFilled()`, sin duplicar nada.
//   - El viaje resultante queda en **"Programados"**, no en "Por asignar" — resultado válido del
//     hold según el oráculo del líder de QA (Por asignar | Programados = PASS; En conflicto = FAIL).
//
// SIN HOLD: este caso no reserva fondos en el alta; el cobro ocurre desde la App Driver al
// finalizar el viaje (fase mobile, fuera de alcance — ver TC1301-1303).
//
// Authorize no expone 3DS (`authorizeGatewayAdapter.requires3ds = false`).
import { expect, test } from '@TestFixture';
import { resolveCard } from '@fixtures/gateways/_shared';
import { journeyDefaultsFor } from '@features/gateway-pg/data/journey-defaults';
import { confirmQuoteByMail } from '@features/gateway-pg/helpers/quote-mail-confirmation';
import { expectQuoteTripInPortal } from '@features/gateway-pg/helpers/quote-trip-verification';
import { cardFormFor } from '@ui/carrier/card-forms';
import { QuoteWidgetPage } from '@ui/QuoteWidgetPage';

const env = process.env.ENV ?? 'test';
const AUTH = journeyDefaultsFor('authorize');

/**
 * Solicitante de la cotización: usuario personal YA REGISTRADO en la plataforma — es el eje del
 * caso (el sistema debe vincularlo al existente, no crear uno nuevo). La casilla es @yopmail.com
 * porque el flujo exige confirmar el viaje por mail y el helper lee esa bandeja.
 */
const QUOTE_REQUESTER = {
	name: 'Emanuel',
	lastName: 'Restrepo',
	email: 'emanuel.restrepo@yopmail.com',
	country: 'Argentina',
	phone: '+54 (11) 2404-8846'
} as const;

test.describe(`Gateway PG · Quote · Authorize — usuario personal SIN hold [${env.toUpperCase()}] @gateway @authorize @quote @regression`, () => {
	test.describe.configure({ mode: 'serial' });
	test.describe.configure({ timeout: 240_000 });
	// El widget es PÚBLICO: sin sesión previa.
	test.use({ storageState: { cookies: [], origins: [] } });

	test(
		'[TS-AUTHORIZE-TC1215] @happy Validar alta de viaje desde Quote con tarjeta Authorize exitosa (Visa 4111 · CVV 900) SIN hold → "Programados"',
		// SIN annotation `tms`: el área Quote de Authorize aún no tiene Tests Xray creados
		// (registry `xray-keys.ts` sin sección quote). Key null = sin annotation, para que el gap
		// quede visible en el summary del reporter — no inventar keys.
		{},
		// `browser` se usa en el paso 11: la verificación en el portal abre una SESIÓN NUEVA, aislada
		// de la sesión anónima del widget (ver `expectQuoteTripInPortal`).
		async ({ page, browser }) => {
			const quote = new QuoteWidgetPage({ page });
			// Visa 4111…1111 · CVV 900 · ZIP 90210 · exp 12/30.
			const card = resolveCard({ gateway: 'authorize', intent: 'HAPPY_NO_AUTH' });

			await test.step('1. Abrir el widget público de cotización del carrier', async () => {
				await quote.goto({ language: 'EN' });
			});

			await test.step(`2. Fijar origen "${AUTH.origin}"`, async () => {
				await quote.setOrigin(AUTH.origin);
			});

			await test.step(`3. Fijar destino "${AUTH.destination}"`, async () => {
				await quote.setDestination(AUTH.destination);
			});

			await test.step('4. Avanzar a selección de vehículo', async () => {
				await quote.selectVehicle();
			});

			await test.step('5. Completar la nota del viaje y confirmar el vehículo', async () => {
				await quote.setTripNote('TC1215 quote authorize sin hold (automatizado)');
				await quote.confirmVehicle();
			});

			await test.step('6. Completar los datos de contacto del solicitante', async () => {
				// Vínculo por MAIL a un usuario personal YA EXISTENTE: es el eje del caso — el sistema
				// debe reconocerlo, no crear uno nuevo. Nota: aun con mail registrado, el widget NO
				// auto-completa los demás datos; hay que llenarlos igual (verificado por QA).
				await quote.fillContact({ ...QUOTE_REQUESTER });
			});

			await test.step('7. Solicitar la cotización', async () => {
				await quote.requestQuote();
			});

			await test.step(`8. Abrir el paso de pago y llenar la tarjeta (•••• ${card.last4})`, async () => {
				await quote.goToPayment();
				const form = cardFormFor('authorize');
				await form.fill(page, card);
				// Verificar el COMMIT del fill antes de confirmar: el form nativo es reactivo y puede
				// limpiar un campo ya tipeado (observado en TC1061 — el número quedó vacío).
				await form.expectFilled?.(page, card);
			});

			await test.step('9. Confirmar la cotización (aún NO crea el viaje)', async () => {
				await quote.confirmQuote();
				// Debería salir del paso de pago (el form de tarjeta ya no está montado).
				await expect(page.getByRole('textbox', { name: /Card number|N[uú]mero de tarjeta/i })).toHaveCount(0, { timeout: 30_000 });
			});

			await test.step('10. Confirmar el viaje desde el mail del solicitante → alta como PROGRAMADO', async () => {
				// REGLA DE NEGOCIO: todo viaje de Quote requiere que el solicitante lo confirme desde su
				// casilla; el alta se produce recién con ese click y queda como viaje PROGRAMADO.
				// Sin este paso el viaje NO existe — el spec estaría verificando nada.
				const confirmPage = await confirmQuoteByMail(page, { email: QUOTE_REQUESTER.email });
				// Debería aterrizar en una página de confirmación de MAGIIS, no en un error.
				await expect(confirmPage).toHaveURL(/magiis/i);
				await confirmPage.close();
			});

			await test.step('11. Verificar el viaje en el portal del carrier (oráculo del caso)', async () => {
				// El oráculo vive en el PORTAL, que es una sesión autenticada distinta del widget
				// anónimo. El helper abre un contexto nuevo a propósito — reusar la página del widget o
				// el popup de yopmail mezclaría sesiones y arrastraría cookies de otro dominio.
				await expectQuoteTripInPortal(browser, {
					requester: `${QUOTE_REQUESTER.name} ${QUOTE_REQUESTER.lastName}`,
					destination: AUTH.destination,
					gateway: 'authorize'
				});
			});
		}
	);
});
