/**
 * BL-036 frente B — Contract test Authorize.net sandbox: declines.
 *
 * Valida que el sandbox dispara Response Code 2 (Declined) para los
 * triggers documentados de decline:
 *   - ZIP 46282 → decline genérico (bank decline)
 *
 * Variables de entorno requeridas: AUTHORIZE_API_LOGIN_ID + AUTHORIZE_TRANSACTION_KEY.
 *
 * TRAZABILIDAD XRAY — key de NIVEL CONTRATO (`AUTHORIZE_CONTRACT_XRAY_KEYS`):
 * MG-594 (ZIP 46282), miembro del Test Execution MG-558. Acredita la RESPUESTA del PSP,
 * no el flujo UI. Contraparte de matriz: `TS-AUTHORIZE-TC1016` (Hold ON) y
 * `TS-AUTHORIZE-TC1017` (Hold OFF) — el Alta de Viaje que describen esos TC (pop-up de
 * error + viaje NO creado) sigue SIN automatizar (gap declarado en la matriz §2.2); por
 * eso este test NO se cablea a esos TC, para no inflar la evidencia.
 *
 * GATE DE VALIDEZ DE MEDICIÓN (2026-07-29): el decline lo dispara el ZIP, y una cuenta en
 * Test Mode no evalúa ese trigger — aprueba (`responseCode '1'`) para cualquier tarjeta.
 * Sin el gate el fallo se lee como drift del sandbox cuando en realidad es la cuenta; ver
 * bloqueante §0 de `docs/gateway-pg/authorize/EXTERNAL-BLOCKERS.md`.
 */

import { test, expect } from '@TestFixture';
import { AUTHORIZE_CARDS } from '@fixtures/gateways/authorize/card-policy';
import { AuthorizeSandboxApi, describeAuthorizeFailure, hasAuthorizeCredentials } from '@api/AuthorizeSandboxApi';
import type { AuthorizeApiResponse } from '@schemas/authorize.types';
import { AUTHORIZE_CONTRACT_XRAY_KEYS } from '@features/gateway-pg/data/xray-keys';
import { assertAuthorizeAccountMeasuresRealAuthorizations } from '@features/gateway-pg/helpers/authorize-account-guard';

test.describe('[BL-036][API] Authorize.net sandbox — Declines (Response Code 2) @gateway @authorize @regression', () => {
	test.skip(!hasAuthorizeCredentials(), 'AUTHORIZE_API_LOGIN_ID/TRANSACTION_KEY no seteadas en env');

	test(
		'Visa + ZIP 46282 → Response Code 2 (declined genérico)',
		{ annotation: [{ type: 'tms', description: AUTHORIZE_CONTRACT_XRAY_KEYS.declineZip46282 }] },
		async ({ request }) => {
			await assertAuthorizeAccountMeasuresRealAuthorizations(request);
			const api = new AuthorizeSandboxApi({ request });

			const response: AuthorizeApiResponse = await api.authorizeOnly({
				card: AUTHORIZE_CARDS.DECLINE_GENERIC,
				amount: '10.00',
				refId: `bl-036-decline-zip-${Date.now()}`
			});

			// resultCode puede ser "Ok" porque el request fue procesado correctamente,
			// pero el transactionResponse.responseCode = "2" indica decline.
			expect(response.messages.resultCode, describeAuthorizeFailure(response)).toBe('Ok');
			expect(response.transactionResponse?.responseCode).toBe('2');

			// El decline debe venir CON MOTIVO legible. Authorize lo publica en `errors[]`, NO en
			// `messages[]` (medido en vivo 2026-08-21, BL-049): un RC 2 devuelve
			// `errors: [{ errorCode: '2', errorText: 'This transaction has been declined.' }]` y
			// `messages` vacío. El assert anterior exigía `messages.length > 0` y fallaba por esa
			// suposición, no porque faltara el motivo. Se aceptan ambas fuentes (el propio sandbox
			// varía según versión) sin relajar la exigencia de que el motivo exista.
			const reasons = [
				...(response.transactionResponse?.messages ?? []).map(m => `[${m.code}] ${m.description}`),
				...(response.transactionResponse?.errors ?? []).map(e => `[${e.errorCode}] ${e.errorText}`)
			];
			expect(reasons.length, `el decline debe informar un motivo (messages[] o errors[]) — ${describeAuthorizeFailure(response)}`).toBeGreaterThan(0);
		}
	);
});
