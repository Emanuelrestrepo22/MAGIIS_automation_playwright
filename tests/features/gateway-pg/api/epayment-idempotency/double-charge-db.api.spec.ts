/**
 * [MG · área F][DB] ePayment — DOBLE COBRO / idempotencia (AC9 · MG-164 / F-02).
 * ============================================================================
 *
 * GATE EJECUTABLE (verificación, NO fix). El test cobra un viaje, RE-cobra el MISMO viaje y
 * cuenta las filas APROBADAS en `mgw_transactions` por `transaction_ref`. El resultado esperado
 * de negocio es UNA sola fila (count === 1).
 *
 * ⚠ ESTE TEST ESTÁ DISEÑADO PARA DAR ROJO hasta que dev agregue Idempotency-Key / dedup en el
 *   backend. El ROJO ES LA EVIDENCIA del gap AC9: sin deduplicación, el reintento del cobro crea
 *   una 2ª fila aprobada con el mismo transaction_ref (count === 2) → doble cobro al pasajero.
 *   No es un test flaky ni mal escrito: mide el riesgo NO-GO del release gateway.
 *
 * Detector = capa DB Oracle (`countMgwTransactionsByRef`). El cobro se dispara con el componente
 * KATA `EpaymentApi` (start → finalize). Se ancla a STRIPE (transacciona en TEST); las rutas del
 * cobro y el payload son overridables por env (MP_EPAYMENT_PATH etc.) para apuntar al flujo Stripe.
 *
 * TRIPLE GATE (default OFF — el test MUTA transacciones, no corre por accidente):
 *   1) ORACLE (ORACLE_*_TEST) · 2) CREDS_READY (USER_CARRIER/PASS_CARRIER/BASE_URL) ·
 *   3) MG_RUN_DOUBLE_CHARGE=1 (flag destructivo explícito). Sin las tres → skip limpio.
 *   Además requiere los datos del cobro (abajo) — sin ellos, skip.
 *
 * BINDING POR ENV (el payload de `MercadopagoEpaymentRequest` NO expone transaction_ref ni
 * travelId; se aportan por env para no inventar campos del contrato):
 *   MG_DC_CARRIER_ID     carrier_account.id que cobra.
 *   MG_DC_PASSENGER_ID   userId del pasajero que paga.
 *   MG_DC_AMOUNT         monto a cobrar (decimal string).
 *   MG_DC_CARD_ID        cardId persistido (o MG_DC_TOKEN de un solo uso).
 *   MG_DC_APP_ID         id del app/provider del país (Stripe en TEST).
 *   MG_DC_TX_REF         transaction_ref que ata ambos intentos en DB (clave del detector).
 *   MG_DC_TRAVEL_ID      opcional — travelId del viaje objetivo (traza; el ref es el que verifica).
 */

/* eslint-disable playwright/no-skipped-test, no-console */

import { test, expect } from '@TestBase';
import { EpaymentApi } from '@api/EpaymentApi';
import { oracleConfigFromEnv, countMgwTransactionsByRef } from '@features/gateway-pg/helpers/oracle-wallet';
import { LoginPage } from '@pages/shared/LoginPage';
import { extractAuthToken } from '@features/gateway-pg/helpers/card-precondition';

// Cobro anclado a STRIPE (transacciona en TEST). El backend ePayment es agnóstico del PSP; la
// ruta/payload apuntan al flujo Stripe vía los overrides MP_EPAYMENT_PATH / MP_EPAYMENT_FINALIZE_PATH.
const CARRIER_ID = process.env.MG_DC_CARRIER_ID ?? process.env.CARRIER_ID ?? '';
const PASSENGER_ID = process.env.MG_DC_PASSENGER_ID ?? '';
const AMOUNT = process.env.MG_DC_AMOUNT ?? '';
const CARD_ID = process.env.MG_DC_CARD_ID ?? '';
const TOKEN = process.env.MG_DC_TOKEN ?? '';
const APP_ID = process.env.MG_DC_APP_ID ?? '';
const TX_REF = process.env.MG_DC_TX_REF ?? '';

const ORACLE = oracleConfigFromEnv();
const CREDS_READY = Boolean(process.env.USER_CARRIER && process.env.PASS_CARRIER && process.env.BASE_URL);
const DOUBLE_CHARGE_OK = process.env.MG_RUN_DOUBLE_CHARGE === '1';
const CHARGE_DATA_READY = Boolean(CARRIER_ID && PASSENGER_ID && AMOUNT && (CARD_ID || TOKEN) && APP_ID && TX_REF);

test.describe(
	'[MG · F][DB] ePayment — doble cobro / idempotencia @regression @gateway @idempotency',
	{
		// Traza ATC: F-02 → MG-162, el Test que dice literalmente "un reintento de cobro sobre el mismo
		// viaje no genera doble cargo (idempotencia)" — sus Steps son cobrar, reintentar sobre el MISMO
		// viaje y observar la respuesta, que es exactamente lo que hace este detector DB.
		// Antes decía MG-164, y era una key cruzada: MG-164 (F-04) valida "ePayment cobra pero finalize
		// falla o el webhook no llega", un desenlace que este spec no induce ni observa. MG-164 queda
		// libre hasta que exista el spec que suprima el webhook / haga fallar finalize.
		annotation: [{ type: 'tms', description: 'MG-162' }]
	},
	() => {
		test.use({ role: 'carrier' });

		// TRIPLE GATE + datos del cobro.
		test.skip(!ORACLE, 'Sin conexión Oracle (ORACLE_*_TEST) — capa DB del detector.');
		test.skip(!CREDS_READY, 'Faltan USER_CARRIER / PASS_CARRIER / BASE_URL.');
		test.skip(
			!DOUBLE_CHARGE_OK,
			'destructivo: MUTA transacciones (cobra + re-cobra). Setear MG_RUN_DOUBLE_CHARGE=1 + entorno dedicado.'
		);
		test.skip(
			!CHARGE_DATA_READY,
			'Faltan datos del cobro (MG_DC_CARRIER_ID / MG_DC_PASSENGER_ID / MG_DC_AMOUNT / MG_DC_CARD_ID|MG_DC_TOKEN / MG_DC_APP_ID / MG_DC_TX_REF).'
		);

		let authToken: string;

		test.beforeAll(async ({ browser }) => {
			if (!ORACLE || !CREDS_READY || !DOUBLE_CHARGE_OK || !CHARGE_DATA_READY) return;
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

		test('[F-02] cobrar + re-cobrar el MISMO viaje → una sola fila APROBADA (idempotencia)', async ({
			request
		}) => {
			const cfg = ORACLE!;
			const epayment = new EpaymentApi({ request });

			const chargeInput = {
				carrierId: CARRIER_ID,
				passengerId: PASSENGER_ID,
				amount: AMOUNT,
				...(CARD_ID ? { cardId: CARD_ID } : { token: TOKEN }),
				mercadopagoAppId: APP_ID,
				authToken
			};

			// 1er cobro: start → finalize.
			const start1 = await epayment.startEpayment(chargeInput);
			expect(start1.status, `startEpayment #1 esperado 2xx, body=${start1.raw}`).toBeLessThan(400);
			const ePaymentId1 = start1.body?.id;
			expect(ePaymentId1, 'startEpayment #1 no devolvió ePaymentId').toBeTruthy();
			await epayment.finalizeEpayment({
				ePaymentId: ePaymentId1 as number | string,
				status: 'approved',
				authToken
			});

			// 2º cobro (RE-intento del MISMO cobro): sin Idempotency-Key el backend NO debe duplicar.
			const start2 = await epayment.startEpayment(chargeInput);
			const ePaymentId2 = start2.body?.id;
			if (ePaymentId2) {
				await epayment.finalizeEpayment({
					ePaymentId: ePaymentId2 as number | string,
					status: 'approved',
					authToken
				});
			}

			// DETECTOR DB: filas APROBADAS por transaction_ref debe ser 1 (no 2). @Async → poll.
			// ⚠ Diseñado para dar ROJO (count===2) mientras el backend NO deduplique — evidencia AC9.
			await expect
				.poll(
					async () =>
						countMgwTransactionsByRef(cfg, { transactionRef: TX_REF, statuses: ['APPROVED', 'CONFIRM'] }),
					{
						message:
							`GAP AC9 (MG-164/F-02): mgw_transactions con transaction_ref=${TX_REF} debe tener 1 fila aprobada. ` +
							'Si es 2 → doble cobro (falta Idempotency-Key/dedup en backend). El rojo ES la evidencia.',
						timeout: 20_000,
						intervals: [1_000, 2_000, 3_000, 5_000]
					}
				)
				.toBe(1);
		});
	}
);
