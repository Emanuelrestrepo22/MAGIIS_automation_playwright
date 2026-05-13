# `specs/authorize/` — slot reservado para Authorize.net

**Estado:** 🔴 Vacío — esperando confirmación de uso real en MAGIIS PROD.

## Por qué este slot está vacío

La SoT de fixtures Authorize.net ya está lista en
[`tests/fixtures/gateways/authorize/`](../../../../fixtures/gateways/authorize/),
pero NO hay specs todavía porque:

1. Falta confirmar con el líder si MAGIIS PROD integra Authorize.net o
   solo el sandbox de prueba ([BL-025](../../../../../docs/ops/BACKLOG.md)).
2. Falta validar acceso a sandbox keys (`AUTHORIZE_API_LOGIN_ID` +
   `AUTHORIZE_TRANSACTION_KEY`) en `.env`.
3. Falta espec runtime del POM Authorize en el portal MAGIIS (selectores del
   form pueden diferir de Stripe Elements; podrían reutilizar la base
   compartida o requerir POM propio).

## Estructura propuesta cuando se active

Espejo exacto de `specs/stripe/`:

```
specs/authorize/
├── web/
│   ├── carrier/
│   │   ├── hold/
│   │   │   ├── apppax-hold-no3ds.spec.ts        (HAPPY_NO_AUTH)
│   │   │   ├── colaborador-hold-no3ds.spec.ts
│   │   │   └── empresa-hold-no3ds.spec.ts
│   │   ├── cargo-a-bordo/
│   │   │   ├── apppax-cargo-happy.spec.ts
│   │   │   ├── apppax-cargo-declines.spec.ts    (DECLINE_AUTHORIZE)
│   │   │   └── ...
│   │   ├── operaciones/
│   │   └── recurrentes/
│   └── contractor/
│       ├── vinculacion-tarjeta.spec.ts
│       ├── colaborador-hold-no3ds.spec.ts
│       └── ...
├── e2e-mobile/
│   └── (espejo de stripe/e2e-mobile/)
└── README.md (este archivo)
```

**Notas importantes:**
- Authorize NO requiere 3DS en el flujo MAGIIS estándar
  (`authorizeGatewayAdapter.requires3ds = false`).
- Los specs `hold-3ds`, `cargo-3ds` y `apppax-cargo-3ds.spec.ts` del slot
  Stripe NO tienen contraparte Authorize (intent `HAPPY_AUTH` no soportado
  por el sandbox Authorize — el resolver lanza error claro).

## Patrón recomendado al crear el primer spec

Aprovechar el resolver cross-gateway para escribir specs parametrizados:

```typescript
import { test, expect } from '@playwright/test';
import { resolveCard } from '../../../../fixtures/gateways/_shared';
import { JOURNEY_DEFAULTS } from '../../data/journey-defaults';

test.describe('[authorize] hold authorize happy path', () => {
  test('crea viaje sin 3DS y queda en SEARCHING_DRIVER', async ({ page }) => {
    const card = resolveCard({ gateway: 'authorize', intent: 'HAPPY_NO_AUTH' });

    // Mismas assertions que Stripe — comportamiento esperado constante.
    await newTravel.fillMinimum({
      ...JOURNEY_DEFAULTS,
      cardLast4: card.last4,
      cardCvc: card.cvc,
      cardZip: card.zip,
    });

    await expect(travelManagement.porAsignarRow).toBeVisible();
  });
});
```

## Cómo proceder cuando se active

1. Confirmar prerequisitos con el líder (BL-025).
2. Cargar credenciales Authorize en `.env.test` y `.env.uat`.
3. Crear primer spec piloto siguiendo el patrón mostrado arriba.
4. Validar contra el sandbox real (al menos 1 happy + 1 decline).
5. Replicar el resto de scenarios siguiendo la estructura espejo de
   `specs/stripe/`, usando los mismos identificadores TC cuando aplique
   (la trazabilidad de matriz va por TC ID — ver `CLAUDE.md` §"Regla de
   trazabilidad de IDs").

## Referencias

- [`tests/fixtures/gateways/authorize/`](../../../../fixtures/gateways/authorize/) — SoT de tarjetas Authorize
- [`tests/fixtures/gateways/_shared/`](../../../../fixtures/gateways/_shared/) — resolver cross-gateway
- [`tests/features/gateway-pg/data/journey-defaults.ts`](../../data/journey-defaults.ts) — datos de dominio MAGIIS agnósticos
- [`tests/features/gateway-pg/helpers/adapters/authorizeGatewayAdapter.ts`](../../helpers/adapters/authorizeGatewayAdapter.ts) — metadata declarativa
- [`docs/ops/BACKLOG.md`](../../../../../docs/ops/BACKLOG.md) — BL-025 (datos), BL-028 (parametrización specs)
