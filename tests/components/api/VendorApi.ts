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
}
