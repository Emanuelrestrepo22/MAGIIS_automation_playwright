// tests/utils/safeRequest.ts
// Envoltorio de APIRequestContext que redacta headers sensibles en error.message.
//
// Motivo (MG-158 code review): `ApiBase.safeFetch` solo protegia los metodos
// get/post/put/patch/delete de ApiBase. Cualquier consumidor que llamara
// `this.request.post(...)` directo -- subclases de ApiBase (AuthorizeSandboxApi,
// CardApi, EpaymentApi, VendorApi) o clientes standalone que reciben un
// APIRequestContext inyectado (ApiClient, AuthorizeApiClient) -- quedaba sin la
// primera barrera de redaccion: si el fetch fallaba a nivel de red (ej. "socket
// hang up"), Playwright embebe el call log completo -- headers incluidos -- en
// error.message, y ese texto viajaba tal cual hasta cualquier reporter/log.
//
// Fix de raiz: envolver el APIRequestContext UNA vez, en el punto donde se
// obtiene (getter de ApiBase, constructor de los clientes standalone), para que
// TODO metodo (get/post/put/patch/delete/head/fetch) quede cubierto por
// herencia -- sin rehacer el try/catch en cada subclase o caller.
import type { APIRequestContext } from '@playwright/test';

import { redactSecrets } from '@utils/redact';

/**
 * Envuelve un APIRequestContext en un Proxy: cualquier metodo que devuelva una
 * Promise que rechace con un Error tiene su `.message` redactado antes de
 * relanzar. Metodos sincronos o que no fallan pasan sin cambios -- transparente
 * para el resto del contrato de APIRequestContext.
 */
export function wrapRequestWithRedaction(request: APIRequestContext): APIRequestContext {
	return new Proxy(request, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver) as unknown;
			if (typeof value !== 'function') return value;

			return function (this: unknown, ...args: unknown[]) {
				const result = (value as (...a: unknown[]) => unknown).apply(target, args);
				if (result instanceof Promise) {
					return result.catch((err: unknown) => {
						if (err instanceof Error) err.message = redactSecrets(err.message);
						throw err;
					});
				}
				return result;
			};
		}
	});
}
