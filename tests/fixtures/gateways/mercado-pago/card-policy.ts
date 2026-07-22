/**
 * MercadoPago Card Policy — Namespace Semántico de Tarjetas de Prueba
 * ===================================================================
 *
 * `MP_CARDS` expone las tarjetas por INTENCIÓN del test. Igual que Authorize, cada entry
 * apunta al objeto completo (porque el trigger es el `holderName`, no el número).
 * No hay 3DS (`mercadoPagoGatewayAdapter.requires3ds = false`).
 *
 * Tabla-guía de decisión (el nombre del titular es el trigger):
 *
 *   | Intención                     | Usar                                  | holderName |
 *   |-------------------------------|---------------------------------------|------------|
 *   | Pago aprobado (default)       | MP_CARDS.APPROVED                     | APRO       |
 *   | Rechazo genérico (canónico)   | MP_CARDS.REJECTED_OTHER               | OTHE       |
 *   | Pendiente                     | MP_CARDS.PENDING                      | CONT       |
 *   | CVV inválido                  | MP_CARDS.REJECTED_INVALID_CVV         | SECU       |
 *   | Fondos insuficientes          | MP_CARDS.REJECTED_INSUFFICIENT_FUNDS  | FUND       |
 *   | Requiere validación           | MP_CARDS.REJECTED_CALL                | CALL       |
 *   | Fecha de expiración           | MP_CARDS.REJECTED_EXPIRED             | EXPI       |
 *   | Error de formulario           | MP_CARDS.REJECTED_FORM                | FORM       |
 */

import { MP_TEST_CARDS, type MercadoPagoTestCard } from './cards';

export const MP_CARDS = {
	// ── Approved / pending ──────────────────────────────────────────────
	/** APRO → pago aprobado (default happy path). */
	APPROVED: MP_TEST_CARDS.approved,
	/** CONT → pago pendiente. */
	PENDING: MP_TEST_CARDS.pending,

	// ── Rejected ────────────────────────────────────────────────────────
	/** OTHE → rechazo por error general. Decline canónico para MAGIIS. */
	REJECTED_OTHER: MP_TEST_CARDS.rejectedOther,
	/** CALL → rechazo, requiere validación para autorizar. */
	REJECTED_CALL: MP_TEST_CARDS.rejectedCallValidation,
	/** FUND → rechazo por fondos insuficientes. */
	REJECTED_INSUFFICIENT_FUNDS: MP_TEST_CARDS.rejectedInsufficientFunds,
	/** SECU → rechazo por código de seguridad inválido. */
	REJECTED_INVALID_CVV: MP_TEST_CARDS.rejectedInvalidCvv,
	/** EXPI → rechazo por problema de fecha de expiración. */
	REJECTED_EXPIRED: MP_TEST_CARDS.rejectedExpired,
	/** FORM → rechazo por error de formulario. */
	REJECTED_FORM: MP_TEST_CARDS.rejectedForm,
	/** DUPL → rechazo por pago duplicado. */
	REJECTED_DUPLICATE: MP_TEST_CARDS.rejectedDuplicate,
	/** LOCK → rechazo, tarjeta deshabilitada. */
	REJECTED_CARD_DISABLED: MP_TEST_CARDS.rejectedCardDisabled,
	/** BLAC → rechazo, en lista negra. */
	REJECTED_BLACKLIST: MP_TEST_CARDS.rejectedBlacklisted,

	// ── No soportado ────────────────────────────────────────────────────
	/** UNSU → operación no soportada. */
	NOT_SUPPORTED: MP_TEST_CARDS.notSupported
} as const satisfies Record<string, MercadoPagoTestCard>;

export type MercadoPagoCardPolicyKey = keyof typeof MP_CARDS;
