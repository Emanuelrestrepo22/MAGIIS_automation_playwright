/**
 * [MG · COB-48][API] Authorize.net — regresión gateway-agnóstica de `allCards`.
 *
 * TC-PAY-COB-48 (idmap `atp-mg-gateway-idmap.md` §"COB Authorize"): `GET
 * passengers/{passengerId}/allCards` para un pax SIN wallet debe responder 200 con
 * lista vacía — NUNCA 500. El endpoint no tiene branching por gateway (misma ruta,
 * mismo controller) → esta suite reusa el ATC `CardApi.listAllCards` YA cableado a
 * MG-172 (ver `card-lifecycle.api.spec.ts`, caso MP), ejecutándolo en contexto de un
 * carrier Authorize para dejar constancia explícita de la equivalencia cross-gateway.
 *
 * ⚠️ DRIFT documentado (ver `.context/reports/authorize-coverage-gap-2026-07-23.md`
 * §6.1 + idmap nota final): MG-551 ≡ MG-149 (C-02) en semántica; NO se duplica el
 * método de `CardApi` — se agrega este spec formal con su propia trazabilidad Xray.
 *
 * GATED — CODE-ONLY hasta confirmar datos de un carrier Authorize + pax sin wallet:
 *   USER_CARRIER / PASS_CARRIER / BASE_URL / CARRIER_ID / AUTHORIZE_PASSENGER_ID.
 * Sin gates → skip LIMPIO (mismo patrón que `card-lifecycle.api.spec.ts`).
 */

// skips env-gated (creds / datos UAT) intencionales en este pack formal.
/* eslint-disable playwright/no-skipped-test */

import { test, expect } from '@TestFixture';
import { CardApi } from '@api/CardApi';
import { LoginPage } from '@pages/shared/LoginPage';
import { extractAuthToken } from '@features/gateway-pg/helpers/card-precondition';

const CARRIER_ACCOUNT_ID = Number(process.env.CARRIER_ID ?? 0);
const PASSENGER_ID = Number(process.env.AUTHORIZE_PASSENGER_ID ?? 0);

const CREDS_READY = Boolean(process.env.USER_CARRIER && process.env.PASS_CARRIER && process.env.BASE_URL);

test.describe(
	'[MG · COB-48][API] Authorize — allCards nunca 500 sin wallet @regression @gateway-pg @authorize',
	{
		annotation: [{ type: 'tms', description: 'MG-551' }]
	},
	() => {
		test.skip(!CREDS_READY, 'Faltan USER_CARRIER / PASS_CARRIER / BASE_URL — configurar .env.test');
		test.skip(!CARRIER_ACCOUNT_ID || !PASSENGER_ID, 'Faltan CARRIER_ID / AUTHORIZE_PASSENGER_ID (carrier Authorize + pax sin wallet) [confirmar en UAT].');

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

		// COB-48 — regresión: pax sin wallet en carrier Authorize → 200 + [] (nunca 500).
		test(
			'[COB-48] listAllCards (pax sin wallet, carrier Authorize) → 200 + lista vacía',
			{
				annotation: [{ type: 'tms', description: 'MG-551' }]
			},
			async ({ request }) => {
				const res = await new CardApi({ request }).listAllCards({
					passengerId: PASSENGER_ID,
					carrierId: CARRIER_ACCOUNT_ID,
					authToken
				});
				expect(res.status, `allCards no debe devolver 500 (status=${res.status} body=${res.raw})`).not.toBe(500);
				expect(res.ok, `allCards esperado 2xx, status=${res.status} body=${res.raw}`).toBe(true);
				expect(Array.isArray(res.body), 'allCards de un pax sin wallet debe devolver un array (puede ser vacío)').toBe(true);
			}
		);
	}
);
