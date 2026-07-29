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
// | TS-AUTHORIZE-TC1012  | personalHappyHoldOff            | §2.1      | EJECUTABLE (destructivo) |
// | TS-AUTHORIZE-TC1017  | personalDeclineHoldOff          | §2.2      | fixme (oráculo decline+HoldOFF no verificado) |
// | TS-AUTHORIZE-TC1053  | colaboradorHappyExistingHoldOn  | §3.1      | EJECUTABLE          |
// | TS-AUTHORIZE-TC1054  | colaboradorHappyNewHoldOff      | §3.1      | EJECUTABLE (destructivo) |
// | TS-AUTHORIZE-TC1055  | colaboradorHappyExistingHoldOff | §3.1      | EJECUTABLE (destructivo) |
// | TS-AUTHORIZE-TC1062  | empresaHappyExistingHoldOn      | §4.1      | EJECUTABLE          |
// | TS-AUTHORIZE-TC1063  | empresaHappyNewHoldOff          | §4.1      | EJECUTABLE (destructivo) |
// | TS-AUTHORIZE-TC1064  | empresaHappyExistingHoldOff     | §4.1      | EJECUTABLE (destructivo) |
//
// ── CÓMO CORREN LOS DOS EJES (`holdMode` / `cardFlow` del motor) ────────────────────────────
//   · Hold OFF (TC1012/1054/1055/1063/1064) — el motor apaga el toggle vía API y lo RESTAURA en
//     el `finally`. Muta el carrier 1521 COMPARTIDO, así que exige
//     `GATEWAY_ALLOW_DESTRUCTIVE_SWITCH=true` y skipea limpio sin él (mismo guard que la suite
//     CFG). Correr SOLO en ventana exclusiva: con el toggle apagado, cualquier spec de hold
//     concurrente fallaría por culpa de estos casos.
//   · Tarjeta existente (TC1053/1055/1062/1064) — el motor SELECCIONA la tarjeta ya vinculada en
//     vez de borrarla y omite el fill + "Validar". Si el pasajero no la tiene, el caso SKIPEA:
//     la vincula el caso seed (TS-AUTHORIZE-TC1051), no éste. Consecuencia práctica: en una
//     corrida limpia hay que ejecutar la suite en el orden serial de la matriz.
//   · Hold ON — el motor ASEVERA (sin escribir) que la pre-autorización está activa, así que un
//     carrier con el toggle apagado ya NO puede acreditar un TC "Hold ON" en verde.
//
// ── POR QUÉ TC1017 SIGUE SIENDO `fixme` ─────────────────────────────────────────────────────
// No es una limitación del motor —sabe apagar el toggle— sino del ORÁCULO: `OUTCOME_BY_INTENT`
// mapea DECLINE_AUTHORIZE a `card-rejected`, y `helpers/journey-outcome.ts` documenta que ese
// desenlace DEPENDE del hold ACTIVO (con hold apagado la vinculación podría no disparar
// transacción y el rechazo se movería al alta del viaje, o no ocurrir). Sin observar una corrida
// real no hay assertion honesta que escribir. El `fixme` mantiene el caso VISIBLE y trazable por
// su TC ID; su cuerpo lanza a propósito, así que flipearlo sin observar el desenlace falla en
// rojo en vez de reportar un PASS que no corresponde.
//
// PENDIENTE DE CONFIRMAR EN VIVO: ambiente `apps-test` CAÍDO. NINGÚN caso de este archivo se
// corrió — ni TC1065 (reusa el actor de TC1061, con grabación en PASS, más el intent de TC1016,
// cuyo oráculo `card-rejected` está verificado en Stripe y confirmado por el líder de QA para
// Authorize, pero la combinación empresa + decline no se observó), ni los 8 casos de los ejes
// nuevos, cuyos supuestos sin observar están listados en el docblock de `hold.factory.ts`.
//
// PRECONDICIONES (declaradas, no gestionadas por los specs):
//   1. Authorize.Net VINCULADA en el Magiis App Store del carrier 1521.
//   2. Hold habilitado en preferencias operativas (default del carrier) — los casos Hold OFF lo
//      apagan y lo devuelven a ese estado al terminar.
//   3. Para los casos de tarjeta existente: el pasajero con la tarjeta de prueba ya vinculada
//      (la deja el caso seed TC1051 / TC1061); sin ella el caso skipea con el motivo.
import { defineHoldSuite } from '@features/gateway-pg/specs/_parametrized/factories/hold.factory';

defineHoldSuite('authorize', {
	suiteSuffix: 'resto de la taxonomía',
	cases: [
		// Ejecutable con el motor actual.
		'empresaDecline',
		// Hold OFF — el motor apaga el toggle y lo restaura (gate GATEWAY_ALLOW_DESTRUCTIVE_SWITCH).
		'personalHappyHoldOff',
		// fixme: el oráculo de decline + Hold OFF no está verificado (ver el docblock).
		'personalDeclineHoldOff',
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
