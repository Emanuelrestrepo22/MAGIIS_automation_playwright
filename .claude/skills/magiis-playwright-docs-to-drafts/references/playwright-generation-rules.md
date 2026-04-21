# Playwright Generation Rules

## Objective
Convert prioritized cases into Playwright draft artifacts aligned with the existing framework.

## Existing framework to reuse

### POMs canónicos (fuente de verdad)

```text
tests/pages/
├── shared/LoginPage.ts          ← login carrier + contractor
├── shared/SuperPage.ts          ← base: openNewTravel, navegación
├── carrier/DashboardPage.ts
├── carrier/NewTravelPage.ts      ← formulario alta de viaje + helpers Stripe
├── carrier/TravelManagementPage.ts  ← columnas Por Asignar / En Conflicto
├── carrier/TravelDetailPage.ts
├── carrier/OperationalPreferencesPage.ts
├── carrier/ThreeDSModal.ts       ← Popup A: Stripe/Visa challenge frame
├── carrier/ThreeDSErrorPopup.ts  ← Popup B: error popup MAGIIS (uso selectivo)
└── carrier/index.ts              ← barrel export
```

Contractor hereda de carrier; solo subclasificar si hay divergencia real de UI.

### Helpers de gateway (reuse antes de crear)

| Helper | Ubicación | Propósito |
|---|---|---|
| `waitForTravelCreation` | `helpers/stripe.helpers.ts` | Esperar URL post-submit (`limitExceeded=false` o `/travels/{id}`) |
| `setupTravelWithFailed3DS` | `helpers/stripe.helpers.ts` | Setup completo: Hold ON + fail3DS + `completeFail()` → navega a detalle |
| `captureCreatedTravelId` | `helpers/travel-cleanup.ts` | API interceptor: captura `travelId` del POST /travels |
| `cancelTravelIfCreated` | `helpers/travel-cleanup.ts` | Cleanup en `finally` para evitar acumulación de viajes |
| `validateCardPrecondition` | `helpers/card-precondition.ts` | Verifica si pasajero tiene tarjeta activa por last4 |

### Datos y tarjetas

- `tests/features/gateway-pg/data/stripeTestData.ts` → `STRIPE_TEST_CARDS`, `TEST_DATA`
- `tests/features/gateway-pg/fixtures/gateway.fixtures.ts` → `loginAsDispatcher`, `loginAsContractor`

### Legado (no crear duplicados)

- `tests/utils/excel-reader.ts` → `readTestCases(path, sheet)`
- `tests/utils/apiClient.ts`
- `tests/utils/dataGenerator.ts`

## Draft generation rules
- Use TypeScript.
- Use `@playwright/test`.
- Reuse existing page objects and fixtures before proposing new ones.
- Create new selectors only when no equivalent selector already exists.
- Keep specs under `tests/specs/<module>`.
- Follow ID-based naming tied to the source case.
- Add tags for smoke, regression, and module when applicable.
- Add explicit `TODO` blocks for DB, API, Stripe Dashboard, or 3DS validation dependencies.
- Do not hardcode credentials or sensitive data.
- Do not assume draft specs are merge-ready by default.

## Expected draft outputs
- spec drafts
- page object proposals
- fixture proposals
- test data proposals
