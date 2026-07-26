# `specs/` — Specs por gateway

Este directorio organiza los specs del feature `gateway-pg` por **pasarela de pago**. Cada gateway tiene su propio subdirectorio espejado.

## Estructura

```
specs/
├── stripe/         🟢 Producción activa (cobertura completa)
│   ├── web/
│   │   ├── carrier/
│   │   │   ├── cargo-a-bordo/
│   │   │   ├── hold/                ← incluye hold-capture.spec.ts (TS-STRIPE-TC1049/1059)
│   │   │   ├── operaciones/
│   │   │   ├── recurrentes/
│   │   │   └── recovery/            ← 4 specs 3DS recovery (TC1051/1057/1061/1063/1064/1053/1039)
│   │   └── contractor/
│   ├── e2e-mobile/
│   ├── quote/
│   └── config/
├── authorize/      🟡 Slot reservado (BL-025 pendiente runtime)
│   └── README.md
└── _parametrized/  🟡 Specs cross-gateway que iteran ACTIVE_GATEWAYS (BL-028)
    ├── hold-happy-no3ds.parametrized.spec.ts
    └── README.md
```

## Convención por gateway

Cuando un gateway nuevo entre en runtime (Authorize, MercadoPago, eBizCharge), crear el subdirectorio espejando la estructura de Stripe:

```
<gateway>/
├── web/
│   ├── carrier/
│   │   ├── hold/
│   │   ├── cargo-a-bordo/        (si el gateway soporta este flow)
│   │   ├── operaciones/
│   │   └── recurrentes/
│   └── contractor/
├── e2e-mobile/                   (si aplica al gateway)
└── admin/                        (BL-037 — switching de pasarela)
```

## Convención de IDs

- Stripe: `TS-STRIPE-TCxxxx` (rango actual: TC0001–TC1130)
- Authorize: `TS-AUTHORIZE-TCxxxx` (rango canónico: TC1001–TC1323)
- Próximos gateways siguen el patrón `TS-<GATEWAY>-TCxxxx`

Ver [`docs/gateway-pg/CONTEXT.md`](../../../../docs/gateway-pg/CONTEXT.md) §"Estado por gateway" para el detalle de cobertura por pasarela.

## Cómo correr specs por gateway

```bash
# Todos los gateways (cubre el feature completo)
pnpm test:test:gateway

# Solo Stripe
pnpm test:test:gateway:stripe

# Solo Authorize (cuando entre runtime — hoy 0 specs)
pnpm test:test:gateway:authorize

# Solo specs parametrizados cross-gateway (BL-028 piloto — sin script dedicado; grep sobre el título)
pnpm test:test:gateway --grep parametrized

# Recovery 3DS Stripe (single spec recovery, workers=1)
pnpm test:test:gateway:3ds
```

## Specs `_parametrized/`

El subdirectorio `_parametrized/` contiene specs que iteran sobre `ACTIVE_GATEWAYS: GatewayName[]` y resuelven la tarjeta con `resolveCard({ gateway, intent })` del shared resolver. Mismo flujo lógico, datos resueltos por gateway.

Habilitado por BL-024 (umbrella + resolver polimórfico). Migración bulk del resto de specs pendiente (BL-028 fase 2).

## Reorganización 2026-05-13

Los 5 specs sueltos que vivían en `specs/stripe/` root fueron movidos a sus sub-categorías:

- `3ds-failure.spec.ts`, `3ds-retry-card-change.spec.ts`, `recorded-3ds-happy-path.spec.ts`, `recorded-3ds-preauth-failure.spec.ts` → `web/carrier/recovery/`
- `hold-capture.spec.ts` → `web/carrier/hold/`

Imports relativos ajustados (3 niveles más profundo). `package.json` actualizado con el nuevo path del script `:stripe:3ds`. Algunos docs (`docs/reports/`, `docs/qa-scope/`, codex-prompts) pueden tener referencias antiguas a los paths originales — son referenciales, se actualizarán cuando se toquen.

## Referencias

- [`docs/gateway-pg/CONTEXT.md`](../../../../docs/gateway-pg/CONTEXT.md) — overview multi-gateway
- [`tests/fixtures/gateways/README.md`](../../../fixtures/gateways/README.md) — convención de fixtures
- [`tests/fixtures/gateways/_shared/`](../../../fixtures/gateways/_shared/) — resolver polimórfico cross-gateway
- [`playwright.gateway-pg.config.ts`](../../../../playwright.gateway-pg.config.ts) — config con `testDir` multi-gateway
