# eBizCharge Test Cards — Fixtures MAGIIS

Source of truth canónica para tarjetas de prueba eBizCharge usadas en tests
automatizados MAGIIS. Espejo del patrón de `tests/fixtures/gateways/stripe/` y
`tests/fixtures/gateways/authorize/`.

> **Estado:** 🟡 SoT de datos + docs listas (BL-027, 2026-07-20). **Runtime (POM/specs) pendiente** —
> depende del modelo de integración backend (ver `docs/gateway-pg/ebizcharge/EXTERNAL-BLOCKERS.md`).
> Fuente: <https://developer.ebizcharge.net/connect/docs/test-credit-card-numbers>

## Regla del sandbox (clave)

| Aspecto | eBizCharge |
|---|---|
| **Trigger del outcome** | **El número de tarjeta** (determinístico, como Stripe — NO por monto/CVV/ZIP) |
| Expiración | Fija `0930` (MMYY = 09/30). Excepción: `4000300411112226` usa `0922` |
| CVV | Declines = `999`; el resto = "any" (usamos `123`, Amex `1234`) |
| 3DS / SCA | **No** (`requires3ds: false`). La tabla CAVV es un *indicador*, no un challenge |

## Estructura de archivos

```
tests/fixtures/gateways/ebizcharge/
├── cards.ts          ← EBIZ_TEST_CARDS (objetos con outcome de negocio) + tablas EBIZ_*_REFERENCE (completas)
├── card-policy.ts    ← namespace semántico EBIZ_CARDS por intención
├── card-resolver.ts  ← resolveCard(key) → EbizTestCard
└── README.md         ← este archivo
```

**Diseño de "referencia completa":** los objetos `EBIZ_TEST_CARDS` cubren las tarjetas con
outcome de negocio (approved default, las 14 declines, CVV2 clave, fraud, delays). Las
categorías de pura anotación se preservan **completas** como arrays de referencia:
`EBIZ_AVS_REFERENCE`, `EBIZ_CVV2_REFERENCE`, `EBIZ_CAVV_REFERENCE`, `EBIZ_CARD_LEVEL_REFERENCE`.

## Intents cross-gateway soportados

| Intent canónico | Key `EBIZ_CARDS` | Número | Resultado |
|---|---|---|---|
| `HAPPY_NO_AUTH` | `SUCCESS` | `4000100011112224` | approved (AVS YYY, CVV2 M) |
| `DECLINE_AUTHORIZE` | `DECLINE_DO_NOT_HONOR` | `4000300211112228` | 05 Do not Honor |
| `DECLINE_INVALID_CVC` | `DECLINE_CVV` | `4000301311112225` | 97 Declined for CVV failure |

`HAPPY_AUTH`, `FAIL_AUTH`, `DECLINE_CAPTURE` → **N/A** (el resolver lanza error claro).

## Tabla de declines (serie `4000300…`, CVV 999)

| Número | Code | Message |
|---|---|---|
| 4000300011112220 | (blank) | Declined |
| 4000300001112222 | 04 | Pickup Card |
| 4000300211112228 | 05 | Do not Honor |
| 4000300311112227 | 12 | Invalid Transaction |
| 4000300411112226 | 15 | Invalid Issuer *(exp 0922)* |
| 4000300511112225 | 25 | Unable to locate Record |
| 4000300611112224 | 51 | Insufficient funds |
| 4000300711112223 | 55 | Invalid Pin |
| 4000300811112222 | 57 | Transaction Not Permitted |
| 4000300911112221 | 62 | Restricted Card |
| 4000301011112228 | 65 | Excess withdrawal count |
| 4000301111112227 | 75 | Pin tries exceeded |
| 4000301211112226 | 78 | No checking account |
| 4000301311112225 | 97 | Declined for CVV failure |

## Otras categorías (referencia)

- **Approved / AVS** — serie `4000100…` (17), cada una con su código AVS (`EBIZ_AVS_REFERENCE`).
- **CVV2** — Visa `4000200…` + MC `5555444…` + Amex `371122…` + Discover `6011222…` → M/N/P/S/U/X (`EBIZ_CVV2_REFERENCE`).
- **CAVV / 3DS indicator** — serie `4000600…` → 1..D (`EBIZ_CAVV_REFERENCE`).
- **Card Level** — serie `4000700…` → A..S3 (`EBIZ_CARD_LEVEL_REFERENCE`).
- **Fraud Profiler** — `4000301411112224` → review; `4000301511112223` → reject.
- **Processing delay** — `4000000011112…` → 5s/15s/30s/45s/60s.

## Cómo usar en specs

```typescript
// Cross-gateway (recomendado)
import { resolveCard } from 'tests/fixtures/gateways/_shared';
const card = resolveCard({ gateway: 'ebizcharge', intent: 'HAPPY_NO_AUTH' });

// eBiz-specific
import { EBIZ_CARDS } from 'tests/fixtures/gateways/ebizcharge/card-policy';
const decline = EBIZ_CARDS.DECLINE_CVV;
```

## Referencias

- Doc oficial: <https://developer.ebizcharge.net/connect/docs/test-credit-card-numbers>
- [BL-027](../../../../docs/ops/BACKLOG.md) — entrada del backlog
- Doc funcional QA: [`docs/gateway-pg/ebizcharge/`](../../../../docs/gateway-pg/ebizcharge/)
- Resolver cross-gateway: [`../_shared/resolver.ts`](../_shared/resolver.ts)
