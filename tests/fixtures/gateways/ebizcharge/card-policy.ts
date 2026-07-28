/**
 * eBizCharge Card Policy — Namespace Semántico de Tarjetas de Prueba
 * ==================================================================
 *
 * `EBIZ_CARDS` expone las tarjetas por INTENCIÓN del test, no por alias técnico.
 * Análogo a `stripe/card-policy.ts` (`CARDS`) y `authorize/card-policy.ts` (`AUTHORIZE_CARDS`).
 *
 * Particularidad de eBizCharge: el outcome lo determina el NÚMERO (como Stripe), por lo
 * que cada entry apunta a un objeto `EbizTestCard` con su número propio. No hay 3DS
 * (`ebizchargeGatewayAdapter.requires3ds = false`).
 *
 * Tabla-guía de decisión:
 *
 *   | Intención                       | Usar                              | Número           | Resultado            |
 *   |---------------------------------|-----------------------------------|------------------|----------------------|
 *   | Pago exitoso (default)          | EBIZ_CARDS.SUCCESS                | 4000100011112224 | approved             |
 *   | Decline genérico                | EBIZ_CARDS.DECLINE_GENERIC       | 4000300011112220 | Declined (sin código)|
 *   | Do not Honor (canónico decline) | EBIZ_CARDS.DECLINE_DO_NOT_HONOR  | 4000300211112228 | 05 Do not Honor      |
 *   | Fondos insuficientes            | EBIZ_CARDS.DECLINE_INSUFFICIENT  | 4000300611112224 | 51 Insufficient funds|
 *   | Fallo de CVV                    | EBIZ_CARDS.DECLINE_CVV           | 4000301311112225 | 97 CVV failure       |
 *   | Amex con CVV2 no match          | EBIZ_CARDS.DECLINE_AMEX_CVV2     | 371122223332241  | decline (CVV 4 díg.) |
 *   | CVV2 no match (aprueba)         | EBIZ_CARDS.CVV2_NO_MATCH         | 4000200111112221 | approved + CVV2 N    |
 *   | CVV2 no procesado (aprueba)     | EBIZ_CARDS.CVV2_NOT_PROCESSED    | 4000200211112220 | approved + CVV2 P    |
 *   | Referral (autorización por voz) | EBIZ_CARDS.REFERRAL              | 4000300111112229 | referral             |
 *   | Fraud Profiler review           | EBIZ_CARDS.FRAUD_REVIEW          | 4000301411112224 | review               |
 *   | Fraud Profiler reject           | EBIZ_CARDS.FRAUD_REJECT          | 4000301511112223 | reject               |
 *   | Retraso de procesamiento (5s..) | EBIZ_CARDS.DELAY_5S .. DELAY_60S | 4000000011112…   | approved-delayed     |
 *
 * Para agregar una card nueva: agregarla en `cards.ts`, exponerla acá con nombre
 * semántico y documentar el comportamiento.
 */

import { EBIZ_TEST_CARDS, type EbizTestCard } from './cards';

export const EBIZ_CARDS = {
	// ── Happy path ──────────────────────────────────────────────────────
	/** DEFAULT happy path — Visa approved (AVS YYY, CVV2 M) → Response approved. */
	SUCCESS: EBIZ_TEST_CARDS.visaApproved,

	// ── Declines ────────────────────────────────────────────────────────
	/** Decline genérico (sin código). */
	DECLINE_GENERIC: EBIZ_TEST_CARDS.declineGeneric,
	/** Decline canónico para MAGIIS — 05 Do not Honor. */
	DECLINE_DO_NOT_HONOR: EBIZ_TEST_CARDS.declineDoNotHonor,
	/** 51 Insufficient funds. */
	DECLINE_INSUFFICIENT: EBIZ_TEST_CARDS.declineInsufficientFunds,
	/** 12 Invalid Transaction. */
	DECLINE_INVALID_TRANSACTION: EBIZ_TEST_CARDS.declineInvalidTransaction,
	/** 62 Restricted Card. */
	DECLINE_RESTRICTED: EBIZ_TEST_CARDS.declineRestrictedCard,
	/** 97 Declined for CVV failure — usado por el intent canónico DECLINE_INVALID_CVC. */
	DECLINE_CVV: EBIZ_TEST_CARDS.declineCvvFailure,
	/**
	 * Amex cuyo CVV2 no coincide y el resultado es DECLINE (no una aprobación anotada).
	 * Vive entre los declines a propósito: la doc la lista en la tabla CVV2 pero su
	 * outcome de negocio es rechazo. Único caso de CVV de 4 dígitos en eBiz.
	 */
	DECLINE_AMEX_CVV2: EBIZ_TEST_CARDS.amexCvv2Decline,

	// ── CVV2 (aprueba, con anotación de verificación) ────────────────────
	/** CVV2 N (No Match) — la transacción se aprueba, la anotación no coincide. */
	CVV2_NO_MATCH: EBIZ_TEST_CARDS.cvv2NoMatch,
	/** CVV2 P (Not Processed). */
	CVV2_NOT_PROCESSED: EBIZ_TEST_CARDS.cvv2NotProcessed,
	/**
	 * @deprecated Usar `DECLINE_AMEX_CVV2` — el outcome es un decline, no una anotación
	 *   CVV2. Se mantiene el alias para no romper imports existentes.
	 */
	CVV2_AMEX_DECLINE: EBIZ_TEST_CARDS.amexCvv2Decline,

	// ── Referral ────────────────────────────────────────────────────────
	/** El emisor deriva a autorización por voz — ni aprobado ni rechazado. */
	REFERRAL: EBIZ_TEST_CARDS.referral,

	// ── Fraud Profiler ──────────────────────────────────────────────────
	/** Fraud Profiler → review (transacción marcada para revisión). */
	FRAUD_REVIEW: EBIZ_TEST_CARDS.fraudReview,
	/** Fraud Profiler → reject (transacción rechazada por antifraude). */
	FRAUD_REJECT: EBIZ_TEST_CARDS.fraudReject,

	// ── Processing delay ────────────────────────────────────────────────
	DELAY_5S: EBIZ_TEST_CARDS.delay5s,
	DELAY_15S: EBIZ_TEST_CARDS.delay15s,
	DELAY_30S: EBIZ_TEST_CARDS.delay30s,
	DELAY_45S: EBIZ_TEST_CARDS.delay45s,
	DELAY_60S: EBIZ_TEST_CARDS.delay60s
} as const satisfies Record<string, EbizTestCard>;

export type EbizCardPolicyKey = keyof typeof EBIZ_CARDS;
