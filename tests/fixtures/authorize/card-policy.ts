/**
 * Authorize.net Card Policy — Namespace Semántico de Tarjetas de Prueba
 * ======================================================================
 *
 * `AUTHORIZE_CARDS` expone las tarjetas por INTENCIÓN del test, no por alias técnico.
 *
 * Análogo a `tests/fixtures/stripe/card-policy.ts` (`CARDS`), pero con dos diferencias:
 *
 *   1. **Cada entry apunta al objeto AuthorizeTestCard completo**, no sólo al número.
 *      Razón: en Authorize.net el outcome se decide por la combinación
 *      (number, cvc, zip), no únicamente por el number como en Stripe.
 *
 *   2. **Sin escenarios 3DS** — Authorize.net no requiere 3DS en el flujo estándar
 *      MAGIIS (`authorizeGatewayAdapter.requires3ds = false`).
 *
 * Tabla-guía de decisión:
 *
 *   | Intención                                 | Usar                                | Trigger     |
 *   |-------------------------------------------|-------------------------------------|-------------|
 *   | Pago exitoso (Visa default)               | AUTHORIZE_CARDS.SUCCESS             | CVV=900     |
 *   | Pago exitoso (Mastercard)                 | AUTHORIZE_CARDS.SUCCESS_MASTERCARD  | CVV=900     |
 *   | Pago exitoso (Amex, CVV 4 dígitos)        | AUTHORIZE_CARDS.SUCCESS_AMEX        | CVV=9000    |
 *   | Decline genérico                          | AUTHORIZE_CARDS.DECLINE_GENERIC     | ZIP=46282   |
 *   | Fallo de CVV (mismatch)                   | AUTHORIZE_CARDS.DECLINE_CVV         | CVV=901     |
 *   | CVV no procesado                          | AUTHORIZE_CARDS.CVV_NOT_PROCESSED   | CVV=904     |
 *   | AVS no match                              | AUTHORIZE_CARDS.AVS_NO_MATCH        | ZIP=46205   |
 *   | AVS issuer no-USA                         | AUTHORIZE_CARDS.AVS_NON_US          | ZIP=46204   |
 *   | Partial authorization                     | AUTHORIZE_CARDS.PARTIAL_AUTH        | ZIP=46225   |
 *   | Prepaid balance cero                      | AUTHORIZE_CARDS.PREPAID_ZERO        | ZIP=46228   |
 *
 * Para agregar una card nueva:
 *   1. Agregarla en `cards.ts` (registry low-level con su trigger documentado).
 *   2. Exponerla acá con nombre semántico.
 *   3. Documentar el comportamiento en el JSDoc + actualizar la tabla.
 */

import { AUTHORIZE_TEST_CARDS, type AuthorizeTestCard } from './cards';

/**
 * Tarjetas canónicas Authorize.net para tests MAGIIS, expuestas por intención.
 *
 * Default para tests nuevos — NO usar los keys técnicos de AUTHORIZE_TEST_CARDS
 * directamente salvo razón documentada.
 */
export const AUTHORIZE_CARDS = {
	// ═══════════════════════════════════════════════════════════════════
	// HAPPY PATHS
	// ═══════════════════════════════════════════════════════════════════

	/**
	 * DEFAULT happy path — Visa con CVV 900 y zip neutro.
	 * Authorize: number `4111...1111`, CVV `900`, zip `90210`.
	 * Resultado: Response Code 1 (approved).
	 */
	SUCCESS: AUTHORIZE_TEST_CARDS.visaSuccess,

	/** Happy path con Mastercard. */
	SUCCESS_MASTERCARD: AUTHORIZE_TEST_CARDS.mastercardSuccess,

	/**
	 * Happy path con Amex.
	 * Importante: el CVV de Amex es de **4 dígitos** (vs 3 para las demás marcas).
	 */
	SUCCESS_AMEX: AUTHORIZE_TEST_CARDS.amexSuccess,

	/** Happy path con Discover. */
	SUCCESS_DISCOVER: AUTHORIZE_TEST_CARDS.discoverSuccess,

	// ═══════════════════════════════════════════════════════════════════
	// UNHAPPY PATHS — DECLINES
	// ═══════════════════════════════════════════════════════════════════

	/**
	 * Decline genérico — la tarjeta es rechazada.
	 * Authorize: zip `46282` → Response Code 2.
	 * Útil para tests UNHAPPY donde el alta de viaje debe fallar al cargar.
	 */
	DECLINE_GENERIC: AUTHORIZE_TEST_CARDS.declinedGeneric,

	// ═══════════════════════════════════════════════════════════════════
	// UNHAPPY PATHS — CVV
	// ═══════════════════════════════════════════════════════════════════

	/**
	 * CVV mismatch — el código no coincide con el del banco.
	 * Authorize: CVV `901` → "N: Does NOT Match".
	 * Útil para tests de validación de wallet con CVV incorrecto.
	 */
	DECLINE_CVV: AUTHORIZE_TEST_CARDS.cvvMismatch,

	/**
	 * CVV no procesado — el banco no validó el CVV.
	 * Authorize: CVV `904` → "P: Is NOT Processed".
	 * Útil para tests donde el CVV está presente pero el issuer no lo validó.
	 */
	CVV_NOT_PROCESSED: AUTHORIZE_TEST_CARDS.cvvNotProcessed,

	// ═══════════════════════════════════════════════════════════════════
	// UNHAPPY PATHS — AVS
	// ═══════════════════════════════════════════════════════════════════

	/**
	 * AVS no match — la dirección/zip no coincide con el banco.
	 * Authorize: zip `46205` → AVS "N: No Match".
	 */
	AVS_NO_MATCH: AUTHORIZE_TEST_CARDS.avsNoMatch,

	/**
	 * AVS issuer no-USA — el banco emisor está fuera de Estados Unidos.
	 * Authorize: zip `46204` → AVS "G: Non-U.S. Issuer".
	 */
	AVS_NON_US: AUTHORIZE_TEST_CARDS.avsNonUsIssuer,

	// ═══════════════════════════════════════════════════════════════════
	// EDGE CASES — PARTIAL / PREPAID AUTHORIZATIONS
	// ═══════════════════════════════════════════════════════════════════

	/**
	 * Partial authorization — sólo se aprueba parcialmente el monto solicitado.
	 * Authorize: zip `46225` → $1.23 autorizado del total.
	 */
	PARTIAL_AUTH: AUTHORIZE_TEST_CARDS.partialAuthorization,

	/**
	 * Prepaid con balance cero — la tarjeta prepaga no tiene fondos.
	 * Authorize: zip `46228` → Prepaid Auth, $0 balance.
	 */
	PREPAID_ZERO: AUTHORIZE_TEST_CARDS.prepaidZeroBalance,
} as const satisfies Record<string, AuthorizeTestCard>;

export type AuthorizeCardPolicyKey = keyof typeof AUTHORIZE_CARDS;
