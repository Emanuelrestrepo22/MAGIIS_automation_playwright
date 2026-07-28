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
// | TS-EBIZ-TC1063  | personalHappyHoldOff            | TS-STRIPE-TC1050  | fixme (Hold OFF)    |
// | TS-EBIZ-TC1059  | colaboradorHappyNewHoldOff      | TS-STRIPE-TC1034  | fixme (Hold OFF)    |
// | TS-EBIZ-TC1068  | empresaHappyNewHoldOff          | TS-STRIPE-TC1066  | fixme (Hold OFF)    |
// | TS-EBIZ-TC1062  | colaboradorHappyExistingHoldOn  | TS-STRIPE-TC1041  | fixme (tarjeta existente) |
// | TS-EBIZ-TC1069  | empresaHappyExistingHoldOn      | TS-STRIPE-TC1067  | fixme (tarjeta existente) |
// | TS-EBIZ-TC1061  | colaboradorHappyExistingHoldOff | TS-STRIPE-TC1036  | fixme (tarjeta existente + Hold OFF) |
// | TS-EBIZ-TC1070  | empresaHappyExistingHoldOff     | TS-STRIPE-TC1068  | fixme (tarjeta existente + Hold OFF) |
//
// Los motivos de `fixme` son los MISMOS que en Authorize y no son propios de eBiz: el motor
// `runStepwiseHoldJourney` no gestiona el toggle de hold y siempre ejercita el alta de tarjeta
// NUEVA (borra la guardada en los pasos 2 y 8, precondición BL-050). Detalle completo en el
// docblock de `hold.factory.ts`.
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
		// Ejecutables con el motor actual (tarjeta nueva, sin exigir el toggle en OFF).
		'colaboradorHappyNewHoldOn',
		'empresaHappyNewHoldOn',
		// Hold OFF — toggle no gestionado por el motor.
		'personalHappyHoldOff',
		'colaboradorHappyNewHoldOff',
		'empresaHappyNewHoldOff',
		// Tarjeta vinculada existente — el motor fuerza el alta de tarjeta nueva.
		'colaboradorHappyExistingHoldOn',
		'empresaHappyExistingHoldOn',
		// Ambos motivos a la vez.
		'colaboradorHappyExistingHoldOff',
		'empresaHappyExistingHoldOff'
	]
});
