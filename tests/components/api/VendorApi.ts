/**
 * KATA Component (Layer 3) — Vendor / payment-gateway lifecycle API.
 *
 * Expone la desvinculación de pasarela + limpieza de wallets del carrier como un mini-flujo
 * ATC atómico. Extiende `ApiBase` y usa `this.request` del fixture.
 *
 * Endpoint (confirmado por ing. inversa backend):
 *   POST /magiis-v0.2/vendor/cleaningWallets/{provider}/{carrierId}/{appId}   (Bearer, SIN body)
 *
 * ⚠ SEMÁNTICA DE LOS PATH PARAMS (crítico, contraintuitivo):
 *   - `{carrierId}` = **userId del ADMIN del carrier** (NO carrier_account.id). El backend hace
 *     findById(userId) + findByUserId(userId).getCarrierAccount().
 *   - `{appId}` = MercadopagoApp.id (fila por país + appCode). En TEST difiere de UAT.
 *   - `{provider}` ∈ {STRIPE, AUTHORIZE, EBIZ, MERCADOPAGO}.
 *
 * Efecto (destructivo):
 *   - STRIPE / AUTHORIZE / EBIZ → borran FÍSICO user_wallet + card (cascade); `deleteXxxVendor`
 *     es @Async (responde 200 ANTES de terminar) → la aserción de count=0 debe poll-ear.
 *   - MERCADOPAGO → NO borra cards (early-return) + delete síncrono.
 *
 * Respuestas: 200 éxito · 404 USER_NOT_FOUND / CARRIER_NOT_FOUND · 400 VENDOR_INVALID_CODE.
 *
 * Contrato KATA de la respuesta (no lanza ante excepción de red → status 0), igual que
 * `ServiceTypeCountsApi`. La aserción del EFECTO (wallets/cards en 0, estado del link) es capa DB.
 *
 * @atc MG-166 — área G (desvinculación / cleaning wallets, ATR MG-515). Mapeo por área
 *   (idmap atp-mg-gateway-idmap.md); el ATC cubre la operación de cleaning que agrupa la suite G.
 */

import type { TestContextOptions } from '@TestContext';
import type { MercadopagoHttpResult } from '@schemas/mercadopago.types';

import { ApiBase } from '@api/ApiBase';
import { atc } from '@utils/decorators';

/** Códigos de proveedor de pasarela aceptados por el endpoint (VENDOR_INVALID_CODE si no matchea). */
export type VendorProvider = 'STRIPE' | 'AUTHORIZE' | 'EBIZ' | 'MERCADOPAGO';

export interface CleaningWalletsInput {
	/** Provider a desvincular. Un valor fuera del enum → 400 VENDOR_INVALID_CODE. */
	provider: VendorProvider;
	/**
	 * userId del ADMIN del carrier (path param `{carrierId}`). NO es carrier_account.id.
	 * Un userId inexistente → 404 USER_NOT_FOUND / CARRIER_NOT_FOUND.
	 */
	carrierUserId: number | string;
	/** MercadopagoApp.id del provider + país del carrier (path param `{appId}`). */
	appId: number | string;
	/** Header Authorization completo (ya incluye "Bearer "). */
	authToken: string;
	/** Override de base URL; default apiBaseUrl (API_URL / AUTH_API_URL / BASE_URL). */
	baseUrl?: string;
}

export interface CleaningWalletsResponse {
	/** HTTP status (0 si hubo excepción de red). */
	status: number;
	/** res.ok() (2xx). */
	ok: boolean;
	/** Body crudo (trim). */
	body: string;
}

export interface RegisterMercadopagoVendorInput {
	/** userId del ADMIN del carrier a vincular (body `carrier`). */
	carrierUserId: number | string;
	/** authorization code del OAuth MP Connect (test-mode). Vacío/expirado → alta falla. */
	code: string;
	/** Header Authorization completo (ya incluye "Bearer "). */
	authToken: string;
	/** Override de base URL; default apiBaseUrl (API_URL / AUTH_API_URL / BASE_URL). */
	baseUrl?: string;
}

export class VendorApi extends ApiBase {
	constructor(options: TestContextOptions) {
		super(options);
	}

	/**
	 * Mini-flujo ATC: POST vendor/cleaningWallets/{provider}/{carrierId}/{appId} (Bearer, sin body).
	 * Devuelve { status, ok, body } del contrato HTTP; NO lanza ante excepción de red (status 0).
	 * El efecto real (borrado físico de wallets/cards, estado del link) es aserción DB.
	 */
	@atc('MG-166', {
		severity: 'critical',
		description: 'POST vendor/cleaningWallets — desvincula la pasarela y limpia wallets del carrier'
	})
	async cleaningWallets(input: CleaningWalletsInput): Promise<CleaningWalletsResponse> {
		const base = (input.baseUrl ?? this.apiBaseUrl ?? process.env.BASE_URL ?? '').replace(/\/$/, '');
		const url = `${base}/magiis-v0.2/vendor/cleaningWallets/${input.provider}/${input.carrierUserId}/${input.appId}`;
		try {
			const res = await this.request.post(url, {
				headers: { Authorization: input.authToken },
				failOnStatusCode: false
			});
			const body = (await res.text()).trim();
			return { status: res.status(), ok: res.ok(), body };
		} catch (err) {
			return { status: 0, ok: false, body: String(err) };
		}
	}

	/**
	 * Mini-flujo ATC: `POST vendor/mercadopago` — vincula la pasarela MercadoPago al carrier
	 * (`registerMercadopagoVendor(user, code, carrier)`). Contraparte MP del alta de Stripe/Connect.
	 *
	 * Ruta REST confirmada por el nombre del endpoint (`POST vendor/mercadopago`); el `code` es el
	 * authorization code del OAuth MP Connect (test-mode). Body overridable si el contrato UAT difiere.
	 *
	 * Contrato de negocio (grounded en reverse-engineering magiis-be):
	 *   - 200/201 → vinculación creada.
	 *   - 409 MERCADOPAGO_IN_USE → el carrier ya tiene MP vinculado (negativo A-04).
	 *   - 404 USER_NOT_FOUND / CARRIER_NOT_FOUND → user/carrier inexistente.
	 *
	 * ⚠️ CODE-ONLY: el alta REAL requiere un `code` OAuth vivo (no automatizable en TEST) → la
	 * ejecución real se difiere a UAT. Devuelve el contrato HTTP; NO lanza ante excepción de red.
	 *
	 * @atc MG-141 — área A (vinculación MP). Mapeo por área (idmap atp-mg-gateway-idmap.md);
	 *   el negativo MERCADOPAGO_IN_USE es MG-144 (A-04), aserción a nivel spec.
	 */
	@atc('MG-141', {
		severity: 'critical',
		description: 'POST vendor/mercadopago — vincula la pasarela MercadoPago al carrier (OAuth Connect)'
	})
	async registerMercadopagoVendor(input: RegisterMercadopagoVendorInput): Promise<MercadopagoHttpResult> {
		const base = (input.baseUrl ?? this.apiBaseUrl ?? process.env.BASE_URL ?? '').replace(/\/$/, '');
		const url = `${base}/magiis-v0.2/vendor/mercadopago`;
		try {
			const res = await this.request.post(url, {
				headers: { Authorization: input.authToken, 'Content-Type': 'application/json' },
				data: { carrier: input.carrierUserId, code: input.code },
				failOnStatusCode: false
			});
			const raw = (await res.text()).trim();
			return { status: res.status(), ok: res.ok(), raw, body: safeJson(raw) };
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
