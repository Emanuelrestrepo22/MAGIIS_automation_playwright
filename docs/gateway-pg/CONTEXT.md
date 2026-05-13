# gateway-pg Context

> **Estado:** multi-gateway desde 2026-05-13 (BL-024 ✅). Stripe es el gateway de referencia con cobertura activa; Authorize.net tiene documentación QA completa y SoT de fixtures lista, pendiente de runtime (BL-025).

## Purpose

Documento canónico del feature `gateway-pg`: pasarelas de pago en MAGIIS. Es el punto de entrada para entender la arquitectura común y las diferencias por pasarela.

Sirve como referencia para:

- Flujos de pago end-to-end (Hold → Capture → settlement)
- Comportamiento por gateway específico (3DS, decline triggers, tokens)
- Mapping de test cases entre gateways equivalentes
- Expectations de UI cross-gateway

## Estado por gateway

| Gateway | Estado | SoT datos | Runtime | Docs | Specs |
| --- | --- | --- | --- | --- | --- |
| **Stripe** | 🟢 Producción | `tests/fixtures/gateways/stripe/` | Completo | [`docs/gateway-pg/stripe/`](./stripe/) | `tests/features/gateway-pg/specs/stripe/**` |
| **Authorize.net** | 🟡 Docs + datos listos | `tests/fixtures/gateways/authorize/` | Pendiente BL-025 | [`docs/gateway-pg/authorize/`](./authorize/) | Slot reservado en `specs/authorize/` |
| **MercadoPago** | 🔴 Investigación | Slot reservado | — | — | — |
| **eBizCharge** | 🔴 Investigación | Slot reservado | — | — | — |

## Modelo arquitectónico (umbrella multi-gateway)

> Principio rector: *"El comportamiento esperado del sistema es constante; sólo los datos de entrada cambian por pasarela."*

### Capas

| Capa | Ubicación | Qué contiene |
| --- | --- | --- |
| **Datos gateway-specific** | `tests/fixtures/gateways/<gateway>/` | Tarjetas, triggers, namespace semántico `CARDS` / `AUTHORIZE_CARDS` |
| **Resolver polimórfico** | `tests/fixtures/gateways/_shared/` | `resolveCard({ gateway, intent })` + tipo común `GenericTestCard` |
| **Adapters declarativos** | `tests/features/gateway-pg/helpers/adapters/` | Metadata estática (`requires3ds`, `usesSharedCardForm`, tags) |
| **Datos de dominio MAGIIS** | `tests/features/gateway-pg/data/journey-defaults.ts` | `JOURNEY_DEFAULTS` agnóstico del gateway (origin, destination, client, passenger) |
| **Helpers gateway-agnostic** | `tests/features/gateway-pg/helpers/journey-url.helpers.ts` | URL post-submit MAGIIS, validaciones de routing |
| **Helpers gateway-specific** | `tests/features/gateway-pg/helpers/<gateway>/` | Recovery flows propios de cada gateway (ej: 3DS retry en Stripe) |
| **POMs compartidos** | `tests/pages/carrier/` (root) | `NewTravelPage`, `DashboardPage`, `TravelManagementPage`, etc. — cross-gateway |
| **POMs gateway-specific** | `tests/pages/carrier/<gateway>/` | Componentes propios del SDK (`ThreeDSModal` Stripe, eventual Accept.js form Authorize) |
| **Specs por gateway** | `tests/features/gateway-pg/specs/<gateway>/` | Tests concretos por gateway |
| **Specs parametrizados** | `tests/features/gateway-pg/specs/_parametrized/` | Specs que iteran sobre `ACTIVE_GATEWAYS` (BL-028) |

### Cómo encajar un gateway nuevo

1. **Datos** → poblar `tests/fixtures/gateways/<gateway>/{cards,card-policy,card-resolver}.ts` siguiendo el patrón de Stripe/Authorize. Ver [`tests/fixtures/gateways/README.md`](../../tests/fixtures/gateways/README.md) §"Cómo agregar un nuevo gateway".
2. **Resolver** → agregar `<GATEWAY>_INTENT_MAP` en `_shared/resolver.ts` con los intents soportados.
3. **Adapter declarativo** → confirmar/crear `<gateway>GatewayAdapter` en `helpers/adapters/` (flags `requires3ds`, `usesSharedCardForm`).
4. **Documentación** → crear `docs/gateway-pg/<gateway>/{README, ARCHITECTURE, matriz_cases, TRACEABILITY, EXTERNAL-BLOCKERS, CHANGELOG}.md` espejando Stripe/Authorize.
5. **POMs específicos** (si los hay) → `tests/pages/carrier/<gateway>/`. Por defecto reutilizar shared.
6. **Specs** → `tests/features/gateway-pg/specs/<gateway>/` con la misma estructura `web/carrier/{hold,cargo-a-bordo,operaciones,recurrentes}/`.

## Key payment concepts

| Concepto MAGIIS | Stripe | Authorize.net |
| --- | --- | --- |
| **Hold** | `requires_action` / `authorized` (pre-auth) | `authOnlyTransaction` |
| **Capture** | `payment_intent.capture` | `priorAuthCaptureTransaction` |
| **NO_AUTORIZADO** | 3DS rejected, decline, requires_action expired | response code 2 (declined), CVV mismatch, ZIP decline |
| **SEARCHING_DRIVER** | hold confirmed | response code 1 (approved) |
| **Reembolso** | `refund` | `refundTransaction` |
| **Cancelación pre-settlement** | `payment_intent.cancel` | `voidTransaction` |
| **Stored credentials** | PaymentMethod ID | `networkTransId` + `subsequentAuthInformation` |
| **3DS** | nativo (`requires_action`) | deprecated → `requires3ds=false` |

## Switching de pasarela (modelo exclusivo)

> ⚠️ **Crítico** (aprendizaje 2026-05-13): MAGIIS opera con UNA SOLA pasarela activa a nivel global. Activar Authorize requiere primero desvincular Stripe. Documentado en `BL-037` del backlog y [`docs/gateway-pg/authorize/ARCHITECTURE.md`](./authorize/ARCHITECTURE.md) §1.bis.

Implicaciones:

- Suites Stripe y Authorize NO concurrentes contra el mismo ambiente.
- Cada suite debe verificar `ensureActiveGateway(<gateway>)` antes de ejecutar.
- Side effects abiertos: tarjetas wallet pre-switch, transacciones pendientes, tiempo de propagación (TODO confirmar con backend).

## Test data

Cada gateway consume su SoT canónica vía namespace semántico (`CARDS.HAPPY_3DS` para Stripe, `AUTHORIZE_CARDS.SUCCESS` para Authorize) o el resolver polimórfico (`resolveCard({ gateway, intent })`).

**Prohibido:** hardcodear números de tarjeta en specs. Ver [`fixtures/gateways/README.md`](../../tests/fixtures/gateways/README.md) §"Cómo se usa desde un spec".

## Automation rules

- Leer este context y el `ARCHITECTURE.md` del gateway específico antes de extender cobertura.
- Mantener TC IDs estables con prefijo `TS-<GATEWAY>-TCxxxx` (`TS-STRIPE-TC1001`, `TS-AUTHORIZE-TC1001`).
- Reutilizar POMs compartidos (`NewTravelPage`, `TravelManagementPage`) cuando el flujo es cross-gateway.
- Usar `expect.poll` / `expect(...).toBeVisible()` en vez de `waitForTimeout` siempre que haya señal observable (ver [`docs/reports/WAITFORTIMEOUT-MIGRATION.md`](../reports/WAITFORTIMEOUT-MIGRATION.md)).
- Suites Stripe 3DS y Authorize: `workers: 1` para evitar colisiones con el SDK del gateway.
- Datos de dominio (origin, destination, client, passenger) → `JOURNEY_DEFAULTS` desde `journey-defaults.ts`. Datos de tarjeta → resolver del gateway.

## Referencias internas

- [`docs/gateway-pg/stripe/`](./stripe/) — documentación QA Stripe (CHANGELOG, matriz_cases, ARCHITECTURE)
- [`docs/gateway-pg/authorize/`](./authorize/) — documentación QA Authorize (estructura espejo)
- [`CLAUDE.md`](../../CLAUDE.md) — glosario MAGIIS + convenciones del proyecto
- [`docs/ops/BACKLOG.md`](../ops/BACKLOG.md) — BL-024 (umbrella), BL-025 (runtime Authorize), BL-026/027/028, BL-036/037
- [`tests/fixtures/gateways/README.md`](../../tests/fixtures/gateways/README.md) — convención multi-gateway en fixtures
