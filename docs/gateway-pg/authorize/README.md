# Authorize.net — Documentación QA Oficial

> **Estado:** DRAFT — fixtures listos (BL-024 ✅), runtime POM/specs pendiente (BL-025 🟡).
> **Effective date:** 2026-05-13
> **SoT de datos:** [`tests/fixtures/gateways/authorize/`](../../../tests/fixtures/gateways/authorize/)
> **Slot de specs:** [`tests/features/gateway-pg/specs/authorize/`](../../../tests/features/gateway-pg/specs/authorize/) (vacío hasta que se confirme uso PROD)

Este directorio espeja la estructura de [`docs/gateway-pg/stripe/`](../stripe/) adaptada al gateway Authorize.net. Su propósito es **dejar la documentación QA lista** para que cuando el equipo dispare BL-025 (runtime) y BL-028 (specs parametrizados) ya exista la trazabilidad de TCs, decisiones arquitectónicas y bloqueos externos.

---

## Contenido del directorio

| Archivo | Propósito | Audiencia |
| --- | --- | --- |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Arquitectura específica Authorize.net + diferencias contra Stripe (triggers, response codes, sin 3DS, mapping MAGIIS) | QA + Dev runtime |
| [`matriz_cases.md`](./matriz_cases.md) | Matriz canónica de TCs `TS-AUTHORIZE-TC1001..` (happy paths, declines, CVV, AVS, partial/prepaid) | QA functional |
| [`matriz_cases2.md`](./matriz_cases2.md) | Casos avanzados (reembolsos, voids, stored credentials, recurring billing, edge cases wallet) | QA functional |
| [`TRACEABILITY.md`](./TRACEABILITY.md) | Mapping TC Stripe ↔ TC Authorize + intents canónicos cross-gateway + TCs no aplicables | Orquestación / Codex |
| [`EXTERNAL-BLOCKERS.md`](./EXTERNAL-BLOCKERS.md) | Sandbox keys, decisión líder PROD, modelo integración, POM web, coordinación BL-024/025/028 | Lead QA / Tech lead |
| [`CHANGELOG.md`](./CHANGELOG.md) | Historial cronológico de cambios documentales | Auditoría |

> No hay `normalized-test-cases.json` ni `.xlsx` todavía — esos son outputs de pipelines de análisis automatizados que se generarán cuando BL-025 empiece runtime.

---

## Orden de lectura recomendado

### Onboarding rápido (15 min)

1. `README.md` (este archivo) — qué hay y por qué.
2. `ARCHITECTURE.md` §1-3 — propósito + modelo + diferencias clave vs Stripe.
3. `TRACEABILITY.md` §3 — qué intents soporta Authorize y qué no.

### Lectura QA functional completa (1-2 h)

1. `ARCHITECTURE.md` completo — incluye triggers, endpoints, decisiones.
2. `matriz_cases.md` — TCs canónicos.
3. `matriz_cases2.md` — edge cases.
4. `EXTERNAL-BLOCKERS.md` — qué falta para automatizar.

### Cuando vayas a escribir el primer spec runtime (BL-025)

1. `EXTERNAL-BLOCKERS.md` §1-4 — confirmar prerequisitos resueltos.
2. `ARCHITECTURE.md` §9 — comando de ejecución aspiracional.
3. `TRACEABILITY.md` §1-3 — qué TC implementar primero (siempre HAPPY_NO_AUTH).
4. [`tests/features/gateway-pg/specs/authorize/README.md`](../../../tests/features/gateway-pg/specs/authorize/README.md) — patrón parametrizado recomendado.

---

## Links rápidos

- **Fixture canónico:** [`tests/fixtures/gateways/authorize/`](../../../tests/fixtures/gateways/authorize/) — `cards.ts`, `card-policy.ts`, `card-resolver.ts`
- **Resolver cross-gateway:** [`tests/fixtures/gateways/_shared/resolver.ts`](../../../tests/fixtures/gateways/_shared/resolver.ts) — `resolveCard({ gateway: 'authorize', intent })`
- **Adapter declarativo:** [`tests/features/gateway-pg/helpers/adapters/authorizeGatewayAdapter.ts`](../../../tests/features/gateway-pg/helpers/adapters/authorizeGatewayAdapter.ts) — `requires3ds: false`
- **Slot de specs:** [`tests/features/gateway-pg/specs/authorize/`](../../../tests/features/gateway-pg/specs/authorize/) — vacío, esperando BL-025
- **Backlog:** [`docs/ops/BACKLOG.md`](../../ops/BACKLOG.md) — BL-024 ✅, BL-025 🟡, BL-028 🟡
- **Doc oficial Authorize:** https://developer.authorize.net/hello_world/testing_guide.html

---

## Convención de IDs

Todos los TCs de este directorio usan prefijo **`TS-AUTHORIZE-TC`** + 4 dígitos arrancando en `TC1001` (no chocan con `TS-STRIPE-TCxxxx`). Los IDs son la fuente de trazabilidad entre matrices, specs y reportes — ver `CLAUDE.md` §"Regla de trazabilidad de IDs".
