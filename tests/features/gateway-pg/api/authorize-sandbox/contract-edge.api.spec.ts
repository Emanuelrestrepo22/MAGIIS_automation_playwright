/**
 * BL-036 frente B — Contract tests Authorize.net sandbox: triggers de borde.
 *
 * Cierra el gap de cobertura de sandbox para tarjetas que YA existen en
 * `AUTHORIZE_CARDS` (card-policy) pero no tenían contract test:
 *   - SUCCESS_DISCOVER (Discover approved)
 *   - AVS_NON_US       (ZIP 46204 → avsResultCode "G")
 *   - PARTIAL_AUTH     (ZIP 46225 → aprobación parcial)
 *   - PREPAID_ZERO     (ZIP 46228 → prepaid approved, balance cero)
 *
 * Mismo patrón que contract-happy/decline/cvv-avs: NO tocan UI MAGIIS, validan
 * el endpoint sandbox directamente y detectan drift antes que los E2E.
 * Se auto-skipean si faltan AUTHORIZE_API_LOGIN_ID / AUTHORIZE_TRANSACTION_KEY.
 *
 * TRAZABILIDAD XRAY — keys de NIVEL CONTRATO (`AUTHORIZE_CONTRACT_XRAY_KEYS`):
 * MG-598 (Discover) · MG-599 (ZIP 46204) · MG-600 (ZIP 46225) · MG-601 (ZIP 46228),
 * miembros del Test Execution MG-558. Acreditan la RESPUESTA del PSP, no el flujo UI.
 * Contraparte de matriz: `TS-AUTHORIZE-TC1015` (Discover), `TS-AUTHORIZE-TC1035`
 * (ZIP 46204), `TS-AUTHORIZE-TC1041` (partial) y `TS-AUTHORIZE-TC1043` (prepaid) — el
 * Alta de Viaje que describen esos TC sigue SIN automatizar (gap declarado en la matriz
 * §§2.4-2.5); por eso estos tests NO se cablean a esos TC, para no inflar la evidencia.
 */

import { test, expect } from '@TestFixture';
import { AUTHORIZE_CARDS } from '@fixtures/gateways/authorize/card-policy';
import { AuthorizeSandboxApi, hasAuthorizeCredentials } from '@api/AuthorizeSandboxApi';
import type { AuthorizeApiResponse } from '@schemas/authorize.types';
import { AUTHORIZE_CONTRACT_XRAY_KEYS } from '@features/gateway-pg/data/xray-keys';
import { assertAuthorizeAccountMeasuresRealAuthorizations } from '@features/gateway-pg/helpers/authorize-account-guard';

test.describe('[BL-036][API] Authorize.net sandbox — Edge triggers @gateway @authorize @regression', () => {
	test.skip(!hasAuthorizeCredentials(), 'AUTHORIZE_API_LOGIN_ID/TRANSACTION_KEY no seteadas en env');

	test(
		'Discover + CVV 900 → Response Code 1 (Approved)',
		{ annotation: [{ type: 'tms', description: AUTHORIZE_CONTRACT_XRAY_KEYS.happyDiscover }] },
		async ({ request }) => {
			const api = new AuthorizeSandboxApi({ request });

			const response: AuthorizeApiResponse = await api.authorizeOnly({
				card: AUTHORIZE_CARDS.SUCCESS_DISCOVER,
				amount: '10.00',
				refId: `bl-036-edge-discover-${Date.now()}`
			});

			expect(response.messages.resultCode).toBe('Ok');
			expect(response.transactionResponse?.responseCode).toBe('1');
			expect(response.transactionResponse?.accountType).toBeTruthy();
		}
	);

	test(
		'AVS issuer no-USA (ZIP 46204) → avsResultCode "G"',
		{ annotation: [{ type: 'tms', description: AUTHORIZE_CONTRACT_XRAY_KEYS.avs46204 }] },
		async ({ request }) => {
			// GATE DE VALIDEZ DE MEDICIÓN (2026-07-29): único test de este archivo cuyo oráculo es un
			// trigger de ZIP (avsResultCode "G"). Una cuenta en Test Mode devuelve 'P' para cualquier
			// tarjeta, así que sin el gate el fallo se lee como drift del sandbox en vez de la cuenta.
			// Los otros tres tests (Discover / partial / prepaid) NO llevan gate: su oráculo es la
			// aprobación, verificable contra cualquier cuenta. Ver bloqueante §0 de EXTERNAL-BLOCKERS.md.
			await assertAuthorizeAccountMeasuresRealAuthorizations(request);
			const api = new AuthorizeSandboxApi({ request });

			const response: AuthorizeApiResponse = await api.authorizeOnly({
				card: AUTHORIZE_CARDS.AVS_NON_US,
				amount: '10.00',
				refId: `bl-036-edge-avs-nonus-${Date.now()}`
			});

			expect(response.messages.resultCode).toBe('Ok');
			// El determinístico es el código AVS; responseCode puede variar por política.
			expect(response.transactionResponse?.avsResultCode).toBe('G');
		}
	);

	test(
		'Partial authorization (ZIP 46225) → aprobación parcial',
		{ annotation: [{ type: 'tms', description: AUTHORIZE_CONTRACT_XRAY_KEYS.partial46225 }] },
		async ({ request }) => {
			const api = new AuthorizeSandboxApi({ request });

			const response: AuthorizeApiResponse = await api.authorizeOnly({
				card: AUTHORIZE_CARDS.PARTIAL_AUTH,
				amount: '10.00',
				refId: `bl-036-edge-partial-${Date.now()}`
			});

			// Endurecido (auditoría 2026-07-28): `responseCode` truthy pasaba también con un
			// decline ('2') o error ('3'), lo que CONTRADICE el título. El contrato de matriz
			// TS-AUTHORIZE-TC1041 exige aprobación → responseCode '1' + mensaje de aprobación.
			expect(response.messages.resultCode).toBe('Ok');
			expect(response.transactionResponse?.responseCode, 'partial auth debe quedar APROBADA (Response Code 1)').toBe('1');
			expect(response.transactionResponse?.messages?.[0]?.code, 'el mensaje de transacción debe ser el de aprobación (code 1)').toBe('1');

			// TODO(live): el oráculo COMPLETO de TS-AUTHORIZE-TC1041 ("solo $1.23 autorizado del
			// total") NO es asertable hoy — la respuesta del sandbox NO trae el monto parcial ni
			// `splitTenderId` (los campos que Authorize.net emite en una partial authorization
			// real). Evidencia del probe live 2026-07-28 con ZIP 46225: transactionResponse =
			// { responseCode:'1', authCode:'000000', transId:'0', testRequest:'1',
			//   avsResultCode:'P', cvvResultCode:'', accountNumber:'XXXX1111' } — IDÉNTICA a la
			// del ZIP 46228 (prepaid). `testRequest:'1'` + `transId:'0'` + `authCode:'000000'`
			// = la cuenta sandbox está en TEST MODE, donde Authorize.net NO evalúa los triggers
			// por ZIP/CVV. Mismo root cause que los 5 tests de trigger que fallan hoy en este
			// pack (CVV 901/904 → cvvResultCode '', ZIP 46205/46204 → avsResultCode 'P',
			// ZIP 46282 → responseCode '1' en vez de '2'). Al pasar la cuenta a Live Mode:
			// assertar el monto aprobado ($1.23) y agregar el campo al facade @schemas/authorize.types.
		}
	);

	test(
		'Prepaid balance cero (ZIP 46228) → procesado',
		{ annotation: [{ type: 'tms', description: AUTHORIZE_CONTRACT_XRAY_KEYS.prepaid46228 }] },
		async ({ request }) => {
			const api = new AuthorizeSandboxApi({ request });

			const response: AuthorizeApiResponse = await api.authorizeOnly({
				card: AUTHORIZE_CARDS.PREPAID_ZERO,
				amount: '10.00',
				refId: `bl-036-edge-prepaid-${Date.now()}`
			});

			// Endurecido (auditoría 2026-07-28): idem partial — el contrato de matriz
			// TS-AUTHORIZE-TC1043 es "Approved con balance cero", así que el approved es parte
			// del oráculo, no un detalle. `toBeTruthy()` aceptaba un decline.
			expect(response.messages.resultCode).toBe('Ok');
			expect(response.transactionResponse?.responseCode, 'prepaid balance cero debe quedar APROBADA (Response Code 1)').toBe('1');
			expect(response.transactionResponse?.messages?.[0]?.code, 'el mensaje de transacción debe ser el de aprobación (code 1)').toBe('1');

			// TODO(live): el "flag explícito" de balance cero que pide TS-AUTHORIZE-TC1043 NO es
			// asertable hoy — la respuesta NO trae el bloque `prePaidCard`
			// (requestedAmount / approvedAmount / balanceOnCard) que Authorize.net emite para
			// tarjetas prepaid. Probe live 2026-07-28 con ZIP 46228: respuesta IDÉNTICA a la del
			// ZIP 46225, con `testRequest:'1'` → cuenta sandbox en TEST MODE, triggers por ZIP
			// inertes (ver detalle en el TODO del test de partial auth). Al pasar a Live Mode:
			// assertar `prePaidCard.balanceOnCard === '0.00'` y agregar el bloque al facade.
		}
	);
});
