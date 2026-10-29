/**
 * [MG · área B][API] MercadoPago — ePayment sobre carrier SIN pasarela vinculada (TC-PAY-B-01).
 *
 * Gate de negocio agnóstico de PSP: `POST ePayment` sobre un carrier sin vendor conectado debe
 * responder 412 CARRIER_NOT_LINKED ANTES de tocar tarjeta/monto/hold. Por eso es automatizable en
 * TEST sin destrabar OAuth ni el sandbox MP (a diferencia de MG-160/161/162/163 en
 * `mercado-pago-formal/epayment.api.spec.ts`, que SÍ requieren `MP_SANDBOX_TRANSACTS=1` porque
 * completan un cobro real) — ver `.context/reports/mercadopago-coverage-gap-2026-07-25.md` §4.
 *
 * Reusa `EpaymentApi.startEpayment` (@atc MG-160) TAL CUAL — su propia descripción ya declara
 * "gates 412/2077" como parte de su contrato (mismo patrón que `VendorApi.cleaningWallets`
 * @atc MG-166 reusado con annotation MG-167 en `mp-integration-deltas.api.spec.ts`: un componente
 * ya cubierto por un ATC general se re-anota con el TMS ID específico del escenario). No se
 * agrega ningún método nuevo a `EpaymentApi` — evita duplicar el POST ya existente.
 *
 * Endpoint bajo prueba: POST /magiis-v0.2/ePayment (ver EpaymentApi.ts).
 * Trazabilidad: área B (gate CARRIER_NOT_LINKED) · TC-PAY-B-01 · ATP MG-178 · release MG-3.
 */

// skip env-gated (creds / datos [confirmar]) intencional en este pack.
/* eslint-disable playwright/no-skipped-test */

import { test, expect } from '@TestBase';
import { EpaymentApi, MP_CARRIER_NOT_LINKED_STATUS } from '@api/EpaymentApi';
import { LoginPage } from '@pages/shared/LoginPage';
import { extractAuthToken } from '@features/gateway-pg/helpers/card-precondition';

// Datos overridables por env — mismo naming que mercado-pago-formal/epayment.api.spec.ts
// (MP_UNLINKED_CARRIER_ID / MP_PASSENGER_ID / MP_APP_ID) para no proliferar variables nuevas.
const UNLINKED_CARRIER_ID = Number(process.env.MP_UNLINKED_CARRIER_ID ?? 0); // carrier SIN vendor MP [confirmar]
const PASSENGER_ID = Number(process.env.MP_PASSENGER_ID ?? 0);
const MP_APP_ID = Number(process.env.MP_APP_ID ?? 0);
const AMOUNT = process.env.MP_AMOUNT ?? '10.00';

// Carrier MP dedicado para el LOGIN (auth token) — NUNCA el carrier 1521 (Authorize/Stripe).
const CREDS_READY = Boolean(process.env.USER_CARRIER_MP && process.env.PASS_CARRIER_MP && process.env.BASE_URL);
const DATA_READY = Boolean(UNLINKED_CARRIER_ID && PASSENGER_ID);

test.describe('[MG · B][API] MercadoPago — ePayment sobre carrier sin pasarela vinculada @regression @gateway @gateway-pg @mercadopago', () => {
	test.use({ role: 'carrier' });
	test.skip(!CREDS_READY, 'Faltan USER_CARRIER_MP / PASS_CARRIER_MP / BASE_URL (carrier ARG) — configurar .env.test');

	let authToken: string;

	// Login por UI (carrier MP) una sola vez; el token se extrae interceptando el header
	// Authorization del SPA — mismo patrón que cleaning-wallets.api.spec.ts / mp-integration-deltas.
	test.beforeAll(async ({ browser }) => {
		if (!CREDS_READY) return;
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			const login = new LoginPage(page, 'carrier');
			await login.goto();
			await login.login(process.env.USER_CARRIER_MP as string, process.env.PASS_CARRIER_MP as string);
			await page.waitForURL(/dashboard/, { timeout: 30_000 });
			let token: string | null = null;
			for (let attempt = 0; attempt < 3 && !token; attempt++) {
				token = await extractAuthToken(page);
			}
			expect(token, 'no se pudo extraer el JWT del SPA tras el login (carrier MP)').toBeTruthy();
			authToken = token as string;
		} finally {
			await context.close();
		}
	});

	test(
		'[B-01] carrier sin pasarela vinculada → 412 CARRIER_NOT_LINKED',
		{ annotation: [{ type: 'tms', description: 'MG-146' }] },
		async ({ request }) => {
			test.skip(
				!DATA_READY,
				'Faltan MP_UNLINKED_CARRIER_ID / MP_PASSENGER_ID (carrier sin vendor MP conectado) [confirmar].'
			);

			// No requiere tarjeta real ni hold: el gate 412 se resuelve ANTES de tocar el
			// pago — por eso cardId es un placeholder inerte (nunca se llega a usarlo).
			const res = await new EpaymentApi({ request }).startEpayment({
				carrierId: UNLINKED_CARRIER_ID,
				passengerId: PASSENGER_ID,
				cardId: 'placeholder-no-op',
				amount: AMOUNT,
				hold: false,
				mercadopagoAppId: MP_APP_ID || undefined,
				authToken
			});

			expect(
				res.status === MP_CARRIER_NOT_LINKED_STATUS || res.raw.includes('CARRIER_NOT_LINKED'),
				`esperado 412 CARRIER_NOT_LINKED, status=${res.status} body=${res.raw}`
			).toBe(true);
		}
	);
});
