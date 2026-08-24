> Este archivo sigue el formato del RUN-LOG de Authorize (`docs/gateway-pg/authorize/RUN-LOG.md`):
> una sección por ronda, con precondición verificada, límite de alcance declarado, resultado por
> caso y el corte **acreditado vs declarado**. La premisa KATA es que el `.md` sea la fuente de
> qué se corre y qué se acreditó — la repetición de la acción se apoya en este archivo, no en la
> memoria de la sesión.

# eBizCharge — log de corridas

Entorno: `test` (apps-test) · Carrier **1521** (Remises EEUU) · Pasarela **eBizCharge vinculada**
(cuenta sandbox, vinculada a mano por el líder de QA).
Matriz: `docs/gateway-pg/ebizcharge/matriz_cases.md` · Registry: `tests/features/gateway-pg/data/xray-keys.ts`.

---

# Ronda 1 — E2E manual con grabación (2026-07-30)

**Modo de trabajo**: ejecución MANUAL con Playwright codegen, un flujo por vez, renombrando la
grabación de forma descriptiva y anotando en el archivo qué test cases cubre. La automatización se
desarrolla después, amoldada a las factories existentes.

Grabación: `tests/features/gateway-pg/recorded/ebizcharge-e2e-link-gateway-hold-colaborador-cobro-driver.recorded.ts`

## Precondición verificada

- eBizCharge **vinculada** en el carrier 1521 con la cuenta sandbox. Authorize quedó desvinculada
  en el mismo acto: es la **regla de exclusividad** (una sola pasarela activa por carrier), no un
  bloqueo de backend.
- Los deltas de eBiz que la matriz anticipa se confirmaron en vivo:
  - la **vinculación** exige `zipCode` del carrier (delta que documenta MG-145);
  - el **alta de tarjeta** exige la **dirección (`placeId`)** del pax (delta que documenta MG-151).

## Límite de alcance declarado

- **No hay dashboard de eBizCharge disponible.** Las transacciones se validan sólo por DB
  (`MGW.logs`, vía el MCP "Magiis BD de test") o por CloudWatch. No se puede contrastar contra el
  panel del proveedor.
- Los **23 tests `@ebizcharge`** de la suite **NO se corrieron**: las credenciales `EBIZ_*` no están
  en `.env.test`, así que `ebizchargeGatewayAdapter.isConfigured()` es `false` y la factory los
  skipea a nivel describe. Esta ronda es 100 % manual.

## Resultado por caso

| # | TC de matriz | Descripción | Resultado | Cobertura |
|---|---|---|---|---|
| 1 | `TS-EBIZ-TC1051` | Vincular eBizCharge con credenciales válidas y reflejar estado vinculado | ✅ **PASS** | COMPLETA |
| 2 | `TS-EBIZ-TC1058` | Vincular tarjeta + alta de viaje colaborador + Hold desde carrier + **cobro desde App Driver** | ✅ **PASS** | COMPLETA |
| 3 | `TS-EBIZ-TC1055` | Exclusividad de pasarela activa | 🟡 parcial | Se observó el efecto (las otras PSP en "No Disponible"); NO se intentó vincular otra |
| 4 | `TS-EBIZ-TC1057` | El request de link/unlink retorna 200 | 🟡 parcial | El link tuvo éxito; NO se capturó el status HTTP |

## Evidencia del cobro (tres fuentes)

**1. UI** — el viaje avanzó a "In Progress" y luego "Finalized" tras el flujo del driver.

**2. DB** (`SELECT l.* FROM MGW.logs AS l ORDER BY l.id DESC`) — travel `67815`, customer `9869`,
carrier `1521`:

| id | type | func | monto | timestamp |
|---|---|---|--:|---|
| 184391 | request | `Payment::holdCard` | 180.31 | 13:07:52 |
| 184392 | ebiz | `Ebiz::hold` | ref `3234121359` | 13:07:54 |
| 184393 | request | `Payment::captureCard` | 18.26 | 13:17:17 |
| 184394 | ebiz | `Ebiz::capture` | ref `3234121359` | 13:17:19 |
| 184395 | response | `Payment::captureCard` | `{"result":"OK","transactionStatus":"confirmed"}` | 13:17:19 |

**3. CloudWatch** (`Test-Logs` / `Test-PaymentGateway`, us-east-2) — la fuente más precisa, muestra
el payload y la respuesta cruda de la pasarela:

```
runTransaction.data { runTransactionResult: { resultCode: 'A', result: 'Approved',
                      remainingBalance: 0, refNum: '3234121359' } }
```

### La query de `MGW.logs` es el oráculo GENERAL del front

Práctica del líder de QA (2026-07-30): **cualquier acción del front se valida con esta consulta**,
no sólo el cobro. `MGW.logs` registra request/response de cada operación contra la pasarela, así que
sirve como oráculo transversal — vinculación, alta de tarjeta, hold, capture — y es la única vía
cuando el proveedor no tiene dashboard accesible (el caso de eBizCharge).

```sql
SELECT l.* FROM MGW.logs AS l
ORDER BY l.id DESC
```

Columnas útiles: `type` (request/response/`<gateway>`), `endpoint`, `func` (`Payment::holdCard`,
`Ebiz::capture`, …), `customer`, `carrier`, `driver`, `transactionRef`, `data`, `timestamp`.
El patrón de lectura es por pares: un `request` con el payload, el `<gateway>` con el ref de la
pasarela y el `response` con el resultado.

### Oráculo del cobro eBiz (queda establecido para la automatización)

```
command: 'capture'  ·  resultCode: 'A'  ·  result: 'Approved'  ·  refNum == intentId
```

`MGW.logs` complementa: correlaciona hold↔capture por `transactionRef`. Ninguna de las dos vías es
alcanzable desde Playwright, así que el spec web debe dejar el `intentId`/`travelId` en el
JourneyContext y la validación se hace después.

## Acreditado vs declarado

| Área | Antes de esta ronda | Después de esta ronda |
|---|---|---|
| CFG (vinculación) | declarada, 0 ejecuciones | `TC1051` **acreditado manual** · `TC1055`/`TC1057` parciales |
| Hold colaborador + cobro driver | declarada, 0 ejecuciones | `TC1058` **acreditado manual**, con evidencia en 3 fuentes |
| Los otros 19 TC de las 4 áreas | declarada | sin cambios — sin ejecutar |

## Dónde plasmar la evidencia: los Xray Tests ANÁLOGOS por área

Los Tests con label `ebizcharge` son sólo 3 y ninguno es este happy path (ver más abajo). Pero el
ATP **sí tiene** Tests agnósticos por área, y los deltas de eBiz están documentados **dentro de
cada uno**. Son los que corresponden para plasmar la evidencia de esta ronda:

| Tramo del E2E | Xray Test análogo | `tcid` | Delta eBiz que el propio Test declara |
|---|---|---|---|
| Desvincular la pasarela previa | **MG-166** | `TC-PAY-G-02` | *"aplica también AUTHORIZE/EBIZ"*; delete `@Async` |
| **Vinculación de pasarela de pago** | **MG-141** | `TC-PAY-A-01` | *"la vinculacion exige `zipCode` del carrier"* |
| **Vinculación de tarjeta** | **MG-148** | `TC-PAY-C-01` | *"EBIZ ademas requiere direccion del pax"* |
| **Alta de viaje con hold** | ❌ **NINGUNO** — ver gap abajo | — | — |
| **Finalización desde App Driver (cobro)** | **MG-161** | `TC-PAY-F-01` | — |

### ❌ GAP del ATP: el área E (hold) no tiene caso happy SIN 3DS

El área E (MG-183) tiene exactamente 3 casos y **ninguno aplica a eBizCharge**:

| Key | `tcid` | Caso | Por qué no aplica a eBiz |
|---|---|---|---|
| MG-158 | `TC-PAY-E-01` | el hold se confirma **cuando el 3DS es exitoso** | eBiz **no tiene 3DS** (`requires3ds: false`); usa la tarjeta 3DS de Stripe como dato |
| MG-159 | — | el hold se libera **cuando el 3DS falla** | ídem |
| MG-160 | `TC-PAY-E-03` | el alta cae a `verificationFoundsCard` **cuando la PSP no soporta hold** | eBiz **sí** soporta hold |

⇒ **El hold happy sin 3DS no tiene dónde acreditarse.** No es un problema de eBiz: afecta igual a
**Authorize**, que tampoco tiene 3DS. Es un caso faltante del ATP, no un error de mapeo.

#### El gap es CENTRAL, no marginal (aclaración del líder de QA, 2026-07-30)

**Todos los casos que se están ejecutando son con hold** — este E2E de eBizCharge y también los
records de Authorize (`ebizcharge-e2e-…`, `authorize-hold-on-personal-apppax`,
`authorize-hold-on-colaborador-contractor`, `authorize-hold-on-empresa-individuo`). Confirmado por
evidencia: `MGW.logs` registra `Ebiz::hold` (180.31) antes del `Ebiz::capture`.

Eso reencuadra el gap: no falta *un* caso de borde, falta **EL caso que se ejecuta en todas las
pasarelas sin 3DS**. Consecuencias:

1. **Ninguna** de las corridas de hold de Authorize ni de eBizCharge tiene un Xray Test propio
   donde acreditarse. Todo el eje hold de las dos PSP sin 3DS queda sin destino de acreditación.
2. `MG-158` se está usando como `@atc` del hold en los POMs
   (`expectPassengerInPorAsignar → MG-158`) para acreditar holds que **no son 3DS**. El título de
   MG-158 dice *"cuando el 3DS del hold es exitoso"* y su dato de prueba es la tarjeta 3DS de
   Stripe, así que un PASS ahí con evidencia de eBiz/Authorize afirma algo que no se probó.
3. Prioridad real: **crear el caso del área E "hold happy sin 3DS" es previo** a acreditar
   cualquier ronda de hold de Authorize o eBizCharge. Sin él no hay forma correcta de reportar lo
   ya ejecutado.

Consecuencia práctica: `MG-158` se usa hoy como `@atc` del hold en los POMs
(`expectPassengerInPorAsignar → MG-158`), con la nota explícita de que es un **mapeo por área
aceptado** porque el idmap es API-level. Para acreditar el hold de una PSP sin 3DS hay que **crear
el caso** (área E, "hold happy sin 3DS") en lugar de forzar `MG-158`, cuyo título dice otra cosa.

### Bonus: la diferencia hold vs capture ESTÁ prevista en el ATP

El hallazgo de esta ronda (hold **180.31** → capture **18.26**) no es una anomalía:
**MG-488** (`TC-PAY-F-05`) es *"Validar reconciliación monto final vs hold (peajes/parking/edición
de precio)"*. O sea el ATP ya modela que el monto capturado difiera del reservado. Este E2E lo
observó por primera vez en vivo con eBiz — candidato natural a acreditar MG-488 en una ronda que
lo verifique explícitamente.

## ⚠️ Xray: no hay Test donde marcar PASS

Consultado el 2026-07-30 (`project = MG AND labels = ebizcharge`): existen **sólo 3** Xray Tests de
eBizCharge, ninguno es este happy path.

| Key | Qué valida | Estado |
|---|---|---|
| MG-145 | vincular EBIZ **sin** `zipCode` → `ZIPCODE_MISSING` | Tareas por hacer |
| MG-151 | alta de tarjeta **sin** dirección del pax → `PASSENGER_ADDRESS_NOT_FOUND` | Tareas por hacer |
| MG-476 | alta por modales `odnService` (no `vendor/`) | Tareas por hacer |

Coincide con el registry: todas las keys de eBiz están en `null` (`with_mg_key = 0`).

**Consecuencia**: la evidencia de esta ronda va a **Allure**, no a Xray. Para acreditar en el Test
Execution **MG-559** hay que crear primero los Xray Tests del happy path (`TC1051`, `TC1058`, …).
Crear entidades Xray en MG está permitido; los defects van a DEV/MX.

## Hallazgos de esta ronda

| # | Hallazgo | Registro |
|---|---|---|
| 1 | 🔴 **CloudWatch loguea las credenciales del merchant en texto plano**, y `password` lleva el valor del *Security Id* y no del campo *Password* | **BL-054** (P1) |
| 2 | El viaje quedó con **origen == destino** en el `description` del capture, pese a haberse elegido otro destino | **BL-055** (a) |
| 3 | **Comisión del 5 %** (`commission: 0.91` sobre `18.26`) no documentada en la matriz | **BL-055** (b) |
| 4 | El modal de vinculación tiene **4 campos** y el adapter declara **3 env keys** — falta una para el `Subscription-Key` | **BL-055** (c) |
| 5 | eBizCharge pide **DIRECCIÓN y autocompleta el ZIP** — campo inexistente en las otras PSP; el adapter no declara `nativeExtraField` | **BL-055** (d) |

## Próxima acción

1. Cargar las 4 credenciales `EBIZ_*` en `.env.test` (hoy **ausentes** ⇒ los tests skipean).
2. Implementar `nativeExtraField: 'address'` en el adapter + `NativeAngularCardForm`: seleccionar del
   autocomplete y **aseverar** que el ZIP se autocompletó, en lugar de tipearlo.
3. Crear los Xray Tests del happy path para poder acreditar contra MG-559.
4. Portar la grabación a consumidor thin de `hold.factory` / `cargo-a-bordo.factory`, reemplazando
   los locators frágiles marcados en el archivo (clases Angular generadas y `textbox().nth(N)`).

---

# Ronda 2 — E2E manual: 3 actores × Hold ON/OFF + ejes nuevos (2026-07-30)

**Modo de trabajo**: igual que la Ronda 1 — ejecución MANUAL con codegen, renombrado descriptivo y
mapeo a TC en el propio archivo. La diferencia es el volumen: **una sola sesión de grabación con 7
tramos y ~6 viajes**, más una segunda grabación separada para el flujo Quote.

Grabaciones:

- `recorded/ebizcharge-e2e-3actores-hold-onoff-delete-recard-programado.recorded.ts` (7 tramos)
- `recorded/ebizcharge-quote-hold-invitado-viaje-programado.recorded.ts` (flujo Quote)

**Todos los viajes son con tarjeta preautorizada (hold)** — el eje que varía es si la pre-autorización
del carrier está ON u OFF. Todos finalizados exitosamente desde la App Driver.

## Precondición verificada

Pasarela eBizCharge ya vinculada desde la Ronda 1 — esta ronda **no repite el switch de pasarela**.
Carrier 1521, cuenta sandbox.

## Límite de alcance declarado

- La **fase driver no está en las grabaciones**: se ejecutó en el device, fuera del codegen. El cobro
  se declara exitoso por reporte del líder de QA, con el oráculo de CloudWatch establecido en la
  Ronda 1 — no hay traza Playwright de esa fase.
- Sin acceso al dashboard de eBizCharge: la validación es por DB (`MGW.logs`) o API.
- La grabación de los 7 tramos **apagó la pre-autorización en el tramo 5 y NO la volvió a encender**:
  el carrier 1521 quedó con Hold OFF al terminar.

## Resultado por caso

| # | Actor | Hold | Tarjeta | Ejes nuevos | TC | Veredicto |
|---|---|---|---|---|---|---|
| 1 | empresa individuo | ON | Visa AVS `…2223` → **delete** → MC `…2226` | delete+re-add · **programado 12:10** · Send Manual+Assign · travelId **67817** | `TC1259` + `TC1261` | ✅ PASS |
| 2 | personal / app pax | ON | Amex `…2225` | — | `TC1256` | ✅ PASS |
| 3 | colaborador | ON | (sin form) | precio manual 33.33 → **cancelado** | — | ⬜ no acredita |
| 4 | colaborador | ON | Amex `…2225` | — | `TC1060` | ✅ PASS |
| 5 | ⚠️ ambiguo | OFF | Amex `…2225` | apagado del toggle | `TC1063` o `TC1059` | 🟡 **PENDIENTE-ACTOR** |
| 6 | personal | OFF | **existente** | tarjeta ya vinculada | `TC1258` | ✅ PASS |
| 7 | empresa individuo | OFF | **delete** → Visa `…2222` | delete+re-add · **Send Service** | `TC1260` | ✅ PASS |
| Q | invitado (Quote) | ON | Visa `…2222` | widget Quote · **programado** · invitado `(inv)` | `TC1205` | 🟡 PARCIAL (2 deltas) |

Las 5 tarjetas usadas son de test eBiz y **todas aprobadas** (`EBIZ_AVS_REFERENCE` /
`EBIZ_CVV2_REFERENCE`) — ninguna de la serie de declines `4000300…`. Coherente con happy path.

### El tramo 5 no se acredita: el actor está sin resolver

El titular de la tarjeta dice `sinhold happycolaborador` pero el cliente seleccionado es
`Restrepo, Emanuel`, que en el tramo 6 es usuario **personal**. Los dos caminos acreditan TC distintos:

- si el cliente es empresa con colaborador asociado → `TS-EBIZ-TC1059`
- si es personal → `TS-EBIZ-TC1063`, y **"colaborador sin hold" queda pendiente de ejecutar**

Se resuelve en la DB, no por inspección de la grabación:

```sql
SELECT t.id, t.created_at, t.status, c.name AS client_name, c.client_type, p.name AS passenger
FROM   MGW.travels t
JOIN   MGW.clients c ON c.id = t.client_id
LEFT   JOIN MGW.passengers p ON p.id = t.passenger_id
WHERE  t.id BETWEEN 67810 AND 67840 ORDER BY t.id DESC;
```

### El flujo Quote cierra el último eje pendiente, con dos deltas

La Ronda 1 y el E2E de los 7 tramos declararon el Quote como **no ejecutado**. Ya está: PASS en verde
según el líder de QA. Se acredita contra `TS-EBIZ-TC1205` (Quote + hold) con dos deltas declarados:

1. **¿invitado NUEVO o vinculado a un pax existente?** TC1205 pide "vinculado a pasajero existente",
   pero se tipearon datos nuevos y la grilla mostró `trepo, ema (inv)` — el marcador `(inv)` es
   invitado. Si el backend creó un pax nuevo, esto es una variante **sin fila en la matriz**.
2. **el viaje quedó PROGRAMADO**, no inmediato. TC1205 no fija el eje de horario.

## Los 5 ejes que la matriz no modelaba → 7 TC creados

Esta ronda ejercitó ejes que **no tenían dónde acreditarse**. Se crearon las filas en la matriz ANTES
de referenciarlas en código (regla de trazabilidad de IDs):

| Eje ejercitado | Por qué faltaba | TC creado |
|---|---|---|
| carrier + personal + **Hold ON** | §116 tenía 4 filas y **las 4 son Hold OFF** | `TC1256` |
| carrier + personal + **tarjeta existente** | §116 son 4 variantes de "vincular nueva" | `TC1257` (ON) · `TC1258` (OFF) |
| **eliminar tarjeta de la wallet** + vincular otra | la matriz sólo tenía desvinculación de **PASARELA** (`TC1054`) | `TC1259` (ON) · `TC1260` (OFF) |
| **alta** de viaje programado + asignación manual | §310 cubre **edición** de programados, no el alta | `TC1261` |
| asignación **manual** del conductor (inmediato) | el despacho no era eje | `TC1262` |

**Send Service NO tiene caso propio a propósito**: es el default del motor, así que ya lo recorren
todas las filas existentes — un caso más sería duplicado de `TC1067`/`TC1068`.

Con `TC1256` se cierra además un gap que el registry declaraba explícitamente: `ebizcharge.holdTcIds`
tenía `personalHappyHoldOn: null` con la nota de que la matriz eBiz no modelaba ese eje.

## Acreditado vs declarado

**Acreditado con evidencia propia**: los 6 tramos ✅ de la tabla, en la fase WEB. Cada uno tiene la
grabación corregida como traza y su TC de matriz.

**Declarado, no acreditado por esta ronda**:

- el **cobro desde la App Driver** de los 6 tramos — se hizo en el device, sin traza Playwright;
- el tramo 5 (actor sin resolver) y el tramo 3 (viaje cancelado);
- el flujo Quote, parcial por los dos deltas;
- **la automatización de los 7 casos nuevos**: están cableados en el catálogo y colectan
  (`--list` da 32 tests `@ebizcharge`, antes 25), pero **se ejecutaron A MANO**. Que el código exista
  no es lo mismo que verificado en vivo.

## Acreditación en Xray — MG-559 (2026-07-30)

**Vía**: el CLI de Xray vive en el repo orquestador `agentic-qa-boilerplate` (`bun xray`, skill
`xray-cli`), autenticado con `~/.xray-cli/token.json`. **Todos los comandos se corren desde ese
directorio**, no desde este repo (acá `bun xray` no existe).

### El área E del hold NO estaba en la execution — y es correcto

MG-559 tiene 34 runs: MG-141..151, MG-161..174, MG-293/295 y MG-482..496. **Faltan MG-152..160**, que
es exactamente el área D (3DS) y el área E, cuyo Test Set se llama literalmente
**`ATP · E — Hold con 3DS`**. Quien armó la execution ya reflejó que eBiz no tiene 3DS, así que el
"gap" no es un olvido a corregir con un Test nuevo: es alcance decidido.

⇒ **El hold se acredita indirectamente vía MG-161**: el capture cobra *sobre* el hold, así que un
`capture` con `resultCode: 'A'` sobre el mismo `refNum` prueba que el hold estaba confirmado. Ese
argumento está escrito en el comentario del run, no inventado como resultado propio.

### 5 runs acreditados PASSED, con comentario estructurado y evidencia adjunta

| Test | Run ID | Caso | Evidencia adjunta |
|---|---|---|---|
| **MG-141** | `6a657cf2afb496cf4f64f78e` | A/TC1 vincular pasarela con cuenta PSP válida | grabación E2E #1 |
| **MG-148** | `6a657cf2afb496cf4f64f795` | C/TC1 alta de tarjeta válida | 2 grabaciones + `wallet-add-ebizcharge-2224.png` |
| **MG-161** | `6a657cf2afb496cf4f64f799` | F/TC1 cobro procesado y viaje cerrado | grabación E2E #1 |
| **MG-293** | `6a6b97ebafb496cf4f813498` | eliminar tarjeta desde App PAX | `wallet-before-delete` + `wallet-after-delete` |
| **MG-295** | `6a6b97ebafb496cf4f813499` | eliminar última tarjeta → estado vacío | `wallet-after-delete` |

MG-293 y MG-295 **no estaban en la execution**: se agregaron con `exec add-tests`. Su resultado ya
existía en `evidence/test/xray-results.ebizcharge.json` (corrida de device 17:43-17:48 UTC) pero ese
JSON **nunca se importó**; se acreditaron directamente por CLI. **No importar ese JSON después** — un
import posterior pisaría los comentarios y la evidencia con un resultado pelado.

### 6 runs con comentario y SIN resultado — el motivo en cada uno

| Test | Por qué no se acredita |
|---|---|
| **MG-165** modal de aviso antes de desvincular | El modal SÍ se observó, pero el paso 4 exige probar la rama **Cancelar** y no se ejecutó |
| **MG-166** la desvinculación limpia las wallets | Sus pasos 4 y 5 piden listar wallets y verificar `user_wallet` **en DB**. Sólo se vio que el proceso arrancó — la limpieza no se verificó |
| **MG-143** exclusividad [negativo clave] | Se observó el *efecto* (otras PSP en "No Disponible") pero no se **intentó** vincular una segunda |
| **MG-482** validaciones de formulario | La evidencia va **en contra**: máscara Amex + CVV sin largo por marca (BL-057). Candidato a FAIL, sin confirmar si es artefacto del codegen |
| **MG-484** aislamiento Personal↔Business | Los 3 actores corrieron, pero el aislamiento por `passengerId` no se aseveró |
| **MG-488** reconciliación monto vs hold | Tenemos los montos (180.31 → 18.26) pero no la regla de negocio contra la cual compararlos |

⚠️ **MG-165 y MG-166 se degradaron respecto del plan inicial.** Se habían estimado acreditables; al
leer sus pasos manuales quedó claro que exigen más de lo verificado. Marcarlos PASS habría afirmado
una rama de cancelación y una limpieza de wallets que nadie observó.

### ⚠️ Los pasos manuales de todos estos Tests están derivados de Stripe

Cada Test nombra Stripe en su precondición ("carrier con STRIPE conectada") y varios pasos describen
llamadas API directas (`POST vendor/stripe`, `GET passengers/{id}/allCards`) que acá se ejercitaron
**por UI**. Es el reuso deliberado de los Tests para las 4 PSP en MG-559. Como `run status PASSED`
marca **todos los pasos** en verde de una vez, cada comentario declara explícitamente el desvío para
que un auditor no lea "Vincular STRIPE ✔" como que se vinculó Stripe.

### ⚠️ Otro proceso está editando MG-559 y transicionando los issues Test

Durante esta sesión, **sin intervención de esta sesión**:

- MG-141, MG-143, MG-148, MG-161, MG-165, MG-166, MG-293, MG-295 pasaron a **`LISTO PARA RELEASE`**.
  El changelog de MG-165 muestra 3 transiciones en 7 segundos (`To Do → In Progress → TEST → LISTO
  PARA RELEASE`, 16:26:38/42/45 -0300) — es un script, y ocurrió ~50 min *después* de marcar los runs.
- **MG-172 fue REMOVIDO** de la execution (estaba en la primera lectura, ya no).

**Contradicción a resolver**: MG-143, MG-165 y MG-166 figuran `LISTO PARA RELEASE` en el tablero
mientras sus runs están en `TO DO` con un comentario que dice explícitamente que no se acreditan. El
estado del issue y el resultado del run se contradicen.

Vale recordar por qué: en MG el workflow de los Test es el **pipeline de desarrollo**
(`Tareas por hacer → En curso → TEST → LISTO PARA RELEASE`), no un ciclo pass/fail. El resultado real
de una prueba es el **run** dentro del Execution; el status del issue no lo representa.

## Hallazgos de esta ronda

| # | Hallazgo | Estado |
|---|---|---|
| 1 | 🔴 **Typo de producto en la confirmación del widget Quote**: "Your Trip was **confimed**!" (falta la R). Es texto de cara al cliente final — el widget es el embebible público | reportar a **DEV/MX** |
| 2 | 🟡 **Máscara del campo "Card number" vs Amex de 15 dígitos**: los dos tramos con Amex necesitaron ~25 acciones de forcejeo para completar el número (agrupamiento 4-6-5, no 4-4-4-4). **Puede ser artefacto del codegen** — reproducir a mano antes de filear | sin confirmar |
| 3 | 🟡 **El CVV no indica el largo esperado por marca**: Amex pide 4 dígitos y el resto 3; el tramo 2 muestra el ida y vuelta `123` → `1234` → `123` → `1235` → `3214` hasta acertar | candidato UX |
| 4 | ⚪ El método de pago sigue rotulado **"Credit Card - Pre-Authorized"** con el toggle del carrier en OFF — el label no refleja el estado de la pre-autorización | observación |
| 5 | ⚪ El **precio manual convive con la tarjeta preautorizada** sin romper el alta (tramo 3) | observación |

## Próxima acción

1. **Resolver el actor del tramo 5** con la query de arriba — es lo único que bloquea acreditar ese
   tramo, y define si "colaborador sin hold" quedó cubierto.
2. **Restaurar la pre-autorización del carrier 1521 a ON**: el tramo 5 la apagó y la grabación no la
   volvió a encender. Cualquier spec de hold que corra antes de eso da un falso resultado.
3. Verificar el delta del Quote en DB (invitado nuevo vs vinculado a pax existente) — decide si
   `TC1205` se acredita entero o hace falta una fila más.
4. **Implementar `nativeExtraField: 'address'`** — pasó de incógnita a **bloqueante confirmado**. El
   form nativo de eBiz pide dirección de facturación + ZIP, con doble evidencia: el autocomplete
   "Enter an address" de las dos grabaciones, y el hallazgo en device de la sesión de app-pax
   (`EBIZ_BILLING` en la fixture: `address` tiene **maxlength=30**, pasarse invalida el FormGroup).
   `ebizchargeGatewayAdapter` no lo declara, así que `NativeAngularCardForm` deja esos campos vacíos y
   "Validar" no habilita. **Ningún caso web de eBiz que abra el form puede pasar en vivo hasta que
   esto exista** — incluidos los 7 nuevos. Es previo al piloto.
5. Cargar las credenciales `EBIZ_*` y correr el **piloto del eje programado** (`TC1261`), que necesita
   además `GATEWAY_SCHEDULED_PICKUP_TIME` (ej. `"12:10 PM"`).
6. Reportar el typo "confimed" a DEV/MX (**BL-056**).


---

# Rondas registradas en la rama de integracion (main)

> Estas rondas se registraron en paralelo, en la version de este archivo que vivia en `main`.
> Se conservan integras al unir las dos historias del log: una ronda registrada no se descarta.

# eBizCharge — log de corridas vivas

> Convención: cada ronda registra QUÉ se corrió, el veredicto por caso y la evidencia que sostiene
> cada afirmación. Nada se declara sin observación citable. Hermanos: `authorize/RUN-LOG.md`
> (matriz de outcomes) y `authorize/RUN-LOG-hold-suite.md` (suite HOLD).

# Ronda 1 — primera corrida viva de la matriz de outcomes (2026-07-30/31)

## Precondición verificada

- Probe read-only del App Store (2026-07-30): `ebizcharge → "Desvincular" → linked` (vinculada
  MANUALMENTE por el usuario con las creds del merchant); `authorize`/`stripe` → "No Disponible"
  (exclusividad), `mercado-pago` → "No disponible en tu región". Gate: `ebizcharge-UI=GO`.
- Creds `EBIZ_MERCHANT_USER` / `EBIZ_MERCHANT_PASSWORD` / `EBIZ_SECURITY_KEY` presentes en
  `.env.test` (el usuario las cargó con los nombres crudos del portal — `UserID`/`password`/
  `securityId`/`EBizSubscription-Key` — y se canonizaron a `EBIZ_*`; la subscription key quedó
  preservada como `EBIZ_SUBSCRIPTION_KEY` para uso API futuro).
- Entorno `test` (apps-test), carrier 1521. Montos de las transacciones de validación del alta:
  **siempre > $10** (confirmado por el usuario en la consola merchant) — MAGIIS transacciona al
  validar, no tokeniza en seco.

## Resultado por caso (matriz `ebizcharge-card-outcomes.spec.ts`, caso por caso)

| Caso | Intent | Tarjeta (fila sandbox) | Esperado (docs/tabla) | Observado vivo | Veredicto |
|---|---|---|---|---|---|
| TC1001 | HAPPY_NO_AUTH | …2224 | aprueba | aprueba + viaje `Buscando chofer` | ✅ (1er run: flake transitorio del geocoder — "No se encontraron resultados"; 2º run verde) |
| TC1003 | HAPPY_SLOW_PROCESSING | …2267 | aprueba con demora | aprueba (~60s reales) | ✅ tras fix: `slowMs` de la celda cableado al oráculo de validación |
| TC1020 | APPROVED_CVV_MISMATCH | …2221 | aprueba | aprueba | ✅ |
| TC1002 | APPROVED_AVS_MISMATCH | …2229 | aprueba (echo AVS NNN) | **RECHAZADA** — "Error al validar tarjeta. Por favor, revise los datos ingresados." | 🔴 divergencia → ver Hallazgo 2 |
| TC1011 | DECLINE_AUTHORIZE | …2228 (05) | rechaza | **ACEPTADA y vinculada** | 🔴 defecto → ver Hallazgo 1 |
| TC1012 | DECLINE_INSUFFICIENT_FUNDS | serie 4000300… (51) | rechaza | ACEPTADA | 🔴 ídem |
| TC1013 | DECLINE_INVALID_TRANSACTION | …2227 (12) | rechaza | ACEPTADA | 🔴 ídem |
| TC1014 | DECLINE_RESTRICTED_CARD | …2221 (62) | rechaza | falla igual (aceptada) | 🔴 ídem |
| TC1015 | DECLINE_INVALID_ISSUER | …2226 (15) | rechaza | falla igual (aceptada) | 🔴 ídem |
| TC1031 | FRAUD_REJECT | …2223 | rechaza | ACEPTADA | 🔴 ídem |
| TC1030 | FRAUD_REVIEW | — | — | skip por diseño (sin oráculo verificado) | ⏭ |

Fixes de test de esta ronda (commit `fix(gateway-pg): [TS-EBIZ-TC1003] default billing address…`):
dirección de facturación default documentada para el 5° campo (dato INERTE al outcome en eBiz;
override por celda) + `slowMs` de la celda sumado al timeout del oráculo de validación.

## Hallazgo 1 — MAGIIS vincula como válidas tarjetas que el procesador DECLINA (defecto de integración)

**La capa PSP quedó aislada con probes SOAP directos** (`runTransaction` `authonly`,
`soap.ebizcharge.net/eBizService.svc`, mismas creds del merchant, monto $12.xx, 2026-07-31):

| Tarjeta | Respuesta DIRECTA del PSP | Vía alta de tarjeta MAGIIS |
|---|---|---|
| …2224 happy | `ResultCode A — Approved` · AVS YYY · CVV M · AuthCode real | vinculada ✓ |
| …2228 decline 05 | **`ResultCode D — Declined` · `ErrorCode 10205 "Do not Honor"`** (RefNum 3234133983) | **vinculada como válida** ✗ |
| …2229 AVS NNN | `ResultCode A — Approved` · **echo `AvsResultCode NNN`** (RefNum 3234189816) | rechazada ✗ |

Conclusión (evidencia de 3 capas: tabla vendor + PSP directo + UI MAGIIS):
- La tabla de triggers por número **SÍ funciona** en la cuenta merchant del equipo (docs del
  vendor confirmadas: <https://developer.ebizcharge.net/connect/docs/test-credit-card-numbers>;
  "simulating the FDMS Nashville responses on the sandbox server").
- **La validación del alta de MAGIIS no propaga el decline del procesador**: 6 tarjetas que el
  PSP declina (05/51/12/15/62/fraud-reject) quedaron vinculadas como método de pago válido.
  Riesgo de negocio: el rechazo real aparece recién al COBRAR el viaje (o nunca en el alta) —
  un pasajero con tarjeta sin fondos viaja igual.
- Clasificación (defect-management doctrine): la integración eBiz es feature PRE-release →
  **Defect** (no Bug), severidad **Critical** (flujo de dinero). Borrador listo para filear:
  `docs/gateway-pg/reports/DEFECT-ebiz-alta-no-propaga-decline-2026-07-31.md` (MG es scope
  Xray-only: lo abre el usuario/líder en el proyecto DEV que corresponda).
- Los 6 casos QUEDAN ROJOS a propósito (la expectativa de negocio es correcta: una tarjeta
  declinada no debe vincularse). En el ATR van como FAILED con el defecto linkeado — NO se
  debilita el oráculo para ponerlos verdes.

## Hallazgo 2 — MAGIIS rechaza el alta cuando el echo AVS es NNN (divergencia, decisión de negocio pendiente)

El PSP APRUEBA la …2229 (con echo AVS NNN); MAGIIS la rechaza con el error genérico. Combinado
con el Hallazgo 1: **la validación de MAGIIS parece decidir por el resultado AVS, no por el
approve/decline del procesador** (explica los dos hallazgos a la vez).

⚠ NO se ajustó el oráculo de TC1002: rechazar AVS NNN coincide con la regla de negocio USA
"sin match de ZIP = falla" (definida por el usuario para Authorize), así que puede ser
comportamiento DESEADO — pero la expectativa de la matriz (`APPROVED_AVS_MISMATCH` → aprueba)
viene de la tabla del PSP, y con UNA observación no se flipea. Pendiente: decisión de negocio
(¿el alta debe rechazar AVS NNN?) → si sí, el caso pasa a esperar rechazo con base
`live-verified` + regla citada, y el intent se renombra en la próxima ronda del idmap.

## Viajes creados (cierre manual desde app driver, a cargo del usuario)

Los 3 casos verdes crearon 1 viaje cada uno (TC1001, TC1003, TC1020) — quedan en
`Buscando chofer` hasta el cierre manual.

## Próximos pasos

1. Suite HOLD eBiz (`ebizcharge-hold.spec.ts`) — alta con hold; cierre driver manual.
2. Cargo a bordo eBiz.
3. CFG (link/unlink/exclusividad) AL FINAL — destructiva, avisar al usuario antes.
4. Acreditación en MG-559 con evidencia adjunta por run (directiva del usuario): verdes PASSED +
   evidencia; los 6 del Hallazgo 1 FAILED + defecto.
5. Decisión de negocio del Hallazgo 2 → ajustar (o no) el oráculo de TC1002 con base citada.

## Validación exploratoria — devolución del hold al cancelar viaje programado (2026-07-31, QA lead + verificación API/DB)

**PASS en trifuerza para el viaje 67969** (colaborador desde carrier, programado, Hold ON $207.93,
cancelado por el carrier): `CARD_HOLDS` fila 1683 transicionó **`HOLD` → `RELEASE`** (mismo intent
`3234201165`, mismo monto) · logs MGW `Approved, remainingBalance 0` → `CANCELLED BY_COLLECTOR`
(21:11:41–43) · PSP directo **`Voided` / "Voided Sale"** (AuthCode 178428).
Para el 67962 el release también se acreditó (PSP `Voided`, $10), con la observación de que lo
liberado fue el hold de VALIDACIÓN de la tarjeta — nunca se colocó hold de monto de viaje y
`CARD_HOLDS` no tiene fila (IDs consecutivos 1678→1683: nunca se escribió, no se borró). Decisión
del QA lead: no es bug; queda como observación de diseño de trazabilidad.

**Capacidad nueva para la campaña — capa PSP por SOAP** (cumple la restricción sin-dashboard):
`GetTransactionDetails(securityToken, transactionRefNum)` y `SearchTransactions(...)` contra
`soap.ebizcharge.net/eBizService.svc` (ns `http://eBizCharge.ServiceModel.SOAP`), token con las
3 creds de `.env.test`. El `RefNum` del PSP == `intentId` de MGW == `CARD_HOLDS.INTENT_ID`. El
reloj del PSP corre 7 h detrás del de la DB. Ciclo confirmado de `CARD_HOLDS.STATUS`:
`HOLD` → `RELEASE` (cancelación) | `CAPTURE` (cobro).

Evidencia: `evidence/test/ebizcharge/hold-release/VALIDACION-hold-release-67962-67969.md`
(+ 3 respuestas XML crudas del PSP en la misma carpeta). Barrido de cierre: **cero retenciones
vivas** en la ventana del merchant.

## Ronda de trifuerza sobre los declines (2026-07-31) — el Hallazgo 1 se DESCOMPONE en 3 causas

Se agregó la **pata PSP forense** al camino de decline de `card-outcome-matrix.factory.ts`: cuando el
oráculo UI falla, el diagnóstico consulta el procesador por SOAP (filtrando por last4) y
`paymentMethodsByPax` para ver si la tarjeta persistió. Helper nuevo:
`tests/features/gateway-pg/helpers/ebiz-psp.ts`. Utilities silenciosas — sin creds o error de red
NO alteran el veredicto UI (la capa es forense, no decide).

Re-corrida caso por caso de los 6 declines. **No son un solo hallazgo:**

### Causa 1 — Defecto de integración CONFIRMADO en 3 capas (4 casos, no 6)

El PSP declinó **esa transacción puntual** con su código, y la tarjeta **quedó vinculada** como
método de pago del pax 5289:

| TC | Tarjeta | RefNum del PSP | Veredicto del procesador | Persistencia |
|---|---|---|---|---|
| TC1011 | …2228 | 3234213576 | `D-Declined` · 10205 "Do not Honor" | **quedó vinculada** |
| TC1012 | …2224 (`4000300611112224`) | 3234213591 | `D-Declined` · 10251 "Insufficient funds" | **quedó vinculada** |
| TC1013 | …2227 | 3234213603 | `D-Declined` · 10212 "Invalid Transaction" | **quedó vinculada** |
| TC1014 | …2221 | 3234213606 | `D-Declined` · 10262 "Restricted Card" | **quedó vinculada** |

Esto **eleva** la evidencia del defecto: antes era "el PSP declina según la doc del vendor"; ahora es
"el PSP declinó ESTA transacción, con RefNum y código, y la tarjeta igual quedó como medio de pago".

### Causa 2 — TC1031 (FRAUD_REJECT, …2223) NO es el mismo defecto

El PSP **APROBÓ** (RefNum 3234213621, `A-Approved`, luego `Voided`). El fraud profiler de esta cuenta
merchant no declina, o el trigger no está activo. Que MAGIIS vincule la tarjeta es **coherente** con
lo que contestó el procesador: el rojo es del ORÁCULO (la doc promete un rechazo antifraude que el
sandbox no produce), no de la integración. Refuta además la hipótesis "Fraud Review / Response Code 4"
que sugería el mensaje de error: no hubo review, hubo approve.

### Causa 3 — TC1015 (DECLINE_INVALID_ISSUER, …2226) es gap del MODELO del test

Cero transacciones en el PSP **y** la tarjeta no persistió. Es el único caso con `exp 0922`
(vencida): la expiración se valida del lado del cliente, la request nunca sale, y no hay mensaje de
rechazo **de pasarela** que `expectNativeCardRejected` pueda assertar. No es defecto de producto —
el caso necesita otro oráculo (validación de formulario, área del futuro MG-482).

### Dos gotchas que costaron intentos

- **last4 colisionados**: `…2224` es last4 del happy `4000100011112224` **y** del insufficient-funds
  `4000300611112224`; `…2221` es del CVV-mismatch **y** del restricted-card. El filtro forense por
  last4 devuelve filas de ambas tarjetas → leer la transacción de la ventana, no la primera fila.
- **`mode: 'serial'`** (`card-outcome-matrix.factory.ts:99`): un rojo **saltea el resto** de la matriz
  (`N did not run`) y `--max-failures` no lo evita. Los declines se corren **de uno** por `--grep`.

### Nota del QA lead sobre la configuración de la cuenta sandbox (2026-07-31)

Hipótesis planteada: las tarjetas que deberían rechazar y sin embargo se vinculan y permiten pagar
se comportan así por la configuración de la cuenta merchant, y sin acceso a la consola no podemos
cambiarla para que el servidor de eBiz responda distinto.

La verificación por transacción separa dónde aplica:

- **Aplica a TC1031 (FRAUD_REJECT).** El PSP contestó `A-Approved` — la cuenta **no discriminó** esa
  tarjeta. El Fraud Profiler es configuración de cuenta y no está activo; sin consola no es
  habilitable. El caso pasa a **NO EJECUTABLE en este ambiente → ENVIRONMENT/BLOCKED con motivo**,
  no FAILED. El fixture conserva la tarjeta y su outcome documentado (la doc del vendor es correcta);
  lo que falta es el trigger habilitado en la cuenta.
- **No aplica a TC1011/1012/1013/1014.** Ahí la cuenta **sí discriminó**: `ResultCode D — Declined`
  con `ErrorCode` 10205/10251/10212/10262 sobre la transacción que MAGIIS disparó al validar.
  El servidor **ya responde el rechazo**; el alta no lo lee. Reconfigurar la cuenta no cambiaría ese
  dato porque ya viene correcto — y viaja en la MISMA respuesta que el `AvsResultCode` que sí se
  está mirando. El defecto se sostiene.
