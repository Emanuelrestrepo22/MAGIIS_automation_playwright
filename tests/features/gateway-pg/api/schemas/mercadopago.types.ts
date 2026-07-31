/**
 * Facade de tipos — contrato MercadoPago (MAGIIS backend `/magiis-v0.2`).
 * ============================================================================
 *
 * Molde: `authorize.types.ts`. Este repo NO tiene pipeline OpenAPI, por lo que los
 * tipos del contrato son *hand-authored* y viven acá como facade tipado que los
 * componentes API MercadoPago (`CardApi`, `EpaymentApi`, `VendorApi`) y sus specs
 * formales importan.
 *
 * FUENTE DEL CONTRATO (reverse-engineering `repo.magiis/magiis-be` develop — confirmado
 * a nivel controller, NO a nivel ruta REST literal):
 *   - `POST vendor/mercadopago`  = `registerMercadopagoVendor(user, code, carrier)`
 *       → 409 MERCADOPAGO_IN_USE si el carrier ya tiene MP vinculado.
 *   - `CardController.getCardToken(...)` + `CardController.addCard(user, token,
 *       mercadopagoAppId, issuerId, cardDetail, carrierId, placeId)`.
 *   - `GET passengers/{id}/allCards`  → tarjetas del pax (MP vive en la cuenta MP,
 *       no en UserWallet local).
 *   - `ePayment → finalize`  → gates 412 CARRIER_NOT_LINKED / 2077 HOLD_NOT_SUPPORTED.
 *
 * ⚠️ ALCANCE (CODE-ONLY): MercadoPago NO transacciona en el entorno TEST → la ejecución
 * REAL de estos contratos se difiere a UAT. Acá exponemos SOLO los campos que los specs
 * formales referencian, grounded en las firmas del controller. NO se inventan campos que
 * el contrato real no exponga; el JSON real del backend tiene más campos.
 *
 * Las RUTAS REST literales (no las firmas) están marcadas `[confirmar en UAT]` en cada
 * componente y son overridables por env — igual que las queries Oracle de `oracle-wallet`.
 */

// ═══════════════════════════════════════════════════════════════════════
// VENDOR — POST vendor/mercadopago (registerMercadopagoVendor)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Payload de vinculación MercadoPago. El backend resuelve el carrier del `user`
 * autenticado + el admin `carrier`; `code` es el authorization code del OAuth MP Connect.
 */
export interface MercadopagoVendorRegisterRequest {
	/** userId del ADMIN del carrier (path/body según ruta — ver componente). */
	carrier: number | string;
	/** authorization code del OAuth MP Connect (test-mode). */
	code: string;
}

/**
 * Códigos de error de negocio del backend MAGIIS relevantes al ciclo MercadoPago.
 * Grounded en el reverse-engineering; se asertan como contrato en los specs.
 */
export type MercadopagoBusinessCode =
	| 'MERCADOPAGO_IN_USE' // 409 — el carrier ya tiene MP vinculado.
	| 'CARRIER_NOT_LINKED' // 412 — cobro/hold sobre carrier sin pasarela vinculada.
	| 'HOLD_NOT_SUPPORTED' // 2077 — MP no soporta hold (verificationFoundsCard).
	| 'VENDOR_INVALID_CODE'; // 400 — provider fuera del enum.

/** Respuesta de contrato HTTP genérica (no lanza ante excepción de red → status 0). */
export interface MercadopagoHttpResult<TBody = unknown> {
	/** HTTP status (0 si hubo excepción de red). */
	status: number;
	/** res.ok() (2xx). */
	ok: boolean;
	/** Body parseado (o `null` si no era JSON). */
	body: TBody | null;
	/** Body crudo (trim) — útil para asertar códigos de negocio en texto. */
	raw: string;
}

// ═══════════════════════════════════════════════════════════════════════
// CARD — getCardToken / addCard / allCards
// ═══════════════════════════════════════════════════════════════════════

/**
 * Detalle de tarjeta para tokenización MercadoPago. El TRIGGER del outcome en el
 * sandbox MP es el `cardholderName` (keyword de estado APRO/OTHE/SECU/FUND...),
 * NO el número — ver fixtures `mercado-pago/cards.ts`.
 */
export interface MercadopagoCardDetail {
	cardNumber: string;
	/** Mes de expiración (MM). */
	expirationMonth: string | number;
	/** Año de expiración (YY o YYYY según sandbox). */
	expirationYear: string | number;
	securityCode: string;
	/** El TRIGGER del outcome (keyword de estado usado como nombre del titular). */
	cardholderName: string;
	/** Documento del titular (DNI 12345678 para escenarios approved). */
	identificationType?: string;
	identificationNumber?: string;
}

/** Payload de tokenización — `CardController.getCardToken(...)`. */
export interface MercadopagoCardTokenRequest {
	card: MercadopagoCardDetail;
	/** MercadopagoApp.id del país del carrier. */
	mercadopagoAppId: number | string;
}

/** Respuesta de tokenización — el `id` es el card token de un solo uso de MP. */
export interface MercadopagoCardTokenResponse {
	id: string;
	/** Últimos 4 dígitos (eco de MP). */
	lastFourDigits?: string;
	/** vida del token en segundos (MP tokens expiran ~7 días / uso único). */
	expirationDate?: string;
	status?: string;
}

/**
 * Payload de alta de tarjeta — `CardController.addCard(user, token, mercadopagoAppId,
 * issuerId, cardDetail, carrierId, placeId)`. El `token` proviene de `getCardToken`.
 */
export interface MercadopagoAddCardRequest {
	/** userId del pasajero dueño de la tarjeta. */
	user: number | string;
	/** card token de un solo uso devuelto por getCardToken. */
	token: string;
	mercadopagoAppId: number | string;
	/** issuer de MP (banco emisor) resuelto en el paso de tokenización. */
	issuerId: number | string;
	cardDetail: MercadopagoCardDetail;
	/** carrier_account.id contexto del alta. */
	carrierId: number | string;
	/** place/city id del pax (contexto MP LATAM). */
	placeId?: number | string;
}

/**
 * Tarjeta del pax devuelta por `GET passengers/{id}/allCards`. Alineada con el shape
 * `PassengerCard` de `card-precondition.ts` (mismo backend), campos MP-relevantes.
 */
export interface MercadopagoPassengerCard {
	id: number;
	cardId: string;
	appCode: string;
	lastFourDigits: string;
	/** 'visa', 'master', 'amex'... */
	paymentMethodId: string;
	cardholder: string;
	expired: boolean;
	defaultCard: boolean;
	expirationYear: number;
	expirationMonth: number;
}

/** Respuesta de `GET passengers/{id}/allCards`. El backend puede devolver el array directo. */
export type MercadopagoAllCardsResponse = MercadopagoPassengerCard[];

// ═══════════════════════════════════════════════════════════════════════
// EPAYMENT — ePayment → finalize (hold / cobro)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Payload de inicio de ePayment (alta de viaje con PSP). Grounded en el flujo
 * `ePayment → finalize`; los gates de negocio (412/2077) se disparan acá.
 */
export interface MercadopagoEpaymentRequest {
	/** carrier_account.id del carrier que cobra. */
	carrierId: number | string;
	/** userId del pasajero que paga. */
	passengerId: number | string;
	/** cardId (persistido vía addCard) o token de un solo uso. */
	cardId?: string;
	token?: string;
	/** Monto a cobrar (decimal string). */
	amount: string;
	/** true si el flujo intenta un HOLD (preautorización) — MP responde 2077. */
	hold?: boolean;
	mercadopagoAppId?: number | string;
}

/** Payload de finalización del ePayment (captura / confirmación del cobro). */
export interface MercadopagoEpaymentFinalizeRequest {
	/** id del ePayment iniciado. */
	ePaymentId: number | string;
	/** estado del cobro devuelto por MP (approved/rejected/pending). */
	status?: string;
}

/**
 * Estado de un ePayment MercadoPago. Refleja el statusDetail del sandbox MP
 * (accredited, cc_rejected_*, pending_contingency...).
 */
export interface MercadopagoEpaymentStatus {
	id?: number | string;
	/** approved | rejected | pending. */
	status: string;
	/** cc_rejected_bad_filled_security_code, accredited, etc. */
	statusDetail?: string;
	/** código de negocio del backend (2077 HOLD_NOT_SUPPORTED / 412 CARRIER_NOT_LINKED). */
	code?: string | number;
	message?: string;
}
