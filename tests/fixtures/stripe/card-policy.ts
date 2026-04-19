/**
 * Stripe Card Policy — Namespace Semántico de Tarjetas de Prueba
 * ================================================================
 *
 * `CARDS` expone las tarjetas por INTENCIÓN del test, no por alias técnico.
 *
 * Problema que resuelve:
 *   Antes de esta policy, cada spec elegía card por alias técnico:
 *     - `STRIPE_TEST_CARDS.visa_3ds_success`  (3155)
 *     - `STRIPE_TEST_CARDS.alwaysAuthenticate` (3184)
 *     - `STRIPE_TEST_CARDS.threeDSRequired`    (3220)
 *
 *   Sin criterio consistente → patrones mezclados, tests flaky (la card 3155
 *   tiene comportamiento variable en TEST: Stripe decide si desafía según
 *   risk score, generando falsos negativos intermitentes).
 *
 * Con esta policy, los tests dicen:
 *     `cardLast4: CARDS.HAPPY_3DS_HOLD_CAPTURE.slice(-4)`
 *   que expresa la INTENCIÓN: "card para happy path con 3DS + hold + capture".
 *
 * Ventajas:
 *   - Intent del test se lee directo en el código
 *   - Centralización: si mañana cambia la card standard, un solo lugar a tocar
 *   - Auto-documentación + previene uso casual de cards deprecadas
 *   - Alineación con patrón industry-standard (Stripe SDK tests, Shopify, Adyen)
 *
 * Tabla-guía de decisión:
 *
 *   | Intención                                | Usar                         | Card  |
 *   |------------------------------------------|------------------------------|-------|
 *   | Pago exitoso sin 3DS                     | CARDS.SUCCESS_NO_3DS         | 4242  |
 *   | Happy path 3DS genérico                  | CARDS.HAPPY_3DS              | 3184  |
 *   | Happy path 3DS + hold/capture separados  | CARDS.HAPPY_3DS_HOLD_CAPTURE | 3184  |
 *   | Happy path 3DS single-shot (simple)      | CARDS.HAPPY_3DS_SINGLE       | 3220  |
 *   | 3DS con fallo de autenticación           | CARDS.FAIL_3DS               | 9235  |
 *   | Decline en authorize (rechazo inmediato) | CARDS.DECLINE_AUTHORIZE      | 0002  |
 *   | Decline en capture (falla al cobrar)     | CARDS.DECLINE_CAPTURE        | 9995  |
 *
 * Para agregar una card nueva:
 *   1. Agregarla primero en `fixtures/stripe/cards.ts` (si no existe).
 *   2. Exponerla acá con nombre semántico descriptivo.
 *   3. Documentar el comportamiento y tests que la usan en el JSDoc.
 *   4. Actualizar la tabla del README.
 */

import { STRIPE_TEST_CARDS } from './cards';

/**
 * Tarjetas canónicas para tests MAGIIS, expuestas por intención.
 *
 * Default para tests nuevos — NO usar los alias técnicos directamente salvo
 * que haya una razón específica documentada en el JSDoc del test.
 */
export const CARDS = {
	// ═══════════════════════════════════════════════════════════════════
	// HAPPY PATHS
	// ═══════════════════════════════════════════════════════════════════

	/**
	 * Pago exitoso sin 3DS — flujos simples de autorización directa.
	 * Stripe: `4242 4242 4242 4242`, visa_success.
	 * Comportamiento: SetupIntent OK → PaymentIntent OK → Capture OK. Sin challenge.
	 */
	SUCCESS_NO_3DS: STRIPE_TEST_CARDS.successDirect,

	/**
	 * DEFAULT 3DS happy path — usar en la mayoría de tests que requieren 3DS.
	 * Stripe: `4000 0027 6000 3184`, always_authenticate.
	 * Comportamiento: 3DS SIEMPRE exigido en Setup y Payment intents.
	 * Elegida como default porque su comportamiento es determinístico (elimina
	 * la variabilidad de 3155 que a veces pide y a veces no).
	 */
	HAPPY_3DS: STRIPE_TEST_CARDS.alwaysAuthenticate,

	/**
	 * Alias explícito de `HAPPY_3DS` para tests donde hay hold + capture en
	 * momentos distintos (portal contractor, flows híbridos driver). Usar éste
	 * cuando el test involucre MÚLTIPLES PaymentIntents/SetupIntents del mismo
	 * PaymentMethod (vinculación → hold → capture).
	 * Stripe: `4000 0027 6000 3184`, always_authenticate.
	 */
	HAPPY_3DS_HOLD_CAPTURE: STRIPE_TEST_CARDS.alwaysAuthenticate,

	/**
	 * Alternativa 3DS para tests single-shot (1 solo intent).
	 * Stripe: `4000 0000 0000 3220`, three_ds_required.
	 * Comportamiento: 3DS obligatorio en primera operación, puede reutilizar auth.
	 * Usar SOLO en tests que validan específicamente este comportamiento de reúso.
	 */
	HAPPY_3DS_SINGLE: STRIPE_TEST_CARDS.threeDSRequired,

	// ═══════════════════════════════════════════════════════════════════
	// UNHAPPY PATHS
	// ═══════════════════════════════════════════════════════════════════

	/**
	 * Fallo en autenticación 3DS — usuario rechaza el challenge o falla.
	 * Stripe: `4000 0000 0000 9235`, visa_3ds_fail.
	 * Resultado: challenge 3DS aparece pero la autenticación falla → NO_AUTORIZADO.
	 */
	FAIL_3DS: STRIPE_TEST_CARDS.fail3DS,

	/**
	 * Decline en authorize — la tarjeta rechaza al intentar hold.
	 * Stripe: `4000 0000 0000 0002`, declined_generic (generic_decline).
	 * Útil para: tests UNHAPPY donde el viaje NO se crea (falla al vincular).
	 */
	DECLINE_AUTHORIZE: STRIPE_TEST_CARDS.declined,

	/**
	 * Decline en capture — authorize OK pero cobro final rechazado.
	 * Stripe: `4000 0000 0000 9995`, declined_funds (insufficient_funds).
	 * Útil para: tests que simulan flujo completo donde el driver finaliza el
	 * viaje y el cobro falla. NO usar para smoke — el fallo solo emerge en capture.
	 */
	DECLINE_CAPTURE: STRIPE_TEST_CARDS.insufficientFunds,

	/**
	 * 3DS obligatorio + decline post-autenticación — escenario edge.
	 * Stripe: `4000 0084 0000 1629`, declined_after_3ds.
	 * Comportamiento: usuario completa 3DS OK → pero el cargo queda card_declined.
	 * Útil para: tests que validan flujo "3DS pasó pero el pago no".
	 */
	DECLINED_AFTER_3DS: STRIPE_TEST_CARDS.declinedAfter3DS,

	// ═══════════════════════════════════════════════════════════════════
	// DEPRECATED — migración pendiente
	// ═══════════════════════════════════════════════════════════════════

	/**
	 * @deprecated Comportamiento variable en Stripe TEST (Stripe decide si
	 *   desafía según risk score) → genera flakiness intermitente.
	 *   Usar `HAPPY_3DS` (3184) o `HAPPY_3DS_SINGLE` (3220) según intención.
	 *   Esta entrada queda solo para specs legacy hasta completar migración.
	 * Stripe: `4000 0025 0000 3155`, visa_3ds_success.
	 */
	LEGACY_3DS_SUCCESS: STRIPE_TEST_CARDS.success3DS,
} as const;

export type CardPolicyKey = keyof typeof CARDS;
