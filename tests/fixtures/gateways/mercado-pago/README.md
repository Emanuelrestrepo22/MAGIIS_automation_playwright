# MercadoPago Test Cards — Fixtures MAGIIS

Source of truth canónica para tarjetas de prueba MercadoPago (LATAM). Espejo del patrón de `stripe/`, `authorize/` y `ebizcharge/`.

> **Estado:** 🟡 SoT de datos + docs listas (BL-026, 2026-07-20). **Runtime (POM/specs) pendiente** —
> ver `docs/gateway-pg/mercado-pago/EXTERNAL-BLOCKERS.md`.
> Fuente: <https://www.mercadopago.com.ar/developers/es/docs/your-integrations/test/cards>

## Regla del sandbox (clave)

| Aspecto | MercadoPago |
|---|---|
| **Trigger del outcome** | **El NOMBRE del titular** (`holderName` = keyword de estado: APRO, OTHE, SECU…) — NO el número/CVV/monto |
| Número / CVV / expiración | **Fijos**: CVV `123` (Amex `1234`), exp `11/30`, tarjeta según catálogo |
| Documento | Approved usa DNI `12345678`; la mayoría de rechazos no requieren documento |
| 3DS / SCA | **No** en el flujo MAGIIS (`requires3ds: false`) |

> ⚠️ En MP `holderName` **NO es inerte**: es el trigger. El spec debe llenar el nombre con el keyword exacto.

## Keywords de estado (nombre del titular)

| Keyword | Status | status_detail | Key `MP_CARDS` |
|---|---|---|---|
| `APRO` | approved | accredited | `APPROVED` |
| `CONT` | pending | pending_contingency | `PENDING` |
| `OTHE` | rejected | cc_rejected_other_reason | `REJECTED_OTHER` |
| `CALL` | rejected | cc_rejected_call_for_authorize | `REJECTED_CALL` |
| `FUND` | rejected | cc_rejected_insufficient_amount | `REJECTED_INSUFFICIENT_FUNDS` |
| `SECU` | rejected | cc_rejected_bad_filled_security_code | `REJECTED_INVALID_CVV` |
| `EXPI` | rejected | cc_rejected_bad_filled_date | `REJECTED_EXPIRED` |
| `FORM` | rejected | cc_rejected_bad_filled_other | `REJECTED_FORM` |
| `DUPL` | rejected | cc_rejected_duplicated_payment | `REJECTED_DUPLICATE` |
| `LOCK` | rejected | cc_rejected_card_disabled | `REJECTED_CARD_DISABLED` |
| `BLAC` | rejected | cc_rejected_blacklist | `REJECTED_BLACKLIST` |
| `UNSU` | not-supported | not_supported | `NOT_SUPPORTED` |

(Además, en `cards.ts`: `CARD`, `INST`, `CTNA`, `ATTE` como entries adicionales de rechazo.)

## Catálogo de tarjetas (referencia — `MP_CARD_CATALOG`)

| Tipo | Marca | Número | CVV |
|---|---|---|---|
| Crédito | Mastercard | 5031755734530604 | 123 |
| Crédito | Visa | 4509953566233704 (default) | 123 |
| Crédito | Amex | 371180303257522 | 1234 |
| Débito | Mastercard | 5287338310253304 | 123 |
| Débito | Visa | 4002768694395619 | 123 |

## Intents cross-gateway soportados

| Intent canónico | Key `MP_CARDS` | holderName | Resultado |
|---|---|---|---|
| `HAPPY_NO_AUTH` | `APPROVED` | APRO | approved |
| `DECLINE_AUTHORIZE` | `REJECTED_OTHER` | OTHE | rejected (error general) |
| `DECLINE_INVALID_CVC` | `REJECTED_INVALID_CVV` | SECU | rejected (CVV inválido) |

`HAPPY_AUTH`, `FAIL_AUTH`, `DECLINE_CAPTURE` → **N/A** (el resolver lanza error claro).

## Cómo usar en specs

```typescript
// Cross-gateway
import { resolveCard } from 'tests/fixtures/gateways/_shared';
const card = resolveCard({ gateway: 'mercado-pago', intent: 'HAPPY_NO_AUTH' });
// card.holderName === 'APRO' ← usar como nombre del titular en el form

// MP-specific
import { MP_CARDS } from 'tests/fixtures/gateways/mercado-pago/card-policy';
const rejected = MP_CARDS.REJECTED_INSUFFICIENT_FUNDS;
```

## Referencias

- Doc oficial: <https://www.mercadopago.com.ar/developers/es/docs/your-integrations/test/cards>
- [BL-026](../../../../docs/ops/BACKLOG.md)
- Doc funcional QA: [`docs/gateway-pg/mercado-pago/`](../../../../docs/gateway-pg/mercado-pago/)
- Resolver cross-gateway: [`../_shared/resolver.ts`](../_shared/resolver.ts)
