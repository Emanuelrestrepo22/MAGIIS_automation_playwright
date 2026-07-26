/**
 * KATA Component (Layer 3) — MercadoPago card lifecycle API.
 *
 * Contraparte MP del alta/listado de tarjetas de Stripe. Expone tres mini-flujos ATC atómicos
 * sobre el backend MAGIIS `/magiis-v0.2`:
 *   - `getCardToken`  → tokeniza una tarjeta (`CardController.getCardToken`). El TRIGGER del
 *       outcome en el sandbox MP es el `cardholderName` (keyword APRO/OTHE/SECU/FUND...), NO el número.
 *   - `addCard`       → persiste la tarjeta tokenizada (`CardController.addCard(user, token,
 *       mercadopagoAppId, issuerId, cardDetail, carrierId, placeId)`).
 *   - `listAllCards`  → lista las tarjetas del pax (`GET passengers/{id}/allCards`).
 *
 * FUENTE (reverse-engineering `repo.magiis/magiis-be` develop — firmas de controller confirmadas;
 * la ruta REST literal de token/addCard es INFERIDA y overridable por env — ver constantes).
 *
 * ⚠️ CODE-ONLY / UAT: MercadoPago NO transacciona en el entorno TEST (la tokenización real exige el
 * SDK MP client-side + sandbox vivo). La ejecución REAL de estos ATCs se difiere a UAT; los specs
 * formales que los usan skipean LIMPIO en TEST (gate por creds + gate "MP no transacciona en test").
 *
 * Convención KATA aplicada:
 *   - Extiende ApiBase (usa `this.request` del fixture).
 *   - Import por alias (@api, @utils, @schemas); sin relativos.
 *   - Métodos públicos fail-fast en validación de input; devuelven el contrato HTTP (no lanzan
 *     ante excepción de red → status 0), igual que `VendorApi`.
 *   - Parámetros 3+ → objeto único.
 *
 * Cobertura: MG-148 (alta/validación tarjeta preautorizada) · MG-149/MG-150 (tokenización + alta) ·
 *   MG-172 (área H — listado/estado de tarjetas del pax) · MG-195 (MPX — las tarjetas del pax
 *   viven en la cuenta MP, visibles vía allCards).
 */

import type { TestContextOptions } from '@TestContext';
import type {
	MercadopagoAddCardRequest,
	MercadopagoAllCardsResponse,
	MercadopagoCardDetail,
	MercadopagoHttpResult
} from '@schemas/mercadopago.types';

import { ApiBase } from '@api/ApiBase';
import { atc } from '@utils/decorators';

/**
 * Rutas REST. `allCards` está confirmada por el nombre del endpoint (`GET passengers/{id}/allCards`).
 * `token` y `addCard` se INFIEREN del controller y son overridables por env para confirmarse en UAT.
 */
const MP_CARD_TOKEN_PATH = process.env.MP_CARD_TOKEN_PATH ?? '/magiis-v0.2/cards/token'; // [confirmar UAT]
const MP_ADD_CARD_PATH = process.env.MP_ADD_CARD_PATH ?? '/magiis-v0.2/cards'; // [confirmar UAT]

/** Input de tokenización — `getCardToken`. */
export interface GetCardTokenInput {
	card: MercadopagoCardDetail;
	mercadopagoAppId: number | string;
	/** Header Authorization completo (ya incluye "Bearer "). */
	authToken: string;
	/** Override de base URL; default apiBaseUrl. */
	baseUrl?: string;
}

/** Input de alta de tarjeta — `addCard`. */
export interface AddCardInput extends MercadopagoAddCardRequest {
	/** Header Authorization completo (ya incluye "Bearer "). */
	authToken: string;
	/** Override de base URL; default apiBaseUrl. */
	baseUrl?: string;
}

/** Input de listado — `listAllCards`. */
export interface ListAllCardsInput {
	/** userId del pasajero (path `{id}`). */
	passengerId: number | string;
	/** carrier_account.id contexto (query/param según ruta UAT). */
	carrierId: number | string;
	/** Header Authorization completo (ya incluye "Bearer "). */
	authToken: string;
	/** Override de base URL; default apiBaseUrl. */
	baseUrl?: string;
}

export class CardApi extends ApiBase {
	constructor(options: TestContextOptions) {
		super(options);
	}

	/** Resuelve la base URL sin barra final. */
	private resolveBase(baseUrl?: string): string {
		return (baseUrl ?? this.apiBaseUrl ?? process.env.BASE_URL ?? '').replace(/\/$/, '');
	}

	/**
	 * Mini-flujo ATC: tokeniza una tarjeta MP. El `cardholderName` del `card` es el TRIGGER del
	 * outcome (keyword de estado). Devuelve el contrato HTTP; `body.id` es el card token de un solo uso.
	 * Fail-fast si falta el número o el nombre (trigger) de la tarjeta.
	 *
	 * @atc MG-149 — área C (tokenización de tarjeta). Ejecución real = UAT.
	 */
	@atc('MG-149', { severity: 'critical', description: 'getCardToken — tokeniza tarjeta MercadoPago (holderName = trigger)' })
	async getCardToken(input: GetCardTokenInput): Promise<MercadopagoHttpResult> {
		if (!input.card?.cardNumber || !input.card?.cardholderName) {
			throw new Error('[CardApi.getCardToken] card.cardNumber y card.cardholderName (trigger) son obligatorios.');
		}
		const url = `${this.resolveBase(input.baseUrl)}${MP_CARD_TOKEN_PATH}`;
		try {
			const res = await this.request.post(url, {
				headers: { Authorization: input.authToken, 'Content-Type': 'application/json' },
				data: { card: input.card, mercadopagoAppId: input.mercadopagoAppId },
				failOnStatusCode: false
			});
			const raw = (await res.text()).trim();
			return { status: res.status(), ok: res.ok(), raw, body: safeJson(raw) };
		} catch (err) {
			return { status: 0, ok: false, raw: String(err), body: null };
		}
	}

	/**
	 * Mini-flujo ATC: persiste una tarjeta tokenizada en el pax. El `token` proviene de `getCardToken`.
	 * Devuelve el contrato HTTP. Fail-fast si falta el token o el user.
	 *
	 * @atc MG-150 — área C (alta de tarjeta). Ejecución real = UAT.
	 */
	@atc('MG-150', { severity: 'critical', description: 'addCard — persiste la tarjeta MP tokenizada en el pasajero' })
	async addCard(input: AddCardInput): Promise<MercadopagoHttpResult> {
		if (!input.token || input.user == null) {
			throw new Error('[CardApi.addCard] token (de getCardToken) y user son obligatorios.');
		}
		const url = `${this.resolveBase(input.baseUrl)}${MP_ADD_CARD_PATH}`;
		const { authToken, baseUrl: _baseUrl, ...payload } = input;
		try {
			const res = await this.request.post(url, {
				headers: { Authorization: authToken, 'Content-Type': 'application/json' },
				data: payload,
				failOnStatusCode: false
			});
			const raw = (await res.text()).trim();
			return { status: res.status(), ok: res.ok(), raw, body: safeJson(raw) };
		} catch (err) {
			return { status: 0, ok: false, raw: String(err), body: null };
		}
	}

	/**
	 * Mini-flujo ATC: lista las tarjetas del pax (`GET passengers/{id}/allCards`). En MP las tarjetas
	 * viven en la cuenta MP (no en UserWallet local) → este listado es el positivo de MG-195.
	 * Devuelve el contrato HTTP con `body` = array de tarjetas (o null si el body no era JSON).
	 *
	 * @atc MG-172 — área H (listado/estado de tarjetas del pax). Ejecución real = UAT.
	 */
	@atc('MG-172', { severity: 'normal', description: 'listAllCards — GET passengers/{id}/allCards (tarjetas del pax en MP)' })
	async listAllCards(input: ListAllCardsInput): Promise<MercadopagoHttpResult<MercadopagoAllCardsResponse>> {
		const url = `${this.resolveBase(input.baseUrl)}/magiis-v0.2/passengers/${input.passengerId}/allCards`;
		try {
			const res = await this.request.get(url, {
				headers: { Authorization: input.authToken },
				params: { carrierId: String(input.carrierId) },
				failOnStatusCode: false
			});
			const raw = (await res.text()).trim();
			return { status: res.status(), ok: res.ok(), raw, body: safeJson(raw) as MercadopagoAllCardsResponse | null };
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
