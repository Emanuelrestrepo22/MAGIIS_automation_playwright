# [DRAFT — para revisión del QA lead] Veredicto de release — eBizCharge · MG-178

> **Estado: BORRADOR.** Este documento NO es el veredicto en vigor de la fila eBizCharge: es el
> insumo para que el QA lead lo revise, ajuste y emita. Nada de aquí se acredita en Jira/Xray
> hasta esa revisión.

**Fecha:** 2026-07-31 · **Ambiente:** `test` (apps-test) · **Carrier:** 1521 (Remises EEUU) ·
**Pasarela:** eBizCharge (merchant sandbox del equipo) · **ATR:** MG-559 ·
**Rúbrica:** `regression-testing/SKILL.md` §GO/CAUTION/NO-GO (score /9 + vetos duros)

## Veredicto propuesto: 🔴 NO-GO (evaluable)

**El cambio de naturaleza importa más que el color.** En el baseline 2026-07-28 la fila era
⚪ NO-EVALUABLE (0 ejecutados, credenciales vacías). Hoy la fila **produce pass-rate legítimo por
primera vez** — y ese pass-rate, con un Defect Critical de flujo de dinero confirmado por 3 capas,
sostiene un NO-GO por evidencia, no por ausencia.

- **Score: -4/9** (umbral NO-GO: < 4).
- **Vetos duros activos: 2** — pass-rate < 90% (mecánico) y fallos con defecto Critical
  confirmado en el flujo de dinero (veto-equivalente; ver matiz taxonómico en §4).

---

## 1. Resumen ejecutivo

1. La matriz de outcomes de tarjeta (`ebizcharge-card-outcomes.spec.ts`) corrió en vivo por
   primera vez: **3 verdes, 7 rojos, 1 skip por diseño**.
2. **4 rojos** son un **defecto real de integración** (Critical): MAGIIS vincula como válidas
   tarjetas que el PSP **declina** (códigos 10205 Do-not-Honor · 10251 Insufficient-funds ·
   10212 Invalid-transaction · 10262 Restricted-card). Acreditado **por transacción**: cada caso
   trae el `RefNum` de la autorización que MAGIIS mismo disparó al validar, su `ResultCode D` y
   confirmación por `paymentMethodsByPax` de que la tarjeta quedó activa como medio de pago.
   Borrador de Defect: `docs/gateway-pg/reports/DEFECT-ebiz-alta-no-propaga-decline-2026-07-31.md`.
   **Refinamiento 2026-07-31 (bajó de 6 a 4)**: `FRAUD_REJECT` (…2223) el PSP lo **APROBÓ** → el
   rojo es del oráculo, no de la integración; `DECLINE_INVALID_ISSUER` (…2226, `exp 0922`) **no
   llega al PSP** ni persiste → la expiración se valida client-side, gap del modelo del test.
3. El 7º rojo (TC1002, AVS NNN) es una **divergencia pendiente de decisión de negocio** — el PSP
   aprueba, MAGIIS rechaza; puede ser comportamiento deseado (regla ZIP-mismatch USA). El oráculo
   NO se flipeó con una sola observación.
4. En paralelo, **9 casos de alta de viaje en verde** (TS-EBIZ-TC1058/1059/1061/1062/1063/1067/
   1068/1069/1070, viajes 67831..67839) con trifuerza UI/API/DB y auditoría anti-vacuidad limpia
   (6 trampas revisadas): los 4 Hold ON con fila `CARD_HOLDS` `PROVIDER_CODE='EBIZ'` + intent
   real; los 5 Hold OFF sin fila (correcto).
5. Validación exploratoria del **hold-release: PASS en trifuerza** (viaje 67969, $207.93:
   `CARD_HOLDS` `HOLD → RELEASE` · MGW `Approved, remainingBalance 0` → `CANCELLED BY_COLLECTOR`
   · PSP `Voided`). Viaje 67962: release OK en PSP ($10, hold de validación) con observación de
   diseño (sin fila local) — **no es bug por decisión del QA lead**. Barrido de cierre: cero
   retenciones vivas.
6. Cobertura **incompleta**: falta correr la suite CFG (8 casos), la pata DB cleaning (MG-166) y
   la fase driver (MG-161, cobro). Aun si los rojos se arreglaran hoy, la fila no tiene pass-rate
   completo.

---

## 2. Resultados por área

| Área | Ejecutado | Verdes | Rojos | Skips | Evidencia |
|---|---|---:|---:|---:|---|
| Matriz de tarjeta (outcomes) | ✅ Ronda 1 + trifuerza (2026-07-30/31) | 3 (TC1001, TC1003, TC1020) | 7 = **4 defecto** (TC1011/1012/1013/1014) + 1 divergencia AVS (TC1002) + 1 oráculo (TC1031, el PSP aprobó) + 1 gap del modelo (TC1015, no llega al PSP) | 1 (TC1030, sin oráculo verificado) | `ebizcharge/RUN-LOG.md` Ronda 1 + Ronda de trifuerza + `RefNum` por caso |
| Alta de viaje (Hold ON/OFF) | ✅ (2026-07-30/31) | 9 (TS-EBIZ-TC1058/1059/1061/1062/1063/1067/1068/1069/1070) | 0 | 0 | trifuerza viajes 67831..67839, auditoría anti-vacuidad 6/6 |
| Hold-release al cancelar (exploratorio) | ✅ (2026-07-31) | 2 (67969 trifuerza; 67962 con observación de diseño) | 0 | — | `evidence/test/ebizcharge/hold-release/VALIDACION-hold-release-67962-67969.md` + 3 XML crudos del PSP |
| Suite CFG (link/unlink/exclusividad) | ⏳ PENDIENTE | — | — | — | 8 casos; destructiva, requiere aviso previo |
| Pata DB cleaning (MG-166) | ⏳ PENDIENTE | — | — | — | — |
| Fase driver — cobro (MG-161) | ⏳ PENDIENTE | — | — | — | — |

**Pass-rate legítimo (gating):** sobre los 19 casos scripted con veredicto (10 matriz ejecutados
+ 9 alta de viaje; el skip declarado TC1030 se excluye, los rojos-defecto SÍ cuentan como fallos):
**12/19 = 63,2%**. Los 2 PASS exploratorios del hold-release se reportan como evidencia de apoyo,
fuera del pass-rate de gating (no son corridas scripted de suite).

---

## 3. Hallazgos

### Hallazgo 1 — MAGIIS vincula como válidas tarjetas que el PSP declina (Defect · Critical)

- **Aislamiento en 3 capas**: tabla del vendor (triggers confirmados en la cuenta merchant) +
  PSP directo (`runTransaction` SOAP `authonly`: `…2228` → `ResultCode D — Declined`,
  `ErrorCode 10205 "Do not Honor"`, RefNum 3234133983) + UI MAGIIS (la misma tarjeta queda
  **vinculada como método de pago válido**). Reproducido con las 6 tarjetas decline/fraud.
- **Riesgo de negocio**: un pasajero con tarjeta sin fondos viaja igual; el rechazo real aparece
  recién al cobrar, con el servicio ya prestado.
- **Clasificación** (defect-management doctrine): integración eBiz es feature **pre-release** →
  **Defect** (no Bug), severidad **Critical** (flujo de dinero) → Prioridad derivada Highest/High.
  MG es scope Xray-only para QA: el ticket lo abre el usuario/líder en el proyecto DEV.
- **Los 6 casos quedan ROJOS a propósito**: la expectativa de negocio es correcta y el oráculo no
  se debilita. En el ATR van FAILED con el defecto linkeado.

### Hallazgo 2 — MAGIIS rechaza el alta con echo AVS NNN (divergencia, decisión de negocio pendiente)

- El PSP APRUEBA la `…2229` (echo `AvsResultCode NNN`); MAGIIS la rechaza con error genérico.
- Combinado con el Hallazgo 1, la hipótesis (no vinculante) es que **la validación del alta decide
  por el resultado AVS y no por el approve/decline del procesador** — explica ambos hallazgos.
- Puede ser comportamiento DESEADO (regla USA "sin match de ZIP = falla"). Con UNA observación el
  oráculo no se flipea. Pendiente: decisión de negocio → si el rechazo es deseado, TC1002 pasa a
  esperar rechazo con base `live-verified` + regla citada.

### Observación de diseño (no bug, decisión del QA lead) — trazabilidad local de holds de validación

En 67962 lo liberado fue el hold de VALIDACIÓN ($10); nunca se colocó hold de monto de viaje y
`CARD_HOLDS` no tiene fila (forense: IDs 1678→1683 consecutivos — la fila nunca se escribió).
`CARD_HOLDS` registra holds de viaje; queda como observación de diseño de trazabilidad.

---

## 4. Clasificación de cada resultado (taxonomía de `regression-testing`)

Contexto taxonómico: **toda la campaña eBiz es primera corrida** (no hay historia previa), así que
por el árbol de decisión ningún rojo puede ser REGRESSION — el punto de entrada es NEW TEST
FAILURE, que exige verificación manual antes de clasificar.

| Caso(s) | Resultado | Clase | Sustento |
|---|---|---|---|
| TC1001 | ✅ PASS | — (1 ocurrencia FLAKY en 1er run: geocoder "No se encontraron resultados", patrón ENVIRONMENT; verde al re-run) | re-run en aislamiento cumplido (regla R1) |
| TC1003 | ✅ PASS | — (tras fix de TEST: `slowMs` cableado al oráculo — defecto de suite, no de producto) | commit `fix(gateway-pg): [TS-EBIZ-TC1003]…` |
| TC1020 | ✅ PASS | — | — |
| TC1011 / TC1012 / TC1013 / TC1014 | 🔴 FAILED | **NEW TEST FAILURE → defecto genuino de producto (Defect · Critical)** | el PSP declinó ESA transacción: `RefNum` + `ResultCode D` + `ErrorCode` (10205/10251/10212/10262) por caso, y `paymentMethodsByPax` confirma que la tarjeta quedó activa. La cuenta **sí discriminó**; MAGIIS no lo propagó |
| TC1031 (FRAUD_REJECT) | 🚫 NO EJECUTABLE en este ambiente | **ENVIRONMENT** — no cuenta como fallo ni como verde | el PSP **APROBÓ** (`RefNum` 3234213621, `A-Approved`): el Fraud Profiler es configuración de la cuenta merchant y no está activo. Sin consola del sandbox no se puede habilitar → el trigger que la doc promete no existe en esta cuenta. En el ATR va **BLOCKED con motivo**, no FAILED |
| TC1015 (DECLINE_INVALID_ISSUER) | 🔴 FAILED por **gap del modelo del test** | **NEW TEST FAILURE (defecto de suite, no de producto)** | cero transacciones en el PSP + la tarjeta no persiste. Es la única con `exp 0922`: la expiración se valida client-side y no hay rechazo **de pasarela** que assertar. El caso necesita oráculo de validación de formulario (área MG-482) |
| TC1002 | 🔴 FAILED | **NEW TEST FAILURE → divergencia pendiente de decisión de negocio** (no se filea defecto todavía; el oráculo se mantiene) | Hallazgo 2 |
| TC1030 | ⏭ SKIP | **skip declarado por diseño** (sin oráculo verificado) — excluido del pass-rate de gating | RUN-LOG Ronda 1 |
| TS-EBIZ-TC1058/1059/1061/1062/1063/1067/1068/1069/1070 | ✅ PASS ×9 | — (trifuerza + auditoría anti-vacuidad 6/6 limpia) | viajes 67831..67839 |
| Hold-release 67969 | ✅ PASS (exploratorio) | — (trifuerza 3 capas) | `VALIDACION-hold-release-67962-67969.md` |
| Hold-release 67962 | ✅ PASS con observación (exploratorio) | — (observación de diseño, no bug por decisión del QA lead) | ídem |
| CFG (8) · MG-166 DB cleaning · MG-161 fase driver | ⏳ PENDIENTE | sin corrida — no computan en el pass-rate ni en el score; se declaran como hueco de cobertura | — |

**Matiz taxonómico que el lead debe validar:** los 4 rojos del defecto NO son REGRESSION en sentido
estricto (feature pre-release, nunca funcionó, sin historia de verdes). Pero para efectos de la
rúbrica se tratan como **fallos con defecto confirmado de severidad Critical** — la lectura contraria
(contarlos como "0 regressions → +3") sería gaming del score con un Defect Critical de dinero sobre
la mesa.

**La hipótesis de "configuración de la cuenta sandbox" — dónde aplica y dónde no.** Planteada por el
QA lead: las tarjetas que deberían rechazar y sin embargo se vinculan y permiten pagar podrían
comportarse así por cómo está configurada la cuenta merchant, y sin acceso a la consola no se puede
cambiar para que el servidor de eBiz responda distinto. La verificación por transacción permite
separar los dos casos:

- **Aplica de lleno a TC1031.** El PSP contestó `A-Approved`: la cuenta **no discriminó** esa tarjeta.
  El Fraud Profiler es configuración de cuenta y no está activo. Sin consola no es habilitable → el
  caso **no es ejecutable acá** y se declara ENVIRONMENT/BLOCKED. No es defecto de MAGIIS ni de la
  suite.
- **No aplica a los 4 del defecto.** En esos, la cuenta **sí discriminó**: la respuesta trae
  `ResultCode D — Declined` con su `ErrorCode` (10205/10251/10212/10262) sobre la transacción que
  MAGIIS mismo disparó. El servidor de eBiz **ya responde el rechazo**; lo que falta es que el alta
  lo lea. Cambiar la configuración de la cuenta no alteraría ese dato, porque el dato ya viene
  correcto — y es la misma respuesta HTTP donde viene el `AvsResultCode` que sí se está mirando
  (ver la hipótesis técnica del borrador de Defect).

---

## 5. Rúbrica puntuada (score /9)

| Factor | Valor hoy | Aporte |
|---|---|---|
| Pass Rate | **12/19 = 63,2%** (gating; skips declarados excluidos, rojos-defecto incluidos) | **-2** (< 90%) |
| Regressions | 0 REGRESSION taxonómico, pero **6 fallos con Defect Critical confirmado** ocupan la fila como "Any High/Critical" (ver matiz §4) | **-3** |
| Critical tests | **no computable** — el tag `@critical` no está verificado en la suite eBiz; por la tabla de severidad de la skill los 6 fallos son CRITICAL (payment = core journey), pero no se inventa el tag | **0** (declarado, no puntuado) |
| Flaky tests | 1 (TC1001, 1er run, resuelto al re-run) ≤ 3 | **+1** |
| **Total** | | **-4 / 9** |

**Umbral:** score < 4 → **NO-GO**.

### Vetos duros (se disparan solos, independientes del score)

| Veto | ¿Activo? | Sustento |
|---|---|---|
| Pass rate < 90% | 🔴 **SÍ** — 63,2% | mecánico, indiscutible |
| REGRESSION High/Critical | 🔴 **SÍ (veto-equivalente)** — taxonómicamente es NEW TEST → Defect Critical (pre-release, sin historia), pero un defecto Critical de dinero confirmado por 3 capas no admite auto-GO bajo ninguna lectura de la rúbrica | Hallazgo 1 + borrador de Defect |
| Any `@critical` test fails | ⚠️ **no verificable** — el tag no está confirmado en la suite eBiz; se declara en vez de asumirse | — |

---

## 6. Lo que sí está acreditado

| Evidencia | Alcance |
|---|---|
| 9 verdes de alta de viaje con trifuerza (Hold ON: fila `CARD_HOLDS` `PROVIDER_CODE='EBIZ'` + intent real; Hold OFF: sin fila) | El flujo alta + colocación de hold funciona end-to-end, con auditoría anti-vacuidad limpia (6 trampas revisadas) |
| Hold-release 67969 PASS en 3 capas (`HOLD→RELEASE` · MGW `CANCELLED BY_COLLECTOR` · PSP `Voided`, mismo intent 3234201165 punta a punta) | La devolución del hold al cancelar viaje programado funciona; cero retenciones vivas al cierre |
| Probes SOAP directos al PSP (`runTransaction`, `GetTransactionDetails`, `SearchTransactions`) | Capacidad nueva de la campaña: la capa PSP es observable sin dashboard; `RefNum` PSP == `intentId` MGW == `CARD_HOLDS.INTENT_ID` |
| 3 verdes de matriz (TC1001/TC1003/TC1020) | El happy path del alta con eBiz aprueba y crea viaje |
| Trazabilidad Xray reparada: MG-559 (33 Tests) ahora recibe MG-141 (link válido), MG-143 (exclusividad), MG-165 (modal desvinculación), MG-148 (alta tarjeta, seed TC1058 verde); 7 keys cruzadas corregidas (commit `9f5d9c1`) | La fila deja de ser "0 anclas estructurales" (baseline §4, punto 4). Un Test nuevo crítico de hold-release está en creación y pase a "listo para release" en paralelo |

---

## 7. Qué falta para mover el veredicto de la fila

| # | Paso | Owner | Desbloquea |
|---|---|---|---|
| **1** | Filear el **Defect Critical** (borrador listo) en el proyecto DEV que corresponda y obtener el fix: el alta debe propagar el decline del PSP | Usuario / QA lead (MG es scope Xray-only) | El único bloqueo de calidad de la fila; sin fix + retest, NO-GO no se mueve |
| **2** | **Decisión de negocio del Hallazgo 2** (¿el alta debe rechazar AVS NNN?) | Negocio / QA lead | TC1002: o pasa a rechazo esperado `live-verified` (verde) o se confirma segundo defecto |
| **3** | Completar cobertura pendiente: **CFG (8, destructiva — avisar antes)** + **MG-166 DB cleaning** + **MG-161 fase driver (cobro)** | QA | Pass-rate completo de la fila; hoy es parcial |
| 4 | Acreditar en **MG-559** con evidencia adjunta por run: verdes PASSED + evidencia; los 6 del Hallazgo 1 FAILED + defecto linkeado | QA | Gate DONE (puntos 1-3) y que el veredicto sea auditable en el TMS |
| 5 | Restaurar la pasarela default al cerrar (punto 5 del Gate DONE, RUNBOOK) | QA | Que la corrida no contamine mediciones de otras pasarelas |
| 6 | Re-emitir este veredicto con los números completos | QA lead | La decisión |

---

## 8. Impacto en el GO/NO-GO release-level

**El release sigue 🔴 NO-GO y esta fila no mueve ninguno de los 4 vetos existentes** (baseline
`gonogo-pasarelas-2026-07-28.md` §10 — son de código y proceso, no de cobertura):

1. **AC9 idempotencia** (CRITICAL) — sin deduplicación en la ruta de cobro.
2. **AC13 enum `MGWTransactionStatus` desincronizado**.
3. **AC6 abandono/timeout de 3DS**.
4. **`develop` no es prod**.

Lo que SÍ cambia con esta fila:

- **eBizCharge pasa de ⚪ NO-EVALUABLE → 🔴 NO-GO evaluable**: primera fila del eje PSP con
  pass-rate legítimo y rúbrica aplicada (el baseline §8 anticipaba exactamente este recómputo).
- **Se agrega un candidato a 5º veto de release**: el Defect Critical del alta (Hallazgo 1) es un
  defecto de producto de flujo de dinero dentro del alcance del release de pasarelas — a
  confirmar como veto formal cuando el lead lo filee en el proyecto DEV. A diferencia de los 4
  vetos vigentes, este nació de ejecución de tests, no de análisis de código.
- La razón (c) del veredicto release-wide ("0 ejecutados en el eje por pasarela") queda
  parcialmente levantada para esta fila: hay ejecución real con evidencia citable.

---

## 9. Higiene y método

- **Ningún oráculo se debilitó para forzar verdes**: los 6 rojos del Hallazgo 1 quedan rojos a
  propósito; el skip TC1030 está declarado con causa (sin oráculo verificado).
- **Auditoría anti-vacuidad**: 6 trampas revisadas y limpias en los 9 verdes de alta de viaje
  (checklist heredado de la campaña Authorize, §Nota metodológica del veredicto hermano).
- **Barrido de cierre**: cero retenciones vivas en la ventana del merchant tras la validación de
  hold-release.
- **Reloj PSP**: corre 7 h detrás del reloj de la DB — toda correlación temporal de evidencia lo
  descuenta.
- **Datos NO verificados en este borrador** (declarados, no asumidos): presencia del tag
  `@critical` en la suite eBiz; keys Xray de los Tests de hold/cargo pendientes de creación;
  resultado del pase a "listo para release" del Test nuevo de hold-release (en curso al corte).

---

*Borrador generado 2026-07-31 sobre: `ebizcharge/RUN-LOG.md` (Ronda 1 + validación hold-release),
`DEFECT-ebiz-alta-no-propaga-decline-2026-07-31.md`, `VALIDACION-hold-release-67962-67969.md`,
baseline `.context/reports/gonogo-pasarelas-2026-07-28.md`, rúbrica `regression-testing/SKILL.md`.
Formato espejado de `VEREDICTO-authorize-MG178.md`. Pendiente de revisión del QA lead.*
