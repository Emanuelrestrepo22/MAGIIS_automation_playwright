// eBizCharge · Carrier · Hold (alta de viaje con tarjeta preautorizada) — consumidor THIN de
// la factory `_parametrized/factories/hold.factory.ts`.
//
// Derivación Fase 4: la matriz eBiz (docs/gateway-pg/ebizcharge/matriz_cases.md) define 9 filas
// que mapean 1:1 a la taxonomía canónica `GatewayHoldCase` (ver `data/xray-keys.ts` →
// `ebizcharge.holdTcIds`). Este archivo genera exactamente esas 9 — ni una más: los casos de la
// taxonomía cuyo `holdTcIds` es `null` en eBiz (personal Hold ON, declines por tipo de cliente,
// AVS) NO se piden, porque la matriz eBiz no los modela con esos ejes.
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
// Los 9 casos de la matriz eBiz son EJECUTABLES: los dos ejes que faltaban están cableados en el
// motor (`holdMode` / `cardFlow`) y no son propios de eBiz. Dos consecuencias operativas:
//   · los 5 casos "destructivo" apagan la pre-autorización del carrier COMPARTIDO y la restauran
//     en el `finally`, así que exigen `GATEWAY_ALLOW_DESTRUCTIVE_SWITCH=true` y skipean limpio
//     sin él — correr SOLO en ventana exclusiva;
//   · los 4 casos de tarjeta existente SKIPEAN si el pasajero no la tiene ya vinculada: la deja
//     el caso seed TC1058 / TC1067, así que la suite corre en el orden serial de la matriz.
// Detalle completo en el docblock de `hold.factory.ts`.
//
// ── GATE DE CREDENCIALES (comportamiento esperado hoy: SKIP LIMPIO) ─────────────────────────
// La factory aplica `test.skip(!adapter.isConfigured(), …)` a nivel describe, y el adapter eBiz
// exige `EBIZ_MERCHANT_USER` + `EBIZ_MERCHANT_PASSWORD` + `EBIZ_SECURITY_KEY`. Esas vars NO
// están en `.env.test`, así que la suite entera skipea limpio — es el resultado correcto y
// esperado, no un fallo.
//
// ── SIN CONFIRMAR EN VIVO (ambiente `apps-test` CAÍDO — NADA de esto se ejecutó) ────────────
//   1. `adapter.nativeExtraField` está SIN definir para eBiz: no se confirmó si el form nativo
//      Angular de eBiz pide un 5° campo (Authorize pide ZIP, Mercado Pago documento). Si lo
//      pide, `NativeAngularCardForm` lo dejará vacío y el paso 9 fallará por el fill.
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
//   5. Ningún caso HOLD de eBiz tiene issue Xray (`registry.hold` = 14× `null`), así que ningún
//      test emite annotation `tms`: el gap queda visible como unmapped en el reporter.
import { defineHoldSuite } from '@features/gateway-pg/specs/_parametrized/factories/hold.factory';

defineHoldSuite('ebizcharge', {
	suiteSuffix: 'matriz derivada Fase 4',
	cases: [
		// Casos seed: tarjeta NUEVA con Hold ON. Dejan la tarjeta vinculada que consumen los casos
		// `Existing` de más abajo, así que van primero en el orden serial.
		'colaboradorHappyNewHoldOn',
		'empresaHappyNewHoldOn',
		// Hold OFF — el motor apaga el toggle y lo restaura (gate GATEWAY_ALLOW_DESTRUCTIVE_SWITCH).
		'personalHappyHoldOff',
		'colaboradorHappyNewHoldOff',
		'empresaHappyNewHoldOff',
		// Tarjeta vinculada existente — el motor la selecciona en vez de borrarla.
		'colaboradorHappyExistingHoldOn',
		'empresaHappyExistingHoldOn',
		// Los dos ejes a la vez.
		'colaboradorHappyExistingHoldOff',
		'empresaHappyExistingHoldOff'
	]
});
