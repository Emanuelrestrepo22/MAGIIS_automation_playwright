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

1. Cargar las 4 credenciales `EBIZ_*` en `.env.test` (hoy **ausentes** ⇒ los 23 tests skipean).
2. Implementar `nativeExtraField: 'address'` en el adapter + `NativeAngularCardForm`: seleccionar del
   autocomplete y **aseverar** que el ZIP se autocompletó, en lugar de tipearlo.
3. Crear los Xray Tests del happy path para poder acreditar contra MG-559.
4. Portar la grabación a consumidor thin de `hold.factory` / `cargo-a-bordo.factory`, reemplazando
   los locators frágiles marcados en el archivo (clases Angular generadas y `textbox().nth(N)`).
