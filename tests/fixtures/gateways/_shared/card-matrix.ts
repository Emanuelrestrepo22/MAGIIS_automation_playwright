/**
 * CARD_MATRIX — la tabla `intent × pasarela`, fuente única de soporte de tarjetas.
 * ================================================================================
 *
 * Reemplaza los 4 mapas sueltos (`STRIPE_INTENT_MAP`, `AUTHORIZE_INTENT_MAP`,
 * `EBIZCHARGE_INTENT_MAP`, `MERCADO_PAGO_INTENT_MAP`) por UNA tabla exhaustiva.
 *
 * Por qué una tabla y no cuatro mapas: con mapas `Partial<Record<...>>`, agregar un
 * intent nuevo compila sin tocar las otras 3 pasarelas — y esas 3 quedan sin soporte de
 * forma SILENCIOSA. No hay error, no hay skip, simplemente el caso nunca se genera y la
 * cobertura que falta no se ve en ningún lado. Acá cada fila es un
 * `Record<CardIntent, …>` exhaustivo: agregar un intent rompe `tsc` en las 4 filas hasta
 * que alguien declare explícitamente `{ card }` (soportado) o `{ na: 'razón' }`
 * (no aplica, con el motivo escrito).
 *
 * Reglas:
 *   1. Las celdas apuntan a KEYS del `card-policy.ts` de su pasarela — nunca a un número
 *      de tarjeta inline (el dato vive en un solo lugar: `cards.ts`).
 *   2. `na` es obligatorio en las celdas no soportadas y su texto viaja LITERAL al mensaje
 *      del `test.skip`, así el reporte dice por qué el caso no corre.
 *   3. `requires3ds` es DATO de la celda, no algo derivado del nombre del intent: derivarlo
 *      del nombre hace que todo intent nuevo herede `false` sin que nadie lo decida.
 *
 * Este archivo es puramente declarativo (tabla + tipos + type guard). La resolución a
 * `GenericTestCard` vive en `resolver.ts`, que importa esta tabla — dependencia en un
 * solo sentido, sin ciclos.
 */

import type { CardPolicyKey } from '../stripe/card-policy';
import type { AuthorizeCardPolicyKey } from '../authorize/card-policy';
import type { EbizCardPolicyKey } from '../ebizcharge/card-policy';
import type { MercadoPagoCardPolicyKey } from '../mercado-pago/card-policy';
import type { CardIntent, GatewayName } from './types';

// ═══════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════

/** Celda soportada: la pasarela expone este outcome y ésta es la card que lo dispara. */
export type CardMatrixSupported<K extends string> = {
	/** Key del `card-policy.ts` de la pasarela. */
	readonly card: K;
	/** `true` solo si el intent exige challenge de autenticación (hoy: solo Stripe). */
	readonly requires3ds?: boolean;
	/** Latencia esperada del sandbox, en ms — el caso ajusta su timeout con esto. */
	readonly slowMs?: number;
	/** Nota de trazabilidad: qué dato concreto dispara el outcome, o de dónde salió. */
	readonly note?: string;
};

/** Celda no aplicable: la razón es OBLIGATORIA y se muestra en el skip. */
export type CardMatrixNotApplicable = {
	readonly na: string;
};

export type CardMatrixCell<K extends string> = CardMatrixSupported<K> | CardMatrixNotApplicable;

/** Fila EXHAUSTIVA: obliga a declarar soporte o N/A para cada intent canónico. */
export type CardMatrixRow<K extends string> = Readonly<Record<CardIntent, CardMatrixCell<K>>>;

export type CardMatrixShape = {
	readonly stripe: CardMatrixRow<CardPolicyKey>;
	readonly authorize: CardMatrixRow<AuthorizeCardPolicyKey>;
	readonly ebizcharge: CardMatrixRow<EbizCardPolicyKey>;
	readonly 'mercado-pago': CardMatrixRow<MercadoPagoCardPolicyKey>;
};

/** Type guard — discrimina celda soportada de celda N/A. */
export function isSupported<K extends string>(cell: CardMatrixCell<K>): cell is CardMatrixSupported<K> {
	return 'card' in cell;
}

// ═══════════════════════════════════════════════════════════════════════
// LA MATRIZ
// ═══════════════════════════════════════════════════════════════════════

const NA_3DS_STRIPE_ONLY =
	'3DS es EXCLUSIVO de Stripe en el flujo MAGIIS (adapter.requires3ds=false): el caso NO se genera, ' +
	'no se degrada a un happy path sin challenge.';

/** Razón compartida: la pasarela agrupa el código bajo su decline genérico. */
const NA_COLAPSA_EN_GENERICO = (gateway: string): string =>
	`El sandbox de ${gateway} no distingue esta causa del decline genérico — el caso ya está cubierto por DECLINE_AUTHORIZE.`;

const NA_SIN_MARCA = (gateway: string): string =>
	`En ${gateway} la marca de la tarjeta no cambia el outcome, así que la variante no aporta un caso de negocio distinto.`;

export const CARD_MATRIX = {
	stripe: {
		HAPPY_NO_AUTH: {
			card: 'SUCCESS_NO_3DS',
			note: '4242 — SetupIntent OK → PaymentIntent OK → Capture OK, sin challenge.'
		},
		HAPPY_MASTERCARD: { card: 'SUCCESS_MASTERCARD', note: 'Mastercard débito.' },
		HAPPY_AMEX: {
			na: 'El registry Stripe del repo no tiene una Amex de prueba — agregarla a STRIPE_TEST_CARDS_RAW primero.'
		},
		HAPPY_DISCOVER: { na: 'El registry Stripe del repo no tiene una Discover de prueba.' },
		HAPPY_PARTIAL_AUTH: { na: 'Las test cards de Stripe no exponen autorización parcial en el flujo MAGIIS.' },
		HAPPY_SLOW_PROCESSING: { na: 'Stripe no publica tarjetas de retraso de procesamiento.' },
		HAPPY_AUTH: {
			card: 'HAPPY_3DS',
			requires3ds: true,
			note: '3184 always_authenticate — challenge determinístico (la 3155 varía por risk score).'
		},
		FAIL_AUTH: {
			card: 'FAIL_3DS',
			requires3ds: true,
			note: '1629 — el challenge se completa y el cobro se declina igual (irrecuperable).'
		},
		DECLINE_AUTHORIZE: { card: 'DECLINE_AUTHORIZE', note: '0002 generic_decline — rechaza al intentar el hold.' },
		DECLINE_CAPTURE: { card: 'DECLINE_CAPTURE', note: '9995 — authorize OK y el cobro final falla.' },
		DECLINE_INVALID_CVC: {
			card: 'DECLINE_INVALID_CVC',
			note: '0127 incorrect_cvc — rechaza (distinto de APPROVED_CVV_MISMATCH).'
		},
		DECLINE_INSUFFICIENT_FUNDS: {
			card: 'DECLINE_CAPTURE',
			note: 'Misma 9995: en Stripe el decline de capture ES por fondos insuficientes. Mismo dato, dos intents con oráculo distinto (uno mira el capture, el otro el mensaje).'
		},
		DECLINE_DO_NOT_HONOR: { na: NA_COLAPSA_EN_GENERICO('Stripe') },
		DECLINE_INVALID_TRANSACTION: { na: NA_COLAPSA_EN_GENERICO('Stripe') },
		DECLINE_INVALID_ISSUER: { na: NA_COLAPSA_EN_GENERICO('Stripe') },
		DECLINE_RESTRICTED_CARD: { na: NA_COLAPSA_EN_GENERICO('Stripe') },
		DECLINE_EXPIRED_CARD: {
			card: 'DECLINE_EXPIRED_CARD',
			note: 'expired_card — el rechazo lo produce el PSP, no la validación del form.'
		},
		DECLINE_PREPAID_ZERO_BALANCE: { na: 'Stripe no expone prepaga con saldo cero.' },
		DECLINE_CARD_FLAGGED: {
			card: 'DECLINE_LOST_CARD',
			note: 'lost_card (la variante stolen_card está en CARDS.DECLINE_STOLEN_CARD).'
		},
		DECLINE_ZIP_MISMATCH: {
			na: "La card que falla el `zip_check` (4000 0000 0000 0036) APRUEBA el cargo igual salvo que la cuenta tenga la Radar rule `Block if :card_address_zip_check: = 'fail'`, hoy NO verificada en la cuenta MAGIIS. Mapearla produciría un spec que espera un rechazo que no ocurre. Al confirmar la regla: agregar la card a stripe/cards.ts + card-policy.ts y declararla acá, en un commit propio."
		},
		FRAUD_REVIEW: {
			na: 'Radar bloquea o deja pasar; no expone un estado "en revisión" que el front de MAGIIS muestre distinto de un decline.'
		},
		FRAUD_REJECT: { card: 'FRAUD_BLOCKED', note: 'always_blocked — Radar la rechaza siempre.' },
		APPROVED_CVV_MISMATCH: {
			card: 'APPROVED_CVV_MISMATCH',
			note: 'cvc_check falla DESPUÉS de autorizar: el cargo pasa, la verificación no.'
		},
		APPROVED_AVS_MISMATCH: {
			card: 'APPROVED_AVS_MISMATCH',
			note: 'zip_fail_elevated — aprueba con la verificación de ZIP fallida.'
		},
		REFERRAL: { na: 'Stripe no expone la respuesta de referral (autorización por voz).' }
	},

	authorize: {
		HAPPY_NO_AUTH: {
			card: 'SUCCESS',
			note: '4111…1111 + CVV 900 → Response Code 1 (verificado en vivo 2026-07-27).'
		},
		HAPPY_MASTERCARD: { card: 'SUCCESS_MASTERCARD' },
		HAPPY_AMEX: { card: 'SUCCESS_AMEX', note: 'CVV de 4 dígitos (9000) — el form nativo tiene que aceptar 4.' },
		HAPPY_DISCOVER: { card: 'SUCCESS_DISCOVER' },
		HAPPY_PARTIAL_AUTH: { card: 'PARTIAL_AUTH', note: 'Trigger por ZIP 46225 → autoriza $1.23 del total pedido.' },
		HAPPY_SLOW_PROCESSING: { na: 'Authorize no publica tarjetas de retraso de procesamiento.' },
		HAPPY_AUTH: { na: NA_3DS_STRIPE_ONLY },
		FAIL_AUTH: { na: NA_3DS_STRIPE_ONLY },
		DECLINE_AUTHORIZE: { card: 'DECLINE_GENERIC', note: 'Trigger por ZIP 46282 → Response Code 2.' },
		DECLINE_CAPTURE: {
			na: 'El sandbox Authorize no expone un decline específico de capture — su test suite decide el outcome en la autorización.'
		},
		DECLINE_INVALID_CVC: { card: 'DECLINE_CVV', note: 'Trigger por CVV 901 → "N: Does NOT Match".' },
		DECLINE_INSUFFICIENT_FUNDS: { na: NA_COLAPSA_EN_GENERICO('Authorize') },
		DECLINE_DO_NOT_HONOR: { na: NA_COLAPSA_EN_GENERICO('Authorize') },
		DECLINE_INVALID_TRANSACTION: { na: NA_COLAPSA_EN_GENERICO('Authorize') },
		DECLINE_INVALID_ISSUER: { na: NA_COLAPSA_EN_GENERICO('Authorize') },
		DECLINE_RESTRICTED_CARD: { na: NA_COLAPSA_EN_GENERICO('Authorize') },
		DECLINE_EXPIRED_CARD: {
			na: 'Authorize valida la expiración del lado del cliente: la request no llega a la pasarela.'
		},
		DECLINE_PREPAID_ZERO_BALANCE: {
			card: 'PREPAID_ZERO',
			note: 'Trigger por ZIP 46228 → Prepaid Auth con saldo $0.'
		},
		DECLINE_CARD_FLAGGED: { na: NA_COLAPSA_EN_GENERICO('Authorize') },
		DECLINE_ZIP_MISMATCH: {
			card: 'AVS_NO_MATCH',
			note: 'ZIP 46205 → el banco responde "no coincide". Que eso RECHACE la operación no es propiedad del trigger sino de la política de la cuenta (Fraud Filters → Enhanced AVS `N = Decline`, aplicada por el líder de QA el 2026-07-28 con la regla de negocio USA "sin match de ZIP = falla"). MISMA card que APPROVED_AVS_MISMATCH: mismo dato, dos intents con oráculo distinto — cuál de los dos aplica lo decide la política de la cuenta, no la tarjeta.'
		},
		FRAUD_REVIEW: {
			na: 'Held-for-Review (Response Code 4) exige tener los Fraud Management Filters activos en la cuenta — ver matriz_cases2.md §10.'
		},
		FRAUD_REJECT: { na: 'Idem FRAUD_REVIEW: depende de los Fraud Management Filters, hoy no configurados.' },
		APPROVED_CVV_MISMATCH: {
			card: 'CVV_NOT_PROCESSED',
			note: 'Trigger por CVV 904 → "P: Is NOT Processed". Los otros resultados (S/U) son eje de ANOTACIÓN, no casos.'
		},
		APPROVED_AVS_MISMATCH: {
			card: 'AVS_NO_MATCH',
			note: 'Trigger por ZIP 46205 → AVS "N". Los otros 4 (G/R/S/U) son eje de ANOTACIÓN.'
		},
		REFERRAL: { na: 'Authorize no expone la respuesta de referral.' }
	},

	ebizcharge: {
		HAPPY_NO_AUTH: { card: 'SUCCESS', note: '4000100011112224 — approved, AVS YYY, CVV2 M.' },
		HAPPY_MASTERCARD: {
			card: 'SUCCESS_MASTERCARD',
			note: '5555444433332226 — fila M de la tabla CVV2 de Mastercard.'
		},
		HAPPY_AMEX: { card: 'SUCCESS_AMEX', note: '371122223332225 — CVV de 4 dígitos.' },
		HAPPY_DISCOVER: { card: 'SUCCESS_DISCOVER', note: '6011222233332224.' },
		HAPPY_PARTIAL_AUTH: { na: 'eBizCharge no expone autorización parcial.' },
		HAPPY_SLOW_PROCESSING: {
			card: 'DELAY_60S',
			slowMs: 60_000,
			note: 'Tabla Slow Processing: aprueba a los 60s. Se toma el límite superior (5/15/30/45s son el mismo comportamiento con menos espera).'
		},
		HAPPY_AUTH: {
			na: `${NA_3DS_STRIPE_ONLY} La serie CAVV de eBiz es un INDICADOR de respuesta, no un challenge — vive en EBIZ_CAVV_REFERENCE.`
		},
		FAIL_AUTH: { na: NA_3DS_STRIPE_ONLY },
		DECLINE_AUTHORIZE: {
			card: 'DECLINE_DO_NOT_HONOR',
			note: 'Código 05 Do not Honor — decline canónico de eBiz para MAGIIS.'
		},
		DECLINE_CAPTURE: {
			na: 'eBizCharge no expone un decline específico de capture: el número decide el outcome en la autorización.'
		},
		DECLINE_INVALID_CVC: { card: 'DECLINE_CVV', note: 'Código 97 Declined for CVV failure.' },
		DECLINE_INSUFFICIENT_FUNDS: { card: 'DECLINE_INSUFFICIENT', note: 'Código 51 Insufficient funds.' },
		DECLINE_DO_NOT_HONOR: {
			card: 'DECLINE_DO_NOT_HONOR',
			note: 'Código 05 — mismo dato que DECLINE_AUTHORIZE, nombrado por su causa.'
		},
		DECLINE_INVALID_TRANSACTION: { card: 'DECLINE_INVALID_TRANSACTION', note: 'Código 12 Invalid Transaction.' },
		DECLINE_INVALID_ISSUER: {
			card: 'DECLINE_INVALID_ISSUER',
			note: 'Código 15 Invalid Issuer — OJO: la única con exp 0922.'
		},
		DECLINE_RESTRICTED_CARD: { card: 'DECLINE_RESTRICTED', note: 'Código 62 Restricted Card.' },
		DECLINE_EXPIRED_CARD: {
			na: 'La expiración se valida del lado del cliente: la request no llega a la pasarela.'
		},
		DECLINE_PREPAID_ZERO_BALANCE: { na: 'eBizCharge no expone prepaga con saldo cero.' },
		DECLINE_CARD_FLAGGED: {
			card: 'DECLINE_PICKUP_CARD',
			note: 'Código 04 Pickup Card — el emisor pide retener la tarjeta.'
		},
		DECLINE_ZIP_MISMATCH: {
			na: 'eBizCharge no expone un rechazo por ZIP: sus números AVS son eje de ANOTACIÓN y todos devuelven approved (equivalente a investigar — BL-027).'
		},
		FRAUD_REVIEW: { card: 'FRAUD_REVIEW', note: 'Fraud Profiler → review (marcada para revisión manual).' },
		FRAUD_REJECT: { card: 'FRAUD_REJECT', note: 'Fraud Profiler → reject.' },
		APPROVED_CVV_MISMATCH: {
			card: 'CVV2_NO_MATCH',
			note: 'CVV2 N con AVS YYY: aprueba con el código de seguridad sin coincidir. El resto de la tabla es eje de ANOTACIÓN.'
		},
		APPROVED_AVS_MISMATCH: { card: 'APPROVED_AVS_MISMATCH', note: '4000100511112229 — approved con AVS NNN.' },
		REFERRAL: { card: 'REFERRAL', note: '4000300111112229 — el emisor deriva a autorización por voz.' }
	},

	'mercado-pago': {
		HAPPY_NO_AUTH: {
			card: 'APPROVED',
			note: 'Trigger por holderName APRO (en MP el titular ES el disparador del outcome).'
		},
		HAPPY_MASTERCARD: { na: NA_SIN_MARCA('MercadoPago') },
		HAPPY_AMEX: { na: NA_SIN_MARCA('MercadoPago') },
		HAPPY_DISCOVER: { na: NA_SIN_MARCA('MercadoPago') },
		HAPPY_PARTIAL_AUTH: { na: 'MercadoPago no expone autorización parcial.' },
		HAPPY_SLOW_PROCESSING: { na: 'MercadoPago no publica tarjetas de retraso de procesamiento.' },
		HAPPY_AUTH: { na: NA_3DS_STRIPE_ONLY },
		FAIL_AUTH: { na: NA_3DS_STRIPE_ONLY },
		DECLINE_AUTHORIZE: { card: 'REJECTED_OTHER', note: 'Trigger por holderName OTHE — decline canónico de MP.' },
		DECLINE_CAPTURE: { na: 'MercadoPago no expone un decline específico de capture.' },
		DECLINE_INVALID_CVC: { card: 'REJECTED_INVALID_CVV', note: 'Trigger por holderName SECU.' },
		DECLINE_INSUFFICIENT_FUNDS: { card: 'REJECTED_INSUFFICIENT_FUNDS', note: 'Trigger por holderName FUND.' },
		DECLINE_DO_NOT_HONOR: { na: NA_COLAPSA_EN_GENERICO('MercadoPago') },
		DECLINE_INVALID_TRANSACTION: { na: NA_COLAPSA_EN_GENERICO('MercadoPago') },
		DECLINE_INVALID_ISSUER: { na: NA_COLAPSA_EN_GENERICO('MercadoPago') },
		DECLINE_RESTRICTED_CARD: {
			card: 'REJECTED_CARD_DISABLED',
			note: 'Trigger por holderName LOCK — tarjeta deshabilitada.'
		},
		DECLINE_EXPIRED_CARD: {
			card: 'REJECTED_EXPIRED',
			note: 'Trigger por holderName EXPI — el rechazo lo produce MP, no el form.'
		},
		DECLINE_PREPAID_ZERO_BALANCE: { na: 'MercadoPago no expone prepaga con saldo cero.' },
		DECLINE_CARD_FLAGGED: {
			na: 'MP no distingue "tarjeta marcada por el emisor" de tarjeta deshabilitada (LOCK) ni de lista negra (BLAC), ya cubiertos por otros intents.'
		},
		DECLINE_ZIP_MISMATCH: { na: 'MP no hace verificación de dirección en el flujo MAGIIS (no pide ZIP).' },
		FRAUD_REVIEW: {
			na: 'CONT deja el pago en `in_process` (pendiente), que NO es lo mismo que una revisión antifraude — mapearlo ahí sería inventar el oráculo.'
		},
		FRAUD_REJECT: { card: 'REJECTED_BLACKLIST', note: 'Trigger por holderName BLAC — rechazo por lista negra.' },
		APPROVED_CVV_MISMATCH: { na: 'MP no expone una aprobación con CVV no coincidente: SECU rechaza directamente.' },
		APPROVED_AVS_MISMATCH: { na: 'MP no hace verificación de dirección en el flujo MAGIIS (no pide ZIP).' },
		REFERRAL: {
			card: 'REJECTED_CALL',
			note: 'Trigger por holderName CALL — "requiere validación para autorizar", que es la semántica de referral.'
		}
	}
} as const satisfies CardMatrixShape;

// ═══════════════════════════════════════════════════════════════════════
// GUARD DE INTEGRIDAD
// ═══════════════════════════════════════════════════════════════════════

/**
 * Cantidad de intents soportados por pasarela — PINNEADA a propósito.
 *
 * Es la red contra el modo de fallo más silencioso de este diseño: si alguien deriva
 * los intents soportados de la matriz y se olvida de filtrar por `isSupported`, el
 * conteo salta a "todos" para las 4 pasarelas, la invariante `requires3ds ⇔ soporta
 * HAPPY_AUTH` pasa espuriamente y se empiezan a generar casos 3DS para pasarelas que no
 * tienen 3DS. Subir un número acá tiene que ser una decisión, no un efecto colateral.
 */
export const EXPECTED_SUPPORTED_COUNTS = {
	stripe: 13,
	// 11 desde el merge de la suite HOLD (2026-07-29): DECLINE_ZIP_MISMATCH entra al vocabulario
	// como intent de DATO y Authorize es la única pasarela que hoy lo dispara (ZIP 46205 +
	// Enhanced AVS `N = Decline`). Decisión, no efecto colateral.
	authorize: 11,
	ebizcharge: 18,
	'mercado-pago': 8
} as const satisfies Record<GatewayName, number>;

/**
 * Valida la matriz: toda celda es `{card}` o `{na}` con razón no vacía, los conteos de
 * soporte coinciden con el pin, y `HAPPY_NO_AUTH` está soportado en las 4 (intent mínimo
 * de cualquier suite).
 *
 * @throws Con detalle `[card-matrix-drift]` si algo divierge.
 */
export function assertCardMatrixIntegrity(): true {
	const gateways = Object.keys(CARD_MATRIX) as GatewayName[];

	for (const gateway of gateways) {
		const row = CARD_MATRIX[gateway] as Readonly<Record<CardIntent, CardMatrixCell<string>>>;
		const intents = Object.keys(row) as CardIntent[];
		let soportados = 0;

		for (const intent of intents) {
			const cell = row[intent];
			if (isSupported(cell)) {
				soportados++;
				if (!cell.card) {
					throw new Error(`[card-matrix-drift] ${gateway}.${intent} declara \`card\` vacío.`);
				}
			} else if (!cell.na?.trim()) {
				throw new Error(
					`[card-matrix-drift] ${gateway}.${intent} es N/A sin razón. La razón es obligatoria: viaja literal al mensaje del skip.`
				);
			}
		}

		const esperado = EXPECTED_SUPPORTED_COUNTS[gateway];
		if (soportados !== esperado) {
			throw new Error(
				`[card-matrix-drift] ${gateway} soporta ${soportados} intents pero EXPECTED_SUPPORTED_COUNTS dice ${esperado}. ` +
					'Si el cambio es intencional, actualizar el pin en el mismo commit; si no, probablemente falta filtrar por isSupported().'
			);
		}

		if (!isSupported(row.HAPPY_NO_AUTH)) {
			throw new Error(
				`[card-matrix-drift] ${gateway} no soporta HAPPY_NO_AUTH (intent mínimo de cualquier suite).`
			);
		}
	}

	return true;
}
