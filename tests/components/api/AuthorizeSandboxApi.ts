/**
 * KATA Component (Layer 3) — Authorize.net sandbox contract API.
 *
 * Versión KATA del cliente legacy `tests/shared/utils/authorize-api-client.ts`
 * (BL-036 frente B): extiende `ApiBase` y expone la transacción `authOnly` como un
 * mini-flujo ATC atómico. Envía requests directos al endpoint sandbox de Authorize.net
 * (NO pasa por la UI MAGIIS) para detectar drift del sandbox ANTES que los E2E.
 *
 * Convención KATA aplicada:
 *   - Extiende ApiBase (usa `this.request` del fixture; sin Bearer — el sandbox usa
 *     `merchantAuthentication` en el body).
 *   - Import por alias (@api, @utils, @schemas, @fixtures) — sin relativos.
 *   - Método público fail-fast; parámetros 3+ → objeto (`AuthorizeAuthOnlyInput`).
 *   - Tipos de request/response desde el facade `@schemas/authorize.types`.
 *
 * Parsing: lee el body como texto y limpia el BOM antes de `JSON.parse` (el sandbox a
 * veces devuelve el JSON con BOM inicial) — comportamiento portado del cliente legacy.
 *
 * NOTA @atc — el idmap `atp-mg-gateway-idmap.md` es MG (Stripe) y NO cubre los contract
 * tests del sandbox Authorize.net (frente B). El ancla real de trazabilidad de estos
 * tests es el work item BL-036, que se usa como testId hasta que exista un Test 1:1.
 */

import type { APIResponse } from '@playwright/test';
import type { TestContextOptions } from '@TestContext';
import type { AuthorizeApiResponse, AuthorizeCreateTransactionRequest } from '@schemas/authorize.types';
import type { AuthorizeTestCard } from '@fixtures/gateways/authorize/cards';

import { ApiBase } from '@api/ApiBase';
import { atc } from '@utils/decorators';

const AUTHORIZE_SANDBOX_ENDPOINT = 'https://apitest.authorize.net/xml/v1/request.api';

/** Indica si las credenciales sandbox (AUTHORIZE_API_LOGIN_ID + TRANSACTION_KEY) están seteadas. */
export function hasAuthorizeCredentials(): boolean {
	return Boolean(process.env.AUTHORIZE_API_LOGIN_ID && process.env.AUTHORIZE_TRANSACTION_KEY);
}

/** Error tipado para fallos de comunicación con el sandbox Authorize (body crudo para debug). */
export class AuthorizeApiError extends Error {
	constructor(
		message: string,
		public readonly response: APIResponse,
		public readonly body: string
	) {
		super(message);
		this.name = 'AuthorizeApiError';
	}
}

/** Parámetros de un `authOnlyTransaction` contra el sandbox. */
export interface AuthorizeAuthOnlyInput {
	/** Fixture `AuthorizeTestCard` del namespace `AUTHORIZE_CARDS`. */
	card: AuthorizeTestCard;
	/** Monto a autorizar (decimal string, ej. "10.00"). */
	amount: string;
	/** ID merchant-side para tracking (opcional, max 20 chars). */
	refId?: string;
}

export class AuthorizeSandboxApi extends ApiBase {
	private readonly apiLoginId: string;
	private readonly transactionKey: string;

	constructor(options: TestContextOptions) {
		super(options);
		this.apiLoginId = process.env.AUTHORIZE_API_LOGIN_ID ?? '';
		this.transactionKey = process.env.AUTHORIZE_TRANSACTION_KEY ?? '';
	}

	/**
	 * Mini-flujo ATC: `authOnlyTransaction` (hold) con la card resuelta → response parseado.
	 * Fail-fast si faltan las credenciales sandbox.
	 */
	@atc('BL-036', { severity: 'critical', description: 'Authorize.net sandbox — authOnlyTransaction (contract)' })
	async authorizeOnly(input: AuthorizeAuthOnlyInput): Promise<AuthorizeApiResponse> {
		if (!this.apiLoginId || !this.transactionKey) {
			throw new Error(
				'[AuthorizeSandboxApi] Credenciales sandbox faltantes. Setear AUTHORIZE_API_LOGIN_ID y ' +
					'AUTHORIZE_TRANSACTION_KEY en .env.test. Usar hasAuthorizeCredentials() para skipear el test.'
			);
		}
		const payload = this.buildAuthOnlyPayload(input);
		return this.post(payload);
	}

	/** Arma el payload canónico `createTransactionRequest` para un authOnlyTransaction. */
	private buildAuthOnlyPayload(input: AuthorizeAuthOnlyInput): AuthorizeCreateTransactionRequest {
		const { card, amount, refId } = input;
		// expirationDate en formato MMYY (ej. "1230" para 12/2030).
		const expirationDate = `${card.exp.month}${card.exp.year.slice(-2)}`;
		return {
			createTransactionRequest: {
				merchantAuthentication: { name: this.apiLoginId, transactionKey: this.transactionKey },
				refId,
				transactionRequest: {
					transactionType: 'authOnlyTransaction',
					amount,
					payment: {
						creditCard: { cardNumber: card.number, expirationDate, cardCode: card.cvc }
					},
					billTo: {
						firstName: card.holderName.split(' ')[0] ?? 'MAGIIS',
						lastName: card.holderName.split(' ').slice(1).join(' ') || 'Test',
						zip: card.zip
					}
				}
			}
		};
	}

	/** POST al sandbox; limpia el BOM inicial antes de parsear. Fail-fast ante body vacío / JSON inválido. */
	private async post(payload: AuthorizeCreateTransactionRequest): Promise<AuthorizeApiResponse> {
		const response = await this.request.post(AUTHORIZE_SANDBOX_ENDPOINT, {
			data: payload,
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			failOnStatusCode: false
		});

		const cleaned = (await response.text()).replace(/^﻿/, '').trim();
		if (!cleaned) {
			throw new AuthorizeApiError(
				`Authorize sandbox respondió body vacío (status ${response.status()})`,
				response,
				cleaned
			);
		}
		try {
			return JSON.parse(cleaned) as AuthorizeApiResponse;
		} catch (err) {
			throw new AuthorizeApiError(
				`Authorize sandbox devolvió JSON inválido: ${(err as Error).message}`,
				response,
				cleaned
			);
		}
	}
}
