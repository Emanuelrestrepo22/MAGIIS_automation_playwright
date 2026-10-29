/**
 * OUTCOME_BY_INTENT — qué debe hacer MAGIIS con cada intent de tarjeta.
 * =====================================================================
 *
 * ⚠ SPLIT DEL MERGE (2026-07-29): este módulo nació como `journey-outcome.ts` en la línea
 * de la matriz de outcomes (área C). La línea de la suite HOLD creó EN PARALELO otro
 * `journey-outcome.ts` con semántica distinta (unión `trip-created|card-rejected|
 * trip-unauthorized`, consumida por hold.factory/stepwise-hold-journey). Al consolidar,
 * aquel conservó el nombre (8 consumidores) y ESTE se renombró a `card-outcome-oracle.ts`
 * (consumidores: card-outcome-matrix.factory, adapters-consistency.unit, hold-area-f-probe).
 * TODO(post-Ronda-7): unificar ambas bases de conocimiento con la evidencia de la corrida
 * limpia — hoy difieren en los declines (allí `card-rejected` por política estricta +
 * hold ON; acá `documented-class` contradicho por observaciones hechas contra la cuenta
 * enlatada, inválidas). NO unificar sin evidencia live de la cuenta correcta.
 *
 * La pieza que faltaba entre el dato y el test. El fixture sabe qué responde la
 * PASARELA (código 51, CVV2 `N`, AVS `NNN`), pero un test necesita saber qué debe hacer
 * el SISTEMA: ¿la tarjeta queda validada? ¿el viaje queda "Buscando chofer" o
 * "No autorizado"? Sin esta capa, "ingresar la tarjeta 51 y verificar que el sistema
 * informe fondos insuficientes" no es expresable en código.
 *
 * El comportamiento es el MISMO para las 4 pasarelas — es justamente el invariante que
 * hace posible el código estándar. Lo que cambia por pasarela es el dato de entrada
 * (`CARD_MATRIX`), no lo que el sistema tiene que hacer.
 *
 * ═══ DOS NIVELES DE CERTEZA, explícitos ═══
 *
 * `basis` distingue de dónde sale cada oráculo, porque no todo está verificado igual:
 *
 *   - `'live-verified'`   — observado corriendo el caso. El oráculo puede ser estricto.
 *   - `'documented-class'` — el mapeo de la CLASE está documentado (aprobada →
 *     `SEARCHING_DRIVER`, rechazada → `NO_AUTORIZADO`, según
 *     `docs/gateway-pg/ebizcharge/ARCHITECTURE.md` §mapping y el catálogo del ATP), pero
 *     el copy exacto del mensaje por código NO se verificó. El oráculo asserta el ESTADO,
 *     que es la regla de negocio, y NO inventa el texto.
 *
 * Un intent cuyo comportamiento no se deduce ni de la clase ni de una corrida **no se
 * declara**, y `outcomeFor()` lanza. Eso es deliberado: un default produciría un test
 * verde que valida lo que asumimos, no lo que el sistema hace.
 *
 * `messagePattern` solo se llena cuando el copy fue verificado. Nunca a partir del
 * mensaje que devuelve la pasarela — MAGIIS no lo muestra tal cual.
 */

import { ALL_CARD_INTENTS, type CardIntent, type GatewayName } from '@fixtures/gateways/_shared';

/** Estado del viaje tras intentar el cobro, tal como lo muestra la grilla del carrier. */
export type ExpectedTravelStatus = 'Buscando chofer' | 'No autorizado';

export type OutcomeBasis = 'live-verified' | 'documented-class';

export type JourneyOutcome = {
	/** Etiqueta corta para el título del test. */
	readonly label: string;
	/** Área C — ¿la tarjeta debe quedar validada y guardada en la wallet? */
	readonly addCardShouldSucceed: boolean;
	/** Área F — estado esperado del viaje tras intentar el cobro. */
	readonly expectedTravelStatus: ExpectedTravelStatus;
	/** De dónde sale el oráculo. */
	readonly basis: OutcomeBasis;
	/** Evidencia concreta — obligatorio, es lo que sostiene el oráculo. */
	readonly evidence: string;
	/** Copy verificado del mensaje al usuario. Ausente = no verificado, no assertar texto. */
	readonly messagePattern?: RegExp;
};

const DOC_MAPPING =
	'docs/gateway-pg/ebizcharge/ARCHITECTURE.md §mapping (approved → SEARCHING_DRIVER, decline → NO_AUTORIZADO) + catálogo del ATP MG-178.';

/** Aprobada: la tarjeta se valida y el viaje sale a buscar chofer. */
const aprobada = (label: string, evidence: string, basis: OutcomeBasis = 'documented-class'): JourneyOutcome => ({
	label,
	addCardShouldSucceed: true,
	expectedTravelStatus: 'Buscando chofer',
	basis,
	evidence
});

/** Rechazada: la tarjeta NO se valida y el viaje queda no autorizado. */
const rechazada = (label: string, evidence: string, basis: OutcomeBasis = 'documented-class'): JourneyOutcome => ({
	label,
	addCardShouldSucceed: false,
	expectedTravelStatus: 'No autorizado',
	basis,
	evidence
});

/**
 * Comportamiento esperado por intent.
 *
 * Deliberadamente PARCIAL: los intents ausentes hacen lanzar a `outcomeFor()` porque su
 * comportamiento no se deduce de la clase (ver el bloque de exclusiones al final).
 */
export const OUTCOME_BY_INTENT: Partial<Record<CardIntent, JourneyOutcome>> = {
	// ── Aprobaciones ────────────────────────────────────────────────────
	HAPPY_NO_AUTH: aprobada(
		'aprobada',
		'Verificado en vivo en Stripe, Authorize (MG-285, 2026-07-24) y MercadoPago; es el oráculo del piloto hold-happy-no3ds.',
		'live-verified'
	),
	HAPPY_MASTERCARD: aprobada(
		'aprobada (Mastercard)',
		`Variante de marca del happy path — mismo comportamiento. ${DOC_MAPPING}`
	),
	HAPPY_AMEX: aprobada('aprobada (Amex, CVV 4 dígitos)', `Variante de marca del happy path. ${DOC_MAPPING}`),
	HAPPY_DISCOVER: aprobada('aprobada (Discover)', `Variante de marca del happy path. ${DOC_MAPPING}`),
	HAPPY_SLOW_PROCESSING: aprobada(
		'aprobada con demora del procesador',
		`El outcome de la pasarela es approved; lo único distinto es la latencia, que se absorbe con el timeout del caso. ${DOC_MAPPING}`
	),
	HAPPY_AUTH: aprobada(
		'aprobada tras challenge 3DS',
		'Verificado en vivo en Stripe (suites de hold con 3DS: el challenge se completa y el viaje queda Buscando chofer).',
		'live-verified'
	),

	// ── Verificación blanda: APRUEBA con la verificación fallida ─────────
	// El riesgo acá es el opuesto al de un decline: que el sistema la deje pasar como si
	// nada hubiera fallado. El estado esperado es el del happy path a propósito.
	APPROVED_CVV_MISMATCH: aprobada(
		'aprobada con CVV2 sin coincidir',
		`La transacción se aprueba (la verificación del código falla pero no rechaza). ${DOC_MAPPING}`
	),
	APPROVED_AVS_MISMATCH: aprobada(
		'aprobada con AVS sin coincidir',
		`La transacción se aprueba (la verificación de dirección falla pero no rechaza). ${DOC_MAPPING}`
	),

	// ── Rechazos ────────────────────────────────────────────────────────
	DECLINE_AUTHORIZE: rechazada(
		'rechazada (decline genérico)',
		'Verificado en vivo en Stripe y MercadoPago; mapeo documentado decline → NO_AUTORIZADO.',
		'live-verified'
	),
	FAIL_AUTH: rechazada(
		'rechazada tras completar el challenge 3DS',
		'Verificado en vivo en Stripe (card 1629: el challenge pasa y el cobro se declina igual).',
		'live-verified'
	),
	DECLINE_INVALID_CVC: rechazada('rechazada por CVV inválido', DOC_MAPPING),
	DECLINE_INSUFFICIENT_FUNDS: rechazada('rechazada por fondos insuficientes', DOC_MAPPING),
	DECLINE_DO_NOT_HONOR: rechazada('rechazada (do not honor)', DOC_MAPPING),
	DECLINE_INVALID_TRANSACTION: rechazada('rechazada (transacción inválida)', DOC_MAPPING),
	DECLINE_INVALID_ISSUER: rechazada('rechazada (emisor inválido)', DOC_MAPPING),
	DECLINE_RESTRICTED_CARD: rechazada('rechazada (tarjeta restringida)', DOC_MAPPING),
	DECLINE_EXPIRED_CARD: rechazada('rechazada por expiración', DOC_MAPPING),
	DECLINE_PREPAID_ZERO_BALANCE: rechazada('rechazada (prepaga sin saldo)', DOC_MAPPING),
	DECLINE_CARD_FLAGGED: rechazada('rechazada (tarjeta marcada por el emisor)', DOC_MAPPING),

	// ── Antifraude y referral: no autorizan la operación ─────────────────
	FRAUD_REJECT: rechazada(
		'rechazada por antifraude',
		`El antifraude rechaza: la operación no queda autorizada. ${DOC_MAPPING}`
	),
	REFERRAL: rechazada(
		'derivada a autorización por voz',
		'El emisor no aprueba: deriva a autorización telefónica, así que el viaje NO puede quedar autorizado. Tabla Referral Response de la doc eBizCharge.'
	)

	// ── SIN declarar a propósito ─────────────────────────────────────────
	// FRAUD_REVIEW        — "marcada para revisión" no es aprobar ni rechazar. Nadie
	//                       observó si MAGIIS expone un tercer estado, y elegir uno de los
	//                       dos existentes sería inventar la regla de negocio.
	// HAPPY_PARTIAL_AUTH  — se autoriza un monto MENOR al pedido. Qué hace MAGIIS con el
	//                       faltante (¿cobra el parcial? ¿rechaza? ¿pide otra tarjeta?) es
	//                       precisamente lo que habría que decidir con producto.
	//                       RONDA 4 (2026-07-29) — se OBSERVÓ y sigue sin oráculo, ahora por un
	//                       motivo más fuerte: el resultado NO ES DETERMINÍSTICO. Con la misma
	//                       tarjeta (ZIP 46225), el mismo journey de hold y el guard de
	//                       atribución en verde, `POST /carriers/1521/travels` devolvió
	//                       `"state":"NO_AUTH"` 1 vez (viaje 67541 → "En Conflicto"/"No
	//                       Autorizado") y `"state":"SEARCHING_DRIVER"` 2 veces (67544, 67545 →
	//                       "Asignar"). Un oráculo sobre un comportamiento 1-de-3 sería un test
	//                       flaky disfrazado de regla de negocio.
	//                       RIESGO ABIERTO (no normalizado acá a propósito): si en las 2 corridas
	//                       que pasaron la pasarela devolvió una autorización PARCIAL, MAGIIS la
	//                       trató como completa — riesgo de dinero. No se puede probar desde acá:
	//                       la cuenta Authorize del backend no es observable y la de `.env.test`
	//                       devuelve aprobación enlatada de Test Mode para este ZIP. Se
	//                       desbloquea alineando las cuentas (RUN-LOG §Ronda 4, pasos 1-2).
	// DECLINE_CAPTURE     — autoriza y falla al capturar: el viaje SÍ se crea y falla más
	//                       tarde, así que no encaja en un oráculo de estado inicial. Es el
	//                       escenario del TC F-04, con su propio flujo.
};

/**
 * Devuelve el comportamiento esperado del sistema para un intent.
 *
 * @throws Si el intent no tiene oráculo. Es intencional: preferimos un caso que no corre a
 *   un caso que asserta una suposición. El mensaje dice qué hace falta para desbloquearlo.
 */
export function outcomeFor(intent: CardIntent): JourneyOutcome {
	const outcome = OUTCOME_BY_INTENT[intent];
	if (!outcome) {
		throw new Error(
			`[journey-outcome] El intent '${intent}' no tiene comportamiento esperado declarado. ` +
				'No hay default a propósito: un default produciría un test que valida lo que asumimos, no lo que el sistema hace. ' +
				'Para habilitarlo hay que definir con producto/QA qué debe mostrar MAGIIS en ese caso, o correrlo una vez en vivo, ' +
				'y declararlo en tests/features/gateway-pg/helpers/journey-outcome.ts citando la evidencia.'
		);
	}
	return outcome;
}

/** `true` si el intent ya tiene oráculo de sistema — para decidir skip sin lanzar. */
export function hasObservedOutcome(intent: CardIntent): boolean {
	return OUTCOME_BY_INTENT[intent] !== undefined;
}

/** Los intents con oráculo, en el orden canónico de la matriz. */
export function observedIntents(): CardIntent[] {
	return ALL_CARD_INTENTS.filter(hasObservedOutcome);
}

/** Los intents verificados en vivo (oráculo estricto disponible). */
export function liveVerifiedIntents(): CardIntent[] {
	return observedIntents().filter(intent => OUTCOME_BY_INTENT[intent]?.basis === 'live-verified');
}

// ═══════════════════════════════════════════════════════════════════════
// EN QUÉ ÁREA EVALÚA LA PASARELA EL OUTCOME (C = alta de tarjeta · F = cobro)
// ═══════════════════════════════════════════════════════════════════════

/**
 * `OUTCOME_BY_INTENT` describe QUÉ debe hacer el sistema. Esta tabla describe DÓNDE la
 * pasarela lo decide, que no es lo mismo y no siempre es el área C.
 *
 * El caso que la hizo necesaria: en Authorize.net el outcome de estos tres intents lo
 * dispara el ZIP o el CVV, y ZIP/CVV son campos de la **respuesta de autorización** (AVS /
 * CVV2) — la pasarela los evalúa en la TRANSACCIÓN, no al crear el perfil de pago. Por eso
 * el alta de la tarjeta aprueba, y aprueba con razón: no hay nada que rechazar todavía.
 *
 * Sin esta tabla el área C exigía un rechazo que la pasarela no emite en esa área, y el
 * único test que "pasaba" lo hacía de forma vacua. Declararlo acá deja el área C assertando
 * el comportamiento REAL y observado (la tarjeta se acepta) en vez de simular un rechazo
 * inexistente.
 *
 * NO es una excepción para tapar un rojo: `addCardShouldSucceed` pasa a `true` porque eso
 * es lo que se observó en vivo, y el caso del área C sigue corriendo con una aserción de
 * PRESENCIA ("Tarjeta válida" visible), que es más fuerte que la de ausencia que tenía.
 *
 * La celda de `CARD_MATRIX` NO se toca: la pasarela SÍ expone el outcome (`{card}` sigue
 * siendo correcto), sólo lo decide en otra área.
 *
 * ═══ LO QUE LA RONDA 4 CORRIGIÓ DE ESTA TABLA (leer antes de confiar en el área F) ═══
 *
 * La ronda 3 dedujo —correctamente— que el ZIP/CVV se evalúan en la transacción, y de ahí
 * concluyó que "la cobertura del rechazo vive en la suite de hold". La ronda 4 corrió el hold
 * con estos intents y esa segunda mitad resultó **FALSA**: el área F tampoco rechaza. El viaje
 * se crea en `SEARCHING_DRIVER` y aparece en "Asignar", igual que el happy path
 * (`docs/gateway-pg/authorize/RUN-LOG.md` §Ronda 4: ZIP 46282 limpio 2/2, CVV 901 1/1,
 * ZIP 46228 1/1; `POST /carriers/1521/travels` → `"state":"SEARCHING_DRIVER"`).
 *
 * Por eso el `basis` de esos intents sigue en `documented-class` y NO subió a `live-verified`:
 * `expectedTravelStatus: 'No autorizado'` es la regla de negocio documentada (y verificada en
 * vivo en Stripe y MercadoPago), pero en Authorize **no se pudo observar**, y lo observado la
 * contradice. Declarar `live-verified` acá sería declarar un oráculo que nadie vio.
 *
 * Esta tabla, entonces, sólo sostiene lo del área C (el alta aprueba — eso SÍ está observado).
 * NO promete cobertura del rechazo en el área F: hoy no existe. El blocker para conseguirla
 * está en el RUN-LOG §Ronda 4 (las creds sandbox de `.env.test` y la cuenta Authorize que usa
 * el backend NO son la misma, así que la pata API no es oráculo válido del flujo E2E).
 */
export type AreaFRelocation = {
	/** El área donde la pasarela realmente evalúa el outcome. */
	readonly area: 'F';
	/** Por qué el alta aprueba: qué evalúa la pasarela y cuándo. */
	readonly reason: string;
	/** Observación en vivo que sostiene la reubicación. */
	readonly evidence: string;
};

const AUTHORIZE_TRANSACTION_SCOPED = (trigger: string): AreaFRelocation => ({
	area: 'F',
	reason:
		`En Authorize.net el outcome lo dispara ${trigger}, y ese dato se evalúa en la RESPUESTA DE AUTORIZACIÓN ` +
		'(campos AVS / CVV2), no al crear el perfil de pago del alta. El alta de la tarjeta aprueba legítimamente. ' +
		'ATENCIÓN (ronda 4): el área F TAMPOCO rechaza — el viaje se crea en SEARCHING_DRIVER. El rechazo NO está ' +
		'cubierto hoy en ninguna de las dos áreas; ver el bloque de la ronda 4 en el header de este archivo.',
	evidence:
		'Área C observada en vivo 2026-07-28 (probe `specs/authorize/probe/decline-oracle-probe.spec.ts`, ronda 3 del ' +
		'RUN-LOG): las 3 tarjetas producen `POST /passengers/{id}/cards` → HTTP 200 con la tarjeta PERSISTIDA ' +
		'(`id` + `cardId` de Authorize + `lastFourDigits`) y el cartel "Tarjeta válida" visible desde t+2s y estable ' +
		'hasta t+30s — idéntico al control HAPPY_NO_AUTH de la misma corrida. Cero mensajes de rechazo en la página. ' +
		'Área F observada en vivo 2026-07-29 (probe `specs/authorize/probe/hold-area-f-probe.spec.ts`, ronda 4): con ' +
		'hold ON el alta llama `POST /cards/passengers/{id}/cardValidationWithHold/{carrierId}` → `true` y ' +
		'`POST /carriers/1521/travels` → `"state":"SEARCHING_DRIVER"`; el viaje queda en "Asignar", NO en ' +
		'"En Conflicto". Es decir: la pasarela no rechaza en ninguna de las dos áreas.'
});

/**
 * Intents cuyo outcome la pasarela NO evalúa en el alta de tarjeta.
 * Exhaustivo por pasarela sólo donde hay evidencia: la ausencia significa "se evalúa en el
 * área C", que es el default y lo que vale para las otras 3 pasarelas.
 */
export const AREA_F_SCOPED_OUTCOMES: Partial<Record<GatewayName, Partial<Record<CardIntent, AreaFRelocation>>>> = {
	authorize: {
		DECLINE_AUTHORIZE: AUTHORIZE_TRANSACTION_SCOPED('el ZIP 46282'),
		DECLINE_INVALID_CVC: AUTHORIZE_TRANSACTION_SCOPED('el CVV 901'),
		DECLINE_PREPAID_ZERO_BALANCE: AUTHORIZE_TRANSACTION_SCOPED('el ZIP 46228')
	}
};

/** `undefined` = la pasarela evalúa este outcome en el alta (área C), el caso normal. */
export function areaFRelocationFor(gateway: GatewayName, intent: CardIntent): AreaFRelocation | undefined {
	return AREA_F_SCOPED_OUTCOMES[gateway]?.[intent];
}

/** Lo que el área C debe esperar del alta de tarjeta, ya resuelta la reubicación de área. */
export type AddCardExpectation = {
	/** `true` → el alta debe aprobar; `false` → el alta debe rechazar. */
	readonly shouldSucceed: boolean;
	/** Presente sólo si el outcome del intent se decide en el área F. */
	readonly relocation?: AreaFRelocation;
};

/**
 * Resuelve la expectativa del área C combinando la regla de negocio (`OUTCOME_BY_INTENT`,
 * cross-pasarela) con el área en que la pasarela evalúa el outcome.
 *
 * Un intent reubicado al área F espera un alta APROBADA, porque es lo observado; su
 * cobertura de rechazo vive en la suite de hold, no acá.
 */
export function addCardExpectation(gateway: GatewayName, intent: CardIntent): AddCardExpectation {
	const relocation = areaFRelocationFor(gateway, intent);
	if (relocation) return { shouldSucceed: true, relocation };
	return { shouldSucceed: outcomeFor(intent).addCardShouldSucceed };
}
