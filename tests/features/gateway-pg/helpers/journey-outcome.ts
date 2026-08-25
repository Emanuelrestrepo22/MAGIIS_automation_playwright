/**
 * Dónde termina el alta de viaje según la INTENCIÓN de la tarjeta.
 * =================================================================
 *
 * Encarnación en código del principio rector del proyecto (CLAUDE.md §BL-024):
 *
 *   "El comportamiento esperado del sistema es constante; sólo cambian los datos de entrada
 *    por pasarela."
 *
 * El **dato** (qué tarjeta/CVV/ZIP dispara el rechazo) lo resuelve `resolveCard({gateway, intent})`
 * y varía por pasarela. El **comportamiento** (¿se crea el viaje? ¿en qué columna cae?) vive acá y
 * es el MISMO para Stripe, Authorize, eBizCharge y Mercado Pago.
 *
 * ── Por qué este módulo NO vive en `fixtures/gateways/_shared/` ──────────────────────────────
 * `_shared/` es contrato de DATOS de tarjetas de prueba. Esto es política de negocio de MAGIIS.
 * La separación es deliberada y load-bearing: garantiza que ningún módulo compartido asserte
 * códigos del proveedor (`avsResultCode`, `cvvResultCode`, Response Code). Esos códigos son
 * artefactos de cada pasarela y sus oráculos se quedan en los specs de contrato de esa pasarela
 * (`specs/authorize/api/contract-*.api.spec.ts`). Acá sólo hay intents y outcomes.
 *
 * ── Regla para agregar una entrada ────────────────────────────────────────────────────────────
 * El mapa es un registro de comportamiento **OBSERVADO**, no de suposiciones. Un intent sin
 * evidencia queda SIN mapear y `outcomeForIntent()` lanza: obliga a que el spec declare el
 * outcome explícitamente (y a que quien lo declare sepa por qué). Es preferible a un default
 * silencioso, que produciría specs que aseveran un desenlace que nadie verificó.
 */

import type { CardIntent } from '@fixtures/gateways/_shared';

/**
 * Los tres desenlaces observables de un alta de viaje con tarjeta pre-autorizada.
 *
 * La distinción entre `card-rejected` y `trip-unauthorized` NO es cosmética: depende de CUÁL de
 * los dos holds falla. El alta con tarjeta nueva dispara DOS transacciones contra la pasarela
 * (regla de negocio confirmada por el líder de QA, 2026-07-27):
 *   1. **hold de vinculación** — al pulsar "Validar"/"Valid" sobre la tarjeta nueva;
 *   2. **hold del viaje**      — al dar de alta, por el monto de la tarifa.
 * Si rechaza el primero, el flujo se corta antes de existir el viaje. Si pasa el primero y falla
 * el segundo, el viaje EXISTE y queda marcado como no autorizado.
 */
export type JourneyOutcome =
	/** Hold aprobado → el viaje aparece en "Por asignar" (on-demand) o "Programados" (quote). */
	| 'trip-created'
	/**
	 * La pasarela rechaza en la validación de la tarjeta → **el viaje NO se crea**.
	 * Assertions: error de rechazo visible + "Seleccionar Vehículo" sigue bloqueado + sin
	 * `POST /travels`. Es un oráculo MÁS fuerte que el del happy path, no más débil.
	 *
	 * ⚠️ PRECONDICIÓN — este desenlace depende del **hold ACTIVO**: con hold encendido (default del
	 * carrier 1521) el sistema hace un hold chico para poder vincular la tarjeta, y ahí es donde la
	 * pasarela declina (confirmado por el líder de QA, 2026-07-28). Con hold APAGADO la vinculación
	 * podría no disparar transacción, y entonces el rechazo se movería al alta del viaje
	 * (`trip-unauthorized`) o no ocurriría. Refuerza la deuda ya anotada en `stepwise-hold-journey`:
	 * nadie asevera el toggle del hold, así que un carrier con hold en OFF cambiaría el desenlace
	 * esperado de estos casos sin que ningún test lo note.
	 */
	| 'card-rejected'
	/**
	 * La tarjeta valida pero el hold del viaje falla → el viaje se crea en estado NO_AUTORIZADO y
	 * cae en la columna "En conflicto".
	 */
	| 'trip-unauthorized';

/**
 * Outcome esperado por intent. Ver la "regla para agregar una entrada" en el doc del módulo:
 * cada línea cita la evidencia que la sostiene.
 */
export const OUTCOME_BY_INTENT: Partial<Record<CardIntent, JourneyOutcome>> = {
	/** Happy path canónico. Verificado en las 4 pasarelas con specs verdes. */
	HAPPY_NO_AUTH: 'trip-created',

	/** 3DS aprobado (exclusivo Stripe). Verificado en la suite de hold Stripe. */
	HAPPY_AUTH: 'trip-created',

	/**
	 * 3DS rechazado (exclusivo Stripe). El viaje SÍ se crea y queda recuperable — verificado en
	 * `specs/stripe/web/carrier/recovery/3ds-failure.spec.ts` (TS-STRIPE-TC1057): "el viaje se
	 * crea en NO_AUTORIZADO → En conflicto", con red flag y botón "Reintentar" en el detalle.
	 */
	FAIL_AUTH: 'trip-unauthorized',

	/**
	 * Decline genérico del banco. Dos evidencias independientes, una por pasarela:
	 *   · Stripe (card 0002) — smoke `TS-STRIPE-P2-TC090 / SMOKE-GW-TC14`: *"botón «Seleccionar
	 *     Vehículo» NO se habilita (card declinada bloquea el flujo)"* + *"viaje no creado"*.
	 *   · Authorize (ZIP 46282) — el líder de QA confirmó (2026-07-28) que con el hold activo la
	 *     declinación ocurre en el momento de la VINCULACIÓN, porque el sistema hace un hold chico
	 *     para vincular la tarjeta.
	 * Que dos pasarelas con mecanismos de trigger distintos (número vs ZIP) produzcan el MISMO
	 * desenlace es justamente lo que valida el principio: el comportamiento es constante.
	 */
	DECLINE_AUTHORIZE: 'card-rejected',

	/**
	 * CVV que no coincide con el del banco.
	 * ⚠️ Depende de la POLÍTICA DE LA CUENTA, no del trigger: en Authorize hace falta el filtro
	 * Card Code Verification con `N = Decline` (decisión D-7 del líder de QA, 2026-07-28, que
	 * supersede D-1 "aceptar con flag" para alinear el comportamiento con Stripe, donde la card
	 * 4000…0127 rechaza de fábrica). Sin ese filtro, Authorize aprueba y el caso queda rojo
	 * legítimamente — el fallo apuntaría a la config de la cuenta, que es lo correcto.
	 */
	DECLINE_INVALID_CVC: 'card-rejected',

	/**
	 * ZIP que no coincide con el registrado para la tarjeta (regla de negocio USA).
	 * ⚠️ También depende de la política de la cuenta: Authorize → Enhanced AVS `N = Decline`
	 * (aplicado 2026-07-28); Stripe → Radar rule sobre `card_address_zip_check` (SIN verificar,
	 * por eso el intent no está mapeado para Stripe en el resolver).
	 */
	DECLINE_ZIP_MISMATCH: 'card-rejected'

	// DECLINE_CAPTURE queda DELIBERADAMENTE SIN MAPEAR: el repo se contradice sobre la card 9995
	// y no hay evidencia que resuelva la contradicción.
	//   · `specs/stripe/web/carrier/hold/hold-capture.spec.ts:116` afirma "la card 9995 rechaza en
	//     el paso de validación — nunca se llega a submit"  ⇒ sería 'card-rejected'.
	//   · `features/smoke/specs/gateway-pg.smoke.spec.ts:854-857` afirma lo contrario — "9995 sólo
	//     rechaza al capturar (al final del viaje)" — y por eso el smoke la cambió por la 0002
	//     ⇒ sería 'trip-created' en la fase web, con el rechazo en la fase driver.
	// Mapearlo con cualquiera de las dos lecturas acreditaría un comportamiento no verificado.
	// Resolver observando una corrida real antes de agregar la entrada.
};

/**
 * Outcome esperado del intent. Lanza si el intent no tiene comportamiento verificado, con la
 * salida indicada: declararlo explícito en el spec (`expectOutcome`) o agregar la entrada al mapa
 * con su evidencia.
 */
export function outcomeForIntent(intent: CardIntent): JourneyOutcome {
	const outcome = OUTCOME_BY_INTENT[intent];

	if (!outcome) {
		throw new Error(
			`No hay outcome verificado para el intent '${intent}'. Opciones: (a) pasar 'expectOutcome' explícito en el spec, o (b) agregar la entrada a OUTCOME_BY_INTENT (tests/features/gateway-pg/helpers/journey-outcome.ts) citando la evidencia que la sostiene. NO se aplica un default: acreditaría un desenlace que nadie verificó.`
		);
	}

	return outcome;
}
