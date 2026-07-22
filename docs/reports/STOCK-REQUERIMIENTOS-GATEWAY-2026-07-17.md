# Stock de Requerimientos — Gateway PG (cobertura, faltantes y soluciones)

**Fecha:** 2026-07-17 · **Alcance:** flujo completo de gateway/pagos (Stripe, Authorize.net, EbizCharge, Mercado Pago) en `magiis-playwright`, entorno objetivo **`test`**.
**Fuentes:** `docs/gateway-pg/**` (matrices, TRACEABILITY, ARCHITECTURE, CONTEXT, EXTERNAL-BLOCKERS), `contracts/gateway-pg.types.ts`, `helpers/adapters/*`, `fixtures/gateways/*`, specs reales.
**Leyenda:** ✅ implementado · ⊘ esqueleto/draft (fixme/skip/gated) · ❌ falta (documentado sin implementación).

---

## 1. Resumen ejecutivo de cobertura

| Pasarela | Requerimientos (doc) | ✅ impl | ⊘ fixme/draft | ❌ falta | Estado |
|---|--:|--:|--:|--:|---|
| **Stripe** | 190 TC canónicos | 50 | 112 | 28 | Único con cobertura real; 0% pasa en `test` por gap de entorno |
| **Authorize.net** | ~78 TC | 0 web · 7 API-contract | 0 | ~71 | Slot web vacío (solo README); 3 specs API sandbox |
| **EbizCharge** (BL-027) | sin matriz | 0 | 0 | todo | Adapter declarado; resolver lanza excepción; 0 fixtures/docs/specs |
| **Mercado Pago** (BL-026) | sin matriz | 0 | 0 | todo | Ídem EbizCharge |

**Interpretación:** el desarrollo Stripe es sólido en diseño (190 TC mapeados) pero **la ejecución está bloqueada en `test`** (falta método "Preautorizada" — ver `ENV-TEST-GATEWAY-PAYMENT-GAP.md`) y **62%** son esqueletos que dependen de POMs/Appium/seeds. Authorize/EbizCharge/MercadoPago son mayormente requerimientos **sin implementar**.

---

## 2. Stock por módulo — Stripe (SoT: docs/gateway-pg/stripe/matriz_cases*.md)

| Módulo | Canónicos | ✅ | ⊘ | ❌ | Faltante/bloqueo principal |
|---|--:|--:|--:|--:|---|
| Config (TC1001–1008) | 8 | 0 | 8 | 0 | POM `GatewayConfigPage` + creds App Store |
| Hold carrier (Sec 4–6) | 34 | 32 | 2 | 0 | TC1063/1064: componente payment-method en travel-detail |
| Cargo-a-bordo | 41 | 3 | 38 | 0 | fase Driver App (Appium) + `DriverTripPaymentScreen` |
| Contractor | 7 | 7 | 0 | 0 | — (completo en diseño) |
| Quote | 28 | 8 | 0 | 20 | **specs quote personal/empresa/sin-filiatorios inexistentes** |
| Recurrentes | 25 | 0 | 19 | 6 | POM `RecurrentTravelPage` + specs contractor recurrente |
| Operaciones | 30 | 0 | 30 | 0 | seeds de viaje (cancelado/finalizado/conflicto) en `test` |
| E2E-mobile | 17 | 0 | 15 | 2 | Appium device + `APPIUM_SERVER_URL`; TC1015/1016 sin mapeo |

**Faltantes duros Stripe (28):** Quote personal+empresa+sin-filiatorios (20: P2-TC007–010, 019–034); Recurrente portal Contractor (6: P2-TC035–040); App-pax 3DS variantes (2: TC1015/1016).
**Crítico entre los esqueletos:** P2-TC047 (recurrente + edición de fechas, marcado ⚠️ caso crítico).

---

## 3. Stock — Authorize.net (SoT: docs/gateway-pg/authorize/matriz_cases*.md)

- **0 specs web** (el slot `specs/authorize/` solo tiene README). **7 contract tests API** (BL-036) cubren triggers sandbox: CVV 900→M (Visa/MC/Amex), ZIP 46282→RC2, CVV 901→N, CVV 904→P, ZIP 46205→N.
- Principio confirmado: **mismo desarrollo, cambian los datos de tarjeta** (CVV/ZIP/marca) → resultado esperado. `AUTHORIZE_CARDS` ya tiene 11 entradas.
- **Faltantes:**
  1. Specs web Authorize (la matriz los pide, estructura espejo de Stripe) — **prioridad 1**: piloto `web/carrier/hold/` TC1011 (SUCCESS) + TC1016 (DECLINE) vía `resolveCard({gateway:'authorize'})`.
  2. POM web Authorize (`tests/pages/carrier/Authorize*.ts`) — inexistente.
  3. Helper `ensureActiveGateway('authorize')` + suite `@gateway-switching` (BL-037) — pasarela única global.
  4. Contract tests API faltantes para triggers ya en policy sin cobertura: `SUCCESS_DISCOVER`, `AVS_NON_US` (46204), `PARTIAL_AUTH` (46225), `PREPAID_ZERO` (46228) — baratos de agregar.
  5. Overrides de tarjeta ausentes en fixtures: CVV 902/903, AVS W/X/Z/R/E, prepaid 46226/46227.
- **Bloqueos externos (EXTERNAL-BLOCKERS):** §1 creds sandbox (`AUTHORIZE_API_LOGIN_ID/TRANSACTION_KEY`), §2 decisión líder (¿PROD usa Authorize?), §3 modelo integración (Accept.js vs API), §4 selectores POM, §5 backend routing `gateway='authorize'`.

---

## 4. Stock — EbizCharge (BL-027) y Mercado Pago (BL-026)

Ambos: adapter declarativo ✅ + registrado en el map ✅, pero **resolver lanza excepción**, `SUPPORTED_INTENTS_BY_GATEWAY=[]`, sin fixtures/docs/POMs/specs. Requerimientos = **todo por implementar**.

**Solución (misma receta para cada uno):**
1. Analizar doc del proveedor (mecanismo de outcome: EbizCharge por CVC/número; Mercado Pago por `holderName` APRO/OTHE/CONT).
2. Poblar `tests/fixtures/gateways/<gw>/{cards,card-policy,card-resolver}.ts`.
3. Agregar `<GW>_INTENT_MAP` + case en `_shared/resolver.ts`; poblar `SUPPORTED_INTENTS_BY_GATEWAY`.
4. Docs `docs/gateway-pg/<gw>/{README,matriz_cases,TRACEABILITY,ARCHITECTURE}.md`.
5. POMs + specs (estructura espejo).
> ⚠️ Inconsistencia a normalizar: carpeta `fixtures/gateways/mercadopago` vs id `'mercado-pago'` (con guion).

---

## 5. Requerimientos de FLUJO (transversales)

| Req | Estado | Nota / faltante |
|---|:--:|---|
| Portal carrier | ✅ | specs web carrier |
| Portal contractor | ⊘ | solo Stripe happy paths; vinculación tarjeta pendiente |
| Portal pax (App Pax) | ⊘ | drafts Appium |
| Journey web (setup+trip) | ✅ | flow1 web-phase |
| Journey mobile (driver accept/route/complete) | ⊘ | Appium draft; requiere device |
| `payment_validation` (fase final) | ⊘ | `validationSources:[]`; depende de fase mobile |
| E2E flow1 / flow2 / flow3 | ⊘ | drafts; **flow3 no tiene tipo en `E2EFlowType`** (gap de contrato) |
| **Trifuerza DB (UI+API+DB)** | ❌ | infra existe (`OracleDb.ts`+`db.fixtures.ts`) pero **asserts DB no cableados** en flows E2E |
| Switching gateway exclusivo (`ensureActiveGateway`, BL-037) | ❌ | requerido en CONTEXT.md, **helper no implementado** |
| Datos centralizados + resolver polimórfico | ✅ | `journey-defaults`, `resolveCard`, adapters |
| Parametrizados cross-gateway (BL-028) | ⊘ | `ACTIVE_GATEWAYS=['stripe']` únicamente |

---

## 6. Gaps de ENTORNO / TMS / GOBERNANZA (bloqueantes)

| Gap | Impacto | Dueño | Task |
|---|---|---|---|
| Método "Preautorizada"/Stripe ausente en apps-test | 94/94 gateway fallan; bloquea toda la cobertura en `test` | DevOps/config | #11 |
| MG sin QA TASK/Defecto/Nueva función | flujo QA real (worklog/defectos) bloqueado | Jira admin | #15 |
| Creds sandbox Authorize (`AUTHORIZE_*`) | bloquea Authorize | Lead QA/Backend | #12 |
| Doc + creds EbizCharge | bloquea EbizCharge | Proveedor/usuario | #13 |
| Xray keys / poblar TMS MG (MG ya tiene Xray) | trazabilidad incompleta | QA + Jira | #14 |
| Appium device + `APPIUM_SERVER_URL` | e2e-mobile no corre | QA infra | — |
| Seeds de viaje (cancelado/finalizado/conflicto) en test | operaciones (30 TC) no ejecutables | QA data | — |

---

## 7. Plan de soluciones — priorizado

### Implementable YA (sin bloqueantes, pura consistencia/estructura)
1. Declarar `flow3-contractor-driver` en `E2EFlowType` (gap de contrato).
2. Normalizar naming `mercadopago`→`mercado-pago` (carpeta vs id) antes de poblar.
3. Retirar/actualizar `docs/gateway-pg/test-ids.md` (esquema legacy TS-GATEWAY que apunta a specs inexistentes).
4. Contract tests API Authorize faltantes (SUCCESS_DISCOVER, AVS_NON_US, PARTIAL_AUTH, PREPAID_ZERO) — mismo patrón BL-036, corren solo si hay creds.
5. Cablear asserts DB (trifuerza) en flow1 usando el fixture `{db}` ya creado.

### Bloqueado por entorno/decisión (gate → luego implementar)
6. Cobertura Stripe real (los 50 impl + levantar esqueletos) → requiere **#11** (pago en test).
7. POMs faltantes: `GatewayConfigPage`, `RecurrentTravelPage`, `DriverTripPaymentScreen` (Appium) → levantan config(8)+recurrentes(19)+cargo(38)+e2e-mobile(15).
8. Quote specs (20 faltantes) → POM quote.
9. Authorize web specs → **#12** + creds + POM + modelo integración.
10. EbizCharge / Mercado Pago → **#13** + doc proveedor.
11. Master Test Plan en Xray MG → **#14** + **#15**.

---

## 8. Notas de trazabilidad
- IDs canónicos salen de `docs/gateway-pg/<gw>/matriz_cases*.md` (regla del CLAUDE.md).
- `matriz_cases2.md` §12 (re-validación 3DS post-fallo) = área sin TC-ID asignado; cubierta de facto por TC1061/1063/1064.
- Huérfanos (spec sin req en matriz): `unit/stripe-card-declined` (BL-043), `_parametrized/hold-happy-no3ds` (BL-028), `carrier-driver-happy-path-template` (FLOW1-TC01).
- SMOKE-GW-TC14 (unhappy contractor P2-TC090): en smoke pero **sin TC en matriz** → crear TC + spec dedicado.
