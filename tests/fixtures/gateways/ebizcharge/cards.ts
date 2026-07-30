/**
 * eBizCharge Test Cards — Source of Truth Canónica
 * =================================================
 *
 * BL-027 (2026-07-20) — poblado del slot `fixtures/gateways/ebizcharge/` a partir
 * del análisis de la doc oficial:
 *   <https://developer.ebizcharge.net/connect/docs/test-credit-card-numbers>
 *
 * Regla del sandbox eBizCharge:
 *   - **El NÚMERO de tarjeta determina el outcome** (determinístico), igual que Stripe
 *     y a diferencia de Authorize.net (que usa CVV/ZIP). NO depende de monto, CVV ni ZIP.
 *   - Expiración fija `0930` (MMYY = 09/30) en casi todas; excepción documentada abajo.
 *   - **CVV: la doc lo declara POR TABLA, no por categoría.** No generalizar:
 *       · tabla Decline Responses → `999` en las 14 filas.
 *       · tabla AVS Responses → `123` en la primera fila, `321` en la segunda y `999` en
 *         las 15 restantes. NO es "cualquier CVV" — el valor está fijado por fila.
 *       · tabla CVV2 Responses → literal `any` en las 21 filas (ahí sí vale cualquiera).
 *       · Fraud Profiler / Slow Processing → la doc no fija CVV.
 *       · tabla Referral Response → `999`.
 *     Por eso `EBIZ_AVS_REFERENCE` lleva su `cvc` explícito por fila.
 *   - **No requiere 3DS** en el flujo MAGIIS (`ebizchargeGatewayAdapter.requires3ds = false`).
 *     La categoría CAVV es un *indicador de respuesta*, no un challenge.
 *
 * Estructura de referencia completa:
 *   - `EBIZ_TEST_CARDS`  — objetos completos para las tarjetas con outcome de negocio
 *     (approved default, las 14 declines, el decline de CVV2 de Amex, referral,
 *     CVV2 clave, fraud profiler, processing delay).
 *   - Arrays `EBIZ_*_REFERENCE` — capturan TODOS los números/códigos documentados de las
 *     categorías puramente de anotación (AVS, CVV2 completo, CAVV, Card Level), sin
 *     promoverlos a objetos de card (no son outcomes de negocio distintos para MAGIIS).
 *
 * Cobertura de la doc: **92 números en 8 tablas** (17 AVS + 21 CVV2 + 14 declines +
 * 2 fraud profiler + 1 referral + 5 slow processing + 12 CAVV + 20 card level, sin
 * solapes). `ebiz-cards-fidelity.unit.spec.ts` transcribe las 8 tablas y falla si este
 * archivo divierge de ellas.
 *
 * Regla arquitectónica (igual que Stripe/Authorize):
 *   - Importar tarjetas desde `tests/fixtures/gateways/ebizcharge/cards` — no duplicar inline.
 *   - Para elegir por intención usar el namespace `EBIZ_CARDS` en `card-policy.ts`.
 */

export type EbizCardBrand = 'visa' | 'mastercard' | 'amex' | 'discover';

export type EbizOutcomeCategory = 'approved' | 'declined' | 'cvv2' | 'fraud-profiler' | 'processing-delay' | 'referral';

export type EbizTestCard = {
	number: string;
	brand: EbizCardBrand;
	/** Expiración en formato MMYY (ej. '0930' = 09/30). */
	exp: string;
	cvc: string;
	holderName: string;
	category: EbizOutcomeCategory;
	expectedOutcome: string;
	/** Declines: código eBizCharge (ej. '05', '51', '97'; '' = decline genérico sin código). */
	declineCode?: string;
	declineMessage?: string;
	/** Código AVS devuelto por la tarjeta approved (ej. 'YYY', 'NNN'). */
	avsResponse?: string;
	/**
	 * Dirección de facturación — AUTOCOMPLETE exclusivo de eBizCharge (verificado en vivo
	 * 2026-07-30). Se escribe, aparecen sugerencias como en pick-up/drop-off, y al elegir la
	 * que matchea el sistema DERIVA el código postal. Obligatorio en el alta de tarjeta.
	 */
	billingAddress?: string;
	/** Sugerencia del geocoder a elegir — evita depender del orden de la lista. */
	addressOption?: string;
	/** ZIP que el sistema debe autocompletar. Valor DERIVADO: se asserta, nunca se tipea. */
	expectedZip?: string;
	/** Resultado CVV2 (M/N/P/S/U/X/n-a). */
	cvv2Result?: string;
	profilerResponse?: 'review' | 'reject';
	processingTimeSec?: number;
	description: string;
};

/** Expiración por defecto del sandbox eBizCharge (todas las tarjetas de prueba). */
export const EBIZ_DEFAULT_EXPIRY = '0930' as const;

/** CVV para escenarios de decline (el sandbox espera 999). */
export const EBIZ_DECLINE_CVV = '999' as const;

/** CVV "any" — el sandbox acepta cualquiera fuera de declines. Valor concreto para el form. */
export const EBIZ_ANY_CVV = '123' as const;
export const EBIZ_ANY_CVV_AMEX = '1234' as const;

export const EBIZ_DEFAULT_HOLDER = 'MAGIIS QA Test';

/**
 * Registry de tarjetas eBizCharge con outcome de negocio.
 * El número determina el resultado; holderName/CVV "any" son inertes al outcome.
 */
export const EBIZ_TEST_CARDS = {
	// ═══════════════════════════════════════════════════════════════════
	// APPROVED (default happy path)
	// ═══════════════════════════════════════════════════════════════════

	visaApproved: {
		number: '4000100011112224',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_ANY_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'approved',
		expectedOutcome: 'approved',
		avsResponse: 'YYY',
		cvv2Result: 'M',
		// Dirección usada en el exploratorio en vivo (2026-07-30). El ZIP NO se declara: el
		// sistema lo deriva al elegir la sugerencia, y el oráculo asserta que llegó.
		billingAddress: '1234 Main street',
		addressOption: 'Main Street, Los Angeles, CA, USA',
		description: 'Visa → approved (AVS YYY, CVV2 M). Default happy path.'
	},

	/**
	 * Approved con AVS `NNN` (dirección Y ZIP no coinciden) — fila 6 de la tabla AVS.
	 * Promovida a card de negocio porque el riesgo NO es un rechazo sino lo contrario:
	 * la transacción se aprueba con la verificación de dirección fallida, y hay que
	 * comprobar que el sistema no la trate como una verificación limpia.
	 */
	visaApprovedAvsMismatch: {
		number: '4000100511112229',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: '999', // la doc fija 999 para esta fila de la tabla AVS
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'approved',
		expectedOutcome: 'approved-avs-mismatch',
		avsResponse: 'NNN',
		cvv2Result: 'M',
		description: 'Visa → approved con AVS NNN (dirección y ZIP no coinciden).'
	},

	// ═══════════════════════════════════════════════════════════════════
	// APPROVED POR MARCA (fila `M` de la tabla CVV2 de cada marca)
	// ═══════════════════════════════════════════════════════════════════

	mastercardApproved: {
		number: '5555444433332226',
		brand: 'mastercard',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_ANY_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'approved',
		expectedOutcome: 'approved',
		avsResponse: 'YYY',
		cvv2Result: 'M',
		description: 'Mastercard → approved (AVS YYY, CVV2 M).'
	},
	amexApproved: {
		number: '371122223332225',
		brand: 'amex',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_ANY_CVV_AMEX, // Amex: CVV de 4 dígitos
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'approved',
		expectedOutcome: 'approved',
		avsResponse: 'YYY',
		cvv2Result: 'M',
		description: 'Amex → approved (AVS YYY, CVV2 M). Único caso con CVV de 4 dígitos en el happy path.'
	},
	discoverApproved: {
		number: '6011222233332224',
		brand: 'discover',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_ANY_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'approved',
		expectedOutcome: 'approved',
		avsResponse: 'YYY',
		cvv2Result: 'M',
		description: 'Discover → approved (AVS YYY, CVV2 M).'
	},

	// ═══════════════════════════════════════════════════════════════════
	// DECLINES (serie 4000300…, CVV 999) — code + message del sandbox
	// ═══════════════════════════════════════════════════════════════════

	declineGeneric: {
		number: '4000300011112220',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_DECLINE_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'declined',
		expectedOutcome: 'declined',
		declineCode: '',
		declineMessage: 'Declined',
		description: 'Decline genérico (sin código).'
	},
	declinePickupCard: {
		number: '4000300001112222',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_DECLINE_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'declined',
		expectedOutcome: 'declined',
		declineCode: '04',
		declineMessage: 'Pickup Card',
		description: 'Decline 04 — Pickup Card.'
	},
	declineDoNotHonor: {
		number: '4000300211112228',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_DECLINE_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'declined',
		expectedOutcome: 'declined',
		declineCode: '05',
		declineMessage: 'Do not Honor',
		description: 'Decline 05 — Do not Honor. Decline genérico canónico para MAGIIS.'
	},
	declineInvalidTransaction: {
		number: '4000300311112227',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_DECLINE_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'declined',
		expectedOutcome: 'declined',
		declineCode: '12',
		declineMessage: 'Invalid Transaction',
		description: 'Decline 12 — Invalid Transaction.'
	},
	declineInvalidIssuer: {
		number: '4000300411112226',
		brand: 'visa',
		exp: '0922', // ← excepción documentada: esta tarjeta usa 09/22
		cvc: EBIZ_DECLINE_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'declined',
		expectedOutcome: 'declined',
		declineCode: '15',
		declineMessage: 'Invalid Issuer',
		description: 'Decline 15 — Invalid Issuer. OJO: exp 0922 (no 0930).'
	},
	declineUnableToLocate: {
		number: '4000300511112225',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_DECLINE_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'declined',
		expectedOutcome: 'declined',
		declineCode: '25',
		declineMessage: 'Unable to locate Record',
		description: 'Decline 25 — Unable to locate Record.'
	},
	declineInsufficientFunds: {
		number: '4000300611112224',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_DECLINE_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'declined',
		expectedOutcome: 'declined',
		declineCode: '51',
		declineMessage: 'Insufficient funds',
		description: 'Decline 51 — Insufficient funds.'
	},
	declineInvalidPin: {
		number: '4000300711112223',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_DECLINE_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'declined',
		expectedOutcome: 'declined',
		declineCode: '55',
		declineMessage: 'Invalid Pin',
		description: 'Decline 55 — Invalid Pin.'
	},
	declineNotPermitted: {
		number: '4000300811112222',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_DECLINE_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'declined',
		expectedOutcome: 'declined',
		declineCode: '57',
		declineMessage: 'Transaction Not Permitted',
		description: 'Decline 57 — Transaction Not Permitted.'
	},
	declineRestrictedCard: {
		number: '4000300911112221',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_DECLINE_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'declined',
		expectedOutcome: 'declined',
		declineCode: '62',
		declineMessage: 'Restricted Card',
		description: 'Decline 62 — Restricted Card.'
	},
	declineExcessWithdrawal: {
		number: '4000301011112228',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_DECLINE_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'declined',
		expectedOutcome: 'declined',
		declineCode: '65',
		declineMessage: 'Excess withdrawal count',
		description: 'Decline 65 — Excess withdrawal count.'
	},
	declinePinTriesExceeded: {
		number: '4000301111112227',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_DECLINE_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'declined',
		expectedOutcome: 'declined',
		declineCode: '75',
		declineMessage: 'Allowable number of pin tries exceeded',
		description: 'Decline 75 — Pin tries exceeded.'
	},
	declineNoCheckingAccount: {
		number: '4000301211112226',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_DECLINE_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'declined',
		expectedOutcome: 'declined',
		declineCode: '78',
		declineMessage: 'No checking account',
		description: 'Decline 78 — No checking account.'
	},
	declineCvvFailure: {
		number: '4000301311112225',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_DECLINE_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'declined',
		expectedOutcome: 'declined',
		declineCode: '97',
		declineMessage: 'Declined for CVV failure',
		description: 'Decline 97 — Declined for CVV failure. Canónico para DECLINE_INVALID_CVC.'
	},

	// ═══════════════════════════════════════════════════════════════════
	// CVV2 (resultado del código de seguridad; el resto de la tabla en EBIZ_CVV2_REFERENCE)
	// ═══════════════════════════════════════════════════════════════════

	cvv2NoMatch: {
		number: '4000200111112221',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_ANY_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'cvv2',
		expectedOutcome: 'cvv2-no-match',
		cvv2Result: 'N',
		description: 'CVV2 N (No Match). AVS YYY.'
	},
	cvv2NotProcessed: {
		number: '4000200211112220',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_ANY_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'cvv2',
		expectedOutcome: 'cvv2-not-processed',
		cvv2Result: 'P',
		description: 'CVV2 P (Not Processed). AVS YYY.'
	},
	/**
	 * La doc la lista en la tabla CVV2 Responses, pero su CVV2 Response es
	 * `CVV2 No Match (Decline)` y su AVS Response viene VACÍO: el outcome de negocio es
	 * un RECHAZO, no una aprobación con anotación. Por eso `category: 'declined'` — el
	 * front debe mostrar tarjeta rechazada. Clasificarla como `'cvv2'` hacía que se
	 * pudiera tomar por happy path.
	 */
	amexCvv2Decline: {
		number: '371122223332241',
		brand: 'amex',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_ANY_CVV_AMEX,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'declined',
		expectedOutcome: 'declined',
		cvv2Result: 'no-match-decline',
		description: 'Amex → CVV2 No Match que resulta en Decline (tabla CVV2 de la doc, outcome = decline).'
	},

	// ═══════════════════════════════════════════════════════════════════
	// FRAUD PROFILER
	// ═══════════════════════════════════════════════════════════════════

	fraudReview: {
		number: '4000301411112224',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_ANY_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'fraud-profiler',
		expectedOutcome: 'fraud-review',
		profilerResponse: 'review',
		description: 'Fraud Profiler → review.'
	},
	fraudReject: {
		number: '4000301511112223',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_ANY_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'fraud-profiler',
		expectedOutcome: 'fraud-reject',
		profilerResponse: 'reject',
		description: 'Fraud Profiler → reject.'
	},

	// ═══════════════════════════════════════════════════════════════════
	// REFERRAL (tabla propia en la doc — 1 sola tarjeta)
	// ═══════════════════════════════════════════════════════════════════

	/**
	 * Tabla `Referral Response` de la doc. Es una CUARTA clase de outcome, distinta de
	 * approved / declined / fraud: el emisor no aprueba ni rechaza, deriva la operación a
	 * autorización por voz. Para MAGIIS el viaje NO puede quedar autorizado.
	 * La doc no publica AVS/CVV2/CAVV/Card Level para esta fila.
	 */
	referral: {
		number: '4000300111112229',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_DECLINE_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'referral',
		expectedOutcome: 'referral',
		description: 'Referral — el emisor deriva a autorización por voz (no aprueba ni rechaza).'
	},

	// ═══════════════════════════════════════════════════════════════════
	// PROCESSING DELAY (serie 4000000011112…)
	// ═══════════════════════════════════════════════════════════════════

	delay5s: {
		number: '4000000011112226',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_ANY_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'processing-delay',
		expectedOutcome: 'approved-delayed',
		processingTimeSec: 5,
		description: 'Approved con retraso de procesamiento de 5s.'
	},
	delay15s: {
		number: '4000000011112234',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_ANY_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'processing-delay',
		expectedOutcome: 'approved-delayed',
		processingTimeSec: 15,
		description: 'Approved con retraso de 15s.'
	},
	delay30s: {
		number: '4000000011112242',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_ANY_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'processing-delay',
		expectedOutcome: 'approved-delayed',
		processingTimeSec: 30,
		description: 'Approved con retraso de 30s.'
	},
	delay45s: {
		number: '4000000011112259',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_ANY_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'processing-delay',
		expectedOutcome: 'approved-delayed',
		processingTimeSec: 45,
		description: 'Approved con retraso de 45s.'
	},
	delay60s: {
		number: '4000000011112267',
		brand: 'visa',
		exp: EBIZ_DEFAULT_EXPIRY,
		cvc: EBIZ_ANY_CVV,
		holderName: EBIZ_DEFAULT_HOLDER,
		category: 'processing-delay',
		expectedOutcome: 'approved-delayed',
		processingTimeSec: 60,
		description: 'Approved con retraso de 60s (útil para timeouts).'
	}
} as const satisfies Record<string, EbizTestCard>;

export type EbizTestCardKey = keyof typeof EBIZ_TEST_CARDS;

// ═══════════════════════════════════════════════════════════════════════
// TABLAS DE REFERENCIA (completas) — categorías de anotación, no outcomes de negocio.
// Capturan todos los números/códigos documentados sin inflar el registry.
// ═══════════════════════════════════════════════════════════════════════

/**
 * AVS — serie approved `4000100…`. Las 17 devuelven approved con CVV2 `M` y CAVV `A`
 * (y Card Level `A`), o sea el AVS es la ÚNICA variable de la tabla.
 *
 * `cvc` va explícito POR FILA porque la doc lo fija: `123` en la primera, `321` en la
 * segunda y `999` en las 15 restantes. Consumir estas filas con `EBIZ_ANY_CVV` metería
 * un dato que la doc no respalda (ver la regla de CVV por tabla en el header).
 */
export const EBIZ_AVS_REFERENCE: ReadonlyArray<{ number: string; avs: string; cvc: string }> = [
	{ number: '4000100011112224', avs: 'YYY', cvc: '123' },
	{ number: '4000100111112223', avs: 'YYX', cvc: '321' },
	{ number: '4000100211112222', avs: 'NYZ', cvc: '999' },
	{ number: '4000100311112221', avs: 'NYW', cvc: '999' },
	{ number: '4000100411112220', avs: 'YNA', cvc: '999' },
	{ number: '4000100511112229', avs: 'NNN', cvc: '999' },
	{ number: '4000100611112228', avs: 'XXW', cvc: '999' },
	{ number: '4000100711112227', avs: 'XXU', cvc: '999' },
	{ number: '4000100811112226', avs: 'XXR', cvc: '999' },
	{ number: '4000100911112225', avs: 'XXS', cvc: '999' },
	{ number: '4000101011112222', avs: 'XXE', cvc: '999' },
	{ number: '4000101111112221', avs: 'XXG', cvc: '999' },
	{ number: '4000101211112220', avs: 'YYG', cvc: '999' },
	{ number: '4000101311112229', avs: 'GGG', cvc: '999' },
	{ number: '4000101411112228', avs: 'YGG', cvc: '999' },
	{ number: '4000101511112227', avs: 'NN', cvc: '999' },
	{ number: '4000101611112226', avs: 'N/A', cvc: '999' }
] as const;

/** CVV2 completo — por marca. `cvv2` = resultado esperado. */
export const EBIZ_CVV2_REFERENCE: ReadonlyArray<{
	number: string;
	brand: EbizCardBrand;
	cvv2: string;
}> = [
	{ number: '4000200011112222', brand: 'visa', cvv2: 'M' },
	{ number: '4000200111112221', brand: 'visa', cvv2: 'N' },
	{ number: '4000200211112220', brand: 'visa', cvv2: 'P' },
	{ number: '4000200311112229', brand: 'visa', cvv2: 'S' },
	{ number: '4000200411112228', brand: 'visa', cvv2: 'U' },
	{ number: '4000200511112227', brand: 'visa', cvv2: 'X' },
	{ number: '5555444433332226', brand: 'mastercard', cvv2: 'M' },
	{ number: '5555444433332234', brand: 'mastercard', cvv2: 'N' },
	{ number: '5555444433332242', brand: 'mastercard', cvv2: 'P' },
	{ number: '5555444433332259', brand: 'mastercard', cvv2: 'S' },
	{ number: '5555444433332267', brand: 'mastercard', cvv2: 'U' },
	{ number: '5555444433332275', brand: 'mastercard', cvv2: 'X' },
	{ number: '371122223332225', brand: 'amex', cvv2: 'M' },
	{ number: '371122223332233', brand: 'amex', cvv2: 'n/a' },
	{ number: '371122223332241', brand: 'amex', cvv2: 'no-match-decline' },
	{ number: '6011222233332224', brand: 'discover', cvv2: 'M' },
	{ number: '6011222233332232', brand: 'discover', cvv2: 'N' },
	{ number: '6011222233332240', brand: 'discover', cvv2: 'P' },
	{ number: '6011222233332257', brand: 'discover', cvv2: 'S' },
	{ number: '6011222233332265', brand: 'discover', cvv2: 'U' },
	{ number: '6011222233332273', brand: 'discover', cvv2: 'X' }
] as const;

/** CAVV / indicador 3DS — serie `4000600…` (approved, AVS YYY, CVV2 M). Referencia; MAGIIS trata eBiz como no-3DS. */
export const EBIZ_CAVV_REFERENCE: ReadonlyArray<{ number: string; cavv: string }> = [
	{ number: '4000600011112223', cavv: '1' },
	{ number: '4000600111112222', cavv: '2' },
	{ number: '4000600211112221', cavv: '3' },
	{ number: '4000600311112220', cavv: '4' },
	{ number: '4000600411112229', cavv: '6' },
	{ number: '4000600511112228', cavv: '7' },
	{ number: '4000600611112227', cavv: '8' },
	{ number: '4000600711112226', cavv: '9' },
	{ number: '4000600811112225', cavv: 'A' },
	{ number: '4000600911112224', cavv: 'B' },
	{ number: '4000601011112221', cavv: 'C' },
	{ number: '4000601111112220', cavv: 'D' }
] as const;

/** Card Level — serie `4000700…` (approved, AVS YYY, CVV2 M). Referencia. */
export const EBIZ_CARD_LEVEL_REFERENCE: ReadonlyArray<{ number: string; level: string }> = [
	{ number: '4000700011112221', level: 'A' },
	{ number: '4000700111112220', level: 'B' },
	{ number: '4000700211112229', level: 'C' },
	{ number: '4000700311112228', level: 'D' },
	{ number: '4000700411112227', level: 'G' },
	{ number: '4000700511112226', level: 'H' },
	{ number: '4000700611112225', level: 'I' },
	{ number: '4000700711112224', level: 'K' },
	{ number: '4000700811112223', level: 'S' },
	{ number: '4000700911112222', level: 'U' },
	{ number: '4000701011112229', level: 'G1' },
	{ number: '4000701111112228', level: 'G2' },
	{ number: '4000701211112227', level: 'J1' },
	{ number: '4000701311112226', level: 'J2' },
	{ number: '4000701411112225', level: 'J3' },
	{ number: '4000701511112224', level: 'J4' },
	{ number: '4000701611112223', level: 'K1' },
	{ number: '4000701711112222', level: 'S1' },
	{ number: '4000701811112221', level: 'S2' },
	{ number: '4000701911112220', level: 'S3' }
] as const;

/** Últimos 4 dígitos del número — útil para asserts de UI. */
export function getEbizCardLast4(card: EbizTestCard): string {
	return card.number.slice(-4);
}
