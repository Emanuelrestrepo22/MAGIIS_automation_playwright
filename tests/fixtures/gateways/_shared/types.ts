/**
 * Multi-gateway shared types — BL-024 Fase 3 (2026-05-13)
 * ========================================================
 *
 * Tipos transversales a todos los gateways de pago soportados por MAGIIS.
 *
 * Principio rector:
 *   "Comportamiento esperado constante, datos variables por gateway."
 *
 * Cada gateway define sus propios tipos específicos (`StripeTestCard`,
 * `AuthorizeTestCard`) con campos que sólo aplican a ese sandbox. Pero
 * cuando el código de orquestación necesita razonar sobre cualquier
 * tarjeta de manera genérica, usa `GenericTestCard` definido acá.
 */

/**
 * Gateways de pago soportados por MAGIIS.
 *
 * **Importante:** estos valores deben coincidir EXACTAMENTE con `PaymentGateway`
 * de `tests/features/gateway-pg/contracts/gateway-pg.types.ts`. Cualquier
 * divergencia rompe el mapeo con `helpers/adapters/index.ts`.
 *
 * Estado:
 *   - stripe       — producción activa, cobertura completa
 *   - authorize    — sandbox listo, runtime pendiente
 *   - mercado-pago — investigación pendiente (BL-026)
 *   - ebizcharge   — investigación pendiente (BL-027)
 */
export type GatewayName = 'stripe' | 'authorize' | 'mercado-pago' | 'ebizcharge';

/**
 * Intents canónicos cross-gateway — EJE DE NEGOCIO.
 *
 * Un intent describe **el outcome que el sistema MAGIIS debe producir**, no el código
 * que devuelve la pasarela. Cada pasarela mapea el intent a una de sus tarjetas
 * concretas en `CARD_MATRIX` (`./card-matrix.ts`), lo que permite specs polimórficos:
 *
 *   const card = resolveCard({ gateway, intent: 'DECLINE_INSUFFICIENT_FUNDS' });
 *
 * Mapping conceptual:
 *   | Intent               | Stripe                     | Authorize             |
 *   |----------------------|----------------------------|-----------------------|
 *   | HAPPY_NO_AUTH        | SUCCESS_NO_3DS (4242)      | SUCCESS (4111+900)    |
 *   | HAPPY_AUTH           | HAPPY_3DS (3184)           | N/A (no 3DS)          |
 *   | FAIL_AUTH            | FAIL_3DS (9235)            | N/A (no 3DS)          |
 *   | DECLINE_AUTHORIZE    | DECLINE_AUTHORIZE (0002)   | DECLINE_GENERIC       |
 *   | DECLINE_CAPTURE      | DECLINE_CAPTURE (9995)     | N/A                   |
 *   | DECLINE_INVALID_CVC  | DECLINE_INVALID_CVC (0127) | DECLINE_CVV (901)     |
 *   | DECLINE_ZIP_MISMATCH | N/A todavía (ver abajo)    | AVS_NO_MATCH (46205)  |
 *
 * El criterio para que algo sea intent y no dato de referencia:
 *   **¿el front muestra algo DISTINTO?** Si dos códigos de respuesta terminan en la misma
 *   pantalla para el usuario, son UN intent con dos datos, no dos intents. Y si un código
 *   no cambia nada de lo que ve el usuario (AVS `XXW` vs `XXU`, CAVV `7` vs `8`, Card
 *   Level `G1` vs `G2`), NO es un intent: es una anotación, y vive en el eje de
 *   referencia (`CardAnnotationRegistry`).
 *
 * Ese criterio es lo que mantiene la matriz en ~20 casos en lugar de ~90: la doc de
 * eBizCharge publica 92 números, pero 70 de ellos solo varían en el código de anotación.
 */

/**
 * Los 6 nombres HISTÓRICOS — CONGELADOS.
 *
 * No renombrar: se usan como literal en `CarrierHoldSteps`, `ContractorHoldSteps`,
 * `adapters/index.ts` (invariantes), `wallet-add-card.factory` y el piloto
 * `hold-happy-no3ds`. Todos pasan el intent como ARGUMENTO, así que ampliar la unión es
 * seguro; renombrar no lo es.
 */
export type LegacyCardIntent =
	| 'HAPPY_NO_AUTH'
	| 'HAPPY_AUTH'
	| 'FAIL_AUTH'
	| 'DECLINE_AUTHORIZE'
	| 'DECLINE_CAPTURE'
	| 'DECLINE_INVALID_CVC'
	/**
	 * El ZIP declarado NO coincide con el que el banco tiene registrado para la tarjeta.
	 *
	 * Es un intent de DATO, no un código de proveedor: acá no se nombra ningún `avsResultCode`.
	 * Cada pasarela lo dispara a su manera (Authorize por ZIP trigger, Stripe por número de
	 * tarjeta) y el resultado en MAGIIS lo define `OUTCOME_BY_INTENT`
	 * (`features/gateway-pg/helpers/journey-outcome.ts`), igual para todas.
	 *
	 * ⚠️ El outcome sólo es igual entre pasarelas si la CUENTA de cada una tiene la regla
	 * equivalente configurada. La regla de negocio USA es "sin match de ZIP = falla":
	 *   · Authorize  → Fraud Filters → Enhanced AVS, `N = Decline` (aplicado 2026-07-28).
	 *   · Stripe     → Radar rule `Block if :card_address_zip_check: = 'fail'` — SIN VERIFICAR.
	 *                  Por eso Stripe queda deliberadamente SIN mapear en el resolver: sin la
	 *                  regla, Stripe aprueba y mapearlo mentiría sobre el comportamiento.
	 *   · eBizCharge → equivalente a investigar (BL-027).
	 */
	| 'DECLINE_ZIP_MISMATCH';

/** Aprobaciones con variante de marca, de monto o de latencia. */
export type ApprovalIntent =
	| 'HAPPY_MASTERCARD'
	| 'HAPPY_AMEX'
	| 'HAPPY_DISCOVER'
	| 'HAPPY_PARTIAL_AUTH'
	| 'HAPPY_SLOW_PROCESSING';

/**
 * Declines con causa DISTINGUIBLE para el usuario o para la operación.
 * Los códigos que el front no diferencia (eBiz 25, 55, 65, 75, 78) NO entran acá:
 * caen en `DECLINE_AUTHORIZE`, que es el decline genérico.
 */
export type DeclineIntent =
	| 'DECLINE_INSUFFICIENT_FUNDS'
	| 'DECLINE_DO_NOT_HONOR'
	| 'DECLINE_INVALID_TRANSACTION'
	| 'DECLINE_INVALID_ISSUER'
	| 'DECLINE_RESTRICTED_CARD'
	| 'DECLINE_EXPIRED_CARD'
	| 'DECLINE_PREPAID_ZERO_BALANCE'
	/**
	 * El emisor marcó la tarjeta y pide no seguir operando con ella (perdida, robada,
	 * retener, deshabilitada). Es UN intent porque las tres pasarelas lo expresan y el
	 * front hace lo mismo: `lost_card`/`stolen_card` en Stripe, código 04 Pickup Card en
	 * eBizCharge, `LOCK` en MercadoPago.
	 */
	| 'DECLINE_CARD_FLAGGED';

/** Antifraude: el front muestra algo distinto de un decline plano. */
export type FraudIntent = 'FRAUD_REVIEW' | 'FRAUD_REJECT';

/**
 * Verificación blanda: la transacción se APRUEBA pero el código de verificación no
 * coincide. Es su propia clase porque el riesgo es el opuesto al de un decline: el peligro
 * es que el sistema la deje pasar como si nada hubiera fallado.
 */
export type SoftVerificationIntent = 'APPROVED_CVV_MISMATCH' | 'APPROVED_AVS_MISMATCH';

/**
 * Referral: el emisor no aprueba ni rechaza — deriva a autorización por voz.
 * Cuarta clase de outcome, con tabla propia en la doc de eBizCharge. Para MAGIIS el viaje
 * NO puede quedar autorizado, así que no es asimilable a un approved.
 */
export type ReferralIntent = 'REFERRAL';

export type CardIntent =
	| LegacyCardIntent
	| ApprovalIntent
	| DeclineIntent
	| FraudIntent
	| SoftVerificationIntent
	| ReferralIntent;

/**
 * Orden canónico de la matriz — única fuente de iteración de las suites parametrizadas.
 * El orden importa: define el orden de los casos en el reporte.
 */
export const ALL_CARD_INTENTS = [
	// Aprobaciones
	'HAPPY_NO_AUTH',
	'HAPPY_MASTERCARD',
	'HAPPY_AMEX',
	'HAPPY_DISCOVER',
	'HAPPY_PARTIAL_AUTH',
	'HAPPY_SLOW_PROCESSING',
	// Autenticación (exclusivo Stripe)
	'HAPPY_AUTH',
	'FAIL_AUTH',
	// Declines
	'DECLINE_AUTHORIZE',
	'DECLINE_CAPTURE',
	'DECLINE_INVALID_CVC',
	'DECLINE_INSUFFICIENT_FUNDS',
	'DECLINE_DO_NOT_HONOR',
	'DECLINE_INVALID_TRANSACTION',
	'DECLINE_INVALID_ISSUER',
	'DECLINE_RESTRICTED_CARD',
	'DECLINE_EXPIRED_CARD',
	'DECLINE_PREPAID_ZERO_BALANCE',
	'DECLINE_CARD_FLAGGED',
	// Intent de DATO (ZIP declarado ≠ ZIP del banco) — no de código de proveedor. Ver el
	// docblock de `LegacyCardIntent.DECLINE_ZIP_MISMATCH`.
	'DECLINE_ZIP_MISMATCH',
	// Antifraude
	'FRAUD_REVIEW',
	'FRAUD_REJECT',
	// Verificación blanda
	'APPROVED_CVV_MISMATCH',
	'APPROVED_AVS_MISMATCH',
	// Referral
	'REFERRAL'
] as const satisfies readonly CardIntent[];

/**
 * Guard de compilación: `ALL_CARD_INTENTS` cubre TODO `CardIntent`.
 * Si se agrega un intent al tipo y no a la lista, `_MissingFromAllIntents` deja de ser
 * `never` y esta asignación no compila.
 */
type _MissingFromAllIntents = Exclude<CardIntent, (typeof ALL_CARD_INTENTS)[number]>;
const _allIntentsExhaustive: _MissingFromAllIntents extends never ? true : never = true;
void _allIntentsExhaustive;

/**
 * Guard de compilación: el eje de ANOTACIÓN no puede colarse como intent de negocio.
 * Un `AVS_*` / `CVV2_*` / `CAVV_*` / `CARD_LEVEL_*` dentro de `CardIntent` significaría
 * que alguien convirtió un código de respuesta en un caso de prueba.
 */
type _AnnotationLeak = Extract<CardIntent, `AVS_${string}` | `CVV2_${string}` | `CAVV_${string}` | `CARD_LEVEL_${string}`>;
const _axesAreSeparate: _AnnotationLeak extends never ? true : never = true;
void _axesAreSeparate;

// ═══════════════════════════════════════════════════════════════════════
// EJE DE ANOTACIÓN — códigos de respuesta, NO casos de prueba
// ═══════════════════════════════════════════════════════════════════════

/**
 * Familias de código de verificación que las pasarelas devuelven junto con el outcome.
 *
 *   - `avs`        — Address Verification System (coincidencia de dirección y ZIP).
 *   - `cvv2`       — resultado de la verificación del código de seguridad.
 *   - `cavv`       — indicador de autenticación del titular (3DS). En eBizCharge es solo
 *                    un indicador de respuesta, NO un challenge.
 *   - `card-level` — clasificación del producto de tarjeta (corporativa, prepaga, …).
 */
export type CardAnnotationKind = 'avs' | 'cvv2' | 'cavv' | 'card-level';

/**
 * Una fila de tabla de anotación.
 *
 * **CONTRATO ARQUITECTÓNICO:** un `CardAnnotationEntry` NUNCA se promueve a caso de
 * prueba. Estos códigos no cambian lo que ve el usuario, así que un test por código
 * multiplicaría la suite sin agregar cobertura de negocio. Solo los consumen (a) la doc y
 * la paridad de datos contra la doc del PSP y (b) `assertAnnotationReferenceIntegrity()`.
 *
 * La excepción son las PROMOCIONES: una fila cuyo outcome de negocio sí importa (aprobar
 * con el AVS fallido, por ejemplo) se agrega ADEMÁS como card en el eje de negocio, y esa
 * promoción queda pinneada en el guard de fidelidad.
 */
export type CardAnnotationEntry = {
	readonly gateway: GatewayName;
	readonly kind: CardAnnotationKind;
	/** Código documentado por la pasarela: 'YYY', 'N', 'A', 'G1', … */
	readonly code: string;
	readonly number: string;
	/** Marca, cuando el código depende de ella (las tablas CVV2 de eBizCharge). */
	readonly brand?: string;
	/**
	 * Trigger alternativo cuando el outcome NO lo dispara el número.
	 * Authorize decide por (cvc, zip); eBizCharge y Stripe, por el número.
	 */
	readonly trigger?: { readonly cvc?: string; readonly zip?: string };
};

export type CardAnnotationRegistry = Readonly<Partial<Record<CardAnnotationKind, readonly CardAnnotationEntry[]>>>;

/**
 * Forma genérica de tarjeta para código de orquestación cross-gateway.
 *
 * Cada gateway define un tipo específico (StripeTestCard, AuthorizeTestCard)
 * con más detalle. Esta forma incluye sólo los campos comunes que cualquier
 * test puede consumir sin importar el gateway.
 *
 * Notas:
 *   - `expiry` es string en formato 'MM/YY' (consistente con UI Stripe Elements).
 *   - `zip` es opcional porque no todos los gateways lo usan en el form.
 *   - `expectedOutcome` es el resultado esperado declarado por el fixture, útil
 *     para que el spec sepa qué assertion validar sin recordar el mapping.
 *   - `requires3ds` indica si la card dispara challenge 3DS. Stripe puede
 *     hacerlo según number; Authorize nunca.
 */
export type GenericTestCard = {
	gateway: GatewayName;
	number: string;
	last4: string;
	expiry: string;
	cvc: string;
	holderName: string;
	zip?: string;
	/** Documento (solo Mercado Pago): tipo, ej. 'DNI' — del fixture MP (`identificationType`). */
	docType?: string;
	/** Documento (solo Mercado Pago): número — del fixture MP (`identificationNumber`). */
	docNumber?: string;
	expectedOutcome: string;
	requires3ds: boolean;
};

/**
 * Argumentos del resolver polimórfico cross-gateway.
 */
export type ResolveCardArgs = {
	gateway: GatewayName;
	intent: CardIntent;
};
