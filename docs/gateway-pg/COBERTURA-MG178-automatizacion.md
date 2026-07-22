# Cobertura MG-178 → Automatización (UI + API)

> **Qué es esto:** matriz que cruza el Test Plan **MG-178** ("ATP · Release Pasarelas de Pago — 4 PSP", 341 TCs, suites MG-510..516) contra lo **ya desarrollado** en automatización: UI (`magiis-playwright`) + API (`magiis-api-e2e`).
>
> **Fecha:** 2026-07-21 · **Alcance:** Stripe 3DS (release Emanuel: MG-20/25/26/27, backend MG-3).
>
> ⚠️ **Mapeo APROXIMADO por ÁREA.** No existe un idmap 1:1 (`atp-mg-gateway-idmap.md` no está creado). El único vínculo formal entre automatización y Jira es la key `MG-####` (annotation `type:'tms'` vía `@atc`). Los 99 candidatos API-automatizables y los TCs individuales del plan **no tienen correspondencia exacta** — se agrupan por área funcional.

## 1. Fuentes de verdad

| Capa | Fuente | Vínculo Jira |
|---|---|---|
| UI | `@atc('MG-####')` en Page components (`tests/components/ui/**`) + `ThreeDsChallengePage` | `type:'tms'` (Xray) + `type:'tc'` |
| UI (specs) | `[TS-STRIPE-TCxxxx]` en títulos de test (matriz interna) | convención `TS-<GATEWAY>-TCxxxx` |
| API | `TC-MG3-*` en `tests/specs/_flows/mg-3-stripe-direct-charge.api.test.ts` vía `makeAnnotate('MG-3')` | `type:'tms'`=MG-3 + `type:'tc'`=MG-3-`<TC>` |

## 2. Áreas cubiertas por UI (verificado por `@atc` reales)

| Área | Acción (ATC) | Ticket `@atc` | Componente | Estado |
|---|---|---|---|---|
| **C** — Alta de viaje / validación tarjeta preautorizada | `fillMinimum` | **MG-148** | `CarrierNewTravelPage` | 🟢 desarrollado |
| **C** — Alta de viaje contractor | `fillMinimum` | **MG-148** | `ContractorNewTravelPage` | 🟢 desarrollado |
| **C** — Alta contractor: tarjeta guardada del colaborador | (saved card) | **MG-482** | `ContractorNewTravelPage` | 🟢 desarrollado |
| **D** — Challenge 3DS: aprobar (COMPLETE) | `completeSuccess` | **MG-152** | `ThreeDsChallengePage` | 🟢 desarrollado |
| **D** — Challenge 3DS: rechazar (FAIL) | `completeFail` | **MG-153** | `ThreeDsChallengePage` | 🟢 desarrollado |
| **E** — Verificar viaje en "Por Asignar" post-hold | `expectPassengerInPorAsignar` | **MG-158** | `CarrierTravelManagementPage` | 🟢 desarrollado |
| **F** — Alta Cargo a Bordo | `fillMinimumCargo` | **MG-161** | `CarrierNewTravelPage` | 🟢 desarrollado |
| **Edición** — Edición viaje: vincular + validar tarjeta | (edit link) | **MG-415** | `CarrierTravelDetailPage` | 🟢 desarrollado |
| **Edición** — Edición viaje: seleccionar tarjeta + recalcular | (edit select) | **MG-416** | `CarrierTravelDetailPage` | 🟢 desarrollado |

> Todos los `@atc` de arriba llevan la nota **"PENDIENTE REASIGNAR"** en los specs: los MG-1xx/4xx son keys de acción a nivel API-component, **no** 1:1 con `TS-STRIPE-TC10xx` (UI) ni con los 99 candidatos del plan.

## 3. Cobertura API (`magiis-api-e2e` — endpoints MG-3)

| TC API | Endpoint | Ticket FE | Estado |
|---|---|---|---|
| `TC-MG3-REG-ALLCARDS` | `GET passengers/{id}/allCards` (regresión "nunca 500") | — | 🟢 activo (endpoint existe v1.72.1) |
| `TC-MG3-CONNACCT` | `GET vendor/carrier/{id}/connectedAccount` | MG-26, MG-25 | 🟢 activo (GET read-only) |
| `TC-MG3-3DSVAL` | `cardValidationWith3DS` | MG-20, MG-27 | 🟡 `test.fixme` (ruta nueva MG-3; contrato v1.72.1 predata) |
| `TC-MG3-3DSCONFIRM` | `confirm3DSVerification` | MG-20, MG-27 | 🟡 `test.fixme` (depende de paymentIntent en requires_action + 3DS interactivo) |
| `TC-MG3-HOLD3DS` | `confirmHoldWith3DS` | MG-20 (Hold) | 🟡 `test.fixme` (body/estado a confirmar con dev) |
| `TC-MG3-18` | `epayment finalize` (webhook async) | MG-26 | 🟡 `test.fixme` (riesgo doble cobro; ruta a confirmar) |
| — | `POST passengers/{id}/cardToken` | MG-20, MG-27 | 🔴 sin test (solo `CardTokenDTO` en contrato) |
| — | `cleaningWallets` | MG-25 | 🔴 sin test (ni en contrato ni catálogo) |
| — | `cardValidationWithHold` | MG-20 | 🔴 sin test propio |

**Prerrequisito bloqueante de los 🟡/🔴:** el `openapi.yaml`/catálogo son de `release/v1.72.1` y **predatan MG-3** → rutas/bodies no confirmables. Desbloqueo: deploy MG-3 en TEST + `pnpm generate:openapi && pnpm catalog:from-be && pnpm generate:types`.

## 4. Matriz por suite MG-510..516 (mapeo real suite→área, del comentario 34350)

> El plan define las suites por ÁREA (A..L, COB, MPX). El cruce con automatización es por **área** (no por TC individual — sigue faltando idmap 1:1). Suites/áreas tomadas del reporte de diseño (comentario MG-178/34350).

| Suite (ATR) | Áreas | # cand. | UI desarrollado | API desarrollado | Veredicto |
|---|---|---|---|---|---|
| **MG-510** · Vinculación & gate | A, B | 7 | — | — | 🔴 NO cubierto (vinculación PSP no automatizada) |
| **MG-511** · Alta/validación tarjeta & 3DS | C, D | 13 | 🟢 MG-148 (alta) + MG-152/153 (3DS) + recovery specs | 🟡 3DSVAL/3DSCONFIRM fixme | **UI cubierto / API bloqueado** |
| **MG-512** · Hold & cobro | E, F, COB | 28 | 🟢 MG-158 (Por Asignar) + MG-161 (cargo) + hold specs KATA | 🟡 HOLD3DS + TC-MG3-18 fixme | **UI cubierto / API bloqueado** |
| **MG-513** · Wallet lifecycle & pax | H | 5 | 🟡 parcial | 🔴 sin test | **parcial** |
| **MG-514** · Hardening PG | L | 23 | — | 🟢 allCards (regresión "nunca 500") | **API parcial (regresión)** |
| **MG-515** · Desvinculación & cleaning | G | 6 | 🔴 config `fixme` (GatewayConfigPage sin impl) | 🔴 `cleaningWallets` sin test | 🔴 NO cubierto (MG-25) |
| **MG-516** · Operación PSP & migración | K, J, MPX | 17 | — | 🟡 CONNACCT 🟢 activo (parte) | **API parcial** |
| **Total candidatos** | | **99** | | | |

> **Edición de viaje** (MG-415/416, UI 🟢) y **contractor** (MG-482, UI 🟢) están desarrollados pero caen en áreas EDIT/TRIP que el plan clasifica como **manuales** (242) — cobertura extra sobre lo que el plan marcaba automatizable.

## 5. Gaps honestos

1. **Idmap 1:1 ausente** — no hay `atp-mg-gateway-idmap.md`; el mapeo es por área. Los 99 candidatos API individuales del plan no tienen correspondencia exacta.
2. **API MG-3 mayormente bloqueada** — 4 TC en `fixme` + 3 sin test, todos gated por el `openapi.yaml` de v1.72.1 (predata MG-3). Solo 2 verdes (`connectedAccount`, `allCards`).
3. **MG-25 (desvinculación) sin cobertura** — `GatewayConfigPage` sin implementar (UI `fixme`); `cleaningWallets` sin test API. Es además el enabler del switching cross-gateway (BL-037).
4. **MG-26 (Driver) fuera de KATA** — cobertura en specs mobile `@e2e-hybrid` (Appium), aún en `TestBase`.
5. **empresa/individuo passenger-disabled OMITIDO** — data-init defectuosa (módulo aparte), no es foco de esta release.
6. **Bug de producto documentado** — toggle "Aplicar Pre-Autorización" (v1.72.8) no habilita Guardar/persiste → workaround vía API (`setHoldViaApi`). Ver `docs/reports/BUG-v1.72.8-preauth-save-regression.md`.

## 6. Conformidad KATA (auditoría 2026-07-21)

Checklist de invariantes KATA: (1) `test/expect` desde `@TestFixture`; (2) orquestación en `@steps/*`, no en el spec; (3) `@atc` en Page components; (4) componentes `extends UiBase`/`ApiBase`/`TestContext`; (5) imports por alias; (6) `@step` solo en helpers read-only.

**Resultado (45 specs, excluye README):** 🟢 **33 conformes** (importan `@TestFixture`) · 🔴 **11 no conformes** (aún `TestBase`).

> Mejora vs baseline del plan (17/7/17 = 41): la migración KATA en paralelo subió los conformes de 17 → **33**. Los families hold (apppax/colaborador/empresa × 3ds/no3ds), cargo-a-bordo y edición-programados están **plenamente** KATA (orquestación confirmada en `CarrierHoldSteps.runHoldScenario` / `CargoABordoSteps` + Page components `@ui` con `@atc`).

**11 specs pendientes de migrar (🔴 `TestBase`):**

| Spec | Grupo | Motivo |
|---|---|---|
| `e2e-mobile/apppax-business-3ds.e2e` | mobile | Appium `@e2e-hybrid`, sustrato mobile |
| `e2e-mobile/apppax-business-hold-3ds.e2e` | mobile | ídem |
| `e2e-mobile/apppax-business-hold-no3ds.e2e` | mobile | ídem |
| `e2e-mobile/apppax-business-no3ds.e2e` | mobile | ídem |
| `e2e-mobile/apppax-personal-3ds.e2e` | mobile | ídem |
| `e2e-mobile/apppax-personal-no3ds.e2e` | mobile | ídem |
| `e2e-mobile/carrier-driver-happy-path-template` | mobile | template flow2 híbrido |
| `web/carrier/recovery/3ds-failure` | recovery | 3DS iframe + serial, POM legacy `ThreeDSModal` |
| `web/carrier/recovery/3ds-retry-card-change` | recovery | ídem |
| `web/carrier/recovery/recorded-3ds-happy-path` | recovery | recorded (codegen), POM legacy |
| `web/carrier/recovery/recorded-3ds-preauth-failure` | recovery | recorded, POM legacy |

> **Sin gate automatizado de conformidad.** Propuesta (no en este pase): check liviano en `consistency-check.mjs` que marque specs bajo `gateway-pg/specs/**` que importen de `TestBase` en lugar de `@TestFixture`.

## 7. Nota de ambiente (canónica)

**Los módulos de pago corren SOLO en TEST.** En UAT las pasarelas usan **tarjetas reales**: la actividad de pruebas es inusual y **los PSP bloquean las cuentas**. Los suites de pago fijan `ENV=test` y saltan si `ENV!=='test'`; las mutaciones requieren `ALLOW_MUTATIONS=1` (solo TEST).
