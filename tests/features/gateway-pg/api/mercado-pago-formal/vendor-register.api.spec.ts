/**
 * [MG · área A][API] vendor/mercadopago — vinculación de pasarela MercadoPago (CONTRATO HTTP).
 *
 * Equivalente MP del alta de Stripe/Connect. Endpoint: POST /magiis-v0.2/vendor/mercadopago
 *   = registerMercadopagoVendor(user, code, carrier) — `code` = authorization code OAuth MP Connect.
 *
 * Trazabilidad (describe-level TMS): MG-141 (alta) · MG-144 (A-04 negativo MERCADOPAGO_IN_USE 409).
 * Capa: API (contrato). Componente: VendorApi.registerMercadopagoVendor (KATA L3).
 *
 * ⚠️ GATED — CODE-ONLY, ejecución REAL diferida a UAT:
 *   1) Gate creds: USER_CARRIER / PASS_CARRIER / BASE_URL (login UI para extraer el JWT).
 *   2) Gate "MP no transacciona en TEST": el alta real requiere un `code` OAuth vivo de MP Connect
 *      (no automatizable en TEST). Setear MP_SANDBOX_TRANSACTS=1 SÓLO en UAT con `code` válido.
 *   Sin las dos → los tests skipean LIMPIO (sin error).
 */

// skips env-gated (creds / UAT-only) intencionales en este pack formal.
/* eslint-disable playwright/no-skipped-test */

import { test, expect } from '@TestFixture';
import { VendorApi } from '@api/VendorApi';
import { LoginPage } from '@pages/shared/LoginPage';
import { extractAuthToken } from '@features/gateway-pg/helpers/card-precondition';
import { mercadoPagoGatewayAdapter } from '@features/gateway-pg/helpers/adapters/mercadoPagoGatewayAdapter';

// admin userId del carrier ARG a vincular [confirmar en UAT]; placeholder 0.
const CARRIER_USER_ID = Number(process.env.MP_CARRIER_USER_ID ?? 0);
// authorization code del OAuth MP Connect (test-mode) — sólo disponible en UAT.
const MP_OAUTH_CODE = process.env.MP_OAUTH_CODE ?? '';

const CREDS_READY = Boolean(process.env.USER_CARRIER && process.env.PASS_CARRIER && process.env.BASE_URL);
// Default OFF: MercadoPago NO transacciona en el entorno TEST → ejecución real diferida a UAT.
const MP_UAT_EXEC = process.env.MP_SANDBOX_TRANSACTS === '1';

test.describe(`[MG · A][API] vendor/mercadopago — vinculación ${mercadoPagoGatewayAdapter.displayName} @regression @gateway @gateway-pg @mercadopago`, {
	// MG-144 removido: el negativo de acá re-vincula el MISMO carrier (semántica de MG-142/A-02), no
	// una cuenta ya usada por OTRO carrier (A-04) — ver el detalle en el test.
	annotation: [
		{ type: 'tms', description: 'MG-141' },
		{ type: 'tms', description: 'MG-142' }
	]
}, () => {
	test.skip(!CREDS_READY, 'Faltan USER_CARRIER / PASS_CARRIER / BASE_URL (carrier ARG) — configurar .env.test');
	test.skip(
		!MP_UAT_EXEC,
		'MercadoPago no transacciona en el entorno TEST — el alta requiere un `code` OAuth vivo de MP Connect. ' +
			'Ejecución real diferida a UAT: setear MP_SANDBOX_TRANSACTS=1 + MP_OAUTH_CODE + MP_CARRIER_USER_ID.'
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

	// A-01 — alta MP: POST vendor/mercadopago con `code` OAuth → 200/201.
	test('[A-01] vincular MercadoPago con code OAuth → 200/201', {
		annotation: [{ type: 'tms', description: 'MG-141' }]
	}, async ({ request }) => {
		test.skip(!CARRIER_USER_ID || !MP_OAUTH_CODE, 'Faltan MP_CARRIER_USER_ID / MP_OAUTH_CODE (datos de UAT) [confirmar].');
		const res = await new VendorApi({ request }).registerMercadopagoVendor({
			carrierUserId: CARRIER_USER_ID,
			code: MP_OAUTH_CODE,
			authToken
		});
		expect([200, 201], `esperado 200/201, status=${res.status} body=${res.raw}`).toContain(res.status);
	});

	// Negativo: re-vincular un carrier con MP ya vinculado → 409 MERCADOPAGO_IN_USE.
	//
	// MG-142 (A-02), no MG-144. El cuerpo de este test usa DOS VECES el mismo `MP_CARRIER_USER_ID`,
	// así que lo que ejercita es "el sistema rechaza vincular dos veces la misma PSP para no duplicar
	// el vínculo" — que es exactamente A-02. MG-144 (A-04) exige "una cuenta de PSP ya usada por OTRO
	// carrier": autenticarse como carrier B e intentar la cuenta del carrier A. Ese segundo carrier no
	// existe en ningún fixture ni env del repo, así que MG-144 queda sin spec (y sin key) hasta
	// resolver el dato — un unmapped visible es preferible a acreditar A-04 con una corrida de A-02.
	// El id local se deja en `[A-04]` para no romper greps ni el histórico de corridas.
	test('[A-04] re-vincular carrier con MP ya vinculado → 409 MERCADOPAGO_IN_USE', {
		annotation: [{ type: 'tms', description: 'MG-142' }]
	}, async ({ request }) => {
		test.skip(!CARRIER_USER_ID || !MP_OAUTH_CODE, 'Faltan MP_CARRIER_USER_ID / MP_OAUTH_CODE (datos de UAT) [confirmar].');
		const res = await new VendorApi({ request }).registerMercadopagoVendor({
			carrierUserId: CARRIER_USER_ID,
			code: MP_OAUTH_CODE,
			authToken
		});
		expect(res.status, `esperado 409 MERCADOPAGO_IN_USE, status=${res.status} body=${res.raw}`).toBe(409);
		expect(res.raw, 'el body debe referenciar el código de negocio MERCADOPAGO_IN_USE').toContain('MERCADOPAGO_IN_USE');
	});
});
