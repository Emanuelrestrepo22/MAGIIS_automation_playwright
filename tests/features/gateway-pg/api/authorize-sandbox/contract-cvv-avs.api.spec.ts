/**
 * BL-036 frente B — Contract test Authorize.net sandbox: CVV + AVS triggers.
 *
 * Valida que los códigos CVV y AVS del response coinciden con los triggers
 * documentados. Estos tests detectan regresiones en el sandbox: si Authorize
 * cambia el mapping CVV → result code, fallan ANTES que los E2E.
 *
 * Tabla de triggers cubiertos:
 *   - CVV 901 → cvvResultCode "N" (Does NOT Match)
 *   - CVV 904 → cvvResultCode "P" (Is NOT Processed)
 *   - ZIP 46205 → avsResultCode "N" (Address & ZIP no match)
 *
 * TRAZABILIDAD XRAY — keys de NIVEL CONTRATO (`AUTHORIZE_CONTRACT_XRAY_KEYS`):
 * MG-595 (CVV 901) · MG-596 (CVV 904) · MG-597 (ZIP 46205), miembros del Test Execution
 * MG-558. Acreditan la RESPUESTA del PSP, no el flujo UI. Contraparte de matriz:
 * `TS-AUTHORIZE-TC1021`/`TC1022` (CVV 901 Hold ON/OFF), `TS-AUTHORIZE-TC1025` (CVV 904) y
 * `TS-AUTHORIZE-TC1031` (ZIP 46205) — el Alta de Viaje que describen esos TC (política
 * MAGIIS de aceptar/rechazar el flag) sigue SIN automatizar (gap declarado en la matriz
 * §§2.3-2.4); por eso estos tests NO se cablean a esos TC, para no inflar la evidencia.
 *
 * GATE DE VALIDEZ DE MEDICIÓN (2026-07-29): los tres tests de este archivo asertan un
 * trigger de CVV/ZIP, y una cuenta en Test Mode NO evalúa esos triggers — devuelve la
 * respuesta enlatada (`cvvResultCode ''`, `avsResultCode 'P'`) para cualquier tarjeta. Sin
 * el gate el fallo se lee como drift del sandbox (`Expected "N", Received ""`) cuando en
 * realidad es la cuenta. `assertAuthorizeAccountMeasuresRealAuthorizations` corta primero
 * con el mensaje accionable del bloqueante §0 de `docs/gateway-pg/authorize/EXTERNAL-BLOCKERS.md`.
 * Los happy paths de `contract-happy` / `contract-edge` quedan deliberadamente SIN gate:
 * su oráculo es la aprobación, no un trigger.
 */

import { test, expect } from '@TestFixture';
import { AUTHORIZE_CARDS } from '@fixtures/gateways/authorize/card-policy';
import { AuthorizeSandboxApi, describeAuthorizeFailure, hasAuthorizeCredentials } from '@api/AuthorizeSandboxApi';
import type { AuthorizeApiResponse } from '@schemas/authorize.types';
import { AUTHORIZE_CONTRACT_XRAY_KEYS } from '@features/gateway-pg/data/xray-keys';
import { assertAuthorizeAccountMeasuresRealAuthorizations } from '@features/gateway-pg/helpers/authorize-account-guard';

test.describe('[BL-036][API] Authorize.net sandbox — CVV + AVS triggers @gateway @authorize @regression', () => {
	test.skip(!hasAuthorizeCredentials(), 'AUTHORIZE_API_LOGIN_ID/TRANSACTION_KEY no seteadas en env');

	test(
		'CVV 901 → cvvResultCode "N" (Does NOT Match)',
		{ annotation: [{ type: 'tms', description: AUTHORIZE_CONTRACT_XRAY_KEYS.cvv901 }] },
		async ({ request }) => {
			await assertAuthorizeAccountMeasuresRealAuthorizations(request);
			const api = new AuthorizeSandboxApi({ request });

			const response: AuthorizeApiResponse = await api.authorizeOnly({
				card: AUTHORIZE_CARDS.DECLINE_CVV,
				amount: '10.00',
				refId: `bl-036-cvv-mismatch-${Date.now()}`
			});

			expect(response.messages.resultCode, describeAuthorizeFailure(response)).toBe('Ok');
			// El responseCode puede ser 1 o 2 según política del merchant;
			// lo determinístico es cvvResultCode.
			expect(response.transactionResponse?.cvvResultCode).toBe('N');
		}
	);

	test(
		'CVV 904 → cvvResultCode "P" (Is NOT Processed)',
		{ annotation: [{ type: 'tms', description: AUTHORIZE_CONTRACT_XRAY_KEYS.cvv904 }] },
		async ({ request }) => {
			await assertAuthorizeAccountMeasuresRealAuthorizations(request);
			const api = new AuthorizeSandboxApi({ request });

			const response: AuthorizeApiResponse = await api.authorizeOnly({
				card: AUTHORIZE_CARDS.CVV_NOT_PROCESSED,
				amount: '10.00',
				refId: `bl-036-cvv-notproc-${Date.now()}`
			});

			expect(response.messages.resultCode, describeAuthorizeFailure(response)).toBe('Ok');
			expect(response.transactionResponse?.cvvResultCode).toBe('P');
		}
	);

	test(
		'ZIP 46205 → avsResultCode "N" (Address & ZIP no match)',
		{ annotation: [{ type: 'tms', description: AUTHORIZE_CONTRACT_XRAY_KEYS.avs46205 }] },
		async ({ request }) => {
			await assertAuthorizeAccountMeasuresRealAuthorizations(request);
			const api = new AuthorizeSandboxApi({ request });

			const response: AuthorizeApiResponse = await api.authorizeOnly({
				card: AUTHORIZE_CARDS.AVS_NO_MATCH,
				amount: '10.00',
				refId: `bl-036-avs-nomatch-${Date.now()}`
			});

			expect(response.messages.resultCode, describeAuthorizeFailure(response)).toBe('Ok');
			expect(response.transactionResponse?.avsResultCode).toBe('N');
		}
	);
});
