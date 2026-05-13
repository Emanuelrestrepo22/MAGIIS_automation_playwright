# `_parametrized/` — specs piloto cross-gateway

## Por qué existe este directorio

El prefijo `_` marca esta carpeta como **estructura experimental**, en línea
con `tests/fixtures/gateways/_shared/` (BL-024 Fase 3). Los specs que viven
acá demuestran el patrón habilitado por el resolver polimórfico
`resolveCard({ gateway, intent })`: un único flujo de UI que itera sobre
varios gateways de pago sin duplicar código.

No es una carpeta productiva todavía. Cuando el approach se confirme contra
≥2 gateways reales, los specs de `specs/stripe/`, `specs/authorize/`, etc.
se irán refactorizando progresivamente para consumir el mismo patrón y
estos pilotos se podrán deprecar o promover a estructura definitiva.

## Qué demuestra el spec piloto

`hold-happy-no3ds.parametrized.spec.ts`:

- Itera sobre `ACTIVE_GATEWAYS: GatewayName[]` con un `for…of` dentro de
  `test.describe`.
- Resuelve la tarjeta vía `resolveCard({ gateway, intent: 'HAPPY_NO_AUTH' })`
  → obtiene una `GenericTestCard` con `number`, `last4`, `expiry`, `cvc`,
  `holderName`, `zip?`, `expectedOutcome`, `requires3ds`.
- Usa `JOURNEY_DEFAULTS` (dominio MAGIIS: cliente, pasajero, origin,
  destination) para todo lo no específico del gateway.
- Reutiliza `loginAsDispatcher`, `NewTravelPage`, `TravelManagementPage`,
  `expectNoThreeDSModal` desde `gateway.fixtures.ts` — **sin** duplicar
  POMs ni helpers.
- Valida estado MAGIIS post-submit: pasajero visible en grilla
  "Por asignar" con estatus "Buscando chofer" (≡ `SEARCHING_DRIVER`).

Principio rector (BL-024): _"comportamiento esperado constante, datos
variables por gateway"_.

## Cuándo se suman más gateways

`ACTIVE_GATEWAYS = ['stripe']` hoy.

| Gateway        | Estado                              | Habilitador          |
| -------------- | ----------------------------------- | -------------------- |
| `stripe`       | runtime web completo                | producción           |
| `authorize`    | fixtures listos, **runtime falta**  | **BL-025**           |
| `mercado-pago` | investigación pendiente             | BL-026               |
| `ebizcharge`   | investigación pendiente             | BL-027               |

Cuando BL-025 termine (POMs Authorize + login del portal), simplemente
agregar `'authorize'` al array. El resolver ya soporta el intent
`HAPPY_NO_AUTH` para Authorize (mapea a card `SUCCESS`, número
`4111 1111 1111 1111`, CVV `900`).

Si el flujo de UI difiere por gateway (ej. Authorize no usa Stripe Elements
iframe), condicionar dentro del `test.step` con `if (gateway === 'authorize')`
o delegar al adapter en `tests/features/gateway-pg/helpers/adapters/`.

## Cómo extender el patrón

### A otros intents (mismo flujo, otro happy/fail path)

Crear nuevos specs piloto en este directorio, uno por intent canónico:

- `hold-happy-3ds.parametrized.spec.ts` → `intent: 'HAPPY_AUTH'`
  (Stripe-only hoy, hasta que algún gateway sume 3DS).
- `hold-fail-3ds.parametrized.spec.ts` → `intent: 'FAIL_AUTH'`.
- `hold-decline-authorize.parametrized.spec.ts` → `intent: 'DECLINE_AUTHORIZE'`.
- `hold-decline-cvc.parametrized.spec.ts` → `intent: 'DECLINE_INVALID_CVC'`.

Cada uno declara su `ACTIVE_GATEWAYS` filtrando por
`SUPPORTED_INTENTS_BY_GATEWAY[gateway].includes(intent)` si querés
auto-saltar gateways que no soportan ese intent.

### A specs productivos existentes

Refactorizar `specs/stripe/.../hold/*.spec.ts` reemplazando:

```ts
cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4)
```

por:

```ts
const card = resolveCard({ gateway: 'stripe', intent: 'HAPPY_NO_AUTH' });
// ...
cardLast4: card.last4
```

Hacerlo **incremental**, un spec a la vez, validando que el behavior no
cambió (mismo last4 4242 resuelto vía resolver vs constante directa).

## Convenciones del directorio

- Sufijo `.parametrized.spec.ts` en los archivos.
- `describe` raíz con prefijo `[BL-028][parametrized]`.
- No referenciar `TS-STRIPE-TCxxxx` en el título del `test`: estos specs
  son **piloto de patrón**, no la implementación oficial del TC. Cuando
  se migre el TC oficial, agregar el ID al describe interno.
- Cada spec piloto debe poder ejecutarse con `--workers=1` por seguridad
  contra colisiones de gateway (regla heredada de `specs/stripe/`).
