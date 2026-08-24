// Ola A — Authorize.Net · Carrier · usuario PERSONAL / APP PAX · Hold ON · Visa APPROVED
//
// TC: TS-AUTHORIZE-TC1011 (docs/gateway-pg/authorize/matriz_cases.md §2.1)
//   Título matriz: "Validar Alta de Viaje desde carrier para usuario personal con tarjeta
//   preautorizada exitosa (Visa 4111…1111 + CVV 900) Hold desde Alta de Viaje y Cobro desde
//   App Driver"
//   Card: AUTHORIZE_CARDS.SUCCESS · Card flow: new · Hold: ON
//   Outcome matriz: "Response Code 1 → viaje pasa a SEARCHING_DRIVER y aparece en columna
//   'Por asignar'"
//
// Caso BASE de la Ola A. Los otros dos varían UNA dimensión sobre éste: el tipo de actor
// (TC1061 empresa individuo, TC1051 colaborador de contractor).
//
// EVIDENCIA DE REFERENCIA: `tests/test-3.spec.ts` — grabación validada en PASS por QA
// (2026-07-27). Busca el cliente por "eman" → Emanuel Restrepo (app pax) y llega a
// "Searching Driver". Usó el titular 'MAGIIS QA TESTER'; el helper genera uno único por corrida
// (BL-050 — Authorize rechaza la combinación número+titular ya vinculada).
//
// ALCANCE: sólo la fase WEB (el hold). El cobro desde App Driver es fase mobile — fuera de
// Ola A (ver TC1301-1303, requieren device Appium).
//
// ORÁCULO: la COLUMNA de gestión de viajes. "Por asignar" = PASS. "En conflicto" con datos
// VÁLIDOS = FAIL (el hold no se pudo hacer) → escalar a dev.
//
// PRECONDICIONES (declaradas, no gestionadas por el spec):
//   1. Authorize.Net VINCULADA en el Magiis App Store del carrier 1521.
//   2. Hold habilitado en preferencias operativas (default del carrier).
//
// ESTADO 2026-07-27: falló en el paso 9 (validación de tarjeta) con "Error al validar tarjeta.
// Por favor, revise los datos ingresados." teniendo los 5 campos correctos en el DOM
// (verificado en screenshot + page snapshot). Con la pasarela vinculada, la hipótesis vigente
// es BL-050 (duplicado en wallet reportado como error genérico) — las 2 grabaciones validadas
// en PASS por QA usaron titulares distintos. Aislar con `AUTHORIZE_CARD_HOLDER=<otro titular>`.
//
// ── MIGRADO A LA FACTORY HOLD (S6) ──────────────────────────────────────────────────────────
// Consumidor THIN de `defineHoldSuite('authorize', { cases: ['personalHappyHoldOn'] })`. La
// factory resuelve el TC ID de matriz (`registry.holdTcIds`), la annotation `tms` (hoy `null`
// → SIN annotation, gap visible; no inventar keys), el gate `isConfigured()`, los datos del
// actor desde `journeyDefaultsFor('authorize')` y el journey de 13 pasos. Comportamiento y
// oráculo IDÉNTICOS a la versión previa: mismo intent `HAPPY_NO_AUTH`, mismo actor
// (cliente = pasajero = app pax), mismos origen/destino y mismo cleanup del motor.
//
// SIN CONFIRMAR EN VIVO: el ambiente `apps-test` está CAÍDO — la migración se verificó sólo de
// forma estática (tsc + eslint + `playwright test --list`).
import { defineHoldSuite } from '@features/gateway-pg/specs/_parametrized/factories/hold.factory';

// Pickup dentro de la geocerca (~500 m) del telefono driver fisico: sin esto el viaje se crea
// pero NO le llega al conductor y no puede finalizarse desde la App Driver. Mismo valor y misma
// razon que el DRIVER_E2E_PICKUP de la factory de cargo a bordo. No toca el default global.
const DRIVER_E2E_PICKUP = 'Ciudad de la Paz 2238, Buenos Aires, Argentina';

defineHoldSuite('authorize', {
	cases: ['personalHappyHoldOn'],
	origin: DRIVER_E2E_PICKUP,
	suiteSuffix: 'usuario personal · Hold ON'
});
