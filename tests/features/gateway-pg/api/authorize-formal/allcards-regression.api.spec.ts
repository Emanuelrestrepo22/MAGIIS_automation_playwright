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
 *
 * ⚠️ DATO DEL GATE INVÁLIDO (hallazgo live 2026-07-28, auditoría de oráculos):
 * el `AUTHORIZE_PASSENGER_ID` configurado hoy en `.env.test` NO es un pax sin wallet —
 * `allCards` devuelve 200 con **4 tarjetas**, todas con `appCode: "MERCADOPAGO"` /
 * `country: "AR"`, es decir el pax de MercadoPago/ARG, no un pax de un carrier Authorize.
 * El assert anterior (`Array.isArray`) lo enmascaraba por completo: el test corría VERDE
 * sin verificar nada del contrato COB-48, y peor, acreditaba MG-551 en Xray con evidencia
 * de otro pax y otra pasarela. Con el oráculo endurecido el test queda ROJO hasta que QA
 * provea un pax sin wallet en un carrier Authorize (o confirme que el contrato acepta
 * lista poblada, en cuyo caso hay que cambiar el título y el TC de matriz, no el assert).
 * Acción pendiente: repuntar `AUTHORIZE_PASSENGER_ID` a un pax sin wallet del carrier
 * Authorize; hasta entonces este rojo es un problema de DATO, no un bug de producto.
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
				expect(Array.isArray(res.body), `allCards debe devolver un array (body=${res.raw})`).toBe(true);
				// Endurecido (auditoría 2026-07-28): el título promete "200 + lista vacía" y
				// TC-PAY-COB-48 fija el pax del gate como pax SIN wallet, pero el assert solo
				// verificaba `Array.isArray` — pasaba también con una lista poblada, es decir
				// con el dato del gate mal elegido. La lista vacía ES el oráculo: si viene
				// poblada, AUTHORIZE_PASSENGER_ID no apunta a un pax sin wallet (dato
				// inválido) o el endpoint devolvió tarjetas de otro pax (bug de scoping).
				// ROJO ESPERADO hoy con el dato actual — ver "DATO DEL GATE INVÁLIDO" en el
				// docblock del módulo. El mensaje del assert distingue las dos causas.
				expect(
					(res.body as unknown[]).length,
					`allCards de un pax SIN wallet debe venir vacía; llegaron ${(res.body as unknown[]).length} tarjeta(s) => AUTHORIZE_PASSENGER_ID no es un pax sin wallet, o el endpoint filtró mal por pax (body=${res.raw})`
				).toBe(0);
			}
		);
	}
);
