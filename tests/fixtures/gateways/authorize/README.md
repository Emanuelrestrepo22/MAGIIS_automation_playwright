# Authorize.net Test Cards — Fixtures MAGIIS

Source of truth canónica para tarjetas de prueba Authorize.net usadas en tests
automatizados MAGIIS. Espejo del patrón en `tests/fixtures/gateways/stripe/`,
adaptado a las particularidades del sandbox Authorize.net.

> **Ubicación canónica:** `tests/fixtures/gateways/authorize/` (BL-024 Fase 3, 2026-05-13).
> El path legacy `tests/fixtures/authorize/` queda como thin re-export.

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
tests/fixtures/gateways/authorize/
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

Verificado contra la guía oficial el 2026-07-20 (<https://developer.authorize.net/hello_world/testing_guide.html>).

| ZIP | AVS | Significado |
|---|---|---|
| `46201` | A | Address match; ZIP no match |
| `46203` | E | AVS inválido / no permitido para el tipo de tarjeta |
| `46204` | G | Non-U.S. bank (issuer no soporta AVS; no para Amex) |
| `46205` | N | Address y ZIP no match |
| `46207` | R | AVS no disponible durante el procesamiento |
| `46208` | S | Issuer U.S. no soporta AVS |
| `46209` | U | Info de dirección del cardholder no disponible |
| `46211` | W | Address no match; ZIP 9 dígitos match (no Amex) |
| `46214` | X | Address match; ZIP 9 dígitos match (no Visa/Amex) |
| `46217` | Z | Address no match; ZIP match |
| `46282` | — | Response Code 2 — Declined (decline genérico) |

### Partial / Prepaid authorization

ZIP (card-not-present) + monto (card-present). Verificado contra la sección "Partial
authorization responses" de la guía oficial (2026-07-20).

| ZIP | Monto | Resultado | Balance restante | Autorizado |
|---|---|---|---|---|
| `46225` | $462.25 | Partial Authorization | n/a | $1.23 |
| `46226` | $462.26 | Prepaid Authorization | $1.23 | Full |
| `46227` | $426.27 | Prepaid Authorization | -$1.23 | Full |
| `46228` | $462.28 | Prepaid Authorization | $0 | Full |

> Nota: la doc oficial también define triggers por **monto** (ej. $70.02, $70.40…), pero
> están marcados **deprecated** (phased out 2011, "may cease to function without notice").
> Los evitamos — usamos los ZIP.

## Cómo usar en specs

### ✅ Cross-gateway — usar el resolver shared

```typescript
import { resolveCard } from 'tests/fixtures/gateways/_shared';

const card = resolveCard({ gateway: 'authorize', intent: 'HAPPY_NO_AUTH' });
await page.fill('[name=cardNumber]', card.number);
await page.fill('[name=cvc]', card.cvc);
await page.fill('[name=zip]', card.zip);
```

### ✅ Authorize-specific — usar el resolver/policy local

```typescript
import { resolveCard } from 'tests/fixtures/gateways/authorize/card-resolver';
import { AUTHORIZE_CARDS } from 'tests/fixtures/gateways/authorize/card-policy';

// Patrón 1: resolver por intención semántica
const card = resolveCard('SUCCESS');

// Patrón 2: acceso directo al policy (equivalente)
const declineCard = AUTHORIZE_CARDS.DECLINE_GENERIC;
```

## Referencia externa

- Authorize.net Testing Guide: <https://developer.authorize.net/hello_world/testing_guide.html>
- Response codes: <https://developer.authorize.net/api/reference/responseCodes.html>

## Trazabilidad

- BL-024 (CardResolver multi-gateway) — generaliza este patrón a 4 gateways ✅
- BL-025 (Test data Authorize) — este fixture
- BL-028 (Specs parametrizados) — consume este fixture
- Resolver cross-gateway: [`../_shared/resolver.ts`](../_shared/resolver.ts)
- Umbrella overview: [`../README.md`](../README.md)
