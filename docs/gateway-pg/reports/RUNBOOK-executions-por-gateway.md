# RUNBOOK — Ejecuciones Xray por pasarela (ATP MG-178)

> **Estado:** ACTIVO — wiring S9 completado (scripts `:xray` + `XRAY_OUTPUT_FILE` + registry `xray-keys.ts`); pendiente primera corrida live por pasarela.
> **Fecha:** 2026-07-27
> **ATP:** MG-178 "Release Pasarelas de Pago (Gateway) — 4 PSP" · Env: `test`
> **SoT de keys:** [`tests/features/gateway-pg/data/xray-keys.ts`](../../../tests/features/gateway-pg/data/xray-keys.ts) (`XRAY_EXECUTIONS_TEST_ENV`, `XRAY_EXECUTION_ENV_VAR`, `XRAY_KEY_DENYLIST_RECOMMENDED`)
> **Rama:** `carrier/gateway-standardization` (Fase 3 — seams S1..S9)

Guía operativa para correr la suite `gateway-pg` POR PASARELA, importar los resultados a su Test Execution de Xray y adjuntar evidencia por run. Un run por pasarela → un JSON aislado (`XRAY_OUTPUT_FILE`) → un import contra SU execution.

---

## 1. Test Executions por pasarela

### 1.1 Executions activas (creadas 2026-07-25, env `test`) — una por pasarela

| Pasarela | Execution (ATR) | Env var (shell) | Script `:xray` | Tag grep |
|---|---|---|---|---|
| Authorize.Net | **MG-558** | `XRAY_EXECUTION_AUTHORIZE` | `test:test:gateway:authorize:xray` | `@authorize` |
| eBizCharge | **MG-559** | `XRAY_EXECUTION_EBIZCHARGE` | `test:test:gateway:ebizcharge:xray` | `@ebizcharge` |
| Stripe | **MG-560** | `XRAY_EXECUTION_STRIPE` | `test:test:gateway:stripe:xray` | `@stripe` |
| Mercado Pago | **MG-561** | `XRAY_EXECUTION_MERCADOPAGO` | `test:test:gateway:mercadopago:xray` | `@mercadopago` |

Las env vars se documentan como placeholders en [`.env.example`](../../../.env.example) (sección "Xray — Test Executions por pasarela"). **NO** viven en `.env.test`: la key se pasa por shell en el momento del run (ver §3).

### 1.2 Executions históricas (NO importar nuevos resultados)

| Execution | Rol | Nota |
|---|---|---|
| **MG-557** | ATR UI CFG Authorize (preexistente al modelo por pasarela) | Cerrada como histórico; el área CFG Authorize ahora acredita contra MG-558. |
| **MG-510..MG-516 + MG-553** | 8 executions por ÁREA del ATP (modelo anterior por área funcional) | Histórico de la Ronda 1 por área. El modelo vigente es POR PASARELA (MG-558..561). |

Todas las keys de §1 están en la denylist recomendada (§2.3) — jamás deben recibir un resultado como Test.

---

## 2. Prerrequisitos live

### 2.1 Ambiente y working tree

1. **Worktree FUERA de OneDrive** — el FS de OneDrive rompe `tsc`/runner local (gotcha documentado del repo). Crear worktree en disco local, p. ej.:
   ```bash
   git worktree add C:/work/magiis-playwright-gw carrier/gateway-standardization
   ```
2. `.env.test` completo: `BASE_URL`, `USER_CARRIER`/`PASS_CARRIER` y las creds por pasarela que apliquen (`USER_CARRIER_MP`/`PASS_CARRIER_MP`, `AUTHORIZE_API_LOGIN_ID`/`AUTHORIZE_TRANSACTION_KEY`, `EBIZ_MERCHANT_USER`/`EBIZ_MERCHANT_PASSWORD`/`EBIZ_SECURITY_KEY`). Cadena de resolución en `.env.example`.
3. Xray CLI autenticado: `bun xray auth login` (ver skill `xray-cli`).

### 2.2 Guard destructivo + ventana exclusiva

- Los casos CFG (link/unlink) son **DESTRUCTIVOS** sobre la pasarela activa del **carrier 1521 (compartido por toda la suite)** — disparan `cleaningWallets` en cascada.
- Requieren `GATEWAY_ALLOW_DESTRUCTIVE_SWITCH=true` explícito (alias legacy: `AUTHORIZE_ALLOW_DESTRUCTIVE_SWITCH`). Sin el flag, la suite CFG skipea limpio.
- Correr SOLO en **ventana exclusiva** del carrier 1521 (nadie más ejecutando contra apps-test con ese carrier). Al terminar, dejar la pasarela default (Stripe) re-vinculada — `GatewaySwitchSteps.restoreStripe()` requiere OAuth manual si el unlink la dejó desvinculada.
- **Capturar network trace de un unlink REAL antes de correr MG-169 sobre el carrier ARG** — verificar que la ÚNICA mutación del unlink es `vendor/cleaningWallets` (supuesto del mock de `expectUnlinkFailureShowsRealError`; el guard anti-mutación del ATC falla si aparece otra, pero la verificación live va primero).
- ⚠️ **La suite CFG re-vincula la pasarela con las credenciales de `.env`** (`GatewaySwitchSteps.linkAuthorize` → `AUTHORIZE_API_LOGIN_ID` / `AUTHORIZE_TRANSACTION_KEY`). Con Authorize eso **conmuta la cuenta que usa el backend**: si esas creds son de la cuenta en Test Mode, todo run de pago posterior mide respuestas enlatadas y da **verdes vacíos**. Correr CFG **antes** de cualquier bloque de pago obliga a re-verificar la cuenta después. El gate `authorize-account-guard.ts` corta los specs de pago si detecta la cuenta enlatada, pero el orden correcto es alinear las creds primero — ver `authorize/EXTERNAL-BLOCKERS.md` §0.

### 2.3 Denylist de keys (emit-all)

El reporter emite TODAS las keys `tms` (estáticas + runtime `@atc`). Para que ninguna key estructural no-Test reciba resultado, los scripts `:xray` por pasarela **ya llevan la denylist recomendada EMBEBIDA** (`XRAY_KEY_DENYLIST=...` en `package.json`) — no hay que exportar nada para el flujo estándar. El export manual queda como **override** (p. ej. para ampliar o recortar la lista en un run puntual):

```bash
export XRAY_KEY_DENYLIST="MG-3,MG-178,MG-509,MG-510,MG-511,MG-512,MG-513,MG-514,MG-515,MG-516,MG-553,MG-557,MG-558,MG-559,MG-560,MG-561"
```

(Misma cadena exportada como `XRAY_KEY_DENYLIST_RECOMMENDED` en `xray-keys.ts`. Nota: en los scripts npm el env embebido lo fija `cross-env`, así que un `export` de shell NO lo pisa — para override, editar el script o correr `npx playwright test` a mano con el env deseado.)

#### Denylist POR RUN — keys ajenas al ATR de la pasarela

La lista de arriba es la parte **estructural** (issues que no son Test: épica, ATP, executions) y es **común** a las 4 pasarelas. Encima de ella, cada script `:xray` añade un tramo **específico de su run**:

> **Criterio:** keys legítimas de ATC que pertenecen al ATR de OTRA pasarela. El ATC las emite por efecto colateral del flujo (p. ej. `unlinkActiveGateway` / `ensureActiveGateway` desvinculan la pasarela ACTIVA — que puede ser Stripe — al preparar el slot para Authorize), así que la corrida las ve aunque el caso probado no sea suyo. **Su run se acredita en el ATR de origen**, no en el de la pasarela que se está corriendo; en este run se denylistean para no inflar el ATR con evidencia prestada.

| Run (`:xray`) | Tramo añadido | Por qué |
|---|---|---|
| `authorize` (MG-558) | `MG-158` + `MG-211..MG-218` | `MG-158` es el piloto hold, key del **área E de Stripe** (Authorize no tiene área E en el membership del ATP) — la emite el piloto parametrizado cuando `GATEWAYS=authorize`. `MG-211..218` = CFG **Stripe**, emitidas por los ATC de switch de la suite CFG Authorize. |
| `stripe` (MG-560) | `MG-219..MG-226` | Simétrico: CFG **Authorize**, alcanzable desde los ATC de switch del run Stripe. `MG-158` **NO** se denylistea acá — es key propia del ATR Stripe. |
| `ebizcharge` (MG-559) | `MG-158` + `MG-211..MG-226` | eBiz no tiene keys CFG propias (registry `null`); todo `MG-211..226` que aparezca es de Stripe o Authorize. `MG-158` es de Stripe. |
| `mercadopago` (MG-561) | `MG-158` + `MG-211..MG-226` | Idem eBizCharge. |

Regla de mantenimiento: al dar de alta keys CFG/WAL de una pasarela nueva, agregarlas al tramo por-run de las OTRAS tres — no a `XRAY_KEY_DENYLIST_RECOMMENDED` (esa lista es solo estructural y compartida).

### 2.4 Orden de ejecución recomendado

**Authorize → eBizCharge → Stripe → Mercado Pago.**

Racional: Authorize y eBiz necesitan link programático (modal de credenciales) y dejan la pasarela conmutada; Stripe se restaura como default al final del bloque destructivo; MP corre último porque su carrier ARG es independiente del carrier 1521 en los flujos no-CFG y su validación de tarjeta no completa en TEST (skips esperados).

---

## 3. Flujo por pasarela (repetir para cada una, en el orden de §2.4)

Ejemplo con **Authorize** (sustituir sufijo/keys para las demás según la tabla §1.1):

Cada pasarela corre **DOS legs** contra el MISMO execution: `:xray:ui` (project `gateway-pg-chromium`, specs de `specs/`) y `:xray:api` (project `api`, contract tests de `api/`). El script agregado `:xray` encadena los dos. Son dos JSON separados y **dos imports al mismo `--execution`** — un import por archivo es válido y acumulativo en Xray.

> **Por qué el leg api existe** (auditoría 2026-07-28): los scripts `:xray` fijaban solo `--project=gateway-pg-chromium`, que hereda `testDir: specs/`. Los contract tests viven en `api/` y solo los colecta el project `api` → sus keys (p. ej. **MG-551** de `allcards-regression`, **MG-172**) NO entraban a NINGÚN ATR. El leg api cierra ese agujero.

```bash
# 1. Run con trazabilidad Xray → un JSON por leg, ambos con el mismo execution
#    (GATEWAYS pinnea el set del piloto parametrizado; --grep filtra los specs por tag.
#     El piloto hold-happy-no3ds SÍ entra al run de su pasarela: su describe interno lleva
#     el tag normalizado `@<gateway>` — mismo patrón gatewayTag de las factories. El leg ui
#     fija --project=gateway-pg-chromium para evitar la doble ejecución por projects
#     solapados regression-web + gateway-pg-chromium; el leg api fija --project=api.)
XRAY_EXECUTION_KEY=MG-558 npm run test:test:gateway:authorize:xray
# → escribe evidence/test/xray-results.authorize-ui.json  (leg ui)
#         + evidence/test/xray-results.authorize-api.json (leg api)
#   ambos con testExecutionKey=MG-558 embebido por el reporter.

# 2. Import de resultados contra la execution de la pasarela — LOS DOS archivos
bun xray import xray --file evidence/test/xray-results.authorize-ui.json  --execution $XRAY_EXECUTION_AUTHORIZE
bun xray import xray --file evidence/test/xray-results.authorize-api.json --execution $XRAY_EXECUTION_AUTHORIZE

# 3. Listar los runs de la execution (obtener runId por Test)
bun xray run list --execution MG-558

# 4. Adjuntar evidencia por run (screenshots/traces del run local)
bun xray run evidence --id <runId> --dir evidence/test/authorize/<MG-key>/

# 5. Verificar la evidencia adjunta
bun xray run evidence-list --id <runId>
```

Comandos equivalentes por pasarela:

| Pasarela | Paso 1 (run: ui + api) | Paso 2 (import de los DOS JSON) |
|---|---|---|
| Authorize | `XRAY_EXECUTION_KEY=MG-558 npm run test:test:gateway:authorize:xray` | `bun xray import xray --file evidence/test/xray-results.authorize-ui.json --execution MG-558` · idem con `...authorize-api.json` |
| eBizCharge | `XRAY_EXECUTION_KEY=MG-559 npm run test:test:gateway:ebizcharge:xray` | `bun xray import xray --file evidence/test/xray-results.ebizcharge-ui.json --execution MG-559` · idem con `...ebizcharge-api.json` |
| Stripe | `XRAY_EXECUTION_KEY=MG-560 npm run test:test:gateway:stripe:xray` | `bun xray import xray --file evidence/test/xray-results.stripe-ui.json --execution MG-560` · idem con `...stripe-api.json` |
| Mercado Pago | `XRAY_EXECUTION_KEY=MG-561 npm run test:test:gateway:mercadopago:xray` | `bun xray import xray --file evidence/test/xray-results.mercadopago-ui.json --execution MG-561` · idem con `...mercadopago-api.json` |

Cobertura del leg api hoy (`--project=api --grep "@<gw>" --list`, 2026-07-28): **authorize = 13**, **mercadopago = 17**, **stripe = 0**, **ebizcharge = 0**.

Notas:

- `XRAY_EXECUTION_KEY` en el paso 1 hace que ambos JSON ya lleven `testExecutionKey` — el `--execution` del paso 2 es redundante-defensivo (mismo valor; si difieren, gana el flag del import).
- El paso 1 en PowerShell: `$env:XRAY_EXECUTION_KEY='MG-558'; npm run test:test:gateway:authorize:xray`.
- **El encadenado es `&&`** (único operador portable entre `sh` y `cmd.exe`): si el leg ui termina con fallos, el leg api **NO corre**. En ese caso — el escenario normal cuando hay bugs que triar — correr el leg api explícitamente: `XRAY_EXECUTION_KEY=MG-558 npm run test:test:gateway:authorize:xray:api`.
- El leg api lleva `--pass-with-no-tests` para que Stripe/eBizCharge (0 contract tests hoy) no rompan el encadenado. Su JSON sale con `tests: []` → **NO importarlo**; cuando esas pasarelas ganen specs `api/*.api.spec.ts` con tag, el leg los recoge sin tocar el script.
- Los specs sin key mapeada aparecen en el summary del reporter como `spec(s) sin key → NO exportados` — es el gap visible esperado para eBiz/MP (registry CFG/WAL `null`, no inventar keys) y para el smoke Authorize (`[TS-AUTHORIZE-SMOKE-01]`, sin key por diseño).
- Evidencia local: los specs escriben screenshots bajo `evidence/test/...`; organizar por pasarela/key antes del paso 4 (`evidence/test/<gw>/<MG-key>/`).

---

## 4. Gate DONE por pasarela (5 puntos)

Una pasarela se declara **DONE** en la Ronda 1 cuando:

1. **Run verde/triado**: el script `:xray` de la pasarela terminó y cada fallo está triado (bug real documentado vs skip esperado por sandbox — p. ej. validación MP que no completa en TEST).
2. **Import OK**: `bun xray import xray` respondió éxito y `bun xray run list --execution <key>` muestra los runs con status coherente con el run local (PASSED/FAILED/TODO).
3. **Evidencia adjunta**: cada run FAILED y los PASSED representativos tienen evidencia (`run evidence` + verificación con `run evidence-list`).
4. **Sin keys estructurales contaminadas**: ninguna key de la denylist (§2.3) recibió resultado (verificar en la execution que solo hay Tests MG esperados).
5. **Estado restaurado**: pasarela default (Stripe) re-vinculada en el carrier 1521, `GATEWAY_ALLOW_DESTRUCTIVE_SWITCH` desactivado, y los viajes de prueba limpiados (`npm run cleanup:test:travels:dry` → `cleanup:test:travels` si aplica).

---

## 5. Referencias

- Registry de keys y executions: `tests/features/gateway-pg/data/xray-keys.ts`
- Reporter emit-all + `XRAY_OUTPUT_FILE`: `tests/utils/reporters/xray-reporter.ts`
- Matriz maestra multi-gateway: [`docs/gateway-pg/MATRIZ-MAESTRA-multigateway.md`](../MATRIZ-MAESTRA-multigateway.md)
- Reporte de cobertura/mapeo ATP MG-178: [`docs/gateway-pg/reports/REPORTE-FINAL-MG178-multigateway.md`](./REPORTE-FINAL-MG178-multigateway.md)
- Placeholders de env: [`.env.example`](../../../.env.example)
