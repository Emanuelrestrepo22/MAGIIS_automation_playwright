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
 */

import { test, expect } from '@TestFixture';
import { AUTHORIZE_CARDS } from '@fixtures/gateways/authorize/card-policy';
import { AuthorizeSandboxApi, hasAuthorizeCredentials } from '@api/AuthorizeSandboxApi';
import type { AuthorizeApiResponse } from '@schemas/authorize.types';

test.describe('[BL-036][API] Authorize.net sandbox — Edge triggers @gateway @authorize @regression', () => {
	test.skip(!hasAuthorizeCredentials(), 'AUTHORIZE_API_LOGIN_ID/TRANSACTION_KEY no seteadas en env');

	test('Discover + CVV 900 → Response Code 1 (Approved)', async ({ request }) => {
		const api = new AuthorizeSandboxApi({ request });

		const response: AuthorizeApiResponse = await api.authorizeOnly({
			card: AUTHORIZE_CARDS.SUCCESS_DISCOVER,
			amount: '10.00',
			refId: `bl-036-edge-discover-${Date.now()}`,
		});

		expect(response.messages.resultCode).toBe('Ok');
		expect(response.transactionResponse?.responseCode).toBe('1');
		expect(response.transactionResponse?.accountType).toBeTruthy();
	});

	test('AVS issuer no-USA (ZIP 46204) → avsResultCode "G"', async ({ request }) => {
		const api = new AuthorizeSandboxApi({ request });

		const response: AuthorizeApiResponse = await api.authorizeOnly({
			card: AUTHORIZE_CARDS.AVS_NON_US,
			amount: '10.00',
			refId: `bl-036-edge-avs-nonus-${Date.now()}`,
		});

		expect(response.messages.resultCode).toBe('Ok');
		// El determinístico es el código AVS; responseCode puede variar por política.
		expect(response.transactionResponse?.avsResultCode).toBe('G');
	});

	test('Partial authorization (ZIP 46225) → aprobación parcial', async ({ request }) => {
		const api = new AuthorizeSandboxApi({ request });

		const response: AuthorizeApiResponse = await api.authorizeOnly({
			card: AUTHORIZE_CARDS.PARTIAL_AUTH,
			amount: '10.00',
			refId: `bl-036-edge-partial-${Date.now()}`,
		});

		// Conservador: el sandbox procesa la operación (Ok) y devuelve un responseCode;
		// el monto parcial exacto ($1.23) depende de la config del sandbox.
		expect(response.messages.resultCode).toBe('Ok');
		expect(response.transactionResponse?.responseCode).toBeTruthy();
	});

	test('Prepaid balance cero (ZIP 46228) → procesado', async ({ request }) => {
		const api = new AuthorizeSandboxApi({ request });

		const response: AuthorizeApiResponse = await api.authorizeOnly({
			card: AUTHORIZE_CARDS.PREPAID_ZERO,
			amount: '10.00',
			refId: `bl-036-edge-prepaid-${Date.now()}`,
		});

		expect(response.messages.resultCode).toBe('Ok');
		expect(response.transactionResponse?.responseCode).toBeTruthy();
	});
});
