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
 */

import { test, expect } from '@TestFixture';
import { AUTHORIZE_CARDS } from '@fixtures/gateways/authorize/card-policy';
import { AuthorizeSandboxApi, hasAuthorizeCredentials } from '@api/AuthorizeSandboxApi';
import type { AuthorizeApiResponse } from '@schemas/authorize.types';

test.describe('[BL-036][API] Authorize.net sandbox — CVV + AVS triggers @gateway @authorize @regression', () => {
	test.skip(!hasAuthorizeCredentials(), 'AUTHORIZE_API_LOGIN_ID/TRANSACTION_KEY no seteadas en env');

	test('CVV 901 → cvvResultCode "N" (Does NOT Match)', async ({ request }) => {
		const api = new AuthorizeSandboxApi({ request });

		const response: AuthorizeApiResponse = await api.authorizeOnly({
			card: AUTHORIZE_CARDS.DECLINE_CVV,
			amount: '10.00',
			refId: `bl-036-cvv-mismatch-${Date.now()}`,
		});

		expect(response.messages.resultCode).toBe('Ok');
		// El responseCode puede ser 1 o 2 según política del merchant;
		// lo determinístico es cvvResultCode.
		expect(response.transactionResponse?.cvvResultCode).toBe('N');
	});

	test('CVV 904 → cvvResultCode "P" (Is NOT Processed)', async ({ request }) => {
		const api = new AuthorizeSandboxApi({ request });

		const response: AuthorizeApiResponse = await api.authorizeOnly({
			card: AUTHORIZE_CARDS.CVV_NOT_PROCESSED,
			amount: '10.00',
			refId: `bl-036-cvv-notproc-${Date.now()}`,
		});

		expect(response.messages.resultCode).toBe('Ok');
		expect(response.transactionResponse?.cvvResultCode).toBe('P');
	});

	test('ZIP 46205 → avsResultCode "N" (Address & ZIP no match)', async ({ request }) => {
		const api = new AuthorizeSandboxApi({ request });

		const response: AuthorizeApiResponse = await api.authorizeOnly({
			card: AUTHORIZE_CARDS.AVS_NO_MATCH,
			amount: '10.00',
			refId: `bl-036-avs-nomatch-${Date.now()}`,
		});

		expect(response.messages.resultCode).toBe('Ok');
		expect(response.transactionResponse?.avsResultCode).toBe('N');
	});
});
