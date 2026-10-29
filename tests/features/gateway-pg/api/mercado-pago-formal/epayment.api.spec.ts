/**
 * [MG · E/F/COB][API] MercadoPago — ePayment → finalize (hold / cobro · CONTRATO HTTP).
 *
 * Equivalente MP del hold + cobro de Stripe. Componente: EpaymentApi (KATA L3).
 * Los gates de negocio se asierten como contrato: 412 CARRIER_NOT_LINKED · 2077 HOLD_NOT_SUPPORTED
 * (MP no soporta hold → verificationFoundsCard, delta vs Stripe).
 *
 * Trazabilidad (describe-level TMS):
 *   - MG-160 (área E) — alta con PSP sin hold → 2077 HOLD_NOT_SUPPORTED.
 *   - MG-161 (área F) — alta Cargo a Bordo → startEpayment + finalize.
 *   - MG-162 (área F/COB) — lectura de estado del cobro (approved).
 *   - MG-163 (área COB) — cobro rechazado (keyword de rechazo del pax).
 *   - MG-164 (área F) — carrier sin pasarela vinculada → 412 CARRIER_NOT_LINKED.
 *
 * ⚠️ GATED — CODE-ONLY, ejecución REAL diferida a UAT:
 *   1) Gate creds: USER_CARRIER / PASS_CARRIER / BASE_URL.
 *   2) Gate "MP no transacciona en TEST": el cobro/hold real exige el sandbox MP vivo con tarjeta
 *      real del pax → MP_SANDBOX_TRANSACTS=1 SÓLO en UAT.
 *   Sin gates → skip LIMPIO (sin error).
 */

// skips env-gated (creds / UAT-only) intencionales en este pack formal.
/* eslint-disable playwright/no-skipped-test */

import { test, expect } from '@TestFixture';
import { EpaymentApi, MP_CARRIER_NOT_LINKED_STATUS, MP_HOLD_NOT_SUPPORTED_CODE } from '@api/EpaymentApi';
import { mercadoPagoGatewayAdapter } from '@features/gateway-pg/helpers/adapters/mercadoPagoGatewayAdapter';
import { LoginPage } from '@pages/shared/LoginPage';
import { extractAuthToken } from '@features/gateway-pg/helpers/card-precondition';

// Datos [confirmar en UAT]; placeholders neutros para skip limpio en TEST.
const CARRIER_ACCOUNT_ID = Number(process.env.CARRIER_ID ?? 0);
const PASSENGER_ID = Number(process.env.MP_PASSENGER_ID ?? 0);
const MP_APP_ID = Number(process.env.MP_APP_ID ?? 0);
// cardId persistido del pax (approved / rejected) — sembrados en UAT.
const MP_CARD_ID = process.env.MP_CARD_ID ?? '';
const MP_REJECT_CARD_ID = process.env.MP_REJECT_CARD_ID ?? '';
// carrier SIN pasarela vinculada (para el gate 412) — [confirmar UAT].
const UNLINKED_CARRIER_ID = Number(process.env.MP_UNLINKED_CARRIER_ID ?? 0);
const AMOUNT = process.env.MP_AMOUNT ?? '10.00';

const CREDS_READY = Boolean(process.env.USER_CARRIER && process.env.PASS_CARRIER && process.env.BASE_URL);
const MP_UAT_EXEC = process.env.MP_SANDBOX_TRANSACTS === '1';

test.describe(
	`[MG · E/F/COB][API] ${mercadoPagoGatewayAdapter.displayName} — ePayment → finalize @regression @gateway @gateway-pg @mercadopago`,
	{
		// MG-162 y MG-164 salieron de esta lista: ningún test de este spec valida idempotencia (F-02) ni
		// finalize-falla/webhook-ausente (F-04). MG-146 entra porque `[F-02]` de acá SÍ valida el gate
		// "operar sin pasarela conectada" (B-01) con su 412 CARRIER_NOT_LINKED.
		annotation: [
			{ type: 'tms', description: 'MG-160' },
			{ type: 'tms', description: 'MG-161' },
			{ type: 'tms', description: 'MG-163' },
			{ type: 'tms', description: 'MG-146' }
		]
	},
	() => {
		test.skip(!CREDS_READY, 'Faltan USER_CARRIER / PASS_CARRIER / BASE_URL (carrier ARG) — configurar .env.test');
		test.skip(
			!MP_UAT_EXEC,
			'MercadoPago no transacciona en el entorno TEST — el cobro/hold real exige el sandbox MP vivo con tarjeta del pax. ' +
				'Ejecución real diferida a UAT: setear MP_SANDBOX_TRANSACTS=1 + MP_CARD_ID / MP_PASSENGER_ID / CARRIER_ID.'
		);

		let authToken: string;

		test.beforeAll(async ({ browser }) => {
			if (!CREDS_READY || !MP_UAT_EXEC) return;
			const context = await browser.newContext();
			const page = await context.newPage();
			try {
				const login = new LoginPage(page, 'carrier');
				await login.goto();
				await login.login(process.env.USER_CARRIER as string, process.env.PASS_CARRIER as string);
				await page.waitForURL(/dashboard/, { timeout: 30_000 });
				let token: string | null = null;
				for (let attempt = 0; attempt < 3 && !token; attempt++) {
					token = await extractAuthToken(page);
				}
				expect(token, 'no se pudo extraer el JWT del SPA tras el login').toBeTruthy();
				authToken = token as string;
			} finally {
				await context.close();
			}
		});

		// E-01 — MG-160: alta con PSP intentando HOLD → 2077 HOLD_NOT_SUPPORTED (delta MP vs Stripe).
		test(
			'[E-01] startEpayment con hold → 2077 HOLD_NOT_SUPPORTED',
			{
				annotation: [{ type: 'tms', description: 'MG-160' }]
			},
			async ({ request }) => {
				test.skip(
					!CARRIER_ACCOUNT_ID || !PASSENGER_ID || !MP_CARD_ID,
					'Faltan CARRIER_ID / MP_PASSENGER_ID / MP_CARD_ID (datos de UAT) [confirmar].'
				);
				const res = await new EpaymentApi({ request }).startEpayment({
					carrierId: CARRIER_ACCOUNT_ID,
					passengerId: PASSENGER_ID,
					cardId: MP_CARD_ID,
					amount: AMOUNT,
					hold: true,
					mercadopagoAppId: MP_APP_ID,
					authToken
				});
				const code = res.body?.code;
				expect(
					res.status === 2077 ||
						String(code) === String(MP_HOLD_NOT_SUPPORTED_CODE) ||
						res.raw.includes('HOLD_NOT_SUPPORTED'),
					`esperado HOLD_NOT_SUPPORTED (2077), status=${res.status} body=${res.raw}`
				).toBe(true);
			}
		);

		// F-01 — MG-161: alta Cargo a Bordo (sin hold) → startEpayment + finalize aprobado.
		// MG-162 removido: cobrar UNA vez con éxito no acredita "un reintento no genera doble cargo".
		test(
			'[F-01] startEpayment (sin hold) + finalize → aprobado',
			{
				annotation: [{ type: 'tms', description: 'MG-161' }]
			},
			async ({ request }) => {
				test.skip(
					!CARRIER_ACCOUNT_ID || !PASSENGER_ID || !MP_CARD_ID,
					'Faltan CARRIER_ID / MP_PASSENGER_ID / MP_CARD_ID (datos de UAT) [confirmar].'
				);
				const api = new EpaymentApi({ request });

				const start = await api.startEpayment({
					carrierId: CARRIER_ACCOUNT_ID,
					passengerId: PASSENGER_ID,
					cardId: MP_CARD_ID,
					amount: AMOUNT,
					hold: false,
					mercadopagoAppId: MP_APP_ID,
					authToken
				});
				expect(start.ok, `startEpayment esperado 2xx, status=${start.status} body=${start.raw}`).toBe(true);
				const ePaymentId = start.body?.id;
				expect(ePaymentId, 'startEpayment debe devolver el id del ePayment').toBeTruthy();

				const finalize = await api.finalizeEpayment({ ePaymentId: ePaymentId as number | string, authToken });
				expect(finalize.ok, `finalize esperado 2xx, status=${finalize.status} body=${finalize.raw}`).toBe(true);

				// MG-162 — el estado del cobro debe quedar approved.
				const statusRes = await api.getEpaymentStatus({ ePaymentId: ePaymentId as number | string, authToken });
				expect(statusRes.body?.status, `estado esperado approved, body=${statusRes.raw}`).toBe('approved');
			}
		);

		// COB-01 — MG-163: cobro con tarjeta de rechazo → estado rejected.
		test(
			'[COB-01] cobro con tarjeta de rechazo → rejected',
			{
				annotation: [{ type: 'tms', description: 'MG-163' }]
			},
			async ({ request }) => {
				test.skip(
					!CARRIER_ACCOUNT_ID || !PASSENGER_ID || !MP_REJECT_CARD_ID,
					'Faltan CARRIER_ID / MP_PASSENGER_ID / MP_REJECT_CARD_ID (tarjeta OTHE sembrada en UAT) [confirmar].'
				);
				const res = await new EpaymentApi({ request }).startEpayment({
					carrierId: CARRIER_ACCOUNT_ID,
					passengerId: PASSENGER_ID,
					cardId: MP_REJECT_CARD_ID,
					amount: AMOUNT,
					hold: false,
					mercadopagoAppId: MP_APP_ID,
					authToken
				});
				// La tarjeta OTHE (keyword de rechazo, fixture MP) produce statusDetail cc_rejected_*.
				expect(res.body?.status, `esperado rejected, body=${res.raw}`).toBe('rejected');
			}
		);

		// MG-146 (B-01), no MG-164: el Test que dice "el sistema bloquea operar cuando no hay pasarela
		// conectada" es B-01, y su Step 2 es "intentar una operación de dinero sobre ese carrier" — este
		// 412 CARRIER_NOT_LINKED es su oráculo exacto. MG-164 (F-04) es finalize-falla/webhook-ausente.
		// El id local del test se deja en `[F-02]` para no romper greps ni el histórico de corridas.
		test(
			'[F-02] carrier sin pasarela vinculada → 412 CARRIER_NOT_LINKED',
			{
				annotation: [{ type: 'tms', description: 'MG-146' }]
			},
			async ({ request }) => {
				test.skip(
					!UNLINKED_CARRIER_ID || !PASSENGER_ID,
					'Faltan MP_UNLINKED_CARRIER_ID / MP_PASSENGER_ID (carrier sin MP en UAT) [confirmar].'
				);
				const res = await new EpaymentApi({ request }).startEpayment({
					carrierId: UNLINKED_CARRIER_ID,
					passengerId: PASSENGER_ID,
					cardId: MP_CARD_ID || 'placeholder',
					amount: AMOUNT,
					hold: false,
					mercadopagoAppId: MP_APP_ID,
					authToken
				});
				expect(
					res.status === MP_CARRIER_NOT_LINKED_STATUS || res.raw.includes('CARRIER_NOT_LINKED'),
					`esperado 412 CARRIER_NOT_LINKED, status=${res.status} body=${res.raw}`
				).toBe(true);
			}
		);
	}
);
