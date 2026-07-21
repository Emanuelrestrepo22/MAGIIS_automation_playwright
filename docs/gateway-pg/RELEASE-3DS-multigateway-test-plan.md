# Test Plan — Release Stripe 3DS multi-gateway (Carrier · App Pax · App Driver)

> **Ambiente: TEST (obligatorio).** Todas las pruebas de pago de esta release corren en **TEST**.
> Las tarjetas de prueba y el environment solo existen en TEST. **UAT usa tarjetas reales**
> (iteración previa a PROD) → probar pagos ahí es costoso/riesgoso. **Prohibido correr los
> módulos de pago en UAT/PROD.**

| Campo | Valor |
|---|---|
| Release | Stripe 3DS/SCA — cobro directo (marketplace-off) |
| Backend | **MG-3** `[Stripe][BE]` |
| Tickets FE/QA | **MG-20** (Carrier v1), **MG-25** (desvinculación), **MG-26** (App Driver), **MG-27** (App Pax) |
| Owner QA | Emanuel Restrepo |
| Ambiente | **TEST** (`ENV=test`) |
| Fecha plan | 2026-07-20 |
| Alcance | Análisis funcional + estrategia trifuerza + gate de release + roadmap cross-gateway |

## 1. Objetivo

1. Validar que la implementación 3DS de **Stripe** funciona en las 3 patas de la **trifuerza** (UI + API + DB), en Carrier (web), App Pax y App Driver.
2. Validar que el cambio **no rompió** las otras pasarelas de MAGIIS (Authorize.Net, eBizCharge en USA; MercadoPago en LATAM), dejando el plan **estandarizado** para adaptarlo a esas pasarelas cambiando solo el dato de tarjeta.

## 2. Trifuerza a nivel de portafolio

La validación UI/API/DB no vive en un repo: cada pata es un proyecto hijo alineado al HUB `agentic-qa-boilerplate`.

| Pata | Proyecto | Rol en esta release | Estado DB |
|---|---|---|---|
| **API** | `magiis-api-e2e` | Contrato de los endpoints Stripe 3DS (`cardToken`, `cardValidationWith3DS`, `confirm3DSVerification`, `ePayment`, `cleaningWallets`…) vs `openapi.yaml` | Oracle **no implementado** (`db_mcp: null`, TODO) |
| **UI / gateway** | `magiis-playwright` (este repo) | 3DS UI, Hold, desvinculación/switching, cross-gateway | `tests/components/db/OracleDb.ts` (SELECT-only) |
| **UI carrier v2** | `magiis-carrier-v2-e2e` | Portal Carrier v2 (fuera del núcleo de esta release, que es Carrier v1) | — |

> Las pruebas **API automatizables se desarrollan en `magiis-api-e2e`** (no en este repo). Ver `magiis-api-e2e/docs/RELEASE-MG3-payments-api-plan.md`.

## 3. Mapeo endpoint → ticket → cobertura API

La capa API agrupa los endpoints bajo **MG-3** (backend). Mantener MG-3 como owner del endpoint y cross-linkear el ticket FE consumidor en cada TC.

| Endpoint | Ticket(s) FE | Test API (`magiis-api-e2e`) | Estado |
|---|---|---|---|
| `POST passengers/{passengerId}/cardToken` | MG-20, MG-27 | — | 🔴 sin test |
| `cardValidationWith3DS` | MG-20, MG-27 | `TC-MG3-3DSVAL` | 🟡 `test.fixme` |
| `confirm3DSVerification` | MG-20, MG-27 | `TC-MG3-3DSCONFIRM` | 🟡 `test.fixme` |
| `cardValidationWithHold` / `confirmHoldWith3DS` | MG-20 (Hold) | `TC-MG3-HOLD3DS` | 🔴/🟡 fixme |
| `POST carriers/{carrierId}/travels/{travelId}/ePayment` | MG-26 | `TC-MG3-18` | 🟡 `test.fixme` |
| `GET vendor/carrier/{carrierId}/connectedAccount` | MG-26, MG-25 | `TC-MG3-CONNACCT` | 🟢 activo |
| `cleaningWallets` | MG-25 | — | 🔴 sin test |
| `allCards` (regresión "sin wallet ⇒ 200, nunca 500") | — | `TC-MG3-REG-ALLCARDS` | 🟢 activo |

> **Bloqueante de contrato:** el `openapi.yaml` de `magiis-api-e2e` es de `release/v1.72.1` y predata MG-3. Antes de sacar los `fixme` hay que regenerarlo post-deploy MG-3 en TEST. Detalle en el plan API.

## 4. Análisis funcional por ticket

### MG-20 — [Stripe][Carrier v1] 3DS
**Flujos:** alta de tarjeta, validación de tarjeta guardada (`requiresAction`), Hold en creación de viaje.

**Matriz 3DS (4 caminos obligatorios):**
1. `validated=true` → tarjeta validada (como hoy).
2. `validated=false & requiresAction=false` → no validada (como hoy).
3. `validated=false & requiresAction=true` → abre modal 3DS → tras challenge OK → `confirm3DSVerification`.
4. Fallo tras challenge → viaje queda en estado de conflicto / `NO_AUTORIZADO`.

**Bug documentado en el ticket → TC de regresión obligatorio:** edición de viaje da error al seleccionar tarjeta existente; pasa `passenger=0` (`/cards/passengers/0/cardValidationWithHold/1521`).

**A acotar con PO/Dev antes de ejecutar:** el ticket lista 10 puntos de creación de viaje (Front, Pax, Quote, Programado, Recurrente, Multiviaje, Clon, Gnet, Afiliado). Definir cuáles son críticos para 3DS este sprint — no caben los 10 en la estimación.

**Cobertura UI existente:** `tests/features/gateway-pg/specs/stripe/web/carrier/{hold,recovery}/` (POMs `ThreeDSModal.ts`, `ThreeDSErrorPopup.ts`; helpers `helpers/stripe/recovery.helpers.ts`).

**Trifuerza:** UI (modal 3DS + estado viaje) · API (`cardToken`/`cardValidationWith3DS`/`confirm3DSVerification`) · DB (`OracleDb`: tarjeta tokenizada persistida, estado del viaje).

### MG-25 — [Stripe][Carrier v1] Modal de desvinculación (`cleaningWallets`)
**AC (ya en Given/When/Then en el ticket):**
- Modal de aviso aparece y **NO** dispara ninguna llamada hasta confirmar.
- Confirmar → `cleaningWallets(provider)`; **NO** los endpoints viejos (`deleteStripeVendor`, etc.).
- Cancelar/cerrar → sin llamada, vinculación intacta.
- Estado "desvinculación en proceso" (`CLEANING_WALLETS`) → botones vincular/desvincular deshabilitados, **persiste tras recargar** hasta `UNLINKED`.
- i18n es/en de los textos.
- Rechazo prolijo si intenta re-vincular durante `CLEANING_WALLETS`.
- Comportamiento por provider (MercadoPago: wallets en cuenta MAGIIS, puede no borrar tarjetas).

**Dependencia:** backend **MG-24** desplegado en TEST (expone status por provider).

**Rol en el plan multi-gateway:** MG-25 **es** el mecanismo de switching de BL-037 (desvincular Stripe para activar otra pasarela). Su cobertura alimenta el helper `ensureActiveGateway()`.

**Cobertura UI existente:** `specs/stripe/config/gateway-config.spec.ts` (hoy `test.fixme`, `GatewayConfigPage` sin implementar) + placeholder `TS-STRIPE-TC1006` (impedir vincular otro gateway con Stripe activo).

**Trifuerza:** UI (modal, estado en proceso, i18n) · API (`cleaningWallets`, status por provider) · DB (`OracleDb`: verificar que las Card/UserWallet del provider **se borraron**).

### MG-26 — [Stripe][Driver] 3DS pago directo (`ePayment`)
**Flujos:** nuevo `ePayment` (`POST carriers/{carrierId}/travels/{travelId}/ePayment`) antes de `finalize`. 2 escenarios (tarjeta cargada a mano vs. ya cargada) × 3 respuestas: `paymentOK=true`→`finalize`; `paymentOK=false & requiresAction=false`→popup "No se pudo realizar el pago"; `paymentOK=false & requiresAction=true`→3DS→`finalize` con validación OK.

**Caso obligatorio declarado:** compatibilidad hacia atrás — apps no actualizadas siguen llamando `finalize` y deben fallar "como hoy" sin romper el flujo.

**Cobertura:** mobile/Appium (`tests/mobile/appium/...`) + E2E híbrido flow2 (`test:test:e2e:flow2`). Riesgo crítico: **no doble cobro** (webhook async).

**Trifuerza:** UI móvil (Driver App) · API (`ePayment`/`finalize`/`connectedAccount`) · DB (`OracleDb`: viaje `FINALIZADO` + `paymentReference`, sin doble cargo).

### MG-27 — [Stripe][Pax] 3DS
**Flujos:** espejo de MG-20 (alta / validación / alta de viaje) en App Pax. Verificar **consistencia** con Carrier: misma respuesta backend, mismos textos de error.

**Gap a cerrar en refinamiento:** confirmar si endpoints/respuestas en Pax son idénticos a Carrier o difieren.

**Cobertura:** `specs/stripe/e2e-mobile/apppax-{personal,business}-{3ds,no3ds}.e2e.spec.ts` (+ variantes `-hold-`).

## 5. Estrategia de regresión cross-gateway

**Meta (elegida por el líder): regresión UI con switching real.** Por cada pasarela activa (tras desvincular Stripe vía MG-25), correr la suite UI del mismo intent y verificar los mismos estados MAGIIS, vía `test.describe.each(ACTIVE_GATEWAYS)` + `resolveCard({ gateway, intent })`. Piloto verde: `specs/_parametrized/hold-happy-no3ds.parametrized.spec.ts`.

**Bloqueada hoy** por: **BL-037** (switching no automatizado — MG-25 es el insumo), **BL-025** (Authorize sin runtime), **BL-026/027** (MP/eBiz sin datos).

**Gate interino de ESTA release (ejecutable hoy, en TEST):**
1. **API:** `TC-MG3-CONNACCT` + `TC-MG3-REG-ALLCARDS` verdes en `magiis-api-e2e`; el resto de endpoints entra al regenerar el contrato.
2. **UI:** Stripe 3DS verde (MG-20/26/27) + TC regresión del bug `passenger=0` + MG-25 desvinculación verde (con MG-24 desplegado).
3. **DB:** persistencia verificada con `OracleDb` en los flujos críticos (viaje creado/finalizado, wallets borradas).
4. **"No rompí a las otras" sin switching:** `assertAdapterFixtureConsistency()` (detecta drift de `requires3ds`: Stripe `true`, Authorize `false`) + unit specs con network mock. El 3DS es Stripe-only, así que el riesgo real está en **componentes compartidos** (POMs de viaje, journey, unlink) → revisión dirigida de ese contrato.

El switching-real UI completo queda como **roadmap** (§8), no gate del sprint.

## 6. Datos de prueba (TEST)

- **Fuente única:** `tests/fixtures/gateways/<gateway>/` + resolver `tests/fixtures/gateways/_shared/resolver.ts` (`resolveCard({ gateway, intent })`). Ver matriz maestra: `docs/gateway-pg/MATRIZ-MAESTRA-multigateway.md`.
- **En `ENV=test`** el registry `STRIPE_TEST_CARDS` usa valores **hardcodeados** (no requiere `STRIPE_CARD_*` en `.env`) — exactamente el caso de esta release.
- **Prohibido** hardcodear tarjetas/direcciones/pasajeros en specs (ver `docs/gateway-pg/CONTEXT.md` §anti-patterns). Dominio → `journey-defaults.ts`; tarjeta → resolver.

## 7. Comandos de ejecución (todo en TEST)

```bash
# UI — Stripe (workers=1 por el SDK)
pnpm test:test:gateway:stripe          # cross-env ENV=test ... --grep @stripe --workers=1
pnpm test:test:gateway:3ds             # recovery/challenge 3DS
pnpm test:test:gateway                 # feature completo (@gateway)
pnpm test:test:gateway:unit            # unit specs (network mock, sin browser)
pnpm test:test:gateway:api             # contract Authorize sandbox (frente B, BL-036)

# E2E híbrido App Pax (MG-27) / Driver (MG-26)
pnpm test:test:e2e:flow2               # passenger-driver

# API (proyecto hijo magiis-api-e2e)
cross-env ENV=test pnpm test:flows     # incluye mg-3-stripe-direct-charge.api.test.ts
```

> Nota: `specs/README.md` menciona scripts `test:test:gateway-pg:*` que **no existen** en `package.json` (los reales son `test:test:gateway[:stripe|:authorize|:3ds|:unit|:api]`). Corregir esa doc (ítem menor).

## 8. Roadmap (post-release) y backlog

Alineado a los BL existentes en `docs/ops/BACKLOG.md`:
- **BL-037** switching automatizado (`ensureActiveGateway`, apoyado en MG-25) → enabler de la regresión UI cross-gateway. *(P1)*
- **BL-025** runtime Authorize (POM Accept.js + primer spec parametrizado con `['stripe','authorize']`). *(P2)*
- **BL-026** MercadoPago (trigger `holderName` APRO/OTHE/CONT) — LATAM. *(P2)*
- **BL-027** eBizCharge (mecanismo a investigar). *(P3)*
- **BL-028** migrar el resto de specs al patrón `describe.each`. *(P2)*
- **Fix naming:** `fixtures/gateways/README.md` escribe `mercadopago/` pero la carpeta/`GatewayName` usan `mercado-pago` (guion). Corregir. *(P3)*
- **API (`magiis-api-e2e`):** regenerar `openapi.yaml` post-MG-3, completar endpoints `fixme`, crear `cardToken`/`cleaningWallets`/`cardValidationWithHold`, materializar pata DB Oracle. Ver plan API.

## 9. Riesgos y dependencias

| Riesgo / Dep | Impacto | Mitigación |
|---|---|---|
| `openapi.yaml` predata MG-3 | API en `fixme`, shapes no confirmables | Regenerar post-deploy MG-3 en TEST (`generate:openapi` + `catalog:from-be`) |
| MG-24 no desplegado en TEST | MG-25 no probable completo (estado en proceso) | Confirmar deploy antes del handoff |
| Switching single-active (BL-037) | Regresión UI cross-gateway no paralela | Gate interino sin switching; switching como roadmap |
| Doble cobro en `ePayment` (MG-26) | Financiero | Verificar en DB `paymentReference` único + webhook idempotente |
| 10 puntos de creación de viaje (MG-20) | Sobrealcance | Acotar críticos con PO |

## 10. Trazabilidad

Cada TC referencia: ticket FE (`MG-20/25/26/27`), backend (`MG-3`), TC UI (`TS-STRIPE-TCxxxx`) y/o TC API (`TC-MG3-*`). Anotación en specs vía `tests/utils/traceability.ts` → `annotate(testInfo, { tms:'MG-XX', tc:'TS-STRIPE-TCxxxx', issue:'MG-XX' })`.
