# Framework Map

## Current stack
- Playwright with `@playwright/test`
- TypeScript
- Page Object Model
- Multi-environment runtime

## Relevant repo structure

```text
tests/
├── TestBase.ts                          ← fixture base con auth por rol y storageState
├── config/runtime.ts                    ← roles: carrier, contractor, web; loginPath, dashboardPattern
├── pages/
│   ├── shared/LoginPage.ts
│   ├── shared/SuperPage.ts
│   ├── carrier/                         ← POMs canónicos — fuente de verdad
│   │   ├── DashboardPage.ts
│   │   ├── NewTravelPage.ts
│   │   ├── TravelManagementPage.ts      ← columnas Por Asignar / En Conflicto
│   │   ├── TravelDetailPage.ts
│   │   ├── OperationalPreferencesPage.ts
│   │   ├── ThreeDSModal.ts              ← Popup A: Stripe/Visa challenge frame
│   │   ├── ThreeDSErrorPopup.ts         ← Popup B: MAGIIS error (uso selectivo)
│   │   └── index.ts
│   └── contractor/                      ← solo si hay divergencia real de UI
├── selectors/                           ← selectores separados de la lógica de página
├── features/
│   └── gateway-pg/
│       ├── specs/stripe/                ← specs por portal y tipo de flujo
│       ├── fixtures/gateway.fixtures.ts ← loginAsDispatcher, loginAsContractor, TEST_DATA
│       ├── data/stripeTestData.ts        ← STRIPE_TEST_CARDS, tarjetas de prueba
│       ├── helpers/stripe.helpers.ts    ← waitForTravelCreation, setupTravelWithFailed3DS
│       └── helpers/travel-cleanup.ts   ← captureCreatedTravelId, cancelTravelIfCreated
├── features/smoke/specs/                ← suite smoke (gateway-pg.smoke.spec.ts)
├── mobile/appium/                       ← screens Appium Android
├── utils/
│   ├── excel-reader.ts                  ← readTestCases(path, sheet)
│   ├── apiClient.ts
│   └── scripts/update-matriz-xlsx.ts   ← sync xlsx desde normalized-test-cases.json
└── coverage/                            ← coverage manifest y README
```

`playwright.config.ts` — config general  
`playwright.gateway-pg.config.ts` — config específica gateway

## Reuse-first guidance

- Reuse `LoginPage` / `SuperPage` antes de crear nuevas páginas de auth.
- Reuse `TravelManagementPage.expectPassengerInPorAsignar()` / `expectPassengerInEnConflicto()` para validar estados del viaje.
- Reuse `setupTravelWithFailed3DS` antes de reescribir el flujo de fallo 3DS.
- Reuse `captureCreatedTravelId` + `cancelTravelIfCreated` en `try/finally` para cleanup.
- Reuse fixtures de `gateway.fixtures.ts` — no duplicar `loginAsDispatcher`.
- Selectors: `tests/selectors/<module>.ts` antes de inventar nuevos.

## Practical rule

Create a new artifact only when the existing framework cannot represent the flow with reasonable clarity.

## Regla de trazabilidad de IDs

Todo ID de TC usado en specs, describe, comentarios o docs proviene exclusivamente de `docs/gateway-pg/stripe/matriz_cases.md` o `matriz_cases2.md`. Si un TC no tiene ID asignado, marcarlo como `[SIN-ID-MATRIZ]` y crear el TC en la matriz antes de desarrollar el spec. Verificar existencia en `docs/gateway-pg/stripe/normalized-test-cases.json`.
