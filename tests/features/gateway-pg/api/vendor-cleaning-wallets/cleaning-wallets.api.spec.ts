/**
 * [MG · área G][API] vendor/cleaningWallets — CONTRATO HTTP (desvinculación de pasarela).
 *
 * Endpoint bajo prueba: POST /magiis-v0.2/vendor/cleaningWallets/{provider}/{carrierId}/{appId}
 *   {carrierId} = userId del ADMIN del carrier (NO carrier_account.id). {appId} = MercadopagoApp.id.
 *
 * Trazabilidad: área G (desvinculación / cleaning) · ATR MG-515 · ATP MG-178 · release MG-3.
 * Capa: API (contrato). El EFECTO (borrado físico de wallets/cards, estado del link) es DB →
 *       cleaning-wallets-db.api.spec.ts.
 *
 * Casos NO destructivos (corren con solo creds + token, no mutan nada):
 *   - 404: carrierId (userId) inexistente.
 *   - 400: provider inválido (VENDOR_INVALID_CODE).
 * Caso destructivo (200-happy): DESVINCULA la pasarela del carrier 1521 (COMPARTIDO por la suite
 *   gateway) → TRIPLE GATE + default OFF. Requiere MG25_RUN_DESTRUCTIVE=1 + Oracle + datos de 1521.
 *   Tras correrlo hay que RE-VINCULAR manualmente (Stripe requiere `code` OAuth — no automatizable).
 */

// skips env-gated (creds / destructivo) intencionales en este pack.
/* eslint-disable playwright/no-skipped-test */

import { test, expect } from '@TestBase';
import { VendorApi, type VendorProvider } from '@api/VendorApi';
import {
	oracleConfigFromEnv,
	countWalletsByCarrierAndApp,
	countCardsByCarrierAndApp
} from '@features/gateway-pg/helpers/oracle-wallet';
import { LoginPage } from '@pages/shared/LoginPage';
import { extractAuthToken } from '@features/gateway-pg/helpers/card-precondition';

// Datos overridables por env. Los del carrier 1521 en TEST NO pudieron descubrirse por DB
// (no hay ORACLE_*_TEST configurado) → defaults 0 = placeholder [confirmar en TEST].
const PROVIDER = (process.env.MG25_PROVIDER as VendorProvider) ?? 'STRIPE';
const CARRIER_USER_ID = Number(process.env.MG25_CARRIER_USER_ID ?? 0); // admin userId de 1521 [confirmar]
const APP_ID = Number(process.env.MG25_APP_ID ?? 0); // appId STRIPE en TEST [confirmar]
// carrier_account.id (dueño de wallets/cards) — para la aserción de invariancia del caso provider inválido.
const CARRIER_ACCOUNT_ID = process.env.CARRIER_ID ?? '1521';
const USER_NONEXISTENT = 99_999_999;

const CREDS_READY = Boolean(process.env.USER_CARRIER && process.env.PASS_CARRIER && process.env.BASE_URL);
const DESTRUCTIVE_OK = process.env.MG25_RUN_DESTRUCTIVE === '1';
const ORACLE = oracleConfigFromEnv();

test.describe('[MG · G][API] vendor/cleaningWallets @regression @gateway-unlink', () => {
	test.use({ role: 'carrier' });
	test.skip(!CREDS_READY, 'Faltan USER_CARRIER / PASS_CARRIER / BASE_URL — configurar .env.test');

	let authToken: string;

	// Login por UI UNA sola vez; el token se extrae interceptando el header Authorization del SPA
	// (mismo patrón que counts-reset.api.spec.ts — no hay endpoint de API-login configurado).
	test.beforeAll(async ({ browser }) => {
		if (!CREDS_READY) return;
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

	test(
		'[G-NEG-USER] carrierId (userId) inexistente → 404 USER_NOT_FOUND / CARRIER_NOT_FOUND',
		{
			annotation: [{ type: 'tms', description: 'MG-166' }]
		},
		async ({ request }) => {
			// No destructivo: un userId inexistente no borra nada.
			const res = await new VendorApi({ request }).cleaningWallets({
				provider: PROVIDER,
				carrierUserId: USER_NONEXISTENT,
				appId: APP_ID || 1,
				authToken
			});
			expect(res.status, `esperado 404, body=${res.body}`).toBe(404);
		}
	);

	test(
		'[G-NEG-PROVIDER] provider inválido → 400 VENDOR_INVALID_CODE (sin mutar el carrier)',
		{
			annotation: [{ type: 'tms', description: 'MG-166' }]
		},
		async ({ request }) => {
			// ⚠ El backend valida el provider DESPUÉS de la fase-1 (mutación): resuelve carrier →
			// mgwLinkedService.cleaningWallets(carrier, provider) → recién el switch lanza 400. Un provider
			// fuera del enum ("FOO") es no-op SOLO porque no existe MercadopagoApp.appCode="FOO" (seguridad
			// data-driven, no un guard de input). Para no depender de esa suerte con un carrier real,
			// asertamos INVARIANCIA de wallets/cards (pre == post) cuando hay Oracle.
			const filter = { carrierAccountId: CARRIER_ACCOUNT_ID, appId: APP_ID || 1 };
			const before = ORACLE
				? {
						wallets: await countWalletsByCarrierAndApp(ORACLE, filter),
						cards: await countCardsByCarrierAndApp(ORACLE, filter)
					}
				: null;

			const res = await new VendorApi({ request }).cleaningWallets({
				provider: 'FOO' as VendorProvider,
				carrierUserId: CARRIER_USER_ID || USER_NONEXISTENT,
				appId: APP_ID || 1,
				authToken
			});
			expect(res.status, `esperado 400, body=${res.body}`).toBe(400);

			if (ORACLE && before) {
				const after = {
					wallets: await countWalletsByCarrierAndApp(ORACLE, filter),
					cards: await countCardsByCarrierAndApp(ORACLE, filter)
				};
				expect(after.wallets, 'provider inválido NO debe borrar wallets del carrier').toBe(before.wallets);
				expect(after.cards, 'provider inválido NO debe borrar cards del carrier').toBe(before.cards);
			}
		}
	);

	test(
		'[G-HAPPY] desvinculación de pasarela → 200 (DESTRUCTIVO — triple gate)',
		{
			annotation: [
				{ type: 'tms', description: 'MG-166' },
				{ type: 'issue', description: 'destructivo: desvincula 1521' }
			]
		},
		async ({ request }) => {
			test.skip(
				!DESTRUCTIVE_OK,
				'destructivo: desvincula la pasarela del carrier 1521 (compartido). Setear MG25_RUN_DESTRUCTIVE=1 + entorno dedicado + teardown de re-vinculación.'
			);
			test.skip(
				!ORACLE,
				'destructivo requiere Oracle (ORACLE_*_TEST) para verificar el efecto y planear el teardown.'
			);
			test.skip(
				!CARRIER_USER_ID || !APP_ID,
				'Faltan MG25_CARRIER_USER_ID / MG25_APP_ID (datos de 1521 en TEST) [confirmar].'
			);

			const res = await new VendorApi({ request }).cleaningWallets({
				provider: PROVIDER,
				carrierUserId: CARRIER_USER_ID,
				appId: APP_ID,
				authToken
			});
			expect(res.status, `esperado 200, body=${res.body}`).toBe(200);

			// eslint-disable-next-line no-console -- recordatorio operativo del teardown manual.
			console.warn(
				`[cleaning-wallets] ⚠ Carrier 1521 DESVINCULADO (provider=${PROVIDER}). Re-vincular MANUALMENTE: ` +
					'Stripe requiere `code` OAuth (no automatizable). El re-link rechaza 409 si el status sigue CLEANING_WALLETS.'
			);
		}
	);
});
