# `tests/fixtures/` — Datos de Prueba Transversales

Source of truth **canónica** para datos de prueba reutilizables en cualquier feature del proyecto.

## Propósito

Esta carpeta existe para resolver un problema común en proyectos grandes: **dónde guardar los datos de prueba atómicos y reusables** (tarjetas Stripe, usuarios tipo, payloads base) de forma que:

- No estén acoplados a un feature específico
- Tengan una única ubicación documentada como source of truth
- Sean descubribles por devs nuevos
- Se expongan por **intención** (qué validan) en vez de por **alias técnico**

## Estructura

```
tests/fixtures/
├── README.md            ← este archivo — taxonomía + convenciones
├── index.ts             ← barrel export
├── stripe/              ← tarjetas de prueba Stripe
│   ├── cards.ts         ← registry de tarjetas atómicas
│   ├── card-policy.ts   ← namespace CARDS por intención (usar éste en tests)
│   └── README.md        ← tabla-guía + políticas de decisión
└── users/               ← usuarios transversales
    └── passengers.ts    ← catálogo de pasajeros por tipo
```

## Diferencia con `features/<x>/data/`

| Carpeta | Qué va ahí |
|---|---|
| **`tests/fixtures/`** (esta) | Datos **atómicos y transversales** (1 card, 1 user, 1 address) usables en cualquier feature |
| `tests/features/<feature>/data/` | **Scenarios específicos del feature** (combinaciones card × user × flow que solo ese feature consume) |

Ejemplo:
- `fixtures/stripe/cards.ts` → la card `4000 0000 0000 0002` como objeto atómico
- `features/gateway-pg/data/cargo-a-bordo-scenarios.ts` → `{ tcId: 'TC1083', cardKey: 'declined_funds', expectedResult: 'declined' }` (combina card + expected + tcId)

## Cómo usar desde un test

### ✅ Recomendado

```typescript
// Import directo desde fixtures
import { CARDS, PASSENGERS } from '@/tests/fixtures';

// O más específico:
import { CARDS } from '@/tests/fixtures/stripe/card-policy';

test('...', async ({ page }) => {
  await travel.fillMinimum({
    passenger: PASSENGERS.appPax.name,
    cardLast4: CARDS.HAPPY_3DS.slice(-4),
    ...
  });
});
```

### ❌ Evitar en código nuevo

```typescript
// ❌ Import desde ubicación interna del feature
import { STRIPE_TEST_CARDS } from '../../features/gateway-pg/data/stripe-cards';

// ❌ Usar alias técnico en vez de policy semántica
cardLast4: STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4);
```

(Los imports legacy siguen funcionando — hay re-exports, pero los migraremos en fases.)

## Convención: cuándo agregar algo a fixtures/

**Sí va a `fixtures/`** si cumple TODAS:
- Es un dato atómico (una card, un user, una address)
- Puede ser usado por >=2 features distintos
- No depende de combinaciones/flow específicos
- Es estable (no se regenera dinámicamente por cada test)

**No va a fixtures/, va al feature** si:
- Es un scenario compuesto específico
- Tiene relaciones con TC IDs de una matriz feature
- Es datos generados dinámicamente por faker

## Policy de cards Stripe

Ver `stripe/README.md` para la tabla completa. Resumen:

- **Default 3DS happy path**: `CARDS.HAPPY_3DS` (3184 — always_authenticate)
- **Default sin 3DS**: `CARDS.SUCCESS_NO_3DS` (4242)
- **Default decline**: `CARDS.DECLINE_AUTHORIZE` (0002) para authorize / `CARDS.DECLINE_CAPTURE` (9995) para capture
- **Deprecated**: `CARDS.LEGACY_3DS_SUCCESS` (3155) → no usar en tests nuevos

## Alineación industry-standard

Esta estructura se inspira en cómo resuelven el mismo problema frameworks de testing de proyectos grandes:

- **Stripe SDK tests**: `test/fixtures/cards.ts`
- **Shopify test suite**: `fixtures/payment-methods.ts`
- **Adyen automation**: `testdata/cards/{env}.json`
- **Selenium referencia** (Emanuelrestrepo22/selenium-py-POM): `tests/utils/` como ubicación única consolidada

## Roadmap de migración

Esta carpeta se creó como Fase 1+2 del plan de estandarización. El estado actual:

- ✅ **Fase 1+2**: estructura + policy object (este MR)
- ⏳ **Fase 3a**: migrar smoke suite a `CARDS.*`
- ⏳ **Fase 3b**: migrar flows E2E
- ⏳ **Fase 3c**: migrar scenarios files
- ⏳ **Fase 4**: `docs/ARCHITECTURE.md` + lint rule contra cards deprecadas

Referencia: plan completo en el MR de esta rama.
