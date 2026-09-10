/**
 * KATA Architecture — Layer 2: API Base Component.
 *
 * Métodos HTTP type-safe para los componentes API. Usa el APIRequestContext nativo
 * de Playwright. Extiende TestContext para heredar drivers y entorno.
 *
 * Patrón de retorno (tuplas):
 *   - GET/DELETE  → [APIResponse, TBody]
 *   - POST/PUT/PATCH → [APIResponse, TBody, TPayload]
 *
 * Adaptación magiis-playwright: sin adjuntos Allure automáticos (este repo aún no
 * expone un util de Allure compartido). apiBaseUrl se resuelve del env.
 */

import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { TestContextOptions } from '@TestContext';

import { TestContext } from '@TestContext';
import { redactSecrets } from '@utils/redact';

export interface RequestOptions {
	headers?: Record<string, string>;
	params?: Record<string, string>;
	timeout?: number;
}

export class ApiBase extends TestContext {
	/** Base URL para requests API (de API_URL / AUTH_API_URL / BASE_URL). */
	readonly apiBaseUrl: string;

	/** Token Bearer para requests autenticadas. */
	authToken: string | null = null;

	/** Headers por defecto. El Accept con comodines evita 406 en servidores estrictos. */
	requestHeaders: Record<string, string> = {
		Accept: '*/*',
		'Content-Type': 'application/json'
	};

	constructor(options: TestContextOptions) {
		super(options);
		this.apiBaseUrl = process.env.API_URL ?? process.env.AUTH_API_URL ?? process.env.BASE_URL ?? '';
	}

	/**
	 * Accesor de APIRequestContext. Prefiere page.request en E2E (comparte cookies).
	 * Fail-fast si no hay request disponible.
	 */
	get request(): APIRequestContext {
		if (this._page) return this._page.request;
		if (!this._request) {
			throw new Error('Request no disponible. ApiBase requiere un fixture api o test.');
		}
		return this._request;
	}

	/**
	 * Ejecuta una llamada `this.request.*` redactando headers sensibles (Authorization,
	 * Cookie, etc.) si el fetch falla a nivel de red -- Playwright embebe el call log
	 * completo (headers incluidos) en error.message ante fallos como "socket hang up".
	 * Primera barrera de defensa antes de que ese mensaje llegue a cualquier reporter/log.
	 */
	private async safeFetch(fn: () => Promise<APIResponse>): Promise<APIResponse> {
		try {
			return await fn();
		} catch (err) {
			if (err instanceof Error) err.message = redactSecrets(err.message);
			throw err;
		}
	}

	setAuthToken(token: string): void {
		this.authToken = token;
	}

	clearAuthToken(): void {
		this.authToken = null;
	}

	/** Parsea la respuesta como JSON; objeto vacío si falla. */
	async getResponseJson<T = Record<string, unknown>>(response: APIResponse): Promise<T> {
		try {
			return (await response.json()) as T;
		} catch {
			return {} as T;
		}
	}

	async apiGET<TBody = Record<string, unknown>>(
		endpoint: string,
		options: RequestOptions = {}
	): Promise<[APIResponse, TBody]> {
		const response = await this.safeFetch(() =>
			this.request.get(this.apiEndpoint(endpoint), {
				headers: this.buildHeaders(options.headers),
				params: options.params,
				timeout: options.timeout
			})
		);
		return [response, await this.getResponseJson<TBody>(response)];
	}

	async apiPOST<TBody = Record<string, unknown>, TPayload = Record<string, unknown>>(
		endpoint: string,
		data: TPayload,
		options: RequestOptions = {}
	): Promise<[APIResponse, TBody, TPayload]> {
		const response = await this.safeFetch(() =>
			this.request.post(this.apiEndpoint(endpoint), {
				headers: this.buildHeaders(options.headers),
				data,
				params: options.params,
				timeout: options.timeout
			})
		);
		return [response, await this.getResponseJson<TBody>(response), data];
	}

	async apiPUT<TBody = Record<string, unknown>, TPayload = Record<string, unknown>>(
		endpoint: string,
		data: TPayload,
		options: RequestOptions = {}
	): Promise<[APIResponse, TBody, TPayload]> {
		const response = await this.safeFetch(() =>
			this.request.put(this.apiEndpoint(endpoint), {
				headers: this.buildHeaders(options.headers),
				data,
				params: options.params,
				timeout: options.timeout
			})
		);
		return [response, await this.getResponseJson<TBody>(response), data];
	}

	async apiPATCH<TBody = Record<string, unknown>, TPayload = Record<string, unknown>>(
		endpoint: string,
		data: TPayload,
		options: RequestOptions = {}
	): Promise<[APIResponse, TBody, TPayload]> {
		const response = await this.safeFetch(() =>
			this.request.patch(this.apiEndpoint(endpoint), {
				headers: this.buildHeaders(options.headers),
				data,
				params: options.params,
				timeout: options.timeout
			})
		);
		return [response, await this.getResponseJson<TBody>(response), data];
	}

	async apiDELETE<TBody = Record<string, unknown>>(
		endpoint: string,
		options: RequestOptions = {}
	): Promise<[APIResponse, TBody]> {
		const response = await this.safeFetch(() =>
			this.request.delete(this.apiEndpoint(endpoint), {
				headers: this.buildHeaders(options.headers),
				params: options.params,
				timeout: options.timeout
			})
		);
		return [response, await this.getResponseJson<TBody>(response)];
	}

	/** Arma la URL completa desde un endpoint (soporta absolutos). */
	apiEndpoint(endpoint: string): string {
		if (endpoint.startsWith('http')) return endpoint;
		const base = this.apiBaseUrl.replace(/\/$/, '');
		const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
		return `${base}${cleanEndpoint}`;
	}

	/** Arma los headers, agregando el token Bearer si existe. */
	buildHeaders(customHeaders?: Record<string, string>): Record<string, string> {
		const headers: Record<string, string> = { ...this.requestHeaders, ...customHeaders };
		if (this.authToken) headers.Authorization = `Bearer ${this.authToken}`;
		return headers;
	}
}
