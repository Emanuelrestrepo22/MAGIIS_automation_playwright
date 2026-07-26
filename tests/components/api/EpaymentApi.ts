/**
 * KATA Component (Layer 3) — MercadoPago ePayment (hold / cobro) API.
 *
 * Contraparte MP del hold + cobro de Stripe. Expone el flujo `ePayment → finalize` + la lectura
 * de estado como mini-flujos ATC atómicos sobre el backend MAGIIS `/magiis-v0.2`:
 *   - `startEpayment`    → inicia el cobro/hold (dispara los gates de negocio).
 *   - `finalizeEpayment` → captura/confirma el cobro iniciado.
 *   - `getEpaymentStatus`→ lee el estado (approved/rejected/pending + statusDetail del sandbox MP).
 *
 * FUENTE (reverse-engineering `repo.magiis/magiis-be` develop — flujo `ePayment → finalize`
 * confirmado; rutas REST literales INFERIDAS y overridables por env — ver constantes).
 *
 * GATES DE NEGOCIO como aserciones de contrato (grounded):
 *   - 412 CARRIER_NOT_LINKED → cobro/hold sobre un carrier sin pasarela vinculada.
 *   - 2077 HOLD_NOT_SUPPORTED → MP no soporta hold (verificationFoundsCard) — delta vs Stripe.
 *
 * ⚠️ CODE-ONLY / UAT: MercadoPago NO transacciona en el entorno TEST → la ejecución REAL (cobro,
 * declines por keyword, hold 2077) se difiere a UAT. Los specs formales skipean LIMPIO en TEST.
 *
 * Convención KATA: extiende ApiBase, import por alias, fail-fast en validación de input, contrato
 * HTTP sin lanzar ante excepción de red (status 0), parámetros como objeto único.
 *
 * Cobertura: MG-160 (área E — alta con PSP sin hold → 2077) · MG-161 (área F — alta Cargo a Bordo) ·
 *   MG-162/MG-163/MG-164 (área F/COB — cobro/finalize + estados approved/rejected).
 */

import type { TestContextOptions } from '@TestContext';
import type {
	MercadopagoEpaymentFinalizeRequest,
	MercadopagoEpaymentRequest,
	MercadopagoEpaymentStatus,
	MercadopagoHttpResult
} from '@schemas/mercadopago.types';

import { ApiBase } from '@api/ApiBase';
import { atc } from '@utils/decorators';

/** Rutas REST INFERIDAS del flujo `ePayment → finalize`; overridables por env para confirmar en UAT. */
const MP_EPAYMENT_PATH = process.env.MP_EPAYMENT_PATH ?? '/magiis-v0.2/ePayment'; // [confirmar UAT]
const MP_EPAYMENT_FINALIZE_PATH = process.env.MP_EPAYMENT_FINALIZE_PATH ?? '/magiis-v0.2/ePayment/finalize'; // [confirmar UAT]

/** Códigos HTTP de los gates de negocio del ePayment MP. */
export const MP_CARRIER_NOT_LINKED_STATUS = 412 as const;
export const MP_HOLD_NOT_SUPPORTED_CODE = 2077 as const;

/** Input de inicio de ePayment. */
export interface StartEpaymentInput extends MercadopagoEpaymentRequest {
	/** Header Authorization completo (ya incluye "Bearer "). */
	authToken: string;
	/** Override de base URL; default apiBaseUrl. */
	baseUrl?: string;
}

/** Input de finalización. */
export interface FinalizeEpaymentInput extends MercadopagoEpaymentFinalizeRequest {
	/** Header Authorization completo (ya incluye "Bearer "). */
	authToken: string;
	/** Override de base URL; default apiBaseUrl. */
	baseUrl?: string;
}

/** Input de lectura de estado. */
export interface GetEpaymentStatusInput {
	ePaymentId: number | string;
	/** Header Authorization completo (ya incluye "Bearer "). */
	authToken: string;
	/** Override de base URL; default apiBaseUrl. */
	baseUrl?: string;
}

export class EpaymentApi extends ApiBase {
	constructor(options: TestContextOptions) {
		super(options);
	}

	/** Resuelve la base URL sin barra final. */
	private resolveBase(baseUrl?: string): string {
		return (baseUrl ?? this.apiBaseUrl ?? process.env.BASE_URL ?? '').replace(/\/$/, '');
	}

	/**
	 * Mini-flujo ATC: inicia el ePayment (alta de viaje con PSP). Con `hold=true` MP responde el gate
	 * HOLD_NOT_SUPPORTED (2077). Sin pasarela vinculada → 412 CARRIER_NOT_LINKED. Devuelve el contrato
	 * HTTP; el gate se asierta a nivel spec. Fail-fast si faltan carrier/passenger/amount.
	 *
	 * @atc MG-160 — área E (alta con PSP sin hold → 2077). Ejecución real = UAT.
	 */
	@atc('MG-160', { severity: 'critical', description: 'startEpayment — inicia cobro/hold MP (gates 412/2077)' })
	async startEpayment(input: StartEpaymentInput): Promise<MercadopagoHttpResult<MercadopagoEpaymentStatus>> {
		if (input.carrierId == null || input.passengerId == null || !input.amount) {
			throw new Error('[EpaymentApi.startEpayment] carrierId, passengerId y amount son obligatorios.');
		}
		const url = `${this.resolveBase(input.baseUrl)}${MP_EPAYMENT_PATH}`;
		const { authToken, baseUrl: _baseUrl, ...payload } = input;
		try {
			const res = await this.request.post(url, {
				headers: { Authorization: authToken, 'Content-Type': 'application/json' },
				data: payload,
				failOnStatusCode: false
			});
			const raw = (await res.text()).trim();
			return { status: res.status(), ok: res.ok(), raw, body: safeJson(raw) as MercadopagoEpaymentStatus | null };
		} catch (err) {
			return { status: 0, ok: false, raw: String(err), body: null };
		}
	}

	/**
	 * Mini-flujo ATC: finaliza (captura/confirma) el ePayment iniciado. Devuelve el contrato HTTP.
	 * Fail-fast si falta el ePaymentId.
	 *
	 * @atc MG-161 — área F (alta Cargo a Bordo / finalize). Ejecución real = UAT.
	 */
	@atc('MG-161', { severity: 'critical', description: 'finalizeEpayment — captura/confirma el cobro MP' })
	async finalizeEpayment(input: FinalizeEpaymentInput): Promise<MercadopagoHttpResult<MercadopagoEpaymentStatus>> {
		if (input.ePaymentId == null) {
			throw new Error('[EpaymentApi.finalizeEpayment] ePaymentId es obligatorio.');
		}
		const url = `${this.resolveBase(input.baseUrl)}${MP_EPAYMENT_FINALIZE_PATH}`;
		try {
			const res = await this.request.post(url, {
				headers: { Authorization: input.authToken, 'Content-Type': 'application/json' },
				data: { ePaymentId: input.ePaymentId, status: input.status },
				failOnStatusCode: false
			});
			const raw = (await res.text()).trim();
			return { status: res.status(), ok: res.ok(), raw, body: safeJson(raw) as MercadopagoEpaymentStatus | null };
		} catch (err) {
			return { status: 0, ok: false, raw: String(err), body: null };
		}
	}

	/**
	 * Mini-flujo ATC: lee el estado del ePayment (approved/rejected/pending + statusDetail del
	 * sandbox MP). Devuelve el contrato HTTP. Fail-fast si falta el ePaymentId.
	 *
	 * @atc MG-162 — área F/COB (lectura de estado del cobro). Ejecución real = UAT.
	 */
	@atc('MG-162', { severity: 'normal', description: 'getEpaymentStatus — lee el estado del cobro MP' })
	async getEpaymentStatus(input: GetEpaymentStatusInput): Promise<MercadopagoHttpResult<MercadopagoEpaymentStatus>> {
		if (input.ePaymentId == null) {
			throw new Error('[EpaymentApi.getEpaymentStatus] ePaymentId es obligatorio.');
		}
		const url = `${this.resolveBase(input.baseUrl)}${MP_EPAYMENT_PATH}/${input.ePaymentId}`;
		try {
			const res = await this.request.get(url, {
				headers: { Authorization: input.authToken },
				failOnStatusCode: false
			});
			const raw = (await res.text()).trim();
			return { status: res.status(), ok: res.ok(), raw, body: safeJson(raw) as MercadopagoEpaymentStatus | null };
		} catch (err) {
			return { status: 0, ok: false, raw: String(err), body: null };
		}
	}
}

/** Parseo tolerante — devuelve `null` si el body no es JSON (evita romper el contrato HTTP). */
function safeJson(raw: string): unknown | null {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
