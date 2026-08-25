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

> ⚠️ **Estado real (2026-07-29)**: la evolución NO fue por este camino. Los specs
> productivos de Authorize/eBizCharge no consumen el piloto de acá — corren sobre
> `runStepwiseHoldJourney` (`helpers/stepwise-hold-journey.ts`), el motor
> paso-a-paso pedido por el líder de QA (2026-07-27) para que el step que falla
> identifique el punto exacto sin abrir el trace. El piloto de este directorio es
> el único consumidor de `CarrierHoldSteps.runHoldScenario` hoy. Ambos motores
> coexisten a propósito; ver los docblocks cruzados de ambos archivos antes de
> refactorizar cualquiera.

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

## Cómo se resuelve el set de gateways (actualizado 2026-07-29)

`ACTIVE_GATEWAYS` **ya NO está hardcodeado**. El spec lo obtiene de
`resolveActiveGateways()` (`helpers/adapters/index.ts`), que resuelve en
tiempo de colección:

1. Si `GATEWAYS` está seteada en env (CSV, ej. `GATEWAYS=authorize,stripe`),
   usa exactamente ese set — y **falla ruidosamente** si contiene un nombre
   desconocido.
2. Si no, devuelve los gateways cuyo adapter reporta `isConfigured()` — es
   decir, los que tienen sus credenciales presentes en el `.env` activo.

Estado real de cobertura (no solo del piloto de este directorio):

| Gateway        | Estado                                                                                  |
| -------------- | --------------------------------------------------------------------------------------- |
| `stripe`       | runtime web completo (~223 specs); card form vía Stripe Elements (3 iframes)             |
| `authorize`    | **runtime completo**: CFG (5 ATC MG-220/221/223/224/226) + HOLD (14 casos) + CARGO + WAL |
| `ebizcharge`   | specs CFG/card-matrix/hold/cargo escritos; **nunca ejecutados live** (faltan `EBIZ_*`)   |
| `mercado-pago` | specs no-hold + wallet web; sin cobertura de cobro real en TEST (no transacciona)        |

> El estado "fixtures listos, runtime falta (BL-025)" que este README declaraba
> para Authorize quedó obsoleto: BL-025 se cerró y Authorize es hoy la segunda
> pasarela con cobertura KATA real.

Si el flujo de UI difiere por gateway, **no** condicionar con
`if (gateway === 'authorize')`: el branch canónico es por capacidad declarada
en el adapter — `adapter.cardForm` (`'stripe-elements'` vs `'native-angular'`,
resuelto por `cardFormFor(gateway)`), `adapter.requires3ds`,
`adapter.outcomeTrigger`. Ver `helpers/adapters/types.ts`.

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
