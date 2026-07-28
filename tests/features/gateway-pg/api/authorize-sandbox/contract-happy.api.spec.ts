/**
 * BL-036 frente B — Contract test Authorize.net sandbox: happy paths.
 *
 * Valida que el sandbox responde Response Code 1 (Approved) para las cards
 * canónicas `AUTHORIZE_CARDS.SUCCESS*` con CVV 900 + ZIP neutro.
 *
 * Estos tests NO tocan UI MAGIIS — son contract tests directos contra el
 * endpoint sandbox de Authorize. Si el sandbox cambia su comportamiento o
 * las cards documentadas dejan de dar Approved, esto falla ANTES que los
 * tests E2E que dependen del mismo sandbox.
 *
 * Variables de entorno requeridas en `.env.test`:
 *   - AUTHORIZE_API_LOGIN_ID
 *   - AUTHORIZE_TRANSACTION_KEY
 *
 * Si no están seteadas, los tests se skipean automáticamente.
 *
 * TRAZABILIDAD XRAY — keys de NIVEL CONTRATO (`AUTHORIZE_CONTRACT_XRAY_KEYS`):
 * MG-590 (Visa) · MG-591 (Mastercard) · MG-592 (Amex) · MG-593 (echo CVV), todas
 * miembros del Test Execution MG-558. Acreditan la RESPUESTA del PSP, no el flujo UI.
 * Contraparte de matriz: `TS-AUTHORIZE-TC1011..TC1015` (Alta de Viaje happy path desde
 * carrier) — ese flujo UI sigue SIN automatizar (gap declarado en la matriz); por eso
 * estos tests NO se cablean a esos TC, para no inflar la evidencia.
 */

import { test, expect } from '@TestFixture';
import { AUTHORIZE_CARDS } from '@fixtures/gateways/authorize/card-policy';
import { AuthorizeSandboxApi, hasAuthorizeCredentials } from '@api/AuthorizeSandboxApi';
import type { AuthorizeApiResponse } from '@schemas/authorize.types';
import { AUTHORIZE_CONTRACT_XRAY_KEYS } from '@features/gateway-pg/data/xray-keys';
import { expectEchoCodeOrSkip } from './sandbox-echo.helpers';

test.describe('[BL-036][API] Authorize.net sandbox — Happy paths (Response Code 1) @gateway @authorize @regression', () => {
	test.skip(!hasAuthorizeCredentials(), 'AUTHORIZE_API_LOGIN_ID/TRANSACTION_KEY no seteadas en env');

	test(
		'Visa + CVV 900 + ZIP neutro → Response Code 1 (Approved)',
		{ annotation: [{ type: 'tms', description: AUTHORIZE_CONTRACT_XRAY_KEYS.happyVisa }] },
		async ({ request }) => {
			const api = new AuthorizeSandboxApi({ request });

			const response: AuthorizeApiResponse = await api.authorizeOnly({
				card: AUTHORIZE_CARDS.SUCCESS,
				amount: '10.00',
				refId: `bl-036-happy-visa-${Date.now()}`
			});

			expect(response.messages.resultCode).toBe('Ok');
			expect(response.transactionResponse?.responseCode).toBe('1');
			expect(response.transactionResponse?.authCode).toBeTruthy();
			expect(response.transactionResponse?.transId).toBeTruthy();
			expect(response.transactionResponse?.accountType).toBe('Visa');
		}
	);

	test(
		'Mastercard + CVV 900 + ZIP neutro → Response Code 1 (Approved)',
		{ annotation: [{ type: 'tms', description: AUTHORIZE_CONTRACT_XRAY_KEYS.happyMastercard }] },
		async ({ request }) => {
			const api = new AuthorizeSandboxApi({ request });

			const response: AuthorizeApiResponse = await api.authorizeOnly({
				card: AUTHORIZE_CARDS.SUCCESS_MASTERCARD,
				amount: '10.00',
				refId: `bl-036-happy-mc-${Date.now()}`
			});

			expect(response.messages.resultCode).toBe('Ok');
			expect(response.transactionResponse?.responseCode).toBe('1');
			expect(response.transactionResponse?.accountType).toBe('MasterCard');
		}
	);

	test(
		'Amex + CVV 4-dígitos + ZIP neutro → Response Code 1 (Approved)',
		{ annotation: [{ type: 'tms', description: AUTHORIZE_CONTRACT_XRAY_KEYS.happyAmex }] },
		async ({ request }) => {
			const api = new AuthorizeSandboxApi({ request });

			const response: AuthorizeApiResponse = await api.authorizeOnly({
				card: AUTHORIZE_CARDS.SUCCESS_AMEX,
				amount: '10.00',
				refId: `bl-036-happy-amex-${Date.now()}`
			});

			expect(response.messages.resultCode).toBe('Ok');
			expect(response.transactionResponse?.responseCode).toBe('1');
			expect(response.transactionResponse?.accountType).toBe('AmericanExpress');
		}
	);

	/**
	 * Contrato de ECHO CVV separado de los happy paths: la aprobación (arriba) es
	 * verificable con cualquier cuenta sandbox; el echo `cvvResultCode` requiere
	 * la verificación CVV habilitada en Security Settings de la cuenta. Test
	 * propio para que los happy paths reporten PASSED y este skipee documentado
	 * hasta configurar la cuenta (gate: sandbox-echo.helpers.ts).
	 */
	test(
		'Echo CVV (M) con CVV 900 para Visa/MC/Amex — contrato Security Settings',
		{ annotation: [{ type: 'tms', description: AUTHORIZE_CONTRACT_XRAY_KEYS.echoCvv }] },
		async ({ request }) => {
			const api = new AuthorizeSandboxApi({ request });
			const cards = [
				{ card: AUTHORIZE_CARDS.SUCCESS, label: 'visa' },
				{ card: AUTHORIZE_CARDS.SUCCESS_MASTERCARD, label: 'mc' },
				{ card: AUTHORIZE_CARDS.SUCCESS_AMEX, label: 'amex' }
			];
			for (const { card, label } of cards) {
				const response: AuthorizeApiResponse = await api.authorizeOnly({
					card,
					amount: '10.00',
					refId: `bl-036-echo-${label}-${Date.now()}`
				});
				expect(response.transactionResponse?.responseCode, `${label}: la transacción debe aprobar`).toBe('1');
				expectEchoCodeOrSkip(response.transactionResponse?.cvvResultCode, 'M', 'cvvResultCode');
			}
		}
	);
});
