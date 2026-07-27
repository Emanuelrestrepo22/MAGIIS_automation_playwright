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
 */

import { test, expect } from '@TestFixture';
import { AUTHORIZE_CARDS } from '@fixtures/gateways/authorize/card-policy';
import { AuthorizeSandboxApi, hasAuthorizeCredentials } from '@api/AuthorizeSandboxApi';
import type { AuthorizeApiResponse } from '@schemas/authorize.types';

test.describe('[BL-036][API] Authorize.net sandbox — Happy paths (Response Code 1) @gateway @authorize @regression', () => {
	test.skip(!hasAuthorizeCredentials(), 'AUTHORIZE_API_LOGIN_ID/TRANSACTION_KEY no seteadas en env');

	test('Visa + CVV 900 + ZIP neutro → Response Code 1 (Approved)', async ({ request }) => {
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
		// CVV match esperado con CVV 900
		expect(response.transactionResponse?.cvvResultCode).toBe('M');
	});

	test('Mastercard + CVV 900 + ZIP neutro → Response Code 1 (Approved)', async ({ request }) => {
		const api = new AuthorizeSandboxApi({ request });

		const response: AuthorizeApiResponse = await api.authorizeOnly({
			card: AUTHORIZE_CARDS.SUCCESS_MASTERCARD,
			amount: '10.00',
			refId: `bl-036-happy-mc-${Date.now()}`
		});

		expect(response.messages.resultCode).toBe('Ok');
		expect(response.transactionResponse?.responseCode).toBe('1');
		expect(response.transactionResponse?.accountType).toBe('MasterCard');
		expect(response.transactionResponse?.cvvResultCode).toBe('M');
	});

	test('Amex + CVV 4-dígitos + ZIP neutro → Response Code 1 (Approved)', async ({ request }) => {
		const api = new AuthorizeSandboxApi({ request });

		const response: AuthorizeApiResponse = await api.authorizeOnly({
			card: AUTHORIZE_CARDS.SUCCESS_AMEX,
			amount: '10.00',
			refId: `bl-036-happy-amex-${Date.now()}`
		});

		expect(response.messages.resultCode).toBe('Ok');
		expect(response.transactionResponse?.responseCode).toBe('1');
		expect(response.transactionResponse?.accountType).toBe('AmericanExpress');
		// Amex CVV de 4 dígitos también dispara match con prefijo 9000
		expect(response.transactionResponse?.cvvResultCode).toBe('M');
	});
});
