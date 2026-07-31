/**
 * [MG · C/H/MPX][API] MercadoPago — ciclo de tarjeta (tokenización · alta · listado · MPX).
 *
 * Equivalente MP del alta/listado de tarjetas de Stripe. Componente: CardApi (KATA L3).
 * En MP el TRIGGER del outcome es el `cardholderName` (keyword APRO/OTHE/SECU/FUND...), NO el número
 * → se reusan las fixtures MP (`mercado-pago/card-resolver` + `card-policy`) como Source of Truth.
 *
 * Trazabilidad (describe-level TMS):
 *   - MG-148 (área C) — alta/validación de tarjeta preautorizada.
 *   - MG-149/MG-150 (área C) — getCardToken + addCard.
 *   - MG-172 (área H) — listado/estado de tarjetas del pax.
 *   - MG-194 (MPX TC1) — la validación de tarjeta MP NO dispara challenge 3DS.
 *   - MG-195 (MPX TC2) — las tarjetas del pax viven en la cuenta MP (no en UserWallet local).
 *
 * ⚠️ GATED — CODE-ONLY, ejecución REAL diferida a UAT:
 *   1) Gate creds: USER_CARRIER / PASS_CARRIER / BASE_URL.
 *   2) Gate "MP no transacciona en TEST": la tokenización real exige el SDK MP client-side + sandbox
 *      vivo → MP_SANDBOX_TRANSACTS=1 SÓLO en UAT.
 *   3) Doble gate +Oracle (ORACLE_*_TEST) para la invariancia local de MG-195 (capa DB).
 *   Sin gates → skip LIMPIO (sin error).
 */

// skips env-gated (creds / UAT-only) intencionales en este pack formal.
/* eslint-disable playwright/no-skipped-test */

import { test, expect } from '@TestFixture';
import { CardApi } from '@api/CardApi';
import type { MercadopagoCardDetail } from '@schemas/mercadopago.types';
import { resolveCard } from '@fixtures/gateways/mercado-pago/card-resolver';
import type { MercadoPagoTestCard } from '@fixtures/gateways/mercado-pago/cards';
import { mercadoPagoGatewayAdapter } from '@features/gateway-pg/helpers/adapters/mercadoPagoGatewayAdapter';
import { LoginPage } from '@pages/shared/LoginPage';
import { extractAuthToken } from '@features/gateway-pg/helpers/card-precondition';
import { oracleConfigFromEnv, countCardsByPassenger } from '@features/gateway-pg/helpers/oracle-wallet';

// Datos [confirmar en UAT]; placeholders neutros para skip limpio en TEST.
const CARRIER_ACCOUNT_ID = Number(process.env.CARRIER_ID ?? 0);
const PASSENGER_ID = Number(process.env.MP_PASSENGER_ID ?? 0);
const MP_APP_ID = Number(process.env.MP_APP_ID ?? 0);
const MP_ISSUER_ID = Number(process.env.MP_ISSUER_ID ?? 0);

const CREDS_READY = Boolean(process.env.USER_CARRIER && process.env.PASS_CARRIER && process.env.BASE_URL);
const MP_UAT_EXEC = process.env.MP_SANDBOX_TRANSACTS === '1';
const ORACLE = oracleConfigFromEnv();

/** Mapea una fixture MP (`MercadoPagoTestCard`, exp 'MM/YY') al detalle del contrato de tokenización. */
function toCardDetail(card: MercadoPagoTestCard): MercadopagoCardDetail {
	const [month, year] = card.exp.split('/');
	return {
		cardNumber: card.number,
		expirationMonth: month,
		expirationYear: year,
		securityCode: card.cvc,
		cardholderName: card.holderName, // ← TRIGGER del outcome (keyword de estado)
		identificationType: card.identificationType,
		identificationNumber: card.identificationNumber
	};
}

test.describe(`[MG · C/H/MPX][API] ${mercadoPagoGatewayAdapter.displayName} — ciclo de tarjeta @regression @gateway @gateway-pg @mercadopago`, {
	annotation: [
		{ type: 'tms', description: 'MG-148' },
		{ type: 'tms', description: 'MG-149' },
		{ type: 'tms', description: 'MG-150' },
		{ type: 'tms', description: 'MG-172' },
		{ type: 'tms', description: 'MG-194' },
		{ type: 'tms', description: 'MG-195' }
	]
}, () => {
	test.skip(!CREDS_READY, 'Faltan USER_CARRIER / PASS_CARRIER / BASE_URL (carrier ARG) — configurar .env.test');
	test.skip(
		!MP_UAT_EXEC,
		'MercadoPago no transacciona en el entorno TEST — la tokenización real exige el SDK MP + sandbox vivo. ' +
			'Ejecución real diferida a UAT: setear MP_SANDBOX_TRANSACTS=1 + MP_PASSENGER_ID / MP_APP_ID / MP_ISSUER_ID.'
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

	// C-01 / C-02 — happy: tokeniza APRO → addCard → tarjeta persistida.
	test('[C-01] getCardToken (APRO) → token + addCard → 200', {
		annotation: [{ type: 'tms', description: 'MG-148' }, { type: 'tms', description: 'MG-150' }]
	}, async ({ request }) => {
		test.skip(!MP_APP_ID || !PASSENGER_ID, 'Faltan MP_APP_ID / MP_PASSENGER_ID (datos de UAT) [confirmar].');
		const api = new CardApi({ request });
		const card = resolveCard('APPROVED'); // holderName APRO = trigger approved

		const tokenRes = await api.getCardToken({ card: toCardDetail(card), mercadopagoAppId: MP_APP_ID, authToken });
		expect(tokenRes.ok, `getCardToken esperado 2xx, status=${tokenRes.status} body=${tokenRes.raw}`).toBe(true);
		const token = (tokenRes.body as { id?: string } | null)?.id;
		expect(token, 'getCardToken debe devolver un card token (id)').toBeTruthy();

		const addRes = await api.addCard({
			user: PASSENGER_ID,
			token: token as string,
			mercadopagoAppId: MP_APP_ID,
			issuerId: MP_ISSUER_ID,
			cardDetail: toCardDetail(card),
			carrierId: CARRIER_ACCOUNT_ID,
			authToken
		});
		expect(addRes.ok, `addCard esperado 2xx, status=${addRes.status} body=${addRes.raw}`).toBe(true);
	});

	// C-03 — negativo de contrato: keyword SECU (CVV inválido) → tokenización/alta rechazada.
	test('[C-03] getCardToken (SECU) → rechazo por security code inválido', {
		annotation: [{ type: 'tms', description: 'MG-149' }]
	}, async ({ request }) => {
		test.skip(!MP_APP_ID, 'Falta MP_APP_ID (dato de UAT) [confirmar].');
		const card = resolveCard('REJECTED_INVALID_CVV'); // holderName SECU
		const res = await new CardApi({ request }).getCardToken({ card: toCardDetail(card), mercadopagoAppId: MP_APP_ID, authToken });
		// El rechazo puede llegar como 4xx (token) o como statusDetail del sandbox — se asierta la no-aprobación.
		expect(res.ok, `SECU no debe producir un token aprobado (status=${res.status} body=${res.raw})`).toBe(false);
	});

	// H-01 — listado de tarjetas del pax (GET passengers/{id}/allCards).
	test('[H-01] listAllCards → tarjetas del pax', {
		annotation: [{ type: 'tms', description: 'MG-172' }]
	}, async ({ request }) => {
		test.skip(!PASSENGER_ID || !CARRIER_ACCOUNT_ID, 'Faltan MP_PASSENGER_ID / CARRIER_ID (datos de UAT) [confirmar].');
		const res = await new CardApi({ request }).listAllCards({ passengerId: PASSENGER_ID, carrierId: CARRIER_ACCOUNT_ID, authToken });
		expect(res.ok, `listAllCards esperado 2xx, status=${res.status} body=${res.raw}`).toBe(true);
		expect(Array.isArray(res.body), 'allCards debe devolver un array de tarjetas').toBe(true);
	});

	// MPX-194 — la validación de tarjeta MP NO dispara challenge 3DS (delta vs Stripe).
	test('[MPX-194] tokenización MP no dispara challenge 3DS', {
		annotation: [{ type: 'tms', description: 'MG-194' }]
	}, async ({ request }) => {
		test.skip(!MP_APP_ID, 'Falta MP_APP_ID (dato de UAT) [confirmar].');
		// Contrato de diseño: el adapter MAGIIS declara MP sin 3DS.
		expect(mercadoPagoGatewayAdapter.requires3ds, 'el adapter MP debe declarar requires3ds=false').toBe(false);
		// Contrato runtime: la tokenización aprobada no devuelve una URL/token de challenge 3DS.
		const card = resolveCard('APPROVED');
		const res = await new CardApi({ request }).getCardToken({ card: toCardDetail(card), mercadopagoAppId: MP_APP_ID, authToken });
		expect(res.ok, `getCardToken esperado 2xx, status=${res.status}`).toBe(true);
		expect(res.raw, 'la respuesta no debe incluir un challenge 3DS').not.toMatch(/three_?ds|challenge|acs_url/i);
	});

	// MPX-195 — las tarjetas del pax viven en la cuenta MP, no en UserWallet local (+Oracle).
	test('[MPX-195] tarjetas del pax en MP + invariancia local (UserWallet) — +Oracle', {
		annotation: [{ type: 'tms', description: 'MG-195' }]
	}, async ({ request }) => {
		test.skip(!PASSENGER_ID || !CARRIER_ACCOUNT_ID, 'Faltan MP_PASSENGER_ID / CARRIER_ID (datos de UAT) [confirmar].');
		test.skip(!ORACLE, 'Sin conexión Oracle (ORACLE_*_TEST) — la invariancia local es capa DB.');

		// Positivo (API): las tarjetas MP del pax son visibles vía allCards.
		const res = await new CardApi({ request }).listAllCards({ passengerId: PASSENGER_ID, carrierId: CARRIER_ACCOUNT_ID, authToken });
		expect(res.ok, `listAllCards esperado 2xx, status=${res.status} body=${res.raw}`).toBe(true);

		// Delta MP (DB): las tarjetas MP NO se persisten en UserWallet local (viven en la cuenta MP).
		const localCards = await countCardsByPassenger(ORACLE!, { passengerUserId: PASSENGER_ID });
		const mpCards = Array.isArray(res.body) ? res.body.length : 0;
		expect(localCards, `MP: las tarjetas del pax (${mpCards} en MP) no deben materializarse en UserWallet local`).toBe(0);
	});
});
