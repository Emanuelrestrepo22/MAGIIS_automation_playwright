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

export const CARD_MATRIX = {
	stripe: {
		HAPPY_NO_AUTH: { card: 'SUCCESS_NO_3DS', note: '4242 — SetupIntent OK → PaymentIntent OK → Capture OK, sin challenge.' },
		HAPPY_AUTH: { card: 'HAPPY_3DS', requires3ds: true, note: '3184 always_authenticate — challenge determinístico (la 3155 varía por risk score).' },
		FAIL_AUTH: { card: 'FAIL_3DS', requires3ds: true, note: '1629 — el challenge se completa y el cobro se declina igual (irrecuperable).' },
		DECLINE_AUTHORIZE: { card: 'DECLINE_AUTHORIZE', note: '0002 generic_decline — rechaza al intentar el hold.' },
		DECLINE_CAPTURE: { card: 'DECLINE_CAPTURE', note: '9995 insufficient_funds — authorize OK y el cobro final falla.' },
		DECLINE_INVALID_CVC: { card: 'DECLINE_INVALID_CVC', note: '0127 incorrect_cvc.' }
	},

	authorize: {
		HAPPY_NO_AUTH: { card: 'SUCCESS', note: '4111…1111 + CVV 900 → Response Code 1 (verificado en vivo 2026-07-27).' },
		DECLINE_AUTHORIZE: { card: 'DECLINE_GENERIC', note: 'Trigger por ZIP 46282 → Response Code 2.' },
		DECLINE_INVALID_CVC: { card: 'DECLINE_CVV', note: 'Trigger por CVV 901 → "N: Does NOT Match".' },
		HAPPY_AUTH: { na: NA_3DS_STRIPE_ONLY },
		FAIL_AUTH: { na: NA_3DS_STRIPE_ONLY },
		DECLINE_CAPTURE: {
			na: 'El sandbox Authorize no expone un decline específico de capture — su test suite decide el outcome en la autorización.'
		}
	},

	ebizcharge: {
		HAPPY_NO_AUTH: { card: 'SUCCESS', note: '4000100011112224 — approved, AVS YYY, CVV2 M.' },
		DECLINE_AUTHORIZE: { card: 'DECLINE_DO_NOT_HONOR', note: 'Código 05 Do not Honor — decline canónico de eBiz para MAGIIS.' },
		DECLINE_INVALID_CVC: { card: 'DECLINE_CVV', note: 'Código 97 Declined for CVV failure.' },
		HAPPY_AUTH: {
			na: `${NA_3DS_STRIPE_ONLY} La serie CAVV de eBiz es un INDICADOR de respuesta, no un challenge — vive en EBIZ_CAVV_REFERENCE.`
		},
		FAIL_AUTH: { na: NA_3DS_STRIPE_ONLY },
		DECLINE_CAPTURE: {
			na: 'eBizCharge no expone un decline específico de capture: el número decide el outcome en la autorización.'
		}
	},

	'mercado-pago': {
		HAPPY_NO_AUTH: { card: 'APPROVED', note: 'Trigger por holderName APRO (en MP el titular ES el disparador del outcome).' },
		DECLINE_AUTHORIZE: { card: 'REJECTED_OTHER', note: 'Trigger por holderName OTHE — decline canónico de MP.' },
		DECLINE_INVALID_CVC: { card: 'REJECTED_INVALID_CVV', note: 'Trigger por holderName SECU.' },
		HAPPY_AUTH: { na: NA_3DS_STRIPE_ONLY },
		FAIL_AUTH: { na: NA_3DS_STRIPE_ONLY },
		DECLINE_CAPTURE: { na: 'MercadoPago no expone un decline específico de capture.' }
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
	stripe: 6,
	authorize: 3,
	ebizcharge: 3,
	'mercado-pago': 3
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
			throw new Error(`[card-matrix-drift] ${gateway} no soporta HAPPY_NO_AUTH (intent mínimo de cualquier suite).`);
		}
	}

	return true;
}
