# `specs/mercado-pago/` — slot reservado para Mercado Pago

**Estado:** 🟡 Vacío — datos + docs listos (BL-026), runtime bloqueado por el modelo de integración backend.

## Por qué este slot está vacío

La SoT de fixtures Mercado Pago ya está lista en
[`tests/fixtures/gateways/mercado-pago/`](../../../../fixtures/gateways/mercado-pago/)
(16 keywords de estado + catálogo de 5 tarjetas), el adapter declarativo
[`mercadoPagoGatewayAdapter`](../../helpers/adapters/mercadoPagoGatewayAdapter.ts)
y el tipo `'mercado-pago'` en `SUPPORTED_PAYMENT_GATEWAYS`. Pero NO hay specs todavía porque:

1. Falta confirmar el **modelo de integración backend** — ¿Checkout API,
   Card Payment Brick o Checkout Pro/Wallet? Esto define el Page Object.
   Ver [EXTERNAL-BLOCKERS.md §2](../../../../../docs/gateway-pg/mercado-pago/EXTERNAL-BLOCKERS.md).
2. Falta confirmar si el `holderName` (el trigger) viaja tal cual al SDK de MP
   desde el form MAGIIS, y si el campo documento (DNI) está expuesto (§4).
3. Falta credencial sandbox del test user MP (§3) — solo necesaria para
   validación por API; el smoke por UI se dispara por `holderName`, sin keys.

## ⚠️ Diferencia crítica con Stripe: el trigger es el `holderName`

En Mercado Pago **el nombre del titular determina el outcome** (keyword de estado),
NO el número/CVV/monto. El spec que llene el form DEBE usar exactamente el keyword:

| Keyword `holderName` | Outcome | Estado MAGIIS |
|---|---|---|
| `APRO` | approved (accredited) — requiere DNI `12345678` | SEARCHING_DRIVER |
| `OTHE` | rejected (cc_rejected_other_reason) — decline canónico | NO_AUTORIZADO |
| `CONT` | pending | pendiente de acreditación |
| `SECU`/`FUND`/`CALL`/… | rejected (ver tabla completa) | NO_AUTORIZADO |

Número/CVV/exp son **fijos**: Visa `4509953566233704`, CVV `123` (Amex `1234`), exp `11/30`.
Tabla completa en [`fixtures/gateways/mercado-pago/cards.ts`](../../../../fixtures/gateways/mercado-pago/cards.ts) (`MP_TEST_CARDS`).

**MP no requiere 3DS** en el flujo MAGIIS (`mercadoPagoGatewayAdapter.requires3ds = false`).

## Alcance en TEST (aprobado por negocio) vs UAT

En TEST las tarjetas sandbox MP **no transaccionan**. Solo son funcionales (aprobado por negocio en esta etapa):

| Grupo | Flujo funcional TEST | Nivel | Vía de automatización |
|---|---|---|---|
| A | Wallet: adicionar / borrar tarjeta (App Pax) | mobile | Appium (autoría) |
| B | Alta de viaje **sin hold** → hasta creación (sin cobro) | web | `playwright codegen` → spec KATA |
| C | Cargo a Bordo → cobro desde App Driver **completa OK** | E2E | codegen (alta) + Appium (cobro) |
| D | Viaje calle → cobro desde App Driver **completa OK** | mobile | Appium (autoría) |

**Fuera de TEST → UAT con tarjetas reales:** hold/preautorización, cobro E2E de tarjeta **vinculada**,
declines transaccionales, 3DS (N/A en MP) y demás críticos post-estandarización Stripe.

**Gap conocido:** el alta sin hold crea el viaje pero el cobro de la tarjeta **vinculada** desde el driver
no completa en TEST; Cargo a Bordo y viaje calle **sí** cobran. Ver captura del modelo (§ "Cómo proceder").

## Estructura propuesta cuando se active

```
specs/mercado-pago/
├── web/                                           ← codegen → spec KATA
│   ├── carrier/no-hold/
│   │   ├── apppax-no-hold.spec.ts                 (MP-NOHOLD-01 · holderName APRO)
│   │   ├── colaborador-no-hold.spec.ts            (MP-NOHOLD-02)
│   │   └── empresa-no-hold.spec.ts                (MP-NOHOLD-03)
│   └── contractor/no-hold/
│       └── colaborador-no-hold.spec.ts            (MP-NOHOLD-04 → redirect dashboard)
├── e2e-mobile/                                     ← Appium (autoría aparte)
│   ├── wallet/         apppax-wallet-add-delete.e2e.spec.ts   (MP-WALLET-01/02)
│   ├── cargo-a-bordo/  {apppax,colaborador,empresa}-cargo.e2e.spec.ts  (MP-CARGO-01/02/03)
│   └── viaje-calle/    driver-viaje-calle.e2e.spec.ts         (MP-CALLE-01)
└── README.md (este archivo)
```

**Notas importantes:**
- Los casos con **Hold ON / 3DS** del slot Stripe NO tienen contraparte MP en TEST (van a UAT; 3DS es N/A en MP).
- Los POMs mobile `PassengerWalletScreen` y `DriverTripPaymentScreen` están **hardcodeados a Stripe Elements**
  → requieren variante MP o parametrización por `mercadoPagoGatewayAdapter` antes de automatizar Grupos A/C/D.
- El resolver cross-gateway soporta 3 intents MP: `HAPPY_NO_AUTH→APRO`, `DECLINE_AUTHORIZE→OTHE`,
  `DECLINE_INVALID_CVC→SECU` ([`_shared/resolver.ts`](../../../../fixtures/gateways/_shared/resolver.ts)).

## Lista de casos de la iteración actual

Los 10 casos (4 grupos) con anclajes, precondiciones, registro de ejecución y checklist de captura del modelo
están en [`docs/gateway-pg/mercado-pago/smoke-cases-no3ds.md`](../../../../../docs/gateway-pg/mercado-pago/smoke-cases-no3ds.md).

## Flujo de automatización de la iteración

### Web (Grupo B) — `playwright codegen` → spec KATA
1. Grabar (sesión limpia): `cross-env ENV=test npx playwright codegen "$BASE_URL"`.
   Recorrer: login dispatcher/contractor → Hold **OFF** → alta con tarjeta `APRO` (+ DNI) → "Buscando chofer".
2. Convertir la salida cruda a spec trazable en `web/{carrier,contractor}/no-hold/`, reemplazando los selectores
   grabados por los POMs existentes (`DashboardPage`, `OperationalPreferencesPage`, `NewTravelPage`,
   `TravelManagementPage`, `ContractorNewTravelPage`) y la aserción `expectPassengerInPorAsignar(pax, undefined, 'Buscando chofer')`.
   ⚠️ En MP el `holderName` **es el trigger** → el paso de llenado debe usar `APRO` tal cual.

### Mobile (Grupos A/C/D) — Appium (autoría aparte)
Reusar `PassengerWalletScreen` (wallet) y `DriverTripPaymentScreen` + `DriverTripHappyPathHarness` (cobro driver),
marcando el **TODO de variante MP** (hoy Stripe Elements). Viaje calle: formalizar POM desde `scripts/start-viaje-calle-flow.ts`.

## Cómo proceder cuando se active

1. Capturar §2 (modelo de integración) durante la grabación/ejecución — checklist en
   `docs/gateway-pg/mercado-pago/smoke-cases-no3ds.md` §"Captura del modelo".
2. Completar `webTodos`/`mobileTodos`/`validationTodos` del adapter con selectores/referencias observados;
   crear la variante MP del form (web y mobile) donde difiera de Stripe Elements.
3. Sumar `'mercado-pago'` a `ACTIVE_GATEWAYS` en
   [`_parametrized/hold-happy-no3ds.parametrized.spec.ts`](../_parametrized/hold-happy-no3ds.parametrized.spec.ts)
   **solo cuando el spec web esté verde** (evita romper compilación/ejecución).
4. IDs `TS-MERCADOPAGO-TCxxxx` para trazabilidad de matriz (ver `CLAUDE.md` §"Convención de commits — trazabilidad TC ID").

## Referencias

- [`docs/gateway-pg/mercado-pago/`](../../../../../docs/gateway-pg/mercado-pago/) — README, ARCHITECTURE, matriz_cases, EXTERNAL-BLOCKERS, TRACEABILITY
- [`tests/fixtures/gateways/mercado-pago/`](../../../../fixtures/gateways/mercado-pago/) — SoT de tarjetas MP (`MP_TEST_CARDS`)
- [`tests/fixtures/gateways/_shared/`](../../../../fixtures/gateways/_shared/) — resolver cross-gateway (`MERCADO_PAGO_INTENT_MAP`)
- [`tests/features/gateway-pg/data/journey-defaults.ts`](../../data/journey-defaults.ts) — datos de dominio MAGIIS agnósticos
- [`tests/features/gateway-pg/helpers/adapters/mercadoPagoGatewayAdapter.ts`](../../helpers/adapters/mercadoPagoGatewayAdapter.ts) — metadata declarativa
