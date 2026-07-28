// Ola A — Authorize.Net · Carrier · Hold · RESTO de la taxonomía (los 9 casos que no tienen
// spec dedicado). Consumidor THIN de la factory `_parametrized/factories/hold.factory.ts`.
//
// Los 5 casos con historia de corrida propia viven en sus archivos dedicados (cada uno con su
// evidencia y estado live en el docblock) y NO se repiten acá:
//   · personalHappyHoldOn       → personal-hold-on-happy.spec.ts        (TS-AUTHORIZE-TC1011)
//   · personalDeclineHoldOn     → personal-hold-decline-generic.spec.ts (TS-AUTHORIZE-TC1016)
//   · personalAvsNoMatch        → personal-hold-zip-mismatch.spec.ts    (TS-AUTHORIZE-TC1031)
//   · colaboradorHappyNewHoldOn → colaborador-hold-on-happy.spec.ts     (TS-AUTHORIZE-TC1051)
//   · empresaHappyNewHoldOn     → empresa-hold-on-happy.spec.ts         (TS-AUTHORIZE-TC1061)
//
// ── COBERTURA DE ESTE ARCHIVO (matriz docs/gateway-pg/authorize/matriz_cases.md) ────────────
// | TS-ID                | Caso de la taxonomía            | Matriz    | Estado en el runner |
// | -------------------- | ------------------------------- | --------- | ------------------- |
// | TS-AUTHORIZE-TC1065  | empresaDecline                  | §4.2      | EJECUTABLE          |
// | TS-AUTHORIZE-TC1012  | personalHappyHoldOff            | §2.1      | fixme (Hold OFF)    |
// | TS-AUTHORIZE-TC1017  | personalDeclineHoldOff          | §2.2      | fixme (Hold OFF + oráculo no verificado) |
// | TS-AUTHORIZE-TC1053  | colaboradorHappyExistingHoldOn  | §3.1      | fixme (tarjeta existente) |
// | TS-AUTHORIZE-TC1054  | colaboradorHappyNewHoldOff      | §3.1      | fixme (Hold OFF)    |
// | TS-AUTHORIZE-TC1055  | colaboradorHappyExistingHoldOff | §3.1      | fixme (tarjeta existente + Hold OFF) |
// | TS-AUTHORIZE-TC1062  | empresaHappyExistingHoldOn      | §4.1      | fixme (tarjeta existente) |
// | TS-AUTHORIZE-TC1063  | empresaHappyNewHoldOff          | §4.1      | fixme (Hold OFF)    |
// | TS-AUTHORIZE-TC1064  | empresaHappyExistingHoldOff     | §4.1      | fixme (tarjeta existente + Hold OFF) |
//
// ── POR QUÉ 8 DE LOS 9 SON `fixme` Y NO TESTS VERDES ────────────────────────────────────────
// El motor `runStepwiseHoldJourney` cubre UNA combinación: tarjeta NUEVA con el toggle de hold
// tal como esté en el carrier (precondición declarada, no gestionada). Generar los otros casos
// como tests ejecutables acreditaría el TC equivocado:
//   · Hold OFF          — el motor no fija ni asevera el toggle, así que correría contra el
//     default Hold ON del carrier 1521 y un TC "Hold OFF" pasaría ejecutando Hold ON. La
//     capacidad existe sin cablear (`setHoldViaApi` / `readHoldEnabled` en
//     `helpers/parameters-api.ts`), pero apagar el hold MUTA el carrier COMPARTIDO → necesita
//     guard destructivo + restore antes de habilitarse.
//   · tarjeta existente — los pasos 2 y 8 del motor BORRAN la tarjeta guardada (precondición
//     BL-050) y siempre ejercitan el alta de tarjeta nueva. El camino de tarjeta guardada ya
//     está modelado en `CarrierHoldSteps.runHoldScenario` (cardFlow / preferSavedCard).
//   · TC1017 suma un tercer motivo: el desenlace de un decline con Hold OFF está declarado NO
//     VERIFICADO en `JourneyOutcome.card-rejected` — sin oráculo confirmado no hay assertion
//     honesta que escribir.
// Un `fixme` mantiene el caso VISIBLE y trazable por su TC ID sin reportar un PASS que no
// corresponde; su cuerpo lanza a propósito, así que flipearlo a `test` sin cablear la
// capacidad falla en rojo.
//
// PENDIENTE DE CONFIRMAR EN VIVO: ambiente `apps-test` CAÍDO. TC1065 (el único ejecutable de
// este archivo) NUNCA se corrió — reusa el mismo actor de TC1061 (empresa individuo, que sí
// tiene grabación en PASS) con el intent de TC1016 (decline, cuyo oráculo `card-rejected` está
// verificado en Stripe y confirmado por el líder de QA para Authorize), pero la combinación
// empresa + decline no se observó todavía.
//
// PRECONDICIONES (declaradas, no gestionadas por los specs):
//   1. Authorize.Net VINCULADA en el Magiis App Store del carrier 1521.
//   2. Hold habilitado en preferencias operativas (default del carrier).
import { defineHoldSuite } from '@features/gateway-pg/specs/_parametrized/factories/hold.factory';

defineHoldSuite('authorize', {
	suiteSuffix: 'resto de la taxonomía',
	cases: [
		// Ejecutable con el motor actual.
		'empresaDecline',
		// Hold OFF — toggle no gestionado por el motor.
		'personalHappyHoldOff',
		'personalDeclineHoldOff',
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
