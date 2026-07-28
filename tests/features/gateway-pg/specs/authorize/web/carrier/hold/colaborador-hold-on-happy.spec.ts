// Ola A — Authorize.Net · Carrier · COLABORADOR DE CONTRACTOR · Hold ON · Visa APPROVED
//
// TC: TS-AUTHORIZE-TC1051 (docs/gateway-pg/authorize/matriz_cases.md §3.1)
//   Título matriz: "Validar vincular tarjeta y Alta de Viaje desde carrier para usuario
//   colaborador con tarjeta preautorizada exitosa Vincular tarjeta nueva (seed) Hold ON"
//   Card: AUTHORIZE_CARDS.SUCCESS · Card flow: new (seed) · Hold: ON
//
// Varía respecto de TC1011 (usuario personal / app pax) UNA sola dimensión: el TIPO DE ACTOR.
// Representa los 5 casos de §3.1 (TC1051-TC1055).
//
// EVIDENCIA DE REFERENCIA: `tests/test-4.spec.ts` — grabación validada en PASS por QA
// (2026-07-27), con el pax SIN tarjetas registradas (card flow "new (seed)" de la matriz).
// Cliente "fast car (+12545555555)" + pasajero "smith, Emanuel (+54124048846)"; la grilla muestra
// la celda "Fast Car (pax) smith, Emanuel". Usó el titular 'Tester Qa PruebaDos'; el helper
// genera uno único por corrida.
//
// PARTICULARIDAD DEL COLABORADOR DE CONTRACTOR:
//   - Cliente y pasajero DIFIEREN: el cliente es la empresa contractor ('fast car') y el
//     pasajero es el colaborador ('smith, Emanuel'). El helper sí selecciona el pasajero.
//   - `PASSENGERS.colaborador` es el colaborador CON tarjeta activa. No usar
//     `colaboradorSinTarjeta` ('Nayla Smith') en tests de hold — no tiene tarjeta vinculada.
//   - El nombre en el portal viene en formato "apellido, nombre"; `matchesSearchText` es
//     token-based, así que matchea sin importar el orden.
//
// ORÁCULO: la COLUMNA de gestión de viajes. "Por asignar" = PASS. "En conflicto" con datos
// VÁLIDOS = FAIL (el hold no se pudo hacer) → escalar a dev.
//
// PRECONDICIONES (declaradas, no gestionadas por el spec):
//   1. Authorize.Net VINCULADA en el Magiis App Store del carrier 1521.
//   2. Hold habilitado en preferencias operativas (default del carrier).
//
// ── MIGRADO A LA FACTORY HOLD (S6) ──────────────────────────────────────────────────────────
// Consumidor THIN de `defineHoldSuite('authorize', { cases: ['colaboradorHappyNewHoldOn'] })`.
// La factory resuelve los datos del actor desde `journeyDefaultsFor('authorize')`
// (`contractorClient` = 'fast car', `contractorPassenger` = colaborador CON tarjeta activa) —
// los MISMOS valores que pasaba este spec a mano. El motor sigue seleccionando el pasajero
// porque cliente y pasajero DIFIEREN, y `expectInGrid` sigue cayendo en su default
// (`passenger`), igual que antes.
//
// SIN CONFIRMAR EN VIVO: el ambiente `apps-test` está CAÍDO — la migración se verificó sólo de
// forma estática (tsc + eslint + `playwright test --list`).
import { defineHoldSuite } from '@features/gateway-pg/specs/_parametrized/factories/hold.factory';

defineHoldSuite('authorize', {
	cases: ['colaboradorHappyNewHoldOn'],
	suiteSuffix: 'colaborador de contractor · tarjeta nueva · Hold ON'
});
