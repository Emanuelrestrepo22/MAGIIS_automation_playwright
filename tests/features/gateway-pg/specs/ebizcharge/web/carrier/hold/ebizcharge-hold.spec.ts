// eBizCharge · Carrier · Hold (alta de viaje con tarjeta preautorizada) — consumidor THIN de
// la factory `_parametrized/factories/hold.factory.ts`.
//
// Derivación Fase 4: la matriz eBiz (docs/gateway-pg/ebizcharge/matriz_cases.md) definía 9 filas
// derivadas que mapean 1:1 a la taxonomía canónica `GatewayHoldCase` (ver `data/xray-keys.ts` →
// `ebizcharge.holdTcIds`). El 2026-07-30 se sumaron 7 filas más (TC1256..TC1262), creadas a partir
// del E2E exploratorio #2 — ver la tanda al final de la tabla. Total: **16 casos**.
//
// Los casos de la taxonomía cuyo `holdTcIds` sigue `null` en eBiz (declines por tipo de cliente, AVS)
// NO se piden, porque la matriz eBiz no los modela con esos ejes: sus declines son filas por TRIGGER
// de tarjeta y sus números AVS son de referencia (todos devuelven approved).
//
// ── COBERTURA DE ESTE ARCHIVO ───────────────────────────────────────────────────────────────
// | TS-ID           | Caso de la taxonomía            | Ref Stripe        | Estado en el runner |
// | --------------- | ------------------------------- | ----------------- | ------------------- |
// | TS-EBIZ-TC1058  | colaboradorHappyNewHoldOn       | TS-STRIPE-TC1033  | EJECUTABLE          |
// | TS-EBIZ-TC1067  | empresaHappyNewHoldOn           | TS-STRIPE-TC1065  | EJECUTABLE          |
// | TS-EBIZ-TC1063  | personalHappyHoldOff            | TS-STRIPE-TC1050  | EJECUTABLE (destructivo) |
// | TS-EBIZ-TC1059  | colaboradorHappyNewHoldOff      | TS-STRIPE-TC1034  | EJECUTABLE (destructivo) |
// | TS-EBIZ-TC1068  | empresaHappyNewHoldOff          | TS-STRIPE-TC1066  | EJECUTABLE (destructivo) |
// | TS-EBIZ-TC1062  | colaboradorHappyExistingHoldOn  | TS-STRIPE-TC1041  | EJECUTABLE          |
// | TS-EBIZ-TC1069  | empresaHappyExistingHoldOn      | TS-STRIPE-TC1067  | EJECUTABLE          |
// | TS-EBIZ-TC1061  | colaboradorHappyExistingHoldOff | TS-STRIPE-TC1036  | EJECUTABLE (destructivo) |
// | TS-EBIZ-TC1070  | empresaHappyExistingHoldOff     | TS-STRIPE-TC1068  | EJECUTABLE (destructivo) |
//
// ── TANDA 2026-07-30: 7 casos agregados desde el E2E exploratorio #2 ────────────────────────
// Origen: `recorded/ebizcharge-e2e-3actores-hold-onoff-delete-recard-programado.recorded.ts`,
// ejecutado a mano por el líder de QA. Ejercitó ejes que la matriz NO modelaba, así que se
// crearon los TC (TC1256..TC1262) y recién después se pidieron acá.
//
// | TS-ID           | Caso de la taxonomía            | Eje nuevo                    | Estado |
// | --------------- | ------------------------------- | ---------------------------- | ------ |
// | TS-EBIZ-TC1256  | personalHappyHoldOn             | personal + Hold ON           | EJECUTABLE |
// | TS-EBIZ-TC1257  | personalHappyExistingHoldOn     | personal + tarjeta existente | EJECUTABLE |
// | TS-EBIZ-TC1258  | personalHappyExistingHoldOff    | idem + Hold OFF              | EJECUTABLE (destructivo) |
// | TS-EBIZ-TC1259  | empresaReplaceCardHoldOn        | eliminar tarjeta + vincular otra | EJECUTABLE |
// | TS-EBIZ-TC1260  | empresaReplaceCardHoldOff       | idem + Hold OFF              | EJECUTABLE (destructivo) |
// | TS-EBIZ-TC1261  | empresaScheduledManualHoldOn    | viaje PROGRAMADO + asig. manual | requiere GATEWAY_SCHEDULED_PICKUP_TIME |
// | TS-EBIZ-TC1262  | empresaManualAssignHoldOn       | asignación MANUAL (inmediato) | EJECUTABLE |
//
// Dos precondiciones de DATOS propias de esta tanda (skip explícito con el motivo, no fallo):
//   · los dos casos de REEMPLAZO necesitan una segunda tarjeta aprobada declarada para eBiz
//     (`preludeCardFor` → Mastercard 5555444433332226, CVV2 M de `EBIZ_CVV2_REFERENCE`);
//   · el caso PROGRAMADO necesita `GATEWAY_SCHEDULED_PICKUP_TIME` (ej. "12:10 PM"). No tiene
//     default porque las opciones del selector dependen del día y de la grilla del carrier.
//
// El eje "Send Service" NO tiene caso propio a propósito: es el default del motor, así que ya lo
// recorren todas las filas anteriores — un caso más sería duplicado. Ver la nota de §Despacho en
// la matriz.
//
// Los 16 casos son EJECUTABLES: los ejes están todos cableados en el motor (`holdMode`, `cardFlow`,
// `schedule`, `dispatch`, `preludeCard`) y ninguno es propio de eBiz. Tres consecuencias operativas:
//   · los 7 casos "destructivo" apagan la pre-autorización del carrier COMPARTIDO y la restauran
//     en el `finally`, así que exigen `GATEWAY_ALLOW_DESTRUCTIVE_SWITCH=true` y skipean limpio
//     sin él — correr SOLO en ventana exclusiva;
//   · los 5 casos de tarjeta existente SKIPEAN si el pasajero no la tiene ya vinculada: la dejan
//     los casos seed (TC1058 colaborador / TC1067 empresa / TC1256 personal), así que la suite corre
//     en el orden serial declarado abajo;
//   · el caso programado skipea sin `GATEWAY_SCHEDULED_PICKUP_TIME`.
// Detalle completo en el docblock de `hold.factory.ts`.
//
// ── GATE DE CREDENCIALES (comportamiento esperado hoy: SKIP LIMPIO) ─────────────────────────
// La factory aplica `test.skip(!adapter.isConfigured(), …)` a nivel describe, y el adapter eBiz
// exige `EBIZ_MERCHANT_USER` + `EBIZ_MERCHANT_PASSWORD` + `EBIZ_SECURITY_KEY`. Esas vars NO
// están en `.env.test`, así que la suite entera skipea limpio — es el resultado correcto y
// esperado, no un fallo.
//
// ── SIN CONFIRMAR EN VIVO (ambiente `apps-test` CAÍDO — NADA de esto se ejecutó) ────────────
//   1. 🔴 **CONFIRMADO el 2026-07-30 y AHORA ES UN BLOQUEANTE, no una incógnita.** El form nativo de
//      eBiz SÍ pide campos extra: **dirección de facturación + ZIP**. Doble evidencia — las dos
//      grabaciones del E2E (el autocomplete "Enter an address" que deriva el ZIP) y el hallazgo en
//      device de la sesión de app-pax (`EBIZ_BILLING` en la fixture: el control `address` tiene
//      **maxlength=30**; pasarse invalida el FormGroup y deja GUARDAR deshabilitado).
//      `ebizchargeGatewayAdapter` sigue SIN declarar `nativeExtraField`, así que
//      `NativeAngularCardForm` deja esos campos vacíos → el FormGroup queda inválido y "Validar" no
//      habilita. **Ningún caso de esta suite que abra el form puede pasar en vivo hasta que se
//      implemente `nativeExtraField: 'address'`** (RUN-LOG Ronda 1, próxima acción 2). Aplica también
//      a los casos de REEMPLAZO de la tanda 2026-07-30, que abren el form dos veces.
//   2. `adapter.linkSuccessStatuses: [200]` es un SUPUESTO explícito (TODO(live) del adapter).
//      El equivalente de Authorize resultó ser 500/409, así que el supuesto tiene precedente
//      en contra: verificar antes de leer un fallo de link como defecto de producto.
//   3. El oráculo del paso 10 (`validateNativeCard` / `expectNativeCardRejected`) nunca se
//      verificó contra eBiz — sus textos de éxito/rechazo se validaron con Authorize.
//   4. `journeyDefaultsFor('ebizcharge')` apunta HOY a la MISMA referencia que Stripe y
//      Authorize (`BASE_GATEWAY_JOURNEY_DEFAULTS`): carrier 1521 US y sus clientes/pasajeros.
//      No está confirmado que eBiz opere sobre ese carrier ni que esos clientes tengan la
//      pasarela habilitada. Si necesita otro carrier/cliente hay que agregar la entrada eBiz en
//      `JOURNEY_DEFAULTS_BY_GATEWAY` con datos VERIFICADOS — deliberadamente no se inventan acá.
//   5. Ningún caso HOLD de eBiz tiene issue Xray (`registry.hold` = 20× `null`), así que ningún
//      test emite annotation `tms`: el gap queda visible como unmapped en el reporter. El área E del
//      ATP (MG-183) no sirve para acreditarlos: sus 3 Tests son 3DS exitoso (MG-158), 3DS fallido
//      (MG-159) y "PSP que no soporta hold" (MG-160) — y eBiz no tiene 3DS pero SÍ soporta hold.
//   6. Los 7 casos de la tanda 2026-07-30 se ejecutaron A MANO (el E2E exploratorio), NO por este
//      spec. Que estén cableados no significa que la automatización esté verificada en vivo.
import { defineHoldSuite } from '@features/gateway-pg/specs/_parametrized/factories/hold.factory';

defineHoldSuite('ebizcharge', {
	suiteSuffix: 'matriz derivada Fase 4',
	cases: [
		// Casos seed: tarjeta NUEVA con Hold ON. Dejan la tarjeta vinculada que consumen los casos
		// `Existing` de más abajo, así que van primero en el orden serial.
		'colaboradorHappyNewHoldOn',
		'empresaHappyNewHoldOn',
		// Seed del actor PERSONAL — habilitado por TC1256 (ver la tanda 2026-07-30 más abajo). Va acá
		// porque `personalHappyExistingHoldOn/Off` dependen de que deje la tarjeta vinculada.
		'personalHappyHoldOn',
		// ── Ejes nuevos con Hold ON (tanda 2026-07-30) ───────────────────────────────────────────
		'empresaReplaceCardHoldOn',
		'empresaManualAssignHoldOn',
		'empresaScheduledManualHoldOn',
		'personalHappyExistingHoldOn',
		// Hold OFF — el motor apaga el toggle y lo restaura (gate GATEWAY_ALLOW_DESTRUCTIVE_SWITCH).
		'personalHappyHoldOff',
		'colaboradorHappyNewHoldOff',
		'empresaHappyNewHoldOff',
		'empresaReplaceCardHoldOff',
		// Tarjeta vinculada existente — el motor la selecciona en vez de borrarla.
		'colaboradorHappyExistingHoldOn',
		'empresaHappyExistingHoldOn',
		// Los dos ejes a la vez.
		'colaboradorHappyExistingHoldOff',
		'empresaHappyExistingHoldOff',
		'personalHappyExistingHoldOff'
	]
});
