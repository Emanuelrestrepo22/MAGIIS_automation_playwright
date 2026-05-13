# eBizCharge Test Cards — slot reservado

**Estado:** 🔴 Pendiente — investigación pendiente ([BL-027](../../../../docs/ops/BACKLOG.md)).

## Por qué este slot está vacío

eBizCharge es el menos documentado de los gateways considerados. Antes de poblar
este directorio hay que investigar:

1. ¿Qué dispara cada outcome? (CVC, número, otro mecanismo)
2. ¿Requiere 3DS o es flat charge / hold?
3. ¿Hay sandbox público o requiere account?
4. Confirmar con backend MAGIIS qué tipo de integración hay (REST API, hosted
   iframe, JS SDK).

## Estructura esperada (cuando se implemente)

```
ebizcharge/
├── cards.ts         ← EBIZ_TEST_CARDS registry low-level
├── card-policy.ts   ← EBIZ_CARDS namespace semántico
├── card-resolver.ts ← resolveCard por intención
└── README.md        ← esta tabla, completa
```

## Referencias

- [BL-027](../../../../docs/ops/BACKLOG.md) — entrada del backlog
- [`_shared/types.ts`](../_shared/types.ts) — `GatewayName` ya incluye `'ebizcharge'`
- [`_shared/resolver.ts`](../_shared/resolver.ts) — actualmente lanza `Gateway 'ebizcharge' aún no soportado`
