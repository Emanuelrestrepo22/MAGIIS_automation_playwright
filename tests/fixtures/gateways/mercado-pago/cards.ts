/**
 * MercadoPago Test Cards — Source of Truth Canónica
 * ==================================================
 *
 * BL-026 (2026-07-20) — poblado del slot `fixtures/gateways/mercado-pago/` a partir
 * del análisis de la doc oficial (Argentina / LATAM):
 *   <https://www.mercadopago.com.ar/developers/es/docs/your-integrations/test/cards>
 *
 * Regla del sandbox MercadoPago:
 *   - **El NOMBRE del titular (`holderName`) determina el outcome** — NO el número, CVV ni monto.
 *     Se usa un keyword de estado como nombre: APRO (approved), OTHE (rechazo general),
 *     CONT (pending), SECU (CVV inválido), FUND (fondos insuficientes), etc.
 *   - Número, CVV y expiración son **fijos** (CVV 123 / Amex 1234, exp `11/30`).
 *   - Para approved se envía documento DNI `12345678`; la mayoría de los rechazos no requieren documento.
 *   - **No requiere 3DS** en el flujo MAGIIS (`mercadoPagoGatewayAdapter.requires3ds = false`).
 *
 * ⚠️ Importante para el normalizer cross-gateway: en MercadoPago `holderName` **NO es inerte** —
 * es el trigger. El spec que llena el form debe usar exactamente este `holderName`.
 *
 * Estructura:
 *   - `MP_TEST_CARDS`   — un entry por keyword de estado (usa la Visa crédito default).
 *   - `MP_CARD_CATALOG` — catálogo de las 5 tarjetas de prueba (crédito/débito por marca), referencia.
 */

export type MercadoPagoBrand = 'visa' | 'mastercard' | 'amex';
export type MercadoPagoCardKind = 'credit' | 'debit';
export type MercadoPagoStatus = 'approved' | 'pending' | 'rejected' | 'not-supported';

export type MercadoPagoTestCard = {
	number: string;
	brand: MercadoPagoBrand;
	kind: MercadoPagoCardKind;
	/** Expiración en formato MM/YY (fija: '11/30'). */
	exp: string;
	cvc: string;
	/** El TRIGGER: keyword de estado usado como nombre del titular (ej. 'APRO'). */
	holderName: string;
	identificationType?: string;
	identificationNumber?: string;
	status: MercadoPagoStatus;
	statusDetail: string;
	expectedOutcome: string;
	description: string;
};

/** Expiración fija del sandbox MercadoPago. */
export const MP_DEFAULT_EXPIRY = '11/30' as const;
export const MP_DEFAULT_CVV = '123' as const;
export const MP_DEFAULT_CVV_AMEX = '1234' as const;

/** Documento para escenarios approved. */
export const MP_APPROVED_DOC = { type: 'DNI', number: '12345678' } as const;

/**
 * Catálogo de tarjetas de prueba (referencia). El outcome NO depende de cuál se use —
 * lo define el `holderName`. Default para escenarios: `visaCredit`.
 */
export const MP_CARD_CATALOG = {
	visaCredit: { number: '4509953566233704', brand: 'visa', kind: 'credit', cvc: MP_DEFAULT_CVV },
	mastercardCredit: { number: '5031755734530604', brand: 'mastercard', kind: 'credit', cvc: MP_DEFAULT_CVV },
	amexCredit: { number: '371180303257522', brand: 'amex', kind: 'credit', cvc: MP_DEFAULT_CVV_AMEX },
	visaDebit: { number: '4002768694395619', brand: 'visa', kind: 'debit', cvc: MP_DEFAULT_CVV },
	mastercardDebit: { number: '5287338310253304', brand: 'mastercard', kind: 'debit', cvc: MP_DEFAULT_CVV }
} as const;

const DEFAULT = MP_CARD_CATALOG.visaCredit;

/** Helper para construir un entry keyword-driven sobre la tarjeta default. */
function mpCard(holderName: string, status: MercadoPagoStatus, statusDetail: string, description: string, withDoc = false): MercadoPagoTestCard {
	return {
		number: DEFAULT.number,
		brand: DEFAULT.brand,
		kind: DEFAULT.kind,
		exp: MP_DEFAULT_EXPIRY,
		cvc: DEFAULT.cvc,
		holderName,
		...(withDoc ? { identificationType: MP_APPROVED_DOC.type, identificationNumber: MP_APPROVED_DOC.number } : {}),
		status,
		statusDetail,
		expectedOutcome: status,
		description
	};
}

/**
 * Registry de tarjetas MercadoPago por keyword de estado (nombre del titular).
 */
export const MP_TEST_CARDS = {
	// ── Approved / pending ──────────────────────────────────────────────
	approved: mpCard('APRO', 'approved', 'accredited', 'APRO → pago aprobado (con DNI 12345678).', true),
	pending: mpCard('CONT', 'pending', 'pending_contingency', 'CONT → pago pendiente.'),

	// ── Rejected ────────────────────────────────────────────────────────
	rejectedOther: mpCard('OTHE', 'rejected', 'cc_rejected_other_reason', 'OTHE → rechazo por error general. Decline canónico MAGIIS.'),
	rejectedCallValidation: mpCard('CALL', 'rejected', 'cc_rejected_call_for_authorize', 'CALL → rechazo, requiere validación para autorizar.'),
	rejectedInsufficientFunds: mpCard('FUND', 'rejected', 'cc_rejected_insufficient_amount', 'FUND → rechazo por fondos insuficientes.'),
	rejectedInvalidCvv: mpCard('SECU', 'rejected', 'cc_rejected_bad_filled_security_code', 'SECU → rechazo por código de seguridad inválido.'),
	rejectedExpired: mpCard('EXPI', 'rejected', 'cc_rejected_bad_filled_date', 'EXPI → rechazo por problema de fecha de expiración.'),
	rejectedForm: mpCard('FORM', 'rejected', 'cc_rejected_bad_filled_other', 'FORM → rechazo por error de formulario.'),
	rejectedMissingCardNumber: mpCard('CARD', 'rejected', 'cc_rejected_bad_filled_card_number', 'CARD → rechazo por número de tarjeta faltante.'),
	rejectedInvalidInstallments: mpCard('INST', 'rejected', 'cc_rejected_invalid_installments', 'INST → rechazo por cuotas inválidas.'),
	rejectedDuplicate: mpCard('DUPL', 'rejected', 'cc_rejected_duplicated_payment', 'DUPL → rechazo por pago duplicado.'),
	rejectedCardDisabled: mpCard('LOCK', 'rejected', 'cc_rejected_card_disabled', 'LOCK → rechazo, tarjeta deshabilitada.'),
	rejectedCardTypeNotAllowed: mpCard('CTNA', 'rejected', 'cc_rejected_card_type_not_allowed', 'CTNA → rechazo, tipo de tarjeta no permitido.'),
	rejectedPinAttempts: mpCard('ATTE', 'rejected', 'cc_rejected_max_attempts', 'ATTE → rechazo, intentos de PIN excedidos.'),
	rejectedBlacklisted: mpCard('BLAC', 'rejected', 'cc_rejected_blacklist', 'BLAC → rechazo, en lista negra.'),

	// ── No soportado ────────────────────────────────────────────────────
	notSupported: mpCard('UNSU', 'not-supported', 'not_supported', 'UNSU → operación no soportada.')
} as const satisfies Record<string, MercadoPagoTestCard>;

export type MercadoPagoTestCardKey = keyof typeof MP_TEST_CARDS;

/** Últimos 4 dígitos — útil para asserts de UI. */
export function getMercadoPagoCardLast4(card: MercadoPagoTestCard): string {
	return card.number.slice(-4);
}
