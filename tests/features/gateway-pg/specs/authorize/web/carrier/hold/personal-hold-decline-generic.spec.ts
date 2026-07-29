// Ola A · UNHAPPY U1 — Authorize.Net · Carrier · usuario PERSONAL / APP PAX · Hold ON · DECLINE
//
// TC: TS-AUTHORIZE-TC1016 (docs/gateway-pg/authorize/matriz_cases.md §2.2, línea 79)
//   Título matriz: "Validar Alta de Viaje desde carrier para usuario personal con tarjeta
//   declinada (ZIP 46282) Hold ON — sistema muestra error de declinación y el viaje no se crea"
//   Card: AUTHORIZE_CARDS.DECLINE_GENERIC (Visa 4111…1111 + CVV 900 + ZIP 46282) · Hold: ON
//   Outcome matriz: "Response Code 2 → red flag 'No autorizado', viaje NO aparece en
//   'Buscando conductor'"
//
// Es el PRIMER caso unhappy de la campaña y el que fija la forma del oráculo para U2 (ZIP
// no-match) y U3 (CVV mismatch): los tres comparten desenlace y sólo cambia el dato que lo
// dispara. Contracara exacta de TC1011, que usa el MISMO actor y el MISMO recorrido con la
// única diferencia del ZIP (90210 → 46282). Esa simetría es deliberada: si TC1011 pasa y este
// falla, la causa está en el dato y no en el flujo.
//
// ── AMBIGÜEDAD DE LA MATRIZ, RESUELTA ───────────────────────────────────────────────────────
// El "Debería" de la matriz (línea 82) ofrece DOS desenlaces alternativos: *"el viaje permanece
// sin crear (la URL no cambia **o** muestra detalle en estado NO_AUTORIZADO)"*. Un oráculo que
// acepte ambos pasaría con cualquiera de los dos comportamientos, incluido el incorrecto.
// Queda resuelto a favor del PRIMERO, con dos evidencias convergentes:
//   1. El líder de QA confirmó (2026-07-28) que con el hold ACTIVO el sistema hace un hold chico
//      para poder vincular la tarjeta ⇒ la pasarela declina en la VINCULACIÓN, antes de que
//      exista viaje alguno.
//   2. Stripe, con mecanismo de trigger distinto (número 0002 en vez de ZIP), produce el mismo
//      desenlace ya verificado en `features/smoke/specs/gateway-pg.smoke.spec.ts` (SMOKE-GW-TC14):
//      el botón "Seleccionar Vehículo" nunca se habilita y el viaje no se crea.
// Por eso el intent mapea a `card-rejected` en `helpers/journey-outcome.ts` y el helper corta en
// el paso 10. Si en la corrida el viaje SÍ se creara y cayera en "En conflicto", el test falla —
// y ese fallo es un hallazgo real (el desenlace sería `trip-unauthorized`), no un test mal hecho.
//
// ── ORÁCULO (por qué no se debilita) ────────────────────────────────────────────────────────
// El caso pasa sólo si se cumplen las TRES cosas, no una:
//   1. El mensaje de rechazo de la pasarela está PRESENTE (no basta con que falte el de éxito:
//      un ambiente caído también hace faltar el de éxito — ver `expectNativeCardRejected`).
//   2. "Seleccionar Vehículo" sigue BLOQUEADO después del rechazo.
//   3. NO hubo `POST /travels` con id.
//
// ALCANCE: sólo fase WEB. No hay fase mobile: sin tarjeta vinculada no hay viaje que cobrar.
//
// PRECONDICIONES (declaradas, no gestionadas por el spec):
//   1. Authorize.Net VINCULADA en el Magiis App Store del carrier 1521.
//   2. Hold HABILITADO en preferencias operativas (default del carrier). ⚠️ Con hold en OFF el
//      desenlace esperado cambia — ver la nota de `JourneyOutcome.card-rejected`.
//
// ── MIGRADO A LA FACTORY HOLD (S6) ──────────────────────────────────────────────────────────
// Consumidor THIN de `defineHoldSuite('authorize', { cases: ['personalDeclineHoldOn'] })`. El
// intent sigue siendo lo ÚNICO que cambia respecto de TC1011 y el desenlace (`card-rejected`)
// se sigue derivando vía `OUTCOME_BY_INTENT` — el spec declara intención, no comportamiento.
// Las TRES condiciones del oráculo (mensaje de rechazo presente + vehículo bloqueado + sin
// `POST /travels`) las asevera el motor `runStepwiseHoldJourney`, sin cambios.
//
// SIN CONFIRMAR EN VIVO: el ambiente `apps-test` está CAÍDO — la migración se verificó sólo de
// forma estática (tsc + eslint + `playwright test --list`).
import { defineHoldSuite } from '@features/gateway-pg/specs/_parametrized/factories/hold.factory';

defineHoldSuite('authorize', {
	cases: ['personalDeclineHoldOn'],
	suiteSuffix: 'usuario personal · tarjeta declinada · Hold ON'
});
