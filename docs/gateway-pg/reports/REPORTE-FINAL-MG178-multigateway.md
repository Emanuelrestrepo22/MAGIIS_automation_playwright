# Reporte — Mapeo specs ↔ ATP MG-178, gap analysis y plan multigateway (Authorize + eBizCharge)

> Corte: 2026-07-23 · Autor: QA Automation · ATP: MG-178 "Release Pasarelas de Pago (Gateway) — 4 PSP"
> Alcance de esta sesión: análisis de cobertura + fixes de trazabilidad Xray (aplicados) + ROI + plan de implementación. La implementación de la suite Authorize/eBiz y su ejecución en verde requieren una sesión en vivo contra apps-test (ver §7).

## 1. Resumen ejecutivo

- El ATP MG-178 tiene **374 Xray Tests** (el último comentario aún citaba 341). Reparto por pasarela: **Stripe 204 · Authorize 76 · MercadoPago 5 · eBizCharge 3 · agnóstico 86**.
- **Las 4 pasarelas NO están cubiertas de forma pareja.** Stripe concentra 55% del ATP y está automatizado a fondo. Authorize tiene diseño (76 tests) pero **0 automatización UI** (solo 4 contract API). eBizCharge tiene **3 tests** y **0 automatización**. MercadoPago tiene 5 tests (API + UI smoke).
- La arquitectura para replicar Stripe → otras pasarelas **ya existe** (resolver de tarjetas por intent + adapters por PSP + spec parametrizado). El bloqueo no es de diseño, es de: (a) credenciales sin cablear, (b) soporte backend de Authorize/EBIZ en apps-test sin confirmar, (c) un bug de `.env.test`.
- **Fixes de trazabilidad del /fix-traceability: APLICADOS y verificados** (§4).

## 2. Mapeo specs automatizados ↔ tests del ATP

Puente de trazabilidad = key **MG-####** vía anotación `annotate(testInfo,{tms:'MG-###'})` (helper `tests/utils/traceability.ts`) consumida por `tests/utils/reporters/xray-reporter.ts`. Los strings `TS-STRIPE-TC10xx` del repo NO son 1:1 con los `TC-PAY-*` del ATP (API-level) — se mapea por MG + área.

### magiis-playwright — suite gateway-pg (~78 spec files, ~330 tests)
| Área ATP (grupo) | Specs que la cubren | Estado |
|---|---|---|
| CFG config link/unlink (MG-196 → MG-211..226) | `specs/stripe/config/gateway-config.spec.ts` (Stripe, hoy `fixme`) | Stripe fixme; Authorize/EBIZ = 0 |
| C alta tarjeta (MG-181) | unit `stripe-card-declined.unit.spec.ts` (MG-148); WAL wallet e2e-mobile | parcial |
| D validación 3DS (MG-182) | `recovery/3ds-*.spec.ts` (MG-154/155/157), `visual/3ds-stripe-modal` (MG-152) | Stripe ✅ |
| E hold (MG-183) | `hold/*-hold-{no3ds,3ds}.spec.ts` app-pax/colaborador/empresa (MG-158) | Stripe ✅ (smoke verde) |
| F cobro / CHG cargo a bordo (MG-184/199) | `cargo-a-bordo/*-cargo-{happy,3ds,declines,antifraud}.spec.ts` (MG-161) | Stripe ✅ |
| G desvinculación (MG-185) | `api/vendor-cleaning-wallets/cleaning-wallets{,-db}.api.spec.ts` (MG-166/167..171) | ✅ (MG-166 verde) |
| H wallet lifecycle (MG-186) | `e2e-mobile/apppax-wallet-{management,delete}` (MG-295/302), `api` MG-172 | Stripe ✅ |
| QUOTE (MG-201) | `quote/quote-colaborador.spec.ts` (MG-361) | Stripe ✅ |
| REC recurrentes (MG-202) | `recurrentes/*-recurrente.spec.ts` (MG-390) | Stripe ✅ |
| EDIT/CLON/REACT (MG-203/204/205) | `operaciones/{edicion,clonacion,reactivacion}-*.spec.ts` (MG-415/428/440) | Stripe ✅ |
| MPX MercadoPago (MG-189) | `api/mercado-pago-formal/*` (MG-194/195), `api/mercado-pago/mp-integration-deltas` (MG-160/167/475) | ✅ código; ejecución UAT |
| COB Authorize (MG-200 → MG-346..360, 519..551) | **ninguno** | ❌ 0 automatización |
| WAL Authorize (MG-198 → MG-285..304) | **ninguno** | ❌ 0 |
| CFG Authorize (MG-196 → MG-219..226) | **ninguno** (solo 25 `.feature` Gherkin en el boilerplate, sin código) | ❌ 0 |
| Contract Authorize (BL-036) | `api/authorize-sandbox/contract-{happy,decline,edge,cvv-avs}.api.spec.ts` | ✅ código; skip sin credenciales |

### magiis-api-e2e
| Flujo | Spec | Estado |
|---|---|---|
| MG-3 Stripe cobro directo | `_flows/mg-3-stripe-direct-charge.api.test.ts` | 2 verdes, 4 `test.fixme` (esperan regenerar openapi.yaml) |
| MG-512 hold/cobro probes | `_flows/mg-512-hold-cobro-explore.api.test.ts` | probes |
| MercadoPago explore | `_flows/mp-api-explore.api.test.ts` | read-only |

### agentic-qa-boilerplate (referencia legacy)
| Spec | TC ID | ↔ ATP |
|---|---|---|
| `tests/gateway-legacy/link-stripe-gateway.test.ts` | TC-GATEWAY-LINK-STRIPE-01 | MG-141 (vinculación) |
| `tests/gateway-legacy/unlink-stripe-gateway.test.ts` | TC-GATEWAY-UNLINK-STRIPE-01 | MG-166 (desvinculación + cascada Oracle) |
| `tests/setup/test-10.spec.ts` (recording) | — | fuente del ciclo Stripe unlink→link |
| `tests/setup/test-14/15/16.spec.ts` (recordings) | — | MercadoPago alta/validación tarjeta (PAN sandbox APRO) |
| `scratchpad/*.feature` (25) | TC-PAY-CFG/WAL | Authorize MG-220/221/223/224/226 + MG-285..304 (Gherkin sin código) |

### Auditoría de anotación tms (F1b)
78 specs gateway: **57 con `tms`, 21 sin**. Los 21 sin trazar se dividen en: sin contraparte ATP (creación de viajes no-gateway `e2e/create-*`, `carrier-driver-happy-path-template`, smoke `portals`), cobertura "más allá del ATP" (e2e híbridos flow1/2/3, contract-sandbox Authorize ×4, `counts-reset-db` = MX-6057), y MP-web sin test ATP dedicado (4 specs no-hold/wallet). **Recomendación**: agregar `tms` solo donde exista MG concreto (cargo-3ds→MG-161; contractor/vinculacion-tarjeta→WAL; smoke gateway-pg→MG-158/166); el resto documentar como "sin contraparte ATP". No se agregaron keys inferidas para no importar al test equivocado.

## 3. Gap analysis — cobertura por pasarela y ticket

Matriz ticket × pasarela (asociaciones test→ticket; un test enlazado a N tickets suma en N filas):

| Ticket release | Stripe | MP | Authorize | EBIZ | Agnóstico |
|---|--:|--:|--:|--:|--:|
| MG-3 | 186 | 0 | 20 | 0 | 16 |
| MG-11 | 1 | 0 | 20 | 0 | 8 |
| MG-13 | 1 | 1 | 0 | 1 | 19 |
| MG-20 | 149 | 0 | 0 | 0 | 8 |
| MG-22 | 0 | 0 | 15 | 0 | 9 |
| MG-24 | 8 | 3 | 8 | 0 | 10 |
| MG-25 | 9 | 2 | 8 | 0 | 3 |
| MG-26 | 46 | 0 | 15 | 0 | 12 |
| MG-27 | 62 | 0 | 0 | 0 | 4 |
| MG-43 | 0 | 0 | 0 | 0 | 3 |

**Gaps principales:**
1. **eBizCharge: 3 tests en todo el ATP** (MG-145 vincular sin zipCode, MG-151 alta sin dirección pax, MG-476 alta por modales odnService). Sin cobertura de cobro/hold/desvinculación. 0 automatización.
2. **MercadoPago: 5 tests**, todos API/deltas; el cobro real solo se valida en UAT (sandbox MP no transacciona en test).
3. **Authorize: 76 tests diseñados pero 0 UI automatizada**; 33 (COB MG-519..551) estaban huérfanos de requisito (corregido, §4). Solo los 4 contract API existen en código.
4. **Los 10 tickets del release son todos "[Stripe]"** — MP/EBIZ/Authorize no tienen historia propia; su cobertura cuelga transversalmente.
5. **46 tests con label `gap`** (validaciones de hardening/seguridad/migración aún sin caso ejecutable).
6. **3DS no aplica a Authorize/EBIZ** (`requires3ds=false`) → ~40% de los specs 3DS de Stripe no tienen réplica; es "no aplica", no gap.

## 4. Fix de trazabilidad (/fix-traceability MG-178) — APLICADO

Auditoría de la capa Xray: **íntegra** — el plan MG-178 tiene los 374 tests (Xray layer), los 10 tickets y los 7 ATR (MG-510..516, 99 tests) correctamente enlazados. El espejo Jira-layer estaba en 0 links (cosmético) — NO se rellenó (decisión: ruido masivo sin valor).

Fixes aplicados vía Jira REST v3 (como Emanuel Restrepo, atribución correcta):

| Fix | Detalle | Verificación |
|---|---|---|
| **33 COB → requisito** | MG-519..551 no tenían link a ninguna historia. Creados 66 links "Test" (cada COB "tests" MG-22 y MG-26, mismo patrón que sus hermanos MG-346..360). | 66 correctos, 0 invertidos, 0 faltantes |
| **Label ebizcharge** | Agregado a MG-145, MG-151, MG-476 (antes solo detectables por summary). | JQL `labels=ebizcharge` → 3 |
| **tcid backfill** | 16 tests automated sin `tcid:` etiquetados (grupo+TCn → `tcid:TC-PAY-<área>-<nn>`); MG-194/195 ya lo tenían = 18/18. | spot-check OK (MG-141=A-01, MG-166=G-02, MG-158=E-01) |

> Gotcha documentado: el primer intento de crear los links reportó HTTP 000 por CRLF en `.env` que corrompía la URL con `\r` — pero los POST SÍ commitearon en el servidor. Un segundo intento creó 66 links en dirección invertida; se borraron los 66 invertidos dejando solo los correctos. Lección: extraer vars de `.env` con `tr -d '\r'`, no `. ./.env`.

## 5. Estado de los "a corregir" del último comentario del ATP

| Ítem | Estado |
|---|---|
| Trazabilidad Xray rota (decorador ~44 specs) | ✅ corregido (commit bf3d17c) |
| `--reporter=list` tapaba reporter Xray | ✅ corregido |
| CLI sync subcontaba planes >100 tests | ✅ corregido (commit 1a04740) |
| `.env.test` carrier duplicado (ARG pisa 1521/Stripe) | ⚠️ **bug confirmado, fix diseñado y listo (§6), NO aplicado** — requiere verificación en vivo |
| CI Stripe (credenciales carrier + disparar workflow) | ⬜ pendiente (sesión en vivo + secrets GitHub) |
| MercadoPago ejecución UAT | ⬜ pendiente (manual, tarjeta real) |
| Idempotencia AC9 / 3DS AC6 / enum AC13 | ⬜ decisión Dev/PO — fuera de alcance QA automation |

## 6. Fix definitivo `.env.test` (diseñado, listo para aplicar)

**Causa raíz confirmada**: `.env.test` define `USER_CARRIER` dos veces (líneas 15-16 = carrier 1521 Stripe; 20-21 = carrier ARG `remiseriamagiis`). dotenv toma la última → **toda la suite** (incl. Stripe) resuelve al carrier ARG vía `DISPATCHER[env]` → `USER_CARRIER_TEST || USER_CARRIER`. Ídem `USER_CONTRACTOR` (25-26 vs 31-32) y `DRIVER_EMAIL` (38-39 vs 41-43).

**Fix (aplicar al inicio de la sesión de ejecución, donde se puede verificar corriendo los specs):**
1. `.env.test`: dejar UNA definición por key = valores del 1521/Stripe (default de la suite). Mover el bloque ARG a `USER_CARRIER_MP`/`PASS_CARRIER_MP`, `USER_CONTRACTOR_MP`, `DRIVER_EMAIL_MP`/`DRIVER_PASSWORD_MP`. Agregar placeholders `AUTHORIZE_API_LOGIN_ID/TRANSACTION_KEY/CLIENT_KEY/GATEWAY_ID` y `EBIZ_*` (valores desde `automation-projects/credenciales-gateway/gateway.txt` — el usuario los pega; NUNCA commitear).
2. `tests/fixtures/users/web-portals/dispatcher.ts` + `contractor-collaborator.ts`: resolución gateway-aware — cadena de candidatos `USER_<ROLE>_<GW>_<ENV>` → `USER_<ROLE>_<GW>` → `USER_<ROLE>_<ENV>` → `USER_<ROLE>` (alias GW: mercado-pago→MP, authorize→AUTHORIZE, ebizcharge→EBIZ). Default (sin gateway) = comportamiento actual = Stripe 1521 (backward-compatible).
3. `tests/features/auth/helpers/login.helpers.ts`: `loginAsDispatcher(page, opts?: {gateway?})` y `loginAsContractor(page, opts?)`.
4. Los 4 specs MP (`specs/mercado-pago/web/**`): pasar `{ gateway: 'mercado-pago' }`.
5. `.env.example`: documentar la convención de sufijo.

**Verificación (en vivo)**: `grep -c "^USER_CARRIER=" .env.test` → 1; los 4 contract specs `authorize-sandbox` corren (no skip) y verdes; login MP sigue entrando con ARG; smoke Stripe verde (no-regresión).

> Nota de seguridad: `credenciales-gateway/gateway.txt` son credenciales en texto plano dentro de OneDrive sincronizado. Recomendación: migrar a un gestor de secretos y removerlo de OneDrive.

## 7. Plan de implementación multigateway (replicar Stripe → Authorize/eBiz)

Premisa (confirmada como arquitectura ya existente): mismos flujos UI, cambian los datos de tarjeta por pasarela vía `resolveCard({gateway,intent})`. Piezas ya construidas: `tests/fixtures/gateways/<gw>/{cards,card-policy,card-resolver}.ts` + `_shared/resolver.ts`, adapters `helpers/adapters/*GatewayAdapter.ts`, piloto `specs/_parametrized/hold-happy-no3ds.parametrized.spec.ts` (`ACTIVE_GATEWAYS=['stripe']`).

**Requiere sesión en vivo contra apps-test** (browser + carrier 1521):

- **F3 Probe GO/NO-GO** (read-only): spec probe del App Store (`/#/home/carrier/integrations/list`, selectores portados de `agentic-qa-boilerplate/tests/gateway-legacy/support.ts`) → confirmar que existen las cards Authorize/EBizCharge, abrir sus modales de vinculación (dump de campos + screenshot), cancelar sin submit. Decide si el backend de test soporta cada PSP.
- **F4 Suite UI Authorize** (si GO): POM `AppStoreGatewaysPage` + Steps `GatewaySwitchSteps.ensureActiveGateway()` (BL-037, con restore Stripe + re-seed tarjeta como teardown) + specs CFG (MG-219..226) → WAL (MG-285..304) → COB (MG-346..360/519..551) + `ACTIVE_GATEWAYS=['stripe','authorize']`.
- **F5 eBizCharge**: link/unlink mínimo reusando el POM; crear tests Xray faltantes si los 3 del ATP no cubren link/alta/cobro.
- **F6 api-e2e**: solo si el backend transacciona Authorize (contract directo ya cubierto en PW).
- **F7 Ejecución + consistencia**: 3 corridas verdes (workers=1) + smoke Stripe; import a Xray (exec con environment apps-test); labels `automated`/`ejecutado-verde-test`; disparar CI Stripe.

**⚠️ Riesgo crítico**: el switching de pasarela sobre el carrier 1521 (compartido con toda la suite Stripe) dispara `cleaningWallets` en cascada, que borra la tarjeta 4242 que precondiciona la suite Stripe. Debe correr en ventana exclusiva con teardown de restore + re-seed y smoke Stripe como gate de salida. Estado final invariante: carrier 1521 con Stripe vinculado.

## 8. ROI — qué automatizar de lo que falta (por Test Set)

Verdicto: **Candidate** (automatizar), **Manual** (terminal), **Deferred** (bloqueado).

| Test Set | # | Verdicto | Racional |
|---|--:|---|---|
| A vinculación (MG-179) | 5 | Candidate | API/UI estable; base del switching |
| C alta tarjeta (MG-181) | 7 | Candidate | form compartido; ya parcialmente automatizado |
| D 3DS (MG-182) | 9 | Candidate (Stripe) / N/A (Authorize) | 3DS no aplica a Authorize/EBIZ |
| E hold (MG-183) | 3 | Candidate | ya verde en Stripe |
| F cobro (MG-184) | 10 | Candidate | ya automatizado Stripe |
| G desvinculación (MG-185) | 8 | Candidate | ya verde (MG-166); resto API |
| H wallet (MG-186) | 5 | Candidate | device-dependiente parcial |
| I reportes (MG-187) | 3 | Manual | validación de reporte 028, baja frecuencia |
| J operación PSP (MG-188) | 4 | Deferred | depende de operación backend |
| MPX (MG-189) | 2 | Candidate | ya código; ejecución UAT |
| CFG (MG-196) | 16 | Candidate | objetivo F4 Authorize |
| TRIP (MG-197) | 57 | Candidate | mayoría ya cubierta por specs Stripe |
| WAL (MG-198) | 21 | Candidate | objetivo F4 Authorize |
| CHG cargo a bordo (MG-199) | 41 | Candidate | ya automatizado Stripe; replicar Authorize |
| COB (MG-200) | 48 | Candidate | 33 Authorize objetivo F4; 15 Stripe |
| QUOTE/REC/EDIT/CLON/REACT (MG-201..205) | 85 | Candidate | ya automatizado Stripe |
| L hardening (MG-206) | 23 | Manual/Deferred | PCI/seguridad/infra; mayoría no-UI |
| K migración (MG-207) | 11 | Manual | OAuth/PCI one-time |
| DOC (MG-208) | 6 | Manual | documentación runbook |
| WEB (MG-209) | 4 | Candidate | incluye MG-476 EBIZ/Authorize |
| ENT (MG-210) | 4 | Candidate | entrypoints de alta de viaje |

## 9. Artefactos y trazabilidad

- Rama de trabajo: `carrier/authorize-ebiz-gateway` (magiis-playwright, desde `feature/kata-conformance`).
- Xray: MG-178 (ATP) → ATR MG-510..516 → 374 tests / 99 automatable-api. 18 con label `automated`.
- Fixes de trazabilidad aplicados: 66 links COB + 3 labels ebizcharge + 16 tcid.
- Backup de `.env.test` (pre-fix): en scratchpad de la sesión.
