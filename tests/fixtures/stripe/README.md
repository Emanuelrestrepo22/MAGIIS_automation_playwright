# Stripe Fixtures — Tarjetas de Prueba

Source of truth para tarjetas Stripe en todo el proyecto.

## Regla canónica — la respuesta la define el número de tarjeta

En los tests de gateway MAGIIS **el comportamiento esperado lo determina el número de la tarjeta**, no data generada aleatoriamente. Stripe test mode expone un set cerrado de PANs con outcome fijo y documentado:

| Número | Outcome determinístico |
|---|---|
| `4242 4242 4242 4242` | Aprobado directo, sin 3DS |
| `4000 0027 6000 3184` | 3DS siempre exigido → éxito al autenticar |
| `4000 0000 0000 9235` | 3DS exigido → falla de autenticación → NO_AUTORIZADO |
| `4000 0000 0000 9995` | Declinada por fondos insuficientes |
| `4000 0084 0000 1629` | 3DS OK + `card_declined` post-auth |

Consecuencias arquitectónicas:

- Las tarjetas son SoT **fija** en `tests/fixtures/stripe/cards.ts` + `card-policy.ts` (policy por intención). No se generan con faker.
- Los campos auxiliares (holderName, cvc, exp, zip) son **inertes al outcome** — Stripe test los ignora para decidir la respuesta. Pueden ser random o fijos sin afectar la aserción.
- `tests/shared/utils/dataGenerator.ts` solo cubre data de auth (emails/passwords no registrados). No debe tener helpers de Stripe: no hay nada que "generar" — hay que **elegir** la card que expresa la intención del test.
- Al escribir un test nuevo: primero decidir qué respuesta espera el TC, después buscar el alias de `CARDS` en `card-policy.ts`. Si no existe alias para esa intención, agregarlo con JSDoc que explique el outcome esperado.

## Estructura

```
tests/fixtures/stripe/
├── cards.ts          ← source of truth de las tarjetas (re-export del registry)
├── card-policy.ts    ← namespace CARDS con nombres por INTENCIÓN
└── README.md         ← este archivo
```

## Cómo usar

### ✅ Recomendado — usar la policy por intención

```typescript
import { CARDS } from '@/tests/fixtures/stripe/card-policy';

await travel.fillMinimum({
  ...
  cardLast4: CARDS.HAPPY_3DS_HOLD_CAPTURE.slice(-4),
});
```

### ❌ Evitar — alias técnico directo

```typescript
// ❌ No hacer esto en tests nuevos
cardLast4: STRIPE_TEST_CARDS.alwaysAuthenticate.slice(-4);
```

## Tabla de cards por intención

| Constante `CARDS.*` | Número | last4 | Intención |
|---|---|---|---|
| `SUCCESS_NO_3DS` | 4242 4242 4242 4242 | 4242 | Pago exitoso sin 3DS |
| **`HAPPY_3DS`** | 4000 0027 6000 3184 | 3184 | **Default 3DS happy path** |
| `HAPPY_3DS_HOLD_CAPTURE` | 4000 0027 6000 3184 | 3184 | Alias para flujos hold + capture |
| `HAPPY_3DS_SINGLE` | 4000 0000 0000 3220 | 3220 | 3DS single-shot (puede reutilizar auth) |
| `FAIL_3DS` | 4000 0000 0000 9235 | 9235 | 3DS con fallo de autenticación |
| `DECLINE_AUTHORIZE` | 4000 0000 0000 0002 | 0002 | Decline en authorize (hold falla) |
| `DECLINE_CAPTURE` | 4000 0000 0000 9995 | 9995 | Decline en capture (cobro final falla) |
| `DECLINED_AFTER_3DS` | 4000 0084 0000 1629 | 1629 | 3DS OK + decline post-autenticación |
| `LEGACY_3DS_SUCCESS` ⚠️ | 4000 0025 0000 3155 | 3155 | **Deprecated** — comportamiento variable |

## Política de elección de card por escenario

### 3DS Happy Path
- **Default**: `HAPPY_3DS` (3184 — always_authenticate)
- **Por qué**: determinístico. Siempre pide challenge en cada intent (setup, authorize, capture). Elimina la variabilidad de 3155.
- **Cuándo usar alternativas**: si el test valida comportamiento específico de reutilización de auth, usar `HAPPY_3DS_SINGLE` (3220) con justificación en JSDoc.

### 3DS con múltiples intents (portal contractor, flows híbridos)
- **Usar**: `HAPPY_3DS_HOLD_CAPTURE` (alias de HAPPY_3DS, 3184)
- **Por qué**: estricto en cada operación → behaviour consistente en secuencia vinculación → hold → capture.

### Declines
- **Falla en vinculación/hold**: `DECLINE_AUTHORIZE` (0002)
- **Falla en cobro final**: `DECLINE_CAPTURE` (9995) — solo si el test llega al paso de captura

### Card deprecada (3155)
- Está en la policy como `LEGACY_3DS_SUCCESS` con `@deprecated` JSDoc.
- Los specs que aún la usan: `passenger-flow2-scenarios.ts`, `passenger-business-scenarios.ts`, `driver-happy-path-scenarios.ts`, flows 1 y 3, algunos smoke.
- Migración pendiente planificada por fases — ver CHANGELOG cuando se ejecute.

## Agregar una card nueva

1. Si el número de tarjeta no existe todavía, agregarla en `features/gateway-pg/data/stripe-cards.ts` (SoT) con JSDoc del comportamiento Stripe.
2. Actualizar `fixtures/stripe/cards.ts` si hace falta exponer nuevo símbolo.
3. Exponerla en `card-policy.ts` bajo el grupo semántico (HAPPY / UNHAPPY / deprecated).
4. Actualizar la tabla de este README.
5. Referenciar los TC IDs que la usan.

## Referencia

- Stripe docs oficiales: https://stripe.com/docs/testing#cards
- Matriz MAGIIS: `docs/gateway-pg/stripe/matriz_cases.md`, `matriz_cases2.md`
