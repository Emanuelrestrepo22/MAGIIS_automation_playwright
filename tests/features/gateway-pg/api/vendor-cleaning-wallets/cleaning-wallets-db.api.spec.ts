/**
 * [MG · área G][DB] vendor/cleaningWallets — verificación de EFECTO (trifuerza · capa DB).
 *
 * Complementa el pack de contrato `cleaning-wallets.api.spec.ts`: la API confirma 200, pero el
 * borrado FÍSICO de user_wallet + card (STRIPE/AUTHORIZE/EBIZ, cascade) y el estado del link
 * (mgw_linked ACTIVE/DELETE_DATE) solo se ven en DB.
 *
 * `deleteXxxVendor` es @Async → el 200 llega ANTES de terminar el borrado; por eso el count=0 se
 * verifica con expect.poll (reintentos), no con una lectura inmediata.
 *
 * TRIPLE GATE (default OFF — el destructivo NO corre por accidente):
 *   1) ORACLE (ORACLE_*_TEST) · 2) CREDS_READY (USER_CARRIER/PASS_CARRIER/BASE_URL) ·
 *   3) MG25_RUN_DESTRUCTIVE=1. Sin las tres → skip.
 *   Además requiere MG25_CARRIER_USER_ID (admin userId de 1521) + MG25_APP_ID (appId STRIPE TEST).
 *
 * ⚠ Carrier 1521 es COMPARTIDO por la suite gateway → desvincularlo la rompe hasta re-vincular.
 *   Teardown de re-link NO automatizable (Stripe requiere `code` OAuth) → ver test [G-RELINK] fixme
 *   + console.warn en afterAll. En un run real hay que re-vincular manualmente.
 */

/* eslint-disable playwright/no-skipped-test, no-console */

import { test, expect } from '@TestBase';
import { VendorApi, type VendorProvider } from '@api/VendorApi';
import {
	oracleConfigFromEnv,
	countWalletsByCarrierAndApp,
	countCardsByCarrierAndApp,
	readMgwLinkStatus
} from '@features/gateway-pg/helpers/oracle-wallet';
import { LoginPage } from '@pages/shared/LoginPage';
import { extractAuthToken } from '@features/gateway-pg/helpers/card-precondition';

const PROVIDER = (process.env.MG25_PROVIDER as VendorProvider) ?? 'STRIPE';
// carrier_account.id (dueño de wallets/cards/mgw_linked) — 1521 en TEST.
const CARRIER_ACCOUNT_ID = process.env.CARRIER_ID ?? '1521';
// admin userId del carrier (path param del endpoint) — [confirmar en TEST], placeholder 0.
const CARRIER_USER_ID = Number(process.env.MG25_CARRIER_USER_ID ?? 0);
// MercadopagoApp.id del provider en TEST — [confirmar], placeholder 0.
const APP_ID = Number(process.env.MG25_APP_ID ?? 0);

const ORACLE = oracleConfigFromEnv();
const CREDS_READY = Boolean(process.env.USER_CARRIER && process.env.PASS_CARRIER && process.env.BASE_URL);
const DESTRUCTIVE_OK = process.env.MG25_RUN_DESTRUCTIVE === '1';

test.describe('[MG · G][DB] vendor/cleaningWallets — verificación de efecto @regression @gateway-unlink', () => {
	test.use({ role: 'carrier' });
	// TRIPLE GATE.
	test.skip(!ORACLE, 'Sin conexión Oracle (ORACLE_*_TEST) — capa DB.');
	test.skip(!CREDS_READY, 'Faltan USER_CARRIER / PASS_CARRIER / BASE_URL.');
	test.skip(
		!DESTRUCTIVE_OK,
		'destructivo: desvincula la pasarela del carrier 1521 (compartido). Setear MG25_RUN_DESTRUCTIVE=1 + entorno dedicado + teardown de re-vinculación.'
	);
	test.skip(
		!CARRIER_USER_ID || !APP_ID,
		'Faltan MG25_CARRIER_USER_ID / MG25_APP_ID (datos de 1521 en TEST) [confirmar].'
	);

	let authToken: string;

	test.beforeAll(async ({ browser }) => {
		if (!ORACLE || !CREDS_READY || !DESTRUCTIVE_OK || !CARRIER_USER_ID || !APP_ID) return;
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

	test.afterAll(() => {
		if (!DESTRUCTIVE_OK) return;
		console.warn(
			`[cleaning-wallets-db] ⚠ Carrier ${CARRIER_ACCOUNT_ID} pudo quedar DESVINCULADO (provider=${PROVIDER}). ` +
				'Re-vincular MANUALMENTE antes de correr la suite gateway (Stripe requiere `code` OAuth — no automatizable). ' +
				'El re-link (POST vendor/{provider} con VendorRegisterDTO) rechaza 409 si el status sigue CLEANING_WALLETS.'
		);
	});

	test(
		'[G-DB-EFFECT] cleaning → user_wallet=0, card=0, link desactivado',
		{
			annotation: [{ type: 'tms', description: 'MG-166' }]
		},
		async ({ request }) => {
			const cfg = ORACLE!;
			const filter = { carrierAccountId: CARRIER_ACCOUNT_ID, appId: APP_ID };

			// Precondición: debe haber al menos una card sembrada para que el borrado sea observable.
			const cardsBefore = await countCardsByCarrierAndApp(cfg, filter);
			test.skip(
				cardsBefore === 0,
				`sin cards para carrier ${CARRIER_ACCOUNT_ID} / app ${APP_ID} — sembrar card antes de correr.`
			);

			// Desvinculación (destructiva).
			const res = await new VendorApi({ request }).cleaningWallets({
				provider: PROVIDER,
				carrierUserId: CARRIER_USER_ID,
				appId: APP_ID,
				authToken
			});
			expect(res.status, `cleaningWallets esperado 200, body=${res.body}`).toBe(200);

			// @Async: el borrado físico termina DESPUÉS del 200 → poll hasta 0.
			await expect
				.poll(async () => countWalletsByCarrierAndApp(cfg, filter), {
					message: 'user_wallet debe quedar en 0 tras el cleaning (borrado físico cascade)',
					timeout: 20_000,
					intervals: [1_000, 2_000, 3_000, 5_000]
				})
				.toBe(0);

			const cardsAfter = await countCardsByCarrierAndApp(cfg, filter);
			expect(cardsAfter, 'card debe quedar en 0 (cascade desde user_wallet)').toBe(0);

			// Estado del link: sin columna STATUS física → se infiere de ACTIVE=0 y/o DELETE_DATE seteado.
			const links = await readMgwLinkStatus(cfg, { carrierAccountId: CARRIER_ACCOUNT_ID, provider: PROVIDER });
			expect(links.length, 'debe existir la fila mgw_linked del provider').toBeGreaterThan(0);
			const unlinked = links.some(l => l.active === 0 || l.active === null || l.deleteDate !== null);
			expect(
				unlinked,
				`mgw_linked debe reflejar desvinculación (active=0 o delete_date). Filas: ${JSON.stringify(links)}`
			).toBe(true);
		}
	);

	test('[G-RELINK] teardown de re-vinculación', () => {
		test.fixme(
			true,
			'Re-link no automatizable: Stripe/MP requieren `code` OAuth. Re-vincular manualmente por UI ' +
				'(POST vendor/{provider} con VendorRegisterDTO). Authorize/Ebiz sí usan keys estáticas.'
		);
	});
});
