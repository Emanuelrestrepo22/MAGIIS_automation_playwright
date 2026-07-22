# Matriz maestra multi-gateway (por intent canónico)

> **Principio rector:** el comportamiento esperado del sistema es constante; **solo cambia la tarjeta por pasarela**.
> Esta matriz estandariza las matrices por pasarela (`docs/gateway-pg/stripe/matriz_cases.md`, `.../authorize/matriz_cases.md`) usando el **intent canónico** como columna rectora. El dato concreto por pasarela es un anexo.
>
> Fuente de los intents: `tests/fixtures/gateways/_shared/types.ts` (`CardIntent`) y el mapping en `_shared/resolver.ts`.
> Ambiente de ejecución: **TEST** (tarjetas de prueba; ver el test plan de la release).

## Intents canónicos → dato por pasarela → estado MAGIIS esperado

| Intent (`CardIntent`) | Estado MAGIIS esperado | Stripe (policy key / nº) | Authorize (policy key / trigger) | MercadoPago (holderName) | eBizCharge | Requiere 3DS |
|---|---|---|---|---|---|---|
| `HAPPY_NO_AUTH` | `SEARCHING_DRIVER` | `SUCCESS_NO_3DS` · 4242… | `SUCCESS` · 4111 + CVV 900 | `APPROVED` · holderName APRO | `SUCCESS` · 4000100011112224 | No |
| `HAPPY_AUTH` | `SEARCHING_DRIVER` (post-challenge) | `HAPPY_3DS` · …3184 | **N/A** (sin 3DS) | **N/A** | **N/A** | **Sí** |
| `FAIL_AUTH` | `NO_AUTORIZADO` | `FAIL_3DS` · …9235 | **N/A** (sin 3DS) | **N/A** | **N/A** | **Sí** |
| `DECLINE_AUTHORIZE` | `NO_AUTORIZADO` | `DECLINE_AUTHORIZE` · …0002 | `DECLINE_GENERIC` · ZIP 46282 | `REJECTED_OTHER` · holderName OTHE | `DECLINE_DO_NOT_HONOR` · 4000300211112228 | No |
| `DECLINE_CAPTURE` | (capture rechazado) | `DECLINE_CAPTURE` · …9995 | **N/A** | **N/A** | **N/A** | No |
| `DECLINE_INVALID_CVC` | `NO_AUTORIZADO` | `DECLINE_INVALID_CVC` · …0127 | `DECLINE_CVV` · CVV 901 | `REJECTED_INVALID_CVV` · holderName SECU | `DECLINE_CVV` · 4000301311112225 | No |

**Leyenda:** los números Stripe son sufijos ilustrativos — el valor exacto y env-aware vive en `tests/fixtures/gateways/stripe/{cards.ts,card-policy.ts}`. **N/A** = el gateway no expone ese comportamiento (el resolver lanza error claro). Los 4 gateways ya tienen datos (BL-025 Authorize, BL-026 MercadoPago, BL-027 eBizCharge); falta runtime UI en los 3 no-Stripe.

## Soporte de intents por gateway (estado real del resolver)

| Gateway | Intents soportados hoy | Fuente |
|---|---|---|
| **stripe** | los 6 (`STRIPE_INTENT_MAP`) | `_shared/resolver.ts` |
| **authorize** | 3: `HAPPY_NO_AUTH`, `DECLINE_AUTHORIZE`, `DECLINE_INVALID_CVC` (`AUTHORIZE_INTENT_MAP`) | `_shared/resolver.ts` |
| **mercado-pago** | 3: `HAPPY_NO_AUTH`, `DECLINE_AUTHORIZE`, `DECLINE_INVALID_CVC` (`MERCADO_PAGO_INTENT_MAP`) | `_shared/resolver.ts` |
| **ebizcharge** | 3: `HAPPY_NO_AUTH`, `DECLINE_AUTHORIZE`, `DECLINE_INVALID_CVC` (`EBIZCHARGE_INTENT_MAP`) | `_shared/resolver.ts` |

> 3DS es **exclusivo de Stripe** (`requires3ds`): Authorize/MP/eBiz tienen `requires3ds=false`. Por eso `HAPPY_AUTH`/`FAIL_AUTH` son N/A fuera de Stripe.

## Cómo se consume desde un spec

```typescript
import { resolveCard, type GatewayName } from 'tests/fixtures/gateways/_shared';
import { JOURNEY_DEFAULTS } from 'tests/features/gateway-pg/data/journey-defaults';

const ACTIVE_GATEWAYS: GatewayName[] = ['stripe']; // + 'authorize' cuando BL-025 tenga runtime

for (const gateway of ACTIVE_GATEWAYS) {
  test.describe(`[${gateway}] hold happy`, () => {
    test('crea viaje → SEARCHING_DRIVER', async () => {
      const card = resolveCard({ gateway, intent: 'HAPPY_NO_AUTH' }); // dato variable
      // ...usa card.number/last4/cvc/zip + JOURNEY_DEFAULTS (dominio constante)
      // assertions MAGIIS idénticas en todos los gateways
    });
  });
}
```

## Alineación con las matrices por pasarela

Esta matriz **no reemplaza** las matrices detalladas por pasarela; las alinea por la columna intent:
- Stripe: `docs/gateway-pg/stripe/matriz_cases.md` (`TS-STRIPE-TC1001..1122`).
- Authorize: `docs/gateway-pg/authorize/matriz_cases.md` (`TS-AUTHORIZE-TC1001..1323`) + `docs/gateway-pg/authorize/TRACEABILITY.md` (25 pares Stripe↔Authorize).
- MercadoPago: `docs/gateway-pg/mercado-pago/matriz_cases.md` (`TS-MP-TCxxxx`). ✅ datos + docs.
- eBizCharge: `docs/gateway-pg/ebizcharge/matriz_cases.md` (`TS-EBIZ-TCxxxx`). ✅ datos + docs.

## Estado (2026-07-20)

Las 4 pasarelas tienen **datos + docs** y están cableadas al resolver cross-gateway. ✅ Fix naming `mercadopago`→`mercado-pago` aplicado.

**Pendiente:** runtime UI (POM + specs) de Authorize (BL-025), MercadoPago (BL-026), eBizCharge (BL-027) — cada uno bloqueado por su modelo de integración backend + confirmación de uso en PROD. Ver los `EXTERNAL-BLOCKERS.md` por pasarela.
