# Gateway PG (Stripe) — Smoke Scope Expandido y Trazabilidad

**Módulo:** Gateway PG · Stripe
**Suite destino:** `tests/features/smoke/specs/gateway-pg.smoke.spec.ts`
**Script CI destino:** incluido en `pnpm run test:test:smoke` (corre todos los specs de la carpeta smoke)
**Estado:** ✅ Spec implementado — pendiente validación en CI con secrets `USER_CONTRACTOR` / `PASS_CONTRACTOR`

---

## Criterios de inclusión en smoke

El scope de esta suite responde a los siguientes ejes de cobertura mínima:

| Eje | Cobertura requerida |
|---|---|
| Tipos de cliente | Al menos uno por tipo: AppPax · Colaborador · Empresa |
| Hold | Hold ON y Hold OFF por tipo de cliente |
| 3DS | Con y sin autenticación 3DS en el happy path |
| Portal de alta | Alta desde Carrier y desde Contractor |
| Vinculación de tarjeta | Al menos una vinculación nueva por tipo de cliente y portal |
| Unhappy path | Al menos uno por portal (carrier + contractor) |
| Cargo a Bordo | Al menos un happy path por tipo de cliente disponible en web |

---

## Resumen de cobertura

| Dimensión | Total casos de smoke |
|---|---|
| Portal Carrier | 9 |
| Portal Contractor | 4 |
| **Total smoke** | **13** |

---

## Portal Carrier

### AppPax

| SMOKE ID | TC Fuente | Descripción del caso | Hold | 3DS | Tipo | Estado spec |
|---|---|---|---|---|---|---|
| SMOKE-GW-TC01 | TS-STRIPE-TC1049 | AppPax · Hold ON · tarjeta sin 3DS (4242) → viaje a SEARCHING\_DRIVER | ON | ❌ | ✅ Positivo | Implementado (`apppax-hold-no3ds.spec.ts`) |
| SMOKE-GW-TC02 | TS-STRIPE-TC1053 | AppPax · Hold ON · tarjeta con 3DS éxito (3155) → modal aprobado → SEARCHING\_DRIVER | ON | ✅ | ✅ Positivo | Implementado (`recorded-3ds-happy-path.spec.ts`) |
| SMOKE-GW-TC03 | TS-STRIPE-TC1050 | AppPax · Hold OFF · tarjeta sin 3DS (4242) → viaje sin preautorización | OFF | ❌ | ✅ Positivo | Implementado (`apppax-hold-no3ds.spec.ts`) |
| SMOKE-GW-TC04 | TS-STRIPE-TC1081 | AppPax · Cargo a Bordo · tarjeta crédito → pago exitoso | N/A | ❌ | ✅ Positivo | Implementado (`apppax-cargo-happy.spec.ts`) |

### Colaborador

| SMOKE ID | TC Fuente | Descripción del caso | Hold | 3DS | Tipo | Estado spec |
|---|---|---|---|---|---|---|
| SMOKE-GW-TC05 | TS-STRIPE-TC1033 | Colaborador · Hold ON · tarjeta sin 3DS → SEARCHING\_DRIVER | ON | ❌ | ✅ Positivo | Implementado (`colaborador-hold-no3ds.spec.ts`) |
| SMOKE-GW-TC06 | TS-STRIPE-TC1037 | Colaborador · Hold ON · tarjeta con 3DS éxito → SEARCHING\_DRIVER | ON | ✅ | ✅ Positivo | Implementado (`colaborador-hold-3ds.spec.ts`) |
| SMOKE-GW-TC07 | TS-STRIPE-TC1096 | Colaborador · Cargo a Bordo · pago exitoso | N/A | ❌ | ✅ Positivo | Implementado (`contractor-cargo-happy.spec.ts`) |

### Empresa

| SMOKE ID | TC Fuente | Descripción del caso | Hold | 3DS | Tipo | Estado spec |
|---|---|---|---|---|---|---|
| SMOKE-GW-TC08 | TS-STRIPE-TC1065 | Empresa · Hold ON · tarjeta sin 3DS → SEARCHING\_DRIVER | ON | ❌ | ✅ Positivo | Implementado (`empresa-hold-no3ds.spec.ts`) |
| SMOKE-GW-TC09 | TS-STRIPE-TC1111 | Empresa · Cargo a Bordo · pago exitoso | N/A | ❌ | ✅ Positivo | Implementado (`empresa-cargo-happy.spec.ts`) |

### Unhappy paths — Portal Carrier

| SMOKE ID | TC Fuente | Descripción del caso | Escenario de fallo | Tipo | Estado spec |
|---|---|---|---|---|---|
| SMOKE-GW-TC10 | TS-STRIPE-TC1057 | AppPax · Hold ON · 3DS rechazado (9235) → pop-up error → estado NO\_AUTORIZADO | Rechazo 3DS | ❌ Negativo | Implementado (`3ds-failure.spec.ts`) |

---

## Portal Contractor

### Colaborador con tarjeta nueva (vinculación en el flujo)

| SMOKE ID | TC Fuente | Descripción del caso | Hold | 3DS | Tipo | Estado spec |
|---|---|---|---|---|---|---|
| SMOKE-GW-TC11 | TS-STRIPE-P2-TC001 | Colaborador · Hold ON · vinculación tarjeta nueva (4242) → SEARCHING\_DRIVER | ON | ❌ | ✅ Positivo | Implementado (`colaborador-hold-no3ds.spec.ts`) |
| SMOKE-GW-TC12 | TS-STRIPE-P2-TC005 | Colaborador · Hold ON · tarjeta con 3DS éxito → SEARCHING\_DRIVER | ON | ✅ | ✅ Positivo | Implementado (`colaborador-hold-3ds.spec.ts`) |
| SMOKE-GW-TC13 | TS-STRIPE-P2-TC002 | Colaborador · Hold OFF · vinculación tarjeta nueva → viaje sin preautorización | OFF | ❌ | ✅ Positivo | Implementado (`colaborador-hold-no3ds.spec.ts`) |

### Unhappy paths — Portal Contractor

| SMOKE ID | TC Fuente | Descripción del caso | Escenario de fallo | Tipo | Estado spec |
|---|---|---|---|---|---|
| SMOKE-GW-TC14 | ⚠️ TC a definir | Colaborador · Hold ON · tarjeta declinada (9995) → error visible → viaje no creado | Fondos insuficientes | ❌ Negativo | ⚠️ Pendiente — spec no existe, requiere nuevo TC en matriz |

---

## Gaps y pendientes

| Gap | Impacto | Acción requerida |
|---|---|---|
| TC unhappy path contractor no existe en matriz | No hay cobertura smoke de fallo en portal contractor | Crear TC en `docs/gateway-pg/stripe/matriz_cases.md` y spec en `contractor/` |
| TS-STRIPE-P2-TCxxx: formato de ID diferente al estándar `TS-STRIPE-TCxxxx` | Riesgo de inconsistencia en reportes y trazabilidad | Revisar si deben normalizarse en la próxima revisión de matriz |
| Vinculación de tarjeta AppPax (wallet) no tiene spec smoke web-only | No hay cobertura smoke de card-linking desde Carrier | Revisar si hay TC en matriz para vinculación desde portal carrier |
| Cargo a Bordo negativo (fondos insuficientes, tarjeta perdida) requiere Appium (Driver App) | 6 TCs bloqueados: TC1082–TC1086, TC1112–TC1116 | Fuera de scope smoke web. Marcar como `@needs-appium` |

---

## Archivos relacionados

| Propósito | Archivo |
|---|---|
| Spec smoke actual (2 TCs base) | `tests/features/smoke/specs/gateway-pg.smoke.spec.ts` |
| AppPax hold sin 3DS | `tests/features/gateway-pg/specs/stripe/carrier/hold/apppax-hold-no3ds.spec.ts` |
| AppPax hold con 3DS | `tests/features/gateway-pg/specs/stripe/recorded-3ds-happy-path.spec.ts` |
| 3DS failure + reintento | `tests/features/gateway-pg/specs/stripe/3ds-failure.spec.ts` |
| Colaborador hold sin 3DS (carrier) | `tests/features/gateway-pg/specs/stripe/carrier/hold/colaborador-hold-no3ds.spec.ts` |
| Colaborador hold 3DS (carrier) | `tests/features/gateway-pg/specs/stripe/carrier/hold/colaborador-hold-3ds.spec.ts` |
| Empresa hold sin 3DS (carrier) | `tests/features/gateway-pg/specs/stripe/carrier/hold/empresa-hold-no3ds.spec.ts` |
| AppPax cargo a bordo happy | `tests/features/gateway-pg/specs/stripe/carrier/cargo-a-bordo/apppax-cargo-happy.spec.ts` |
| Colaborador cargo a bordo happy | `tests/features/gateway-pg/specs/stripe/carrier/cargo-a-bordo/contractor-cargo-happy.spec.ts` |
| Empresa cargo a bordo happy | `tests/features/gateway-pg/specs/stripe/carrier/cargo-a-bordo/empresa-cargo-happy.spec.ts` |
| Contractor colaborador hold sin 3DS | `tests/features/gateway-pg/specs/stripe/contractor/colaborador-hold-no3ds.spec.ts` |
| Contractor colaborador hold 3DS | `tests/features/gateway-pg/specs/stripe/contractor/colaborador-hold-3ds.spec.ts` |
| Datos y tarjetas Stripe | `tests/features/gateway-pg/data/stripeTestData.ts` |
| Fixtures de gateway | `tests/features/gateway-pg/fixtures/gateway.fixtures.ts` |
| Matriz de TCs fuente | `docs/gateway-pg/stripe/matriz_cases.md` |

---

## Orden de implementación en smoke spec

Prioridad basada en criticidad de negocio y riesgo técnico:

1. **Fase 1 — Base ya implementada**
   - SMOKE-GW-TC01 (AppPax · Hold ON · sin 3DS) ✅
   - SMOKE-GW-TC10-unhappy (AppPax · Hold · fondos insuficientes) ✅ *(parcial — en spec base)*

2. **Fase 2 — Ampliar carrier happy paths**
   - SMOKE-GW-TC02 (AppPax · Hold ON · 3DS éxito)
   - SMOKE-GW-TC03 (AppPax · Hold OFF)
   - SMOKE-GW-TC05 (Colaborador · Hold ON · sin 3DS)
   - SMOKE-GW-TC08 (Empresa · Hold ON · sin 3DS)

3. **Fase 3 — Cargo a Bordo**
   - SMOKE-GW-TC04 (AppPax · Cargo a Bordo)
   - SMOKE-GW-TC07 (Colaborador · Cargo a Bordo)
   - SMOKE-GW-TC09 (Empresa · Cargo a Bordo)

4. **Fase 4 — Portal Contractor**
   - SMOKE-GW-TC11 (Colaborador · Hold ON · vinculación nueva)
   - SMOKE-GW-TC12 (Colaborador · Hold ON · 3DS)
   - SMOKE-GW-TC13 (Colaborador · Hold OFF)

5. **Fase 5 — Unhappy paths completos**
   - SMOKE-GW-TC06 (Colaborador · Hold ON · 3DS)
   - SMOKE-GW-TC10 (AppPax · 3DS rechazado → NO\_AUTORIZADO)
   - SMOKE-GW-TC14 (Contractor unhappy — pendiente TC)
