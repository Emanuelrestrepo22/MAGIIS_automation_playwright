// tests/utils/safeRequest.unit.ts
// Unit test de wrapRequestWithRedaction (node:test -- sin runner de Playwright).
// Sufijo .unit.ts para que Playwright (testMatch **/*.api.test.ts / **/*.unit.spec.ts)
// NO lo recoja. Run: npx tsx --test tests/utils/safeRequest.unit.ts
//
// Cierra el hallazgo MEDIUM del code review MG-158: `ApiBase.safeFetch` solo
// protegía los 5 métodos get/post/put/patch/delete de ApiBase -- un consumidor
// que recibe un APIRequestContext inyectado (ApiClient, AuthorizeApiClient) y
// llama `this.request.post(...)` directo, SIN pasar por ApiBase, quedaba fuera
// de la redacción. Este test simula exactamente ese caso: un cliente standalone
// (no ApiBase) cuyo fetch falla con headers sensibles embebidos en error.message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { APIRequestContext } from '@playwright/test';
import { wrapRequestWithRedaction } from './safeRequest';

const FAKE_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.FAKE_SIGNATURE_NOT_A_REAL_TOKEN_XXXXXXXXXXXXXXXXXXXXXXXX';

/** Fake mínimo de APIRequestContext: post() rechaza como lo haría Playwright ante un
 *  "socket hang up", con el call log completo (headers incluidos) en error.message. */
function fakeRequestThatFailsWithHeaders(): APIRequestContext {
	return {
		post: async () => {
			throw new Error(
				'apiRequestContext.fetch: socket hang up\nCall log:\n' +
					'  - → POST https://api.magiis.com/x\n' +
					`  - authorization: Bearer ${FAKE_TOKEN}\n` +
					'  - content-type: application/json'
			);
		}
	} as unknown as APIRequestContext;
}

test('un cliente standalone (no ApiBase) que llama this.request.post directo queda redactado', async () => {
	// Simula el patrón real de AuthorizeApiClient/ApiClient: reciben un
	// APIRequestContext por constructor y llaman this.request.post(...) sin
	// pasar por ApiBase.apiPOST/safeFetch.
	class StandaloneClient {
		private readonly request: APIRequestContext;
		constructor(request: APIRequestContext) {
			this.request = wrapRequestWithRedaction(request);
		}
		async post(): Promise<unknown> {
			return this.request.post('https://api.magiis.com/x', { data: {} });
		}
	}

	const client = new StandaloneClient(fakeRequestThatFailsWithHeaders());

	await assert.rejects(
		() => client.post(),
		(err: unknown) => {
			assert.ok(err instanceof Error);
			assert.ok(!err.message.includes(FAKE_TOKEN), 'el token no debe aparecer en el error propagado');
			assert.match(err.message, /authorization: \[REDACTED\]/i);
			assert.match(err.message, /content-type: application\/json/); // preserva el resto del volcado
			return true;
		}
	);
});

test('sin el wrapper, el mismo cliente SI filtraria el token (control negativo)', async () => {
	class UnwrappedClient {
		constructor(private readonly request: APIRequestContext) {}
		async post(): Promise<unknown> {
			return this.request.post('https://api.magiis.com/x', { data: {} });
		}
	}

	const client = new UnwrappedClient(fakeRequestThatFailsWithHeaders());

	await assert.rejects(
		() => client.post(),
		(err: unknown) => {
			assert.ok(err instanceof Error);
			assert.ok(err.message.includes(FAKE_TOKEN), 'control negativo: sin wrapper el token viaja en claro');
			return true;
		}
	);
});

test('un metodo que resuelve OK pasa transparente (no altera responses exitosas)', async () => {
	const okRequest = {
		get: async () => ({ status: () => 200 })
	} as unknown as APIRequestContext;

	const wrapped = wrapRequestWithRedaction(okRequest);
	const response = (await wrapped.get('https://api.magiis.com/x')) as { status: () => number };
	assert.equal(response.status(), 200);
});
