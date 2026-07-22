# MercadoPago — Documentación QA

> **Estado:** 🟡 SoT de datos + documentación listas (BL-026, 2026-07-20). Runtime (POM/specs) pendiente — ver [`EXTERNAL-BLOCKERS.md`](./EXTERNAL-BLOCKERS.md).
> Gateway de LATAM. Fuente: <https://www.mercadopago.com.ar/developers/es/docs/your-integrations/test/cards>

Punto de entrada de la documentación funcional QA de MercadoPago como pasarela de pago en MAGIIS. Espeja la estructura de [`docs/gateway-pg/authorize/`](../authorize/).

## Índice

| Doc | Contenido |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Mecanismo de trigger (holderName), mapping MAGIIS↔MP, keywords de estado, modelo de integración |
| [matriz_cases.md](./matriz_cases.md) | Casos de prueba `TS-MP-TCxxxx` |
| [TRACEABILITY.md](./TRACEABILITY.md) | Mapeo de intents Stripe↔MP; qué migra y qué no |
| [EXTERNAL-BLOCKERS.md](./EXTERNAL-BLOCKERS.md) | Bloqueantes del runtime (uso en PROD, modelo de integración, sandbox keys `MP_*`) |
| [CHANGELOG.md](./CHANGELOG.md) | Historial |

## Resumen en una línea

MercadoPago determina el outcome **por el NOMBRE del titular** (keyword: APRO/OTHE/SECU/FUND…), con número/CVV/expiración fijos, y **no requiere 3DS**. Los datos viven en [`tests/fixtures/gateways/mercado-pago/`](../../../tests/fixtures/gateways/mercado-pago/).

## Qué falta para automatizar (runtime)

1. Confirmar que MAGIIS usa MercadoPago en PROD (LATAM).
2. Modelo de integración backend (Checkout API / Bricks / Wallet) → define el POM.
3. Sandbox keys `MP_*` en `.env`.

Detalle en [EXTERNAL-BLOCKERS.md](./EXTERNAL-BLOCKERS.md).
