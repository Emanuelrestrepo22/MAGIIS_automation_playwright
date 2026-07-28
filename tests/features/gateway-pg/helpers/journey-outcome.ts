/**
 * OUTCOME_BY_INTENT — qué debe hacer MAGIIS con cada intent de tarjeta.
 * =====================================================================
 *
 * La pieza que faltaba entre el dato y el test. El fixture sabe qué responde la
 * PASARELA (código 51, CVV2 `N`, AVS `NNN`), pero un test necesita saber qué debe
 * mostrar el SISTEMA: ¿el viaje queda "Buscando chofer" o "No autorizado"? ¿aparece un
 * mensaje? ¿se guarda la tarjeta? Sin esta capa, "ingresar la tarjeta 51 y verificar que
 * el sistema informe fondos insuficientes" no es expresable en código.
 *
 * El comportamiento es el MISMO para las 4 pasarelas — es justamente el invariante que
 * hace posible el código estándar. Lo que cambia por pasarela es el dato de entrada
 * (`CARD_MATRIX`), no lo que el sistema tiene que hacer.
 *
 * ═══ REGLA DURA: este archivo es un registro de comportamiento OBSERVADO ═══
 *
 * Solo se declara un intent cuando su comportamiento fue verificado en vivo o está
 * documentado en el repo. Un intent sin observación **lanza** en `outcomeFor()` en vez de
 * caer en un default optimista. Un default acá sería peor que un hueco: produciría un
 * test verde que asserta el comportamiento que asumimos, no el que el sistema tiene.
 *
 * Hoy hay DOS estados observados, y están documentados:
 *   - `SEARCHING_DRIVER` ("Buscando chofer") ← transacción aprobada
 *   - `NO_AUTORIZADO` ("No autorizado")     ← transacción rechazada
 * Fuente: `docs/gateway-pg/ebizcharge/ARCHITECTURE.md` §mapping + los ~20 asserts de
 * 'Buscando chofer' que ya existen en las suites verdes de Stripe/Authorize/MP.
 *
 * Cómo se agrega un intent: correrlo en vivo UNA vez, observar el estado y el mensaje
 * reales, y recién entonces declararlo acá citando la evidencia.
 */

import { ALL_CARD_INTENTS, type CardIntent } from '@fixtures/gateways/_shared';

/** Estado del viaje tras intentar el cobro, tal como lo muestra la grilla del carrier. */
export type ExpectedTravelStatus = 'Buscando chofer' | 'No autorizado';

export type JourneyOutcome = {
	/** Etiqueta corta para el título del test. */
	readonly label: string;
	/** Estado esperado del viaje. */
	readonly expectedTravelStatus: ExpectedTravelStatus;
	/** `true` si la tarjeta debe quedar guardada/seleccionable tras la operación. */
	readonly cardShouldPersist: boolean;
	/** De dónde sale la observación — obligatorio, es lo que sostiene el oráculo. */
	readonly evidence: string;
};

/**
 * Comportamiento observado por intent. Deliberadamente PARCIAL: solo lo verificado.
 * Los intents ausentes hacen lanzar a `outcomeFor()`.
 */
export const OUTCOME_BY_INTENT: Partial<Record<CardIntent, JourneyOutcome>> = {
	HAPPY_NO_AUTH: {
		label: 'aprobada',
		expectedTravelStatus: 'Buscando chofer',
		cardShouldPersist: true,
		evidence:
			'Verificado en vivo en Stripe, Authorize (MG-285, 2026-07-24) y MercadoPago; es el oráculo del piloto hold-happy-no3ds.'
	},
	DECLINE_AUTHORIZE: {
		label: 'rechazada (decline genérico)',
		expectedTravelStatus: 'No autorizado',
		cardShouldPersist: false,
		evidence: 'docs/gateway-pg/ebizcharge/ARCHITECTURE.md §mapping: decline → NO_AUTORIZADO. Observado en Stripe y MP.'
	}
};

/**
 * Devuelve el comportamiento esperado del sistema para un intent.
 *
 * @throws Si el intent no tiene comportamiento OBSERVADO. Es intencional: preferimos un
 *   test que no corre a un test que asserta una suposición. El mensaje dice exactamente
 *   qué hay que hacer para desbloquearlo.
 */
export function outcomeFor(intent: CardIntent): JourneyOutcome {
	const outcome = OUTCOME_BY_INTENT[intent];
	if (!outcome) {
		throw new Error(
			`[journey-outcome] El intent '${intent}' no tiene comportamiento OBSERVADO declarado en OUTCOME_BY_INTENT. ` +
				'No hay default a propósito: un default produciría un test que valida lo que asumimos, no lo que el sistema hace. ' +
				`Para habilitarlo: correr el caso una vez en vivo, observar el estado del viaje y el mensaje reales, ` +
				`y declarar la entrada en tests/features/gateway-pg/helpers/journey-outcome.ts citando la evidencia.`
		);
	}
	return outcome;
}

/** `true` si el intent ya tiene oráculo de sistema — para decidir skip sin lanzar. */
export function hasObservedOutcome(intent: CardIntent): boolean {
	return OUTCOME_BY_INTENT[intent] !== undefined;
}

/** Los intents que hoy tienen oráculo, en el orden canónico de la matriz. */
export function observedIntents(): CardIntent[] {
	return ALL_CARD_INTENTS.filter(hasObservedOutcome);
}
