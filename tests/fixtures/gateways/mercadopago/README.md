# MercadoPago Test Cards — slot reservado

**Estado:** 🔴 Pendiente — investigación pendiente ([BL-026](../../../../docs/ops/BACKLOG.md)).

## Por qué este slot está vacío

MercadoPago dispara outcomes por el **nombre del titular** (`APRO`, `OTHE`, `CONT`, etc.)
combinado con un set fijo de tarjetas de prueba por marca. No requiere 3DS en
los flujos MAGIIS habituales.

Antes de poblar este directorio hay que:

1. Confirmar con el líder si MAGIIS PROD integra MercadoPago.
2. Recolectar matriz `holderName → outcome` de la doc oficial MP.
3. Confirmar acceso a sandbox keys en `.env` (variables `MP_*`).

## Estructura esperada (cuando se implemente)

```
mercadopago/
├── cards.ts         ← MP_TEST_CARDS registry low-level
├── card-policy.ts   ← MP_CARDS namespace semántico
├── card-resolver.ts ← resolveCard por intención
└── README.md        ← esta tabla, completa
```

## Referencias

- <https://www.mercadopago.com.ar/developers/es/docs/checkout-api/integration-test/test-cards>
- [BL-026](../../../../docs/ops/BACKLOG.md) — entrada del backlog
- [`_shared/types.ts`](../_shared/types.ts) — `GatewayName` ya incluye `'mercadopago'`
- [`_shared/resolver.ts`](../_shared/resolver.ts) — actualmente lanza `Gateway 'mercadopago' aún no soportado`
