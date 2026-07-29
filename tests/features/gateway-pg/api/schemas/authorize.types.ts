/**
 * Facade de tipos — contrato Authorize.net sandbox (createTransactionRequest).
 * ============================================================================
 *
 * Fase G / BL-036 frente B — Este repo NO tiene pipeline OpenAPI, por lo que
 * los tipos del contrato son *hand-authored* y viven acá como facade tipado
 * que los specs API de `authorize-sandbox/` importan.
 *
 * Alcance: SOLO los campos que los contract tests de Authorize.net referencian
 * hoy (request `authOnlyTransaction` + response con responseCode / cvvResultCode
 * / avsResultCode / accountType / messages). Grounded en los payloads reales
 * construidos y parseados por `AuthorizeApiClient`
 * (`tests/shared/utils/authorize-api-client.ts`). NO se inventan campos que el
 * contrato real no exponga; el JSON del sandbox tiene más campos, exponemos los
 * críticos para los tests de contrato.
 *
 * Referencia: <https://developer.authorize.net/api/reference/index.html>
 */

// ═══════════════════════════════════════════════════════════════════════
// REQUEST — createTransactionRequest
// ═══════════════════════════════════════════════════════════════════════

/**
 * Tipos de transacción soportados por Authorize.net usados en tests.
 * Lista parcial — ver doc oficial para el set completo.
 */
export type AuthorizeTransactionType =
	| 'authOnlyTransaction' // hold (autorización sin captura)
	| 'authCaptureTransaction' // auth + capture en una llamada
	| 'priorAuthCaptureTransaction' // captura un authOnly previo
	| 'refundTransaction' // reembolso de transacción settled
	| 'voidTransaction'; // void de transacción no-settled

/** Bloque de autenticación merchant (name = API_LOGIN_ID, transactionKey). */
export interface AuthorizeMerchantAuthentication {
	name: string;
	transactionKey: string;
}

/** Datos de tarjeta enviados en `payment.creditCard`. */
export interface AuthorizeCreditCard {
	cardNumber: string;
	/** Formato MMYY, ej. "1230" para 12/2030. */
	expirationDate: string;
	cardCode: string;
}

/** Dirección de facturación enviada en `billTo` (dispara triggers AVS por zip). */
export interface AuthorizeBillTo {
	firstName: string;
	lastName: string;
	zip: string;
}

/** Cuerpo `transactionRequest` del payload createTransactionRequest. */
export interface AuthorizeTransactionRequestBody {
	transactionType: AuthorizeTransactionType;
	amount?: string;
	payment?: {
		creditCard: AuthorizeCreditCard;
	};
	billTo?: AuthorizeBillTo;
	refTransId?: string;
}

/** Payload raíz enviado al endpoint sandbox. */
export interface AuthorizeCreateTransactionRequest {
	createTransactionRequest: {
		merchantAuthentication: AuthorizeMerchantAuthentication;
		refId?: string;
		transactionRequest: AuthorizeTransactionRequestBody;
	};
}

// ═══════════════════════════════════════════════════════════════════════
// RESPONSE — createTransactionResponse
// ═══════════════════════════════════════════════════════════════════════

/**
 * Response code de la transacción.
 * 1=Approved, 2=Declined, 3=Error, 4=Held for review.
 */
export type AuthorizeResponseCode = '1' | '2' | '3' | '4';

/** resultCode del bloque `messages` top-level. */
export type AuthorizeResultCode = 'Ok' | 'Error';

/** Mensaje dentro de `transactionResponse.messages`. */
export interface AuthorizeTransactionMessage {
	code: string;
	description: string;
}

/** Error dentro de `transactionResponse.errors`. */
export interface AuthorizeTransactionError {
	errorCode: string;
	errorText: string;
}

/** Mensaje dentro del bloque `messages` top-level. */
export interface AuthorizeResponseMessage {
	code: string;
	text: string;
}

/**
 * Bloque `transactionResponse` — resultado de la transacción.
 * Campos opcionales porque el sandbox no siempre los devuelve (ej. declines
 * sin authCode válido). El JSON real tiene más campos.
 */
export interface AuthorizeTransactionResponse {
	responseCode: AuthorizeResponseCode;
	authCode?: string;
	/** M, A, N, G, etc. (Address Verification Service). */
	avsResultCode?: string;
	/** M, N, P, S, U (Card Code Verification). */
	cvvResultCode?: string;
	transId?: string;
	/**
	 * `'1'` cuando la cuenta procesó la transacción en **Test Mode**: la respuesta es
	 * enlatada (`transId '0'`, `authCode '000000'`) y los triggers de ZIP/CVV NO se
	 * evalúan. Discriminador de la cuenta — ver `helpers/authorize-account-guard.ts`.
	 */
	testRequest?: string;
	/** Últimos 4 dígitos. */
	accountNumber?: string;
	/** Visa, MasterCard, AmericanExpress, etc. */
	accountType?: string;
	messages?: AuthorizeTransactionMessage[];
	errors?: AuthorizeTransactionError[];
}

/** Response raíz de `createTransactionRequest` parseado desde el sandbox. */
export interface AuthorizeApiResponse {
	transactionResponse?: AuthorizeTransactionResponse;
	refId?: string;
	messages: {
		resultCode: AuthorizeResultCode;
		message: AuthorizeResponseMessage[];
	};
}
