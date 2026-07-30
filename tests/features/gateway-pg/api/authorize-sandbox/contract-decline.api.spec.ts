/**
 * BL-036 frente B — Contract test Authorize.net sandbox: declines.
 *
 * Valida que el sandbox dispara Response Code 2 (Declined) para los
 * triggers documentados de decline:
 *   - ZIP 46282 → decline genérico (bank decline)
 *
 * Variables de entorno requeridas: AUTHORIZE_API_LOGIN_ID + AUTHORIZE_TRANSACTION_KEY.
 */

import { test, expect } from '@TestFixture';
import { AUTHORIZE_CARDS } from '@fixtures/gateways/authorize/card-policy';
import { AuthorizeSandboxApi, hasAuthorizeCredentials } from '@api/AuthorizeSandboxApi';
import type { AuthorizeApiResponse } from '@schemas/authorize.types';

test.describe('[BL-036][API] Authorize.net sandbox — Declines (Response Code 2) @gateway @authorize @regression', () => {
	test.skip(!hasAuthorizeCredentials(), 'AUTHORIZE_API_LOGIN_ID/TRANSACTION_KEY no seteadas en env');

	test('Visa + ZIP 46282 → Response Code 2 (declined genérico)', async ({ request }) => {
		const api = new AuthorizeSandboxApi({ request });

		const response: AuthorizeApiResponse = await api.authorizeOnly({
			card: AUTHORIZE_CARDS.DECLINE_GENERIC,
			amount: '10.00',
			refId: `bl-036-decline-zip-${Date.now()}`,
		});

		// resultCode puede ser "Ok" porque el request fue procesado correctamente,
		// pero el transactionResponse.responseCode = "2" indica decline.
		expect(response.messages.resultCode).toBe('Ok');
		expect(response.transactionResponse?.responseCode).toBe('2');

		// La transacción declinada normalmente NO devuelve authCode válido.
		// El motivo del decline vive en `transactionResponse.errors[]` — `.messages[]` es el
		// campo que Authorize.net puebla en transacciones EXITOSAS (ej. "This transaction
		// has been approved"), por diseño va vacío en un decline. Verificado en vivo contra
		// el sandbox real (2026-07-24): `errors` trae el código/motivo, `messages` viene [].
		const errors = response.transactionResponse?.errors ?? [];
		expect(errors.length).toBeGreaterThan(0);
	});
});
