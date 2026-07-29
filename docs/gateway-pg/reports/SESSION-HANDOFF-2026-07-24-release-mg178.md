# SESSION HANDOFF — Release Pasarelas de Pago (MG-178), 2026-07-24

> Documento de continuidad para retomar esta sesión desde otro entorno (VSCode + Claude Code).
> Abrí este repo (`magiis-playwright`) o el boilerplate (`agentic-qa-boilerplate`) en Claude Code y
> pedí: *"leé `docs/gateway-pg/reports/SESSION-HANDOFF-2026-07-24-release-mg178.md` y continuá"*.

## 1. Objetivo de la sesión

Ejecutar orquestadamente la automatización ya desarrollada del release "Pasarelas de Pago" (Xray Test
Plan **MG-178**, proyecto MG, `magiis.atlassian.net`), sincronizar resultados a Xray (EXECUTING →
PASSED/FAILED + evidencia), validar trifuerza (UI/API/DB), y cerrar con un **Go/No-Go** en el ATP.
Orden pedido por el usuario: `MercadoPago → Stripe → Desvinculación → PAUSA vinculación → Stripe test
cards → Authorize + trifuerza → Go/No-Go`.

**Repos involucrados:**
- **Cockpit** (Xray CLI, credenciales, orquestación): `agentic-qa-boilerplate`
  (`C:\Users\Erika\OneDrive - MAGIIS USA LLC (1)\Documentos\agentic-qa-boilerplate`)
- **Ejecutor** (specs reales, este repo): `magiis-playwright`
  (`C:\Users\Erika\OneDrive - MAGIIS USA LLC (1)\Escritorio\automation-projects\magiis-playwright`,
  rama `carrier/authorize-ebiz-gateway`)

**Plan completo (con todo el detalle de stages):**
`C:\Users\Erika\.claude\plans\como-agente-orquestados-de-validated-hartmanis.md` (puede no existir en
este equipo/entorno — si no está, este handoff es la fuente de verdad).

---

## 2. Estado Xray — qué ya se cerró (con evidencia adjunta)

| Ticket | Status | Evidencia adjunta | Nota |
|---|---|---|---|
| **MG-158** (Hold 3DS, área E) | PASSED | `batch-apppax-hold.log` | 16/16 AppPax+empresa hold pass |
| **MG-166** (Desvinculación G) | PASSED | `batch-desvinc.log` | Cascada DB confirmada (oracledb): `user_wallet=0, card=0, mgw_linked` inactivo |
| **MG-154** (Recovery 3ds-failure) | FAILED | `b-recovery.log` | Hallazgo real: gap AC6 (sin ruta de abandono/timeout 3DS) |
| **MG-155** (Recovery abandon/timeout) | FAILED | `b-recovery.log` | ídem |
| **MG-157** (Recovery preauth-failure) | FAILED | `b-recovery.log` | ídem |
| **MG-148** (Stripe unit decline, mock) | PASSED | (sin adjuntar aún — pendiente si hace falta) | — |
| MG-220..226 (Authorize CFG link/unlink) | **Bloqueado** | — | Colisión multi-sesión sobre carrier 1521 (ver §4). Código corregido, ejecución automatizada no confiable todavía |
| BL-036 (Authorize sandbox API, sin key MG) | 3 passed / 8 failed | trace.zip en disco (no Xray, sin ticket) | Hallazgo: credenciales sandbox no habilitadas para magic-number triggers (decline real, AVS/CVV codes vienen vacíos) — gap de config, no bug |

**Logs de evidencia** en `C:/Users/Erika/AppData/Local/Temp/pw-logs/*.log` (pueden no sobrevivir a un
reinicio de máquina — son de `%TEMP%`). Traces BL-036 en
`C:/Users/Erika/AppData/Local/Temp/pw-art-evidence/authorize-sandbox-contract-*/trace.zip`.

**Deuda / fuera de alcance de esta sesión:**
- **MercadoPago**: 16 tests SKIPPED por diseño (`MP_UAT_EXEC` gate — MP no transacciona en TEST sandbox).
  El usuario corre en paralelo, en otro chat, las pruebas manuales en **UAT**.
- **eBizCharge**: sin spec ejecutable (solo scaffolding/fixtures) — deuda técnica documentada.
- **Capa API KATA de pagos completa**: ~76 de 99 Xray Tests API automatizables (MG-510..516) aún sin
  spec — el ATP diseña más de lo que hoy ejecuta.

---

## 3. Hallazgos técnicos clave de esta sesión (root-causes reales, no adivinados)

### 3.1 — OneDrive rompe artefactos Playwright en batches grandes
Correr desde el path OneDrive (`Escritorio\automation-projects\magiis-playwright`) con batches largos
(30+ min) causa `ENOENT` en escritura de trace/video (`.playwright-artifacts-*`), aunque la sync esté
pausada. **Mitigación**: `--output=<ruta fuera de OneDrive, ej. C:/Users/Erika/AppData/Local/Temp/pw-art>`
+ `--trace=off` en lotes largos, `--trace=on` solo en lotes chicos/dirigidos.

### 3.2 — Login intermitente (timing, no código)
`login:goto`/`login:dashboard` timeoutean esporádicamente (ambiente lento, no relacionado a mi código).
Se agregó `LOGIN_GOTO_TIMEOUT` (env, default 20s) a `tests/pages/shared/LoginPage.ts` — **cambio
UNCOMMITTED intencional, mantenerlo**. Usar `LOGIN_GOTO_TIMEOUT=60000` + `--retries=1` en runs manuales.

### 3.3 — POM `AppStoreGatewaysPage.ts` — 3 root-causes reales corregidos (código YA aplicado)
Este archivo fue **restaurado** desde un commit revertido (`git show dbfa380:<path>` — el slice Authorize
se había commiteado y luego revertido, `ac94d0b`=HEAD) y **corregido** con hallazgos verificados en vivo:

1. **Selectores de acción por CLASE, no texto**: `a.green-text` (Vincular/Link) / `a.red-text`
   (Desvincular/Unlink). `getByText('Vincular',{exact:true})` daba `count=0` pese a que `evaluate()`
   confirmaba el textContent — inestable por timing. La clase es el discriminador estable.
2. **Click NORMAL de Playwright** (NO `dispatchEvent`/`el.click()` nativo/`force:true`). El handler
   Angular exige un evento "trusted" (generado vía CDP) — confirmado con diagnóstico quirúrgico
   (`elementFromPoint` + native-click no abre el modal; `.click()` normal sí).
3. **Campos del modal por `formcontrolname`, NO `name`**: el input real es
   `<input formcontrolname="apiLoginKey" id="apiLoginKey">` (Angular Reactive Forms) —
   `ng-reflect-name` (debug-only) generó la confusión original del HANDOFF previo.
4. **Botón submit = "Continuar" (español)**, no "Continue" — el modal mezcla idiomas (título/labels
   en inglés, botones en español). Empieza `disabled` hasta que el form sea válido.
5. **`goto()` debe esperar `networkidle`**: la card muestra un estado inicial optimista/cacheado
   (ej. "Vincular") que ~750ms después el fetch real corrige (ej. "Desvincular") — leer/clickear antes
   de esa corrección opera sobre datos stale. Agregado `waitForLoadState('networkidle')` tras el goto.
6. **QUIRK de negocio confirmado**: el link con credenciales válidas devuelve **HTTP 500 = pasarela
   CONECTADA** (éxito). HTTP 400 = NO conectada. El 500-en-éxito es un *smell* de API (debería ser 2xx)
   → candidato a Improvement/Defect (rutear a DEV/MX, nunca crear en MG).

**Selector Angular real del componente** (dato nuevo, capturado por el usuario en DevTools):
`app-carrier > app-global-integrations` — más estable que depender solo de `.card` genérico si hace
falta reforzar el POM más adelante.

### 3.4 — Colisión multi-sesión confirmada (bloqueante activo)
Detectada evidencia irrefutable: en la MISMA ejecución de un test, el gateway activo leído cambió entre
un intento y el siguiente (Stripe→Authorize), y por separado, un test de hold Stripe falló con
`Stripe frame not found: cardNumber` mientras segundos después `readState('stripe')` confirmaba
`linked`. **Conclusión**: hay otra sesión/proceso tocando el MISMO carrier 1521 en TEST al mismo tiempo
(alternando qué gateway está vinculado). Mientras esto siga activo, **cualquier automatización que
dependa de un gateway específico vinculado es no-confiable** — no reintentar ciegamente, coordinar
ventana exclusiva primero. Archivos untracked de otra sesión encontrados en `git status` (specs
MercadoPago, grabaciones `2026-07-22-mercadopago-*.recorded.ts`) — **no tocar, no son míos**.

**Estado del carrier 1521 al cierre de esta sesión** (confirmado por el usuario en vivo): **Authorize.Net
vinculado** ("Desvincular" visible), Stripe/MercadoPago/EBiz → "No Disponible" (exclusividad). Esto
puede haber cambiado de nuevo si la otra sesión sigue activa — **verificar el estado real antes de
asumir nada** (`AppStoreGatewaysPage.readState('authorize')` o inspección visual del App Store).

---

## 4. Scope trazable acordado para la suite Authorize (Fase C del plan, NO empezada aún)

**Precisión del usuario**: la suite Authorize debe tener la **misma cantidad de test cases que Stripe
tiene desarrollados, EXCLUYENDO los específicos de 3DS** (Authorize no soporta 3DS —
`authorizeGatewayAdapter.requires3ds = false`, confirmado en código; **no hay paso de 3DS en Authorize,
eso es exclusivo de Stripe** — confirmado también por el usuario).

**Baseline Stripe** (inventario verificado por `playwright --list`):
- Web: **223 TC / 55 files**. Puramente 3DS a excluir del conteo objetivo: `recovery/*` (5 files, 100%
  3DS) · variantes `*-hold-3ds*`/`*-cargo-*-3ds*` (cada área tiene par 3ds/no3ds — solo replicar el
  no3ds) · `visual/3ds-stripe-modal.visual.spec.ts` · sub-tests 3ds en `_parametrized`/`e2e-mobile`.
- API: **47 TC / 13 files** (ninguno 3DS-específico).
- **Conteo objetivo Authorize = (223+47) − (TCs puramente 3DS de Stripe)**. Calcular el número exacto al
  implementar (no antes — evita comprometerse sin contar sub-tests reales dentro de cada file).

**Reusar (no recrear)**: `resolveCard({gateway:'authorize',intent})` + `AUTHORIZE_TEST_CARDS` +
`card-precondition.ts` + `travel-cleanup.ts` + `GatewaySwitchSteps`. Agregar `'authorize'` a
`ACTIVE_GATEWAYS` del parametrizado (`SUPPORTED_INTENTS_BY_GATEWAY.authorize` ya excluye intents 3DS).

**Fase B pendiente (bloqueante para specs de alta-de-tarjeta)**: `NewTravelPageBase.fillPreauthorizedCard()`
está 100% acoplado a Stripe Elements (iframes). Falta el **Strategy Pattern** (BL-038):
`CardFormStrategy` + `StripeCardForm` (extraer) + `AuthorizeCardForm` (nuevo) — **el modelo real del
formulario de tarjeta con Authorize activo AÚN NO ESTÁ CONFIRMADO EN CÓDIGO** (¿iframe Accept.js como
Stripe, o inputs nativos?). Se le pidió al usuario grabar manualmente (Playwright Codegen) el flujo de
alta de viaje con Authorize ya vinculado para resolver esta incógnita — **respuesta pendiente**.

**Regla del usuario "vincular tarjeta → 200"**: los specs de alta de tarjeta Authorize deben capturar
la respuesta HTTP del card-write (endpoint aún no confirmado; candidatos `paymentMethodsByPax`/
`travels` vía `page.route('**/magiis-v0.2/**')`) y **asertar 200** (distinto del quirk 500 del
gateway-link, que es un endpoint distinto).

---

## 5. Tarjetas de test Authorize (SoT: `tests/fixtures/gateways/authorize/cards.ts`)

Trigger por **CVV + ZIP** en números fijos (no por el número de tarjeta):
- **Happy/SUCCESS** (sin 3DS, no aplica): Visa `4111 1111 1111 1111`, CVV `900`, ZIP `90210`,
  exp `12/2030`, holder `MAGIIS QA Test` → Response Code 1 (Approved).
- `SUCCESS_MASTERCARD` = `5424000000000015` · `SUCCESS_AMEX` = `370000000000002` (CVV 4 dígitos `9000`)
  · `SUCCESS_DISCOVER` = `6011000000000012`.
- `DECLINE_GENERIC` = ZIP `46282` · `DECLINE_CVV` = CVV `901` · `CVV_NOT_PROCESSED` = `904`.
- `AVS_NO_MATCH` = ZIP `46205` · `AVS_NON_US` = `46204` · `PARTIAL_AUTH` = `46225` · `PREPAID_ZERO` = `46228`.

**Nota del hallazgo BL-036**: las credenciales sandbox actuales (`AUTHORIZE_API_LOGIN_ID` /
`AUTHORIZE_TRANSACTION_KEY` en `.env.test`) conectan y aprueban transacciones normales, pero **NO
generan los magic-number triggers** (decline con ZIP 46282 dio Approved en vez de Declined; varios
AVS/CVV result codes vinieron vacíos). Puede requerir credenciales sandbox específicas "habilitadas
para test triggers" — investigar con el equipo/Authorize.net si se necesita profundizar ahí.

---

## 6. Decisiones del usuario (vigentes, no re-preguntar)

| Tema | Decisión |
|---|---|
| Ejecución | Local, el agente ejecuta; usuario pausa OneDrive sync antes de correr |
| Ambiente | TEST para automatización (Stripe/Authorize); MercadoPago resto → UAT manual del usuario |
| Estado Xray | EXECUTING al iniciar cada suite → PASSED/FAILED al terminar + evidencia adjunta |
| Orphans (spec sin key MG) | Reportar y arreglar (crear/linkear Test faltante) |
| Scope Authorize | Misma cantidad de TC que Stripe, SIN 3DS (no existe ese paso en Authorize) |
| Regla de negocio observada | Gateway-link: 500=CONECTADA, 400=NO conectada (quirk, reportar defect) |
| Regla de negocio (tarjeta) | Card-link debe asertar 200 (distinto del quirk de arriba) |

**Reglas duras del proyecto (CLAUDE.md, no negociables):**
- MG = **solo entidades Xray** — nunca crear/editar/transicionar incidencias de producto en MG.
  Defects → rutear a DEV/MX.
- No rewrite de historia git, no force-push, no `--no-verify`.
- No commits con atribución IA.
- Confirmar antes de push a `main`.

---

## 7. Próximo paso inmediato (donde se cortó la sesión)

Se le pidió al usuario **grabar manualmente con Playwright Codegen** (`pnpm exec playwright codegen
https://apps-test.magiis.com/#/authentication/login/carrier --output=tests/authorize-link-manual.spec.ts`)
el flujo de **alta de viaje con tarjeta Authorize** (Authorize ya estaba vinculado, así que se saltó el
paso de link/unlink y se pasó directo a probar con el gateway activo):

1. Nuevo Viaje → seleccionar pasajero → origen/destino.
2. Método de pago "Tarjeta de Crédito - Preautorizada".
3. **Observar el formulario de tarjeta que aparece** (¿iframe como Stripe, o inputs nativos? — esto
   resuelve la incógnita de Fase B).
4. Llenar con Visa `4111111111111111` / `12/2030` / CVV `900` / ZIP `90210` (happy, sin 3DS).
5. Validar tarjeta → completar alta de viaje.

**Falta la respuesta del usuario** sobre qué encontró en el paso 3 (tipo de formulario). Con esa
respuesta, se puede completar la Fase B (`AuthorizeCardForm.ts`) y desbloquear toda la Fase C.

---

## 8. Archivos clave tocados esta sesión (para orientarte rápido)

**Restaurados de `dbfa380` (git-reverted) + corregidos:**
- `tests/components/ui/carrier/AppStoreGatewaysPage.ts` — POM principal, ver §3.3.
- `tests/components/steps/GatewaySwitchSteps.ts` — `restoreStripe()` sigue **INCOMPLETO** (falta OAuth
  Connect test-mode + re-seed de tarjeta — hoy hace catch + `console.warn` de restauración manual).
- `tests/features/gateway-pg/specs/authorize/web/carrier/config/authorize-link-unlink.spec.ts` — 5 tests
  (TC1002/1003/1005/1006/1008 → MG-220/221/223/224/226).
- Barrels: `tests/components/steps/index.ts`, `tests/components/ui/carrier/index.ts` (exports re-agregados).

**Modificado (uncommitted, intencional — mantener):**
- `tests/pages/shared/LoginPage.ts` — `LOGIN_GOTO_TIMEOUT` env-driven.

**Documentos de referencia ya existentes (no creados esta sesión, pero centrales):**
- `docs/gateway-pg/authorize/HANDOFF-live-reconciliation-2026-07-24.md` — el handoff previo que
  originó las correcciones de §3.3 (parcialmente superado por lo ya aplicado, pero con contexto extra).
- `docs/gateway-pg/authorize/ARCHITECTURE.md` + `EXTERNAL-BLOCKERS.md` — modelo de integración,
  blockers BL-024/025/028/036/037/038.
- `docs/gateway-pg/authorize/matriz_cases.md` + `matriz_cases2.md` — TS-AUTHORIZE-TC#### completo.
- `docs/ops/BACKLOG.md:626` — BL-038 (Strategy Pattern CardForm, ~17 archivos consumidores estimados).

**En el boilerplate** (`agentic-qa-boilerplate`):
- `.context/magiis-process/atp-mg-gateway-idmap.md` — mapa `TC-PAY-<área>-NN → MG-#### → ATR`.
- `.context/magiis-process/atp-mg-release-gateway.md` — ATP espejo completo (4 PSP, veredicto previo).

---

## 9. Comandos de referencia rápida

```bash
# Auth Xray (desde agentic-qa-boilerplate)
bun xray auth login && bun xray auth status

# Ver estado de un run/execution
bun xray run list --execution MG-511
bun xray run status --id <runId> --status PASSED
bun xray run evidence --id <runId> --file <path>

# Correr specs (desde magiis-playwright, receta anti-OneDrive + anti-timing)
LOGIN_GOTO_TIMEOUT=60000 ENV=test pnpm exec playwright test <target> \
  -c playwright.gateway-pg.config.ts --project=gateway-pg-chromium \
  --output="C:/Users/Erika/AppData/Local/Temp/pw-art" --trace=on --retries=1 --timeout=180000

# Grabar manualmente (Playwright Codegen)
pnpm exec playwright codegen https://apps-test.magiis.com/#/authentication/login/carrier \
  --output=tests/authorize-link-manual.spec.ts
```

---

*Generado 2026-07-24 al cierre de una sesión larga de trabajo sobre MG-178. Si algo de este documento
quedó desactualizado (el estado del carrier 1521 especialmente, dado que hay otra sesión activa),
re-verificar antes de asumir.*
