/**
 * BL-036 frente B — Contract test Authorize.net sandbox: declines.
 *
 * Valida que el sandbox dispara Response Code 2 (Declined) para los
 * triggers documentados de decline:
 *   - ZIP 46282 → decline genérico (bank decline)
 *
 * Variables de entorno requeridas: AUTHORIZE_API_LOGIN_ID + AUTHORIZE_TRANSACTION_KEY.
 */

import { test, expect } from '@playwright/test';
import { AUTHORIZE_CARDS } from '../../../../fixtures/gateways/authorize/card-policy';
import { AuthorizeApiClient, hasAuthorizeCredentials } from '../../../../shared/utils/authorize-api-client';

test.describe('[BL-036][API] Authorize.net sandbox — Declines (Response Code 2)', () => {
	test.skip(!hasAuthorizeCredentials(), 'AUTHORIZE_API_LOGIN_ID/TRANSACTION_KEY no seteadas en env');

	test('Visa + ZIP 46282 → Response Code 2 (declined genérico)', async ({ request }) => {
		const client = new AuthorizeApiClient(request);

		const response = await client.authOnlyTransaction(
			AUTHORIZE_CARDS.DECLINE_GENERIC,
			'10.00',
			`bl-036-decline-zip-${Date.now()}`
		);

		// resultCode puede ser "Ok" porque el request fue procesado correctamente,
		// pero el transactionResponse.responseCode = "2" indica decline.
		expect(response.messages.resultCode).toBe('Ok');
		expect(response.transactionResponse?.responseCode).toBe('2');

		// La transacción declinada normalmente NO devuelve authCode válido.
		// transId puede o no estar presente según versión del sandbox.
		const messages = response.transactionResponse?.messages ?? [];
		expect(messages.length).toBeGreaterThan(0);
	});
});
