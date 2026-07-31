// Ola A — Authorize.Net · Carrier · usuario EMPRESA INDIVIDUO · Hold ON · Visa APPROVED
//
// TC: TS-AUTHORIZE-TC1061 (docs/gateway-pg/authorize/matriz_cases.md §4.1)
//   Título matriz: "Validar Alta de Viaje desde carrier para usuario empresa individuo con
//   tarjeta preautorizada exitosa Vincular tarjeta nueva Hold ON"
//   Card: AUTHORIZE_CARDS.SUCCESS · Card flow: new · Hold: ON
//
// Varía respecto de TC1011 (usuario personal / app pax) UNA sola dimensión: el TIPO DE CLIENTE.
// Representa los 4 casos de §4.1 (TC1061-TC1064).
//
// EVIDENCIA DE REFERENCIA: `tests/test-6.spec.ts` — grabación validada en PASS por QA
// (2026-07-27). Busca el cliente por "marce" → "Stripe, Marcelle (+9398989887)", el pasajero se
// auto-asigna ("Customer Stripe, Marcelle" en el dropdown) y la grilla muestra la celda
// "Stripe, Marcelle". Usó el titular 'MAGIIS QA TESTTRES'; el helper genera uno único por corrida.
// Ojo: el cliente trae un origen PRE-CARGADO ("3500 Paradise Road, Las Vegas") que la grabación
// reemplaza por Reconquista 661 — si el paso 5 falla, sospechar de eso primero.
//
// PARTICULARIDAD DEL CLIENTE EMPRESA INDIVIDUO (BL-003, confirmado en la suite Stripe):
//   - `client === passenger` — el cliente titular ES el pasajero; NO hay sub-pasajero que
//     elegir y el campo de pasajero queda auto-asignado (el helper no lo toca).
//   - La grilla de gestión muestra al CLIENTE TITULAR en formato "apellido, nombre"
//     (ej. "Stripe, Marcelle"), no a un sub-pasajero. `matchesSearchText` es token-based, así
//     que buscar "Marcelle Stripe" matchea igual sin importar el orden.
//
// ORÁCULO: la COLUMNA de gestión de viajes. "Por asignar" = PASS. "En conflicto" con datos
// VÁLIDOS = FAIL (el hold no se pudo hacer) → escalar a dev.
//
// PRECONDICIONES (declaradas, no gestionadas por el spec):
//   1. Authorize.Net VINCULADA en el Magiis App Store del carrier 1521.
//   2. Hold habilitado en preferencias operativas (default del carrier).
//
// ── MIGRADO A LA FACTORY HOLD (S6) ──────────────────────────────────────────────────────────
// Consumidor THIN de `defineHoldSuite('authorize', { cases: ['empresaHappyNewHoldOn'] })`. La
// factory mapea el actor `empresa` a `client === passenger` (`journeyDefaultsFor.client`), que
// es exactamente lo que pasaba este spec: el motor detecta la igualdad y NO toca el campo de
// pasajero (auto-asignado, BL-003).
//
// SIN CONFIRMAR EN VIVO: el ambiente `apps-test` está CAÍDO — la migración se verificó sólo de
// forma estática (tsc + eslint + `playwright test --list`).
import { defineHoldSuite } from '@features/gateway-pg/specs/_parametrized/factories/hold.factory';

// Pickup dentro de la geocerca (~500 m) del telefono driver fisico: sin esto el viaje se crea
// pero NO le llega al conductor y no puede finalizarse desde la App Driver. Mismo valor y misma
// razon que el DRIVER_E2E_PICKUP de la factory de cargo a bordo. No toca el default global.
const DRIVER_E2E_PICKUP = 'Ciudad de la Paz 2238, Buenos Aires, Argentina';

defineHoldSuite('authorize', {
	cases: ['empresaHappyNewHoldOn'],
	origin: DRIVER_E2E_PICKUP,
	suiteSuffix: 'empresa individuo · tarjeta nueva · Hold ON'
});
