/**
 * [MG · MPX][API] Mercado Pago — deltas de integración (Fase 2 trifuerza · capa API).
 *
 * Deltas MP del ATP MG-178 que NO requieren transacción de tarjeta (por eso son automatizables en
 * TEST, a diferencia del cobro/declines que van a UAT con tarjeta real):
 *   - MG-167 (área G): la desvinculación MP NO ejecuta cleaning LOCAL de wallets/cards
 *     (las tarjetas del pax viven en la cuenta MP, no en UserWallet local) → INVARIANCIA local.
 *   - MG-194 (MPX TC1): la validación de tarjeta MP no dispara challenge 3DS.        [fixme: falta endpoint]
 *   - MG-195 (MPX TC2): las tarjetas del pax viven en la cuenta MP (customer/cards).  [fixme: falta endpoint]
 *   - MG-160 (área E): alta con PSP sin hold → verificationFoundsCard / 2077.         [fixme: falta endpoint]
 *   - MG-475 (área K/WEB): retorno OAuth MP no invocado en ngOnInit [gap web].        [fixme: gap producto]
 *
 * Capa API; el EFECTO local (invariancia de wallets/cards) se verifica por DB (oracle-wallet).
 * Región MP = ARG (carrier ARG). Endpoint reutilizado: POST vendor/cleaningWallets/{provider}/{carrierUserId}/{appId}.
 */

// skips env-gated (creds / destructivo) intencionales.
/* eslint-disable playwright/no-skipped-test */

import { test, expect } from '@TestBase';
import { VendorApi, type VendorProvider } from '@api/VendorApi';
import { oracleConfigFromEnv, countWalletsByCarrierAndApp, countCardsByCarrierAndApp } from '@features/gateway-pg/helpers/oracle-wallet';
import { LoginPage } from '@pages/shared/LoginPage';
import { extractAuthToken } from '@features/gateway-pg/helpers/card-precondition';

const MP_PROVIDER = 'MERCADOPAGO' as VendorProvider;
const CARRIER_USER_ID = Number(process.env.MP_CARRIER_USER_ID ?? 0); // admin userId del carrier ARG [confirmar]
const APP_ID = Number(process.env.MP_APP_ID ?? 0); // MercadopagoApp.id de MP en TEST ARG [confirmar]
const CARRIER_ACCOUNT_ID = process.env.CARRIER_ID ?? '0';

const CREDS_READY = Boolean(process.env.USER_CARRIER && process.env.PASS_CARRIER && process.env.BASE_URL);
const DESTRUCTIVE_OK = process.env.MP_RUN_DESTRUCTIVE === '1';
const ORACLE = oracleConfigFromEnv();

test.describe('[MG · MPX][API] Mercado Pago — deltas de integración @regression @gateway-pg @mercado-pago', () => {
	test.use({ role: 'carrier' });
	test.skip(!CREDS_READY, 'Faltan USER_CARRIER / PASS_CARRIER / BASE_URL (carrier ARG) — configurar .env.test');

	let authToken: string;

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

	// MG-167 — DELTA MP: desvincular MP NO borra wallets/cards LOCALES (viven en MP).
	// Contraparte del cascade de Stripe (que SÍ borra local). Destructivo (desvincula MP del carrier ARG) → triple gate.
	test('[MPX-G] desvinculación MP no ejecuta cleaning local (wallets/cards locales invariantes)', {
		annotation: [{ type: 'tms', description: 'MG-167' }, { type: 'issue', description: 'destructivo: desvincula MP del carrier ARG' }]
	}, async ({ request }) => {
		test.skip(!DESTRUCTIVE_OK, 'destructivo: desvincula MP del carrier ARG. Setear MP_RUN_DESTRUCTIVE=1 + entorno dedicado.');
		test.skip(!ORACLE, 'requiere Oracle (ORACLE_*_TEST) para verificar invariancia local.');
		test.skip(!CARRIER_USER_ID || !APP_ID, 'Faltan MP_CARRIER_USER_ID / MP_APP_ID (datos MP del carrier ARG en TEST) [confirmar].');

		const filter = { carrierAccountId: CARRIER_ACCOUNT_ID, appId: APP_ID };
		const before = { wallets: await countWalletsByCarrierAndApp(ORACLE!, filter), cards: await countCardsByCarrierAndApp(ORACLE!, filter) };

		const res = await new VendorApi({ request }).cleaningWallets({ provider: MP_PROVIDER, carrierUserId: CARRIER_USER_ID, appId: APP_ID, authToken });
		expect(res.status, `esperado 200, body=${res.body}`).toBe(200);

		const after = { wallets: await countWalletsByCarrierAndApp(ORACLE!, filter), cards: await countCardsByCarrierAndApp(ORACLE!, filter) };
		// DELTA MP (vs Stripe): las tarjetas viven en MP → el cleaning NO borra local.
		expect(after.wallets, 'MP: la desvinculación NO debe borrar wallets locales').toBe(before.wallets);
		expect(after.cards, 'MP: la desvinculación NO debe borrar cards locales').toBe(before.cards);
	});

	// Deltas pendientes de endpoint/component API (no hay superficie en el repo hoy).
	test('[MPX TC1] validación de tarjeta MP no dispara challenge 3DS', { annotation: [{ type: 'tms', description: 'MG-194' }] }, async () => {
		test.fixme(true, 'Falta endpoint/component de validación de tarjeta MP (createCardToken/validate). Confirmar contrato antes de automatizar.');
	});
	test('[MPX TC2] tarjetas del pax viven en la cuenta MP (customer/cards)', { annotation: [{ type: 'tms', description: 'MG-195' }] }, async () => {
		test.fixme(true, 'Falta endpoint MP customer/cards. La ausencia en UserWallet local se cubre parcialmente en MG-167; el positivo (existen en MP) requiere API MP.');
	});
	test('[MPX E] alta con PSP sin hold → verificationFoundsCard (HOLD_NOT_SUPPORTED 2077)', { annotation: [{ type: 'tms', description: 'MG-160' }] }, async () => {
		test.fixme(true, 'Falta component API de alta/hold para assert del code 2077. Confirmar endpoint de alta de viaje + payload.');
	});
	test('[MPX K/WEB] retorno OAuth MP no invocado en ngOnInit [gap web]', { annotation: [{ type: 'tms', description: 'MG-475' }] }, async () => {
		test.fixme(true, 'Gap de producto (web) — validar cuando se corrija el ngOnInit del callback OAuth MP. Hoy no hay comportamiento estable que asertar.');
	});
});
