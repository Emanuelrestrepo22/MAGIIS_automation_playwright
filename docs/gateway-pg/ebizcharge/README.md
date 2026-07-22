# eBizCharge — Documentación QA

> **Estado:** 🟡 SoT de datos + documentación listas (BL-027, 2026-07-20). Runtime (POM/specs) pendiente — ver [`EXTERNAL-BLOCKERS.md`](./EXTERNAL-BLOCKERS.md).
> Gateway de USA. Fuente: <https://developer.ebizcharge.net/connect/docs/test-credit-card-numbers>

Punto de entrada de la documentación funcional QA de eBizCharge como pasarela de pago en MAGIIS. Espeja la estructura de [`docs/gateway-pg/authorize/`](../authorize/).

## Índice

| Doc | Contenido |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Mecanismo de trigger, mapping MAGIIS↔eBiz, categorías de respuesta, modelo de integración |
| [matriz_cases.md](./matriz_cases.md) | Casos de prueba `TS-EBIZ-TCxxxx` (happy, declines, CVV2, fraud, delay) |
| [TRACEABILITY.md](./TRACEABILITY.md) | Mapeo de intents Stripe↔eBiz; qué migra y qué no |
| [EXTERNAL-BLOCKERS.md](./EXTERNAL-BLOCKERS.md) | Bloqueantes del runtime (uso en PROD, modelo de integración, sandbox) |
| [CHANGELOG.md](./CHANGELOG.md) | Historial |

## Resumen en una línea

eBizCharge determina el outcome **por el número de tarjeta** (como Stripe), **no requiere 3DS**, y tiene una tabla rica de respuestas (approved/AVS, declines con código, CVV2, CAVV, Card Level, Fraud Profiler, Processing delay). Los datos viven en [`tests/fixtures/gateways/ebizcharge/`](../../../tests/fixtures/gateways/ebizcharge/).

## Qué falta para automatizar (runtime)

1. Confirmar que MAGIIS usa eBizCharge en PROD (USA).
2. Modelo de integración backend (REST API / hosted iframe / JS SDK) → define el POM.
3. Sandbox account/keys.

Detalle en [EXTERNAL-BLOCKERS.md](./EXTERNAL-BLOCKERS.md).
