# Authorize.net Test Cards — Fixtures MAGIIS

Source of truth canónica para tarjetas de prueba Authorize.net usadas en tests
automatizados MAGIIS. Espejo del patrón en `tests/fixtures/stripe/`, adaptado
a las particularidades del sandbox Authorize.net.

## Diferencias clave con Stripe

| Aspecto | Stripe | Authorize.net |
|---|---|---|
| Trigger del outcome | Número de tarjeta | CVV y/o ZIP del titular |
| Cantidad de números distintos | 1 por outcome | 1 por marca (Visa/MC/Amex/...) |
| 3D Secure | Sí (`requires3ds: true`) | **No** (`requires3ds: false`) |
| Resolver acepta número directo | Sí | No (sólo keys del policy) |

En Authorize.net, **mismo número de tarjeta sirve para todos los outcomes** —
lo que cambia es la combinación CVV + ZIP. Por eso el namespace `AUTHORIZE_CARDS`
mapea a objetos completos en vez de sólo a números.

## Estructura de los archivos

```
tests/fixtures/authorize/
├── cards.ts          ← registry low-level (AuthorizeTestCard + AUTHORIZE_TEST_CARDS)
├── card-policy.ts    ← namespace semántico AUTHORIZE_CARDS por intención
├── card-resolver.ts  ← resolveCard(key) → AuthorizeTestCard
└── README.md         ← este archivo
```

## Triggers documentados (sandbox Authorize.net)

### CVV (3 dígitos, 4 para Amex)

| CVV | Resultado |
|---|---|
| `900` | M — CVV match (approved) |
| `901` | N — Does NOT match |
| `902` | S — Should be on card, but is not indicated |
| `903` | U — Issuer not certified |
| `904` | P — Is NOT processed |

### Zip code (CARD-NOT-PRESENT)

| ZIP | Resultado |
|---|---|
| `46201` | A — Address match |
| `46203` | E — Invalid AVS |
| `46204` | G — Non-U.S. Issuer |
| `46205` | N — No Match |
| `46211` | W — ZIP matched 9 digits |
| `46214` | X — Address + 9-digit ZIP match |
| `46217` | Z — ZIP match |
| `46225` | Partial Auth ($1.23 authorized) |
| `46226` | Prepaid Auth ($1.23 remaining) |
| `46227` | Prepaid Auth (-$1.23 balance) |
| `46228` | Prepaid Auth ($0 balance) |
| `46282` | Response Code 2 — Declined |

> Nota: la doc oficial define triggers por monto también, pero están marcados
> como **deprecated** ("may cease to function without notice"). Los evitamos.

## Cómo usar en specs

```typescript
import { resolveCard } from '@/tests/fixtures/authorize/card-resolver';
import { AUTHORIZE_CARDS } from '@/tests/fixtures/authorize/card-policy';

// Patrón 1: resolver por intención semántica
const card = resolveCard('SUCCESS');
await page.fill('[name=cardNumber]', card.number);
await page.fill('[name=cvc]', card.cvc);
await page.fill('[name=zip]', card.zip);

// Patrón 2: acceso directo al policy (equivalente)
const declineCard = AUTHORIZE_CARDS.DECLINE_GENERIC;
```

## Referencia externa

- Authorize.net Testing Guide: <https://developer.authorize.net/hello_world/testing_guide.html>
- Response codes: <https://developer.authorize.net/api/reference/responseCodes.html>

## Trazabilidad

- BL-024 (CardResolver multi-gateway) — generaliza este patrón a 4 gateways
- BL-025 (Test data Authorize) — este fixture
- BL-028 (Specs parametrizados) — consume este fixture
