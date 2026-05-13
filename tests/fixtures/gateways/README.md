# `fixtures/gateways/` — Umbrella multi-gateway

Esta carpeta es la **Source of Truth canónica** para datos de prueba específicos
de cada pasarela de pago soportada por MAGIIS.

> **Principio rector**
> *El comportamiento esperado del sistema es constante; sólo los datos de entrada
> cambian por pasarela. Las assertions de UI, los estados de viaje, las grillas
> y los popups son MAGIIS — no del gateway.*

## Mapa

```
fixtures/gateways/
├── _shared/                 ← cross-gateway (intents, tipos comunes, resolver polimórfico)
│   ├── types.ts             — GatewayName, CardIntent, GenericTestCard
│   ├── policy.ts            — (opcional, intents canónicos si crecen)
│   ├── resolver.ts          — resolveCard({ gateway, intent })
│   └── index.ts             — barrel
├── stripe/                  ← 🟢 producción activa
│   ├── cards.ts             — SoT canónica Stripe (env-aware)
│   ├── card-policy.ts       — namespace CARDS (HAPPY_3DS, FAIL_3DS, etc)
│   ├── card-resolver.ts     — resolver Stripe-specific
│   └── README.md            — tabla de cards + triggers
├── authorize/               ← 🟡 sandbox listo, runtime pendiente
│   ├── cards.ts             — SoT canónica Authorize (CVV/ZIP triggers)
│   ├── card-policy.ts       — namespace AUTHORIZE_CARDS
│   ├── card-resolver.ts     — resolver Authorize-specific
│   └── README.md            — tabla de triggers CVV/ZIP
├── mercadopago/             ← 🔴 investigación pendiente (BL-026)
│   └── README.md
└── ebizcharge/              ← 🔴 investigación pendiente (BL-027)
    └── README.md
```

## Cómo cada gateway dispara outcomes

| Gateway       | Mecanismo del trigger                              | Requiere 3DS | Estado MAGIIS                   |
|---------------|----------------------------------------------------|--------------|---------------------------------|
| **Stripe**    | El **número de tarjeta** determina el resultado    | Sí           | 🟢 Producción activa            |
| **Authorize** | El **CVV o ZIP** sobre tarjeta fija determina      | No           | 🟡 SoT lista, sin runtime        |
| **MercadoPago** | El **`holderName`** + tarjetas fijas             | No           | 🔴 Investigación pendiente      |
| **eBizCharge** | A investigar                                      | A investigar | 🔴 Investigación pendiente      |

## Cómo agregar un nuevo gateway (checklist de 5 pasos)

1. **Crear carpeta** `fixtures/gateways/<nombre>/` siguiendo la estructura
   `cards.ts`, `card-policy.ts`, `card-resolver.ts`, `README.md`.
2. **Definir tipo específico** en `cards.ts` (`<Gateway>TestCard` con los
   campos que el SDK exige: number, brand, exp, cvc, posibles triggers).
3. **Crear namespace semántico** en `card-policy.ts` con keys por intención
   (`SUCCESS`, `DECLINE_*`, `AVS_*`, etc.).
4. **Implementar resolver específico** en `card-resolver.ts`. Retorna el objeto
   gateway-specific completo (sin normalizar — eso lo hace `_shared/resolver.ts`).
5. **Conectar al cross-gateway resolver** en [`_shared/resolver.ts`](_shared/resolver.ts):
   - Agregar el `case '<gateway>'` al switch.
   - Definir `<GATEWAY>_INTENT_MAP` con los intents soportados.
   - Implementar `normalize<Gateway>Card()` que convierte al `GenericTestCard`.
6. **Actualizar `GatewayName`** en [`_shared/types.ts`](_shared/types.ts) si todavía no está incluido.
7. **Actualizar allowlist** del check 2 (cards deprecadas) en
   `scripts/ci/pre-push.mjs` si el gateway nuevo redefine alguna card sensible.

## Cómo se usa desde un spec

### Forma cross-gateway (recomendada para parametrización)

```typescript
import { resolveCard, type GatewayName } from 'tests/fixtures/gateways/_shared';
import { JOURNEY_DEFAULTS } from 'tests/features/gateway-pg/data/journey-defaults';

const GATEWAYS: GatewayName[] = ['stripe', 'authorize'];

test.describe.each(GATEWAYS)('[%s] hold authorize happy path', (gateway) => {
  test('crea viaje y queda en SEARCHING_DRIVER', async ({ page }) => {
    const card = resolveCard({ gateway, intent: 'HAPPY_NO_AUTH' });

    await newTravel.fillMinimum({
      ...JOURNEY_DEFAULTS,                           // dominio constante
      cardLast4: card.last4,                          // ← dato variable por gateway
      cardCvc: card.cvc,
      cardZip: card.zip,
    });

    // Mismas assertions en todos los gateways:
    await expect(travelManagement.porAsignarRow).toBeVisible();
  });
});
```

### Forma específica del gateway (cuando se necesita lo gateway-only)

```typescript
import { CARDS } from 'tests/fixtures/gateways/stripe/card-policy';

const card = CARDS.HAPPY_3DS_HOLD_CAPTURE;  // solo aplica a Stripe
```

## Compatibilidad con paths legacy

Los archivos en `tests/fixtures/stripe/` y `tests/fixtures/authorize/` son
**thin re-exports** desde `gateways/<x>/`. Specs existentes siguen funcionando
sin migrar imports. Archivos nuevos deben importar desde `gateways/<x>/` directamente.

Los archivos en `tests/features/gateway-pg/data/stripe-cards.ts` y `stripeTestData.ts`
también son re-exports legacy desde `gateways/stripe/`.

## Referencias cruzadas

- [`tests/features/gateway-pg/data/journey-defaults.ts`](../../features/gateway-pg/data/journey-defaults.ts) — datos de dominio MAGIIS agnósticos del gateway.
- [`tests/features/gateway-pg/helpers/adapters/`](../../features/gateway-pg/helpers/adapters/) — adapters declarativos (`requires3ds`, `usesSharedCardForm`).
- [`docs/ops/BACKLOG.md`](../../../docs/ops/BACKLOG.md) — BL-024 (este refactor), BL-025/026/027/028 (gateways pendientes).
- [`CLAUDE.md`](../../../CLAUDE.md) — política del proyecto y glosario MAGIIS.
