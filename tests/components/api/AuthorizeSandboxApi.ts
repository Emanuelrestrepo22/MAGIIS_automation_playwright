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

/** Límite documentado de `refId` en la API de Authorize.net. */
const AUTHORIZE_REF_ID_MAX_LENGTH = 20;

/** Indica si las credenciales sandbox (AUTHORIZE_API_LOGIN_ID + TRANSACTION_KEY) están seteadas. */
export function hasAuthorizeCredentials(): boolean {
	return Boolean(process.env.AUTHORIZE_API_LOGIN_ID && process.env.AUTHORIZE_TRANSACTION_KEY);
}

/**
 * Resumen legible de TODO lo diagnóstico que trae una respuesta del sandbox, para usar como
 * mensaje de fallo de un `expect`.
 *
 * POR QUÉ EXISTE (BL-049): los specs aserraban `messages.resultCode === 'Ok'` sin loguear
 * `messages.message[]`. Cuando el sandbox devuelve `resultCode: 'Error'` —la transacción fue
 * RECHAZADA por la API, no evaluada con un resultado distinto al esperado— el motivo real
 * quedaba fuera del log y la causa raíz era indiagnosticable desde la corrida (3 de los 4
 * fallos de la Ronda 1, 2026-07-28). Con esto, el mismo fallo dice por qué.
 *
 * Lee las DOS fuentes, porque viven en niveles distintos del payload y no siempre coexisten:
 *   - `messages.message[]` (top-level) → rechazos de la API (`E000xx`: auth, campos, formato).
 *   - `transactionResponse.errors[]`   → rechazos del procesador (decline, tarjeta inválida).
 */
export function describeAuthorizeFailure(response: AuthorizeApiResponse): string {
	const parts = [`resultCode=${response.messages?.resultCode ?? '(ausente)'}`];

	const apiMessages = (response.messages?.message ?? []).map(m => `[${m.code}] ${m.text}`);
	if (apiMessages.length) parts.push(`messages=${apiMessages.join(' | ')}`);

	const txErrors = (response.transactionResponse?.errors ?? []).map(e => `[${e.errorCode}] ${e.errorText}`);
	if (txErrors.length) parts.push(`errors=${txErrors.join(' | ')}`);

	const rc = response.transactionResponse?.responseCode;
	if (rc) parts.push(`responseCode=${rc}`);

	return parts.join(' · ');
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
				// Truncado al límite REAL de la API (20 chars, BL-049 §"defecto colateral"): los
				// callers componen `<label>-${Date.now()}` y superan el límite (~31-35 chars). Se
				// sanea acá y no en cada spec para que ningún caller futuro pueda olvidarlo.
				// Se conserva el SUFIJO (`slice(-N)`), no el prefijo: el timestamp vive al final y
				// es lo único que da unicidad. Cortando por el principio, los labels de ≥20 chars
				// (`bl-036-cvv-mismatch-`, `bl-036-edge-discover-`) quedaban sin un solo dígito y
				// el resto solo con los de mayor orden (`17`, `178`) que no cambian en el día → el
				// refId era constante entre corridas y dejaba de servir para rastrear la
				// transacción en el Merchant Interface, que es su única razón de existir.
				refId: refId?.slice(-AUTHORIZE_REF_ID_MAX_LENGTH),
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
					},
					// duplicateWindow=0: recomendación oficial de la guía de testing de Authorize.net
					// para transacciones repetidas. Sin esto, misma tarjeta + mismo monto (10.00 fijo
					// en el pack de contrato) dentro de la ventana de dedupe → responseCode 3
					// (error 11, duplicate) — observado en vivo 2026-07-29 sobre la Visa 4111
					// martillada por las corridas del día. Va DESPUÉS de billTo (API JSON de
					// Authorize sensible al orden de campos).
					transactionSettings: {
						setting: [{ settingName: 'duplicateWindow', settingValue: '0' }]
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
