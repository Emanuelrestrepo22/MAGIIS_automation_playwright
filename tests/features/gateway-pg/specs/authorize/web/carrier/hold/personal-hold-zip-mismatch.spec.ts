// Ola A · UNHAPPY U2 — Authorize.Net · Carrier · usuario PERSONAL / APP PAX · Hold ON · AVS ZIP no match
//
// TC: TS-AUTHORIZE-TC1031 (docs/gateway-pg/authorize/matriz_cases.md §2.4, línea 105)
//   Título matriz: "Validar Alta de Viaje desde carrier para usuario personal con AVS no match
//   (ZIP 46205) Hold ON"
//   Card: AUTHORIZE_CARDS.AVS_NO_MATCH (Visa 4111…1111 + CVV 900 + ZIP 46205) · Hold: ON
//   Outcome matriz (original): `avsResultCode = "N"` (Address & ZIP no match)
//
// ── DE EXPLORATORIO A VERIFICABLE — política de cuenta USA 2026-07-28 ────────────────────────
// La matriz clasificaba este caso como EXPLORATORIO: *"TODO matriz: documentar el comportamiento
// MAGIIS esperado para cada AVS code… Pendiente confirmación con líder."* Un caso sin resultado
// esperado no puede fallar, así que no aportaba señal de regresión.
//
// Quedó VERIFICABLE cuando el líder de QA configuró la política de la cuenta sandbox Authorize
// (2026-07-28) aplicando la regla de negocio de USA para validación de tarjetas — *sin match de
// ZIP = falla*: Fraud Filters → Enhanced AVS → `N (No Match) = Decline`.
//
// El expected NO es el código AVS: es el efecto en MAGIIS. El `avsResultCode` es un artefacto del
// proveedor y su oráculo vive en los specs de contrato API de Authorize; acá se asevera el
// comportamiento del sistema, que es el mismo para toda pasarela cuya cuenta tenga la regla
// equivalente (ver `CardIntent.DECLINE_ZIP_MISMATCH` y `helpers/journey-outcome.ts`).
//
// ── POR QUÉ ESTE CASO VA ANTES QUE TC1016 ───────────────────────────────────────────────────
// Los dos son declines, pero por mecanismos distintos y con dependencias de config distintas:
//   · TC1031 (este) — el rechazo lo produce el **filtro AVS de la cuenta**, que está demostrado
//     ACTIVO: el dashboard del sandbox mostró 4 transacciones del 2026-07-28 con AFDS trigger
//     "Enhanced AVS Handling Filter" (hold de vinculación de $10, VISA-1111).
//   · TC1016 — el rechazo lo produce el **magic ZIP 46282** del sandbox, que además requiere que
//     la cuenta esté en Live Mode (en Test Mode las transacciones no se procesan de verdad y el
//     trigger no aplica). Verificado en vivo: 46282 aprobó.
// Se ejecuta primero el que depende de menos config sin verificar.
//
// ── ORÁCULO (por qué no se debilita) ────────────────────────────────────────────────────────
// El caso pasa sólo si se cumplen las TRES cosas:
//   1. El mensaje de rechazo de la pasarela está PRESENTE (no basta con que falte el de éxito: un
//      ambiente caído también hace faltar el de éxito — ver `expectNativeCardRejected`).
//   2. "Seleccionar Vehículo" sigue BLOQUEADO después del rechazo.
//   3. NO hubo `POST /travels` con id.
// Si en cambio la tarjeta se vincula y el viaje se crea, el test falla — y el fallo distingue las
// dos causas posibles: la fila `N` volvió a "hold for review"/Allow (config), o MAGIIS ignora el
// decline (defecto de producto).
//
// PRECONDICIONES (declaradas, no gestionadas por el spec):
//   1. Authorize.Net VINCULADA en el Magiis App Store del carrier 1521.
//   2. Hold HABILITADO en preferencias operativas (default del carrier). ⚠️ Con hold en OFF el
//      desenlace esperado cambia — ver la nota de `JourneyOutcome.card-rejected`.
//   3. Enhanced AVS con `N = Decline` **guardado** en la cuenta sandbox.
//
// ── MIGRADO A LA FACTORY HOLD (S6) ──────────────────────────────────────────────────────────
// Consumidor THIN de `defineHoldSuite('authorize', { cases: ['personalAvsNoMatch'] })`. Único
// cambio respecto de TC1011 sigue siendo el ZIP, vía el intent `DECLINE_ZIP_MISMATCH`; el
// desenlace se deriva de `OUTCOME_BY_INTENT` y las TRES condiciones del oráculo las asevera el
// motor `runStepwiseHoldJourney`, sin cambios.
//
// El caso NO se genera para pasarelas que no expongan `DECLINE_ZIP_MISMATCH`: eBizCharge y
// Mercado Pago lo tienen sin mapear en `SUPPORTED_INTENTS_BY_GATEWAY`, así que la factory lo
// filtra en tiempo de definición en vez de dejar que `resolveCard` rompa la suite.
//
// SIN CONFIRMAR EN VIVO: el ambiente `apps-test` está CAÍDO — la migración se verificó sólo de
// forma estática (tsc + eslint + `playwright test --list`).
import { defineHoldSuite } from '@features/gateway-pg/specs/_parametrized/factories/hold.factory';

defineHoldSuite('authorize', {
	cases: ['personalAvsNoMatch'],
	suiteSuffix: 'usuario personal · ZIP no match · Hold ON'
});
