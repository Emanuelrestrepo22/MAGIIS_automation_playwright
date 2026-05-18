/**
 * Authorize.net API Client — wrapper Playwright para tests API directos.
 * ========================================================================
 *
 * BL-036 frente B (2026-05-13) — habilita tests de tipo API que envíen
 * requests directos al sandbox Authorize.net, sin pasar por la UI MAGIIS.
 *
 * Sirve para:
 *   - Validar que el sandbox responde como esperamos a los triggers documentados
 *     (CVV 900/901/904 + ZIP 46282/46205/46225/46228).
 *   - Detectar regresiones cuando Authorize cambia el comportamiento del sandbox.
 *   - Smoke "contract tests" que fallan ANTES que los E2E si algo del sandbox
 *     deja de funcionar.
 *
 * Endpoints:
 *   - Sandbox: https://apitest.authorize.net/xml/v1/request.api
 *   - Production: https://api.authorize.net/xml/v1/request.api (NO usar en tests)
 *
 * Autenticación: bloque `merchantAuthentication` con `name` (API_LOGIN_ID,
 * max 20 chars) + `transactionKey` (API_TRANSACTION_KEY, max 16 chars).
 *
 * Variables de entorno requeridas (cargar en .env.test):
 *   - AUTHORIZE_API_LOGIN_ID
 *   - AUTHORIZE_TRANSACTION_KEY
 *
 * Si no están seteadas, `hasAuthorizeCredentials()` devuelve false y los specs
 * deben hacer `test.skip()` con mensaje claro — no romper la suite.
 *
 * Referencia: <https://developer.authorize.net/api/reference/index.html>
 */

import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { AuthorizeTestCard } from '../../fixtures/gateways/authorize/cards';

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Tipos de transacción soportados por Authorize.net que usamos en tests.
 * Lista parcial — extender según necesidad. Ver doc oficial para el set completo.
 */
export type AuthorizeTransactionType =
	| 'authOnlyTransaction' // hold (autorización sin captura)
	| 'authCaptureTransaction' // auth + capture en una llamada
	| 'priorAuthCaptureTransaction' // captura un authOnly previo
	| 'refundTransaction' // reembolso de transacción settled
	| 'voidTransaction'; // void de transacción no-settled

/**
 * Response shape relevante para tests de contrato.
 * El JSON real tiene más campos — exponemos los críticos.
 */
export type AuthorizeTransactionResponse = {
	responseCode: '1' | '2' | '3' | '4'; // 1=Approved, 2=Declined, 3=Error, 4=Held
	authCode?: string;
	avsResultCode?: string; // M, A, N, etc.
	cvvResultCode?: string; // M, N, P, S, U
	transId?: string;
	accountNumber?: string; // últimos 4
	accountType?: string; // Visa, Mastercard, etc.
	messages?: Array<{ code: string; description: string }>;
	errors?: Array<{ errorCode: string; errorText: string }>;
};

export type AuthorizeApiResponse = {
	transactionResponse?: AuthorizeTransactionResponse;
	refId?: string;
	messages: {
		resultCode: 'Ok' | 'Error';
		message: Array<{ code: string; text: string }>;
	};
};

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════

const AUTHORIZE_SANDBOX_ENDPOINT = 'https://apitest.authorize.net/xml/v1/request.api';

/**
 * Indica si las credenciales sandbox están seteadas en el entorno actual.
 *
 * Usar en `test.beforeAll` para skipear suites cuando faltan credenciales:
 *
 *   test.skip(!hasAuthorizeCredentials(), 'AUTHORIZE_API_LOGIN_ID/TRANSACTION_KEY no seteadas');
 */
export function hasAuthorizeCredentials(): boolean {
	return Boolean(process.env.AUTHORIZE_API_LOGIN_ID && process.env.AUTHORIZE_TRANSACTION_KEY);
}

// ═══════════════════════════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Cliente Playwright para enviar requests directos al sandbox Authorize.net.
 *
 * Diseño:
 *   - Usa `APIRequestContext` nativo de Playwright (timeouts, tracing, retries).
 *   - Construye el payload JSON canónico Authorize (createTransactionRequest).
 *   - Devuelve el response tipado parsing los campos críticos.
 *   - No hace asserts — el spec consumidor decide qué validar.
 */
export class AuthorizeApiClient {
	private readonly apiLoginId: string;
	private readonly transactionKey: string;
	private readonly endpoint: string;

	constructor(
		private readonly request: APIRequestContext,
		opts: {
			apiLoginId?: string;
			transactionKey?: string;
			endpoint?: string;
		} = {},
	) {
		this.apiLoginId = opts.apiLoginId ?? process.env.AUTHORIZE_API_LOGIN_ID ?? '';
		this.transactionKey = opts.transactionKey ?? process.env.AUTHORIZE_TRANSACTION_KEY ?? '';
		this.endpoint = opts.endpoint ?? AUTHORIZE_SANDBOX_ENDPOINT;

		if (!this.apiLoginId || !this.transactionKey) {
			throw new Error(
				'[AuthorizeApiClient] Credenciales sandbox faltantes. Setear ' +
					'AUTHORIZE_API_LOGIN_ID y AUTHORIZE_TRANSACTION_KEY en .env.test. ' +
					'Usar hasAuthorizeCredentials() para skipear el test si no están.',
			);
		}
	}

	/**
	 * Envía un `authOnlyTransaction` (hold) con la card resuelta.
	 *
	 * @param card — fixture `AuthorizeTestCard` del namespace `AUTHORIZE_CARDS`
	 * @param amount — monto a autorizar (decimal string, ej. "10.00")
	 * @param refId — ID merchant-side para tracking (opcional, max 20 chars)
	 */
	async authOnlyTransaction(
		card: AuthorizeTestCard,
		amount: string,
		refId?: string,
	): Promise<AuthorizeApiResponse> {
		const payload = this.buildTransactionPayload('authOnlyTransaction', card, amount, refId);
		return this.post(payload);
	}

	/**
	 * Envía un `authCaptureTransaction` (hold + capture en una sola llamada).
	 */
	async authCaptureTransaction(
		card: AuthorizeTestCard,
		amount: string,
		refId?: string,
	): Promise<AuthorizeApiResponse> {
		const payload = this.buildTransactionPayload('authCaptureTransaction', card, amount, refId);
		return this.post(payload);
	}

	/**
	 * Captura una autorización previa via `priorAuthCaptureTransaction`.
	 */
	async priorAuthCapture(refTransId: string, amount: string, refId?: string): Promise<AuthorizeApiResponse> {
		const payload = {
			createTransactionRequest: {
				merchantAuthentication: this.getAuthBlock(),
				refId,
				transactionRequest: {
					transactionType: 'priorAuthCaptureTransaction' as const,
					amount,
					refTransId,
				},
			},
		};
		return this.post(payload);
	}

	/**
	 * Void de una transacción no-settled via `voidTransaction`.
	 */
	async voidTransaction(refTransId: string, refId?: string): Promise<AuthorizeApiResponse> {
		const payload = {
			createTransactionRequest: {
				merchantAuthentication: this.getAuthBlock(),
				refId,
				transactionRequest: {
					transactionType: 'voidTransaction' as const,
					refTransId,
				},
			},
		};
		return this.post(payload);
	}

	// ─── Internos ──────────────────────────────────────────────────────────

	private getAuthBlock(): { name: string; transactionKey: string } {
		return {
			name: this.apiLoginId,
			transactionKey: this.transactionKey,
		};
	}

	private buildTransactionPayload(
		transactionType: AuthorizeTransactionType,
		card: AuthorizeTestCard,
		amount: string,
		refId?: string,
	): unknown {
		// Format expirationDate como MMYY (ej "1230" para 12/2030).
		const expirationDate = `${card.exp.month}${card.exp.year.slice(-2)}`;
		return {
			createTransactionRequest: {
				merchantAuthentication: this.getAuthBlock(),
				refId,
				transactionRequest: {
					transactionType,
					amount,
					payment: {
						creditCard: {
							cardNumber: card.number,
							expirationDate,
							cardCode: card.cvc,
						},
					},
					billTo: {
						firstName: card.holderName.split(' ')[0] ?? 'MAGIIS',
						lastName: card.holderName.split(' ').slice(1).join(' ') || 'Test',
						zip: card.zip,
					},
				},
			},
		};
	}

	private async post(payload: unknown): Promise<AuthorizeApiResponse> {
		const response = await this.request.post(this.endpoint, {
			data: payload,
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			failOnStatusCode: false,
		});

		// El sandbox a veces devuelve el JSON con BOM al inicio — limpiarlo.
		const raw = await response.text();
		const cleaned = raw.replace(/^﻿/, '').trim();

		if (!cleaned) {
			throw new AuthorizeApiError(
				`Authorize sandbox respondió body vacío (status ${response.status()})`,
				response,
				cleaned,
			);
		}

		try {
			return JSON.parse(cleaned) as AuthorizeApiResponse;
		} catch (err) {
			throw new AuthorizeApiError(
				`Authorize sandbox devolvió JSON inválido: ${(err as Error).message}`,
				response,
				cleaned,
			);
		}
	}
}

// ═══════════════════════════════════════════════════════════════════════
// ERROR TYPE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Error tipado para fallos de comunicación con el sandbox Authorize.
 * Expone el response crudo y el body para debugging.
 */
export class AuthorizeApiError extends Error {
	constructor(
		message: string,
		public readonly response: APIResponse,
		public readonly body: string,
	) {
		super(message);
		this.name = 'AuthorizeApiError';
	}
}
