# Gateway PG Stripe Architecture

> **STATUS:** CANONICAL
> **Effective date:** 2026-04-09
> **Source matrix:** `docs/gateway-pg/stripe/matriz_cases.md` + `docs/gateway-pg/stripe/matriz_cases2.md`
> **Stack:** Playwright + TypeScript (web) + Appium + WebdriverIO (mobile)

## Canonical map (enforced)

- Test case source of truth: `tests/features/gateway-pg/specs/stripe/**`
- Execution entrypoint for Gateway config: `tests/specs/gateway-pg/stripe/**` (wrapper specs only)
- Canonical web POMs: `tests/pages/shared/**` and `tests/pages/carrier/**`
- Canonical gateway data: `tests/features/gateway-pg/data/**`
- Feature-level helpers/fixtures/context: `tests/features/gateway-pg/{helpers,fixtures,context}/**`
- Appium screens and scripts: `tests/mobile/appium/**`

## Rules to avoid ambiguity

1. `docs/codex-prompts/README.md` and `AGENTS.md` define document precedence for Gemini/Codex/Claude workflows.
2. If a path in this file conflicts with repository reality, repository reality + `CLAUDE.md` wins.
3. `tests/specs/gateway-pg/stripe/**` must stay as wrappers (`import ...features...`) and must not contain business logic.
4. New reusable POMs are added to `tests/pages/**`, not to `tests/features/**/pages`.
5. Any structural change must update canonical docs in the same PR cycle.

## Compatibility and legacy notes

- `tests/pages/gateway-pg/**` exists only as transitional compatibility exports.
- `tests/data/gateway-pg/**` can re-export from `tests/features/gateway-pg/data/**` for backward compatibility.
- Historical sections below are preserved as planning appendix. Use this canonical header first when implementing.

## Historical appendix (legacy planning snapshot)

> **Base documental:** `matriz_cases.md` (Parte 1, TCs 1001–1121) + `matriz_cases2.md` (Parte 2, P2-TC001–P2-TC089)
> **Total TCs fuente:** ~211
> **Stack:** Playwright + TypeScript (web) · Appium + WebdriverIO (mobile)
> **Fecha:** 2026-04-08

---

## 1. Estructura de carpetas por feature

```
tests/
├── specs/
│   └── gateway-pg/
│       └── stripe/
│           ├── config/
│           │   └── gateway-config.spec.ts          ← TC1001–TC1008 (configuración pasarela)
│           ├── carrier/
│           │   ├── hold/
│           │   │   ├── colaborador-hold-no3ds.spec.ts   ← TC1033–TC1036, TC1041–TC1044
│           │   │   ├── colaborador-hold-3ds.spec.ts     ← TC1037–TC1040, TC1045–TC1048
│           │   │   ├── apppax-hold-no3ds.spec.ts        ← TC1049–TC1052, TC1057–TC1060
│           │   │   ├── apppax-hold-3ds.spec.ts          ← TC1053–TC1056, TC1061–TC1064
│           │   │   ├── empresa-hold-no3ds.spec.ts       ← TC1065–TC1068, TC1073–TC1076
│           │   │   └── empresa-hold-3ds.spec.ts         ← TC1069–TC1072, TC1077–TC1080
│           │   ├── cargo-a-bordo/
│           │   │   ├── apppax-cargo-happy.spec.ts       ← TC1081
│           │   │   ├── apppax-cargo-declines.spec.ts    ← TC1082–TC1086
│           │   │   ├── apppax-cargo-antifraud.spec.ts   ← TC1087–TC1091
│           │   │   ├── apppax-cargo-3ds.spec.ts         ← TC1092–TC1095
│           │   │   ├── contractor-cargo-happy.spec.ts   ← TC1096
│           │   │   ├── contractor-cargo-declines.spec.ts ← TC1097–TC1101
│           │   │   ├── contractor-cargo-antifraud.spec.ts ← TC1102–TC1106
│           │   │   ├── contractor-cargo-3ds.spec.ts     ← TC1107–TC1110
│           │   │   ├── empresa-cargo-happy.spec.ts      ← TC1111
│           │   │   ├── empresa-cargo-declines.spec.ts   ← TC1112–TC1116
│           │   │   └── empresa-cargo-antifraud.spec.ts  ← TC1117–TC1121
│           │   ├── recurrentes/
│           │   │   ├── colaborador-recurrente.spec.ts   ← P2-TC041–TC047
│           │   │   ├── apppax-recurrente.spec.ts        ← P2-TC048–TC053
│           │   │   └── empresa-recurrente.spec.ts       ← P2-TC054–TC059
│           │   └── operaciones/
│           │       ├── reactivacion.spec.ts             ← P2-TC060–TC065
│           │       ├── clonacion-cancelados.spec.ts     ← P2-TC066–TC071
│           │       ├── clonacion-finalizados.spec.ts    ← P2-TC072–TC077
│           │       ├── edicion-programados.spec.ts      ← P2-TC078–TC083
│           │       └── edicion-conflicto.spec.ts        ← P2-TC084–TC089
│           ├── contractor/
│           │   └── vinculacion-tarjeta.spec.ts          ← P2-TC001–TC006
│           ├── quote/
│           │   ├── quote-sin-datos.spec.ts              ← P2-TC007–TC010
│           │   ├── quote-colaborador.spec.ts            ← P2-TC011–TC018
│           │   ├── quote-apppax.spec.ts                 ← P2-TC019–TC026
│           │   └── quote-empresa.spec.ts                ← P2-TC027–TC034
│           └── e2e-mobile/
│               ├── apppax-personal-no3ds.e2e.spec.ts    ← TC1009–TC1012 (Playwright+Appium)
│               ├── apppax-personal-3ds.e2e.spec.ts      ← TC1013–TC1016 (Playwright+Appium)
│               ├── apppax-business-no3ds.e2e.spec.ts    ← TC1017–TC1020, TC1025–TC1028
│               └── apppax-business-3ds.e2e.spec.ts      ← TC1021–TC1024, TC1029–TC1032
├── pages/
│   └── gateway-pg/                    ← Page Objects existentes + nuevos
│       ├── NewTravelPage.ts
│       ├── TravelManagementPage.ts
│       ├── TravelDetailPage.ts
│       ├── ThreeDSModal.ts
│       ├── ThreeDSErrorPopup.ts
│       ├── GatewayConfigPage.ts       ← NUEVO (TC1001–TC1008)
│       ├── QuotePage.ts               ← NUEVO (P2-TC007–TC034)
│       └── RecurrentTravelPage.ts     ← NUEVO (P2-TC035–TC059)
└── data/
    └── gateway-pg/
        ├── hold-scenarios.ts          ← datos para flujos hold/capture
        ├── cargo-a-bordo-scenarios.ts ← datos para cargo a bordo + antifraude
        └── passengers.ts              ← tipos de pasajero por user type
```

---

## 2. Agrupación dentro del spec (patrón estándar)

Cada spec sigue este patrón de 2 niveles:

```typescript
// carrier/hold/apppax-hold-3ds.spec.ts

test.describe('Gateway PG · Carrier · App Pax — Hold con 3DS', () => {

  test.describe('Hold ON — autenticación exitosa', () => {
    test('[TS-STRIPE-TC1053] @smoke @critical hold+cobro app pax 3DS success', ...);
    test('[TS-STRIPE-TC1055] @regression hold+cobro app pax 3DS success variante', ...);
  });

  test.describe('Hold OFF — sin cobro al finalizar', () => {
    test('[TS-STRIPE-TC1054] @regression sin hold app pax 3DS success', ...);
  });

  test.describe('3DS fallido', () => {
    test('[TS-STRIPE-TC1056] @regression 3DS rechazado → estado NO_AUTORIZADO', ...);
    test('[TS-STRIPE-TC1062] @edge 3DS error → mensaje informativo', ...);
  });

});
```

**Regla:** el ID del TC fuente va en el título del `test()`, no en el `describe()`.

---

## 3. Tags para filtrar sin tocar archivos

| Tag | Criterio | TCs aplicables |
|---|---|---|
| `@smoke` | 1 happy path por feature, cobertura mínima | TC1002, TC1009, TC1033, TC1049, TC1065, TC1081, TC1096, TC1111, P2-TC001 |
| `@critical` | Flujos con impacto directo en pagos y hold | TC1009, TC1013, TC1033, TC1037, TC1053, TC1092, P2-TC047 |
| `@regression` | Variantes y flujos alternativos | TC1010–TC1012, TC1034–TC1036, TC1050–TC1052, etc. |
| `@3ds` | Cualquier flujo que involucre modal 3DS | TC1013–TC1016, TC1021–TC1024, TC1029–TC1032, TC1037–TC1040, TC1053–TC1056, etc. |
| `@hold` | Flujos con preautorización Stripe | Todos los TC con "Hold desde Alta de Viaje y Cobro desde App Driver" |
| `@cargo-a-bordo` | Flujos de pago directo sin hold | TC1081–TC1121 |
| `@antifraud` | Escenarios de tarjetas bloqueadas/antifraude | TC1087–TC1091, TC1102–TC1106, TC1117–TC1121 |
| `@mobile` | Requiere Appium (fase mobile) | TC1009–TC1032, todos E2E híbridos |
| `@web-only` | Solo Playwright, sin Appium | TC1001–TC1008, TC1033–TC1080, P2-TC001–P2-TC089 |
| `@contractor` | Portal contractor | P2-TC001–TC006, P2-TC035–TC040 |
| `@quote` | Flujo quote | P2-TC007–TC034 |
| `@recurrente` | Viajes recurrentes | P2-TC035–TC059 |

Uso en spec:
```typescript
test('[TS-STRIPE-TC1053] @smoke @critical @3ds @hold hold+cobro app pax 3DS', ...)
```

Ejecución por tag:
```bash
npx playwright test --grep @smoke           # solo smoke
npx playwright test --grep "@critical.*@3ds" # críticos con 3DS
npx playwright test --grep-invert @mobile   # todo menos mobile
```

---

## 4. Suite files para ejecución por capas

### playwright.gateway-pg.config.ts (ya existe)
Chromium · `workers=1` · timeout 60s

### Agregar projects:

```typescript
// playwright.gateway-pg.config.ts
projects: [
  {
    name: 'smoke',
    grep: /@smoke/,
    use: { browserName: 'chromium' },
  },
  {
    name: 'critical',
    grep: /@critical/,
    use: { browserName: 'chromium' },
  },
  {
    name: 'regression-web',
    grep: /@web-only/,
    grepInvert: /@smoke|@critical/,
    use: { browserName: 'chromium' },
  },
  {
    name: 'cargo-a-bordo',
    grep: /@cargo-a-bordo/,
    use: { browserName: 'chromium' },
  },
  {
    name: 'e2e-mobile',
    grep: /@mobile/,
    use: { browserName: 'chromium' },
    // fase web solamente; la fase Appium se dispara desde el orquestador
  },
]
```

### Scripts en package.json:

```json
"test:gateway:smoke":       "ENV=test npx playwright test -c playwright.gateway-pg.config.ts --project=smoke",
"test:gateway:critical":    "ENV=test npx playwright test -c playwright.gateway-pg.config.ts --project=critical",
"test:gateway:regression":  "ENV=test npx playwright test -c playwright.gateway-pg.config.ts --project=regression-web",
"test:gateway:cargo":       "ENV=test npx playwright test -c playwright.gateway-pg.config.ts --project=cargo-a-bordo",
"test:gateway:all":         "ENV=test npx playwright test -c playwright.gateway-pg.config.ts"
```

---

## 5. Separación de datos de prueba

### `tests/data/gateway-pg/hold-scenarios.ts`
```typescript
export const HOLD_SCENARIOS = {
  appPaxPersonal_holdOn_no3DS:    { tcId: 'TC1009', holdOn: true,  card: 'successDirect', userType: 'app-pax-personal' },
  appPaxPersonal_holdOff_no3DS:   { tcId: 'TC1010', holdOn: false, card: 'successDirect', userType: 'app-pax-personal' },
  appPaxPersonal_holdOn_3DS:      { tcId: 'TC1013', holdOn: true,  card: 'success3DS',    userType: 'app-pax-personal' },
  carrierColaborador_holdOn_3DS:  { tcId: 'TC1037', holdOn: true,  card: 'success3DS',    userType: 'colaborador' },
  carrierAppPax_holdOn_3DS:       { tcId: 'TC1053', holdOn: true,  card: 'success3DS',    userType: 'app-pax' },
  // ...
} as const;
```

### `tests/data/gateway-pg/cargo-a-bordo-scenarios.ts`
```typescript
export const CARGO_SCENARIOS = {
  happy:             { tcId: 'TC1081', card: 'successDirect',    expectedResult: 'approved' },
  declinedGeneric:   { tcId: 'TC1082', card: 'declined',         expectedResult: 'declined' },
  insufficientFunds: { tcId: 'TC1083', card: 'insufficientFunds',expectedResult: 'declined' },
  cvcFail:           { tcId: 'TC1087', card: 'cvcFail',          expectedResult: 'antifraud' },
  maxRisk:           { tcId: 'TC1088', card: 'maxRisk',          expectedResult: 'antifraud' },
  happy3DS:          { tcId: 'TC1092', card: 'success3DS',       expectedResult: 'approved-after-3ds' },
  // ...
} as const;
```

### `tests/data/gateway-pg/passengers.ts`
```typescript
export const PASSENGERS = {
  appPax:     { name: 'Stripe, Test Driver',     type: 'app-pax'             },
  colaborador:{ name: 'Colaborador Test User',   type: 'colaborador'         },
  empresa:    { name: 'Empresa Individuo Test',  type: 'empresa-individuo'   },
} as const;
```

---

## 6. Matriz de prioridades por archivo

| Archivo spec | TCs fuente | Prioridad | Tag principal | Runner | Estado |
|---|---|---|---|---|---|
| `config/gateway-config.spec.ts` | TC1001–TC1008 | P1 | `@smoke @critical @web-only` | Playwright | ⬜ pendiente |
| `carrier/hold/apppax-hold-3ds.spec.ts` | TC1053–TC1056, TC1061–TC1064 | P1 | `@smoke @critical @3ds @hold` | Playwright | 🟡 parcial (test-3.spec.ts) |
| `carrier/hold/colaborador-hold-3ds.spec.ts` | TC1037–TC1040, TC1045–TC1048 | P1 | `@critical @3ds @hold` | Playwright | ⬜ pendiente |
| `carrier/hold/empresa-hold-3ds.spec.ts` | TC1069–TC1072, TC1077–TC1080 | P1 | `@critical @3ds @hold` | Playwright | ⬜ pendiente |
| `carrier/hold/apppax-hold-no3ds.spec.ts` | TC1049–TC1052, TC1057–TC1060 | P2 | `@regression @hold @web-only` | Playwright | ⬜ pendiente |
| `carrier/hold/colaborador-hold-no3ds.spec.ts` | TC1033–TC1036, TC1041–TC1044 | P2 | `@regression @hold @web-only` | Playwright | ⬜ pendiente |
| `carrier/hold/empresa-hold-no3ds.spec.ts` | TC1065–TC1068, TC1073–TC1076 | P2 | `@regression @hold @web-only` | Playwright | ⬜ pendiente |
| `carrier/cargo-a-bordo/apppax-cargo-happy.spec.ts` | TC1081 | P1 | `@smoke @cargo-a-bordo` | Playwright | ⬜ pendiente |
| `carrier/cargo-a-bordo/apppax-cargo-3ds.spec.ts` | TC1092–TC1095 | P1 | `@critical @3ds @cargo-a-bordo` | Playwright | ⬜ pendiente |
| `carrier/cargo-a-bordo/apppax-cargo-declines.spec.ts` | TC1082–TC1086 | P2 | `@regression @cargo-a-bordo` | Playwright | ⬜ pendiente |
| `carrier/cargo-a-bordo/apppax-cargo-antifraud.spec.ts` | TC1087–TC1091 | P2 | `@antifraud @cargo-a-bordo` | Playwright | ⬜ pendiente |
| `carrier/recurrentes/colaborador-recurrente.spec.ts` | P2-TC041–TC047 | P2 | `@recurrente @critical` (TC047 crítico) | Playwright | ⬜ pendiente |
| `carrier/operaciones/reactivacion.spec.ts` | P2-TC060–TC065 | P2 | `@regression @recurrente` | Playwright | ⬜ pendiente |
| `carrier/operaciones/edicion-conflicto.spec.ts` | P2-TC084–TC089 | P2 | `@regression @3ds` | Playwright | ⬜ pendiente |
| `contractor/vinculacion-tarjeta.spec.ts` | P2-TC001–TC006 | P2 | `@smoke @contractor` | Playwright | ⬜ pendiente |
| `quote/quote-colaborador.spec.ts` | P2-TC011–TC018 | P3 | `@quote` | Playwright | ⬜ pendiente |
| `e2e-mobile/apppax-personal-no3ds.e2e.spec.ts` | TC1009–TC1012 | P1 | `@mobile @hold` | Playwright+Appium | 🟡 draft active |
| `e2e-mobile/apppax-personal-3ds.e2e.spec.ts` | TC1013–TC1016 | P1 | `@mobile @3ds @hold` | Playwright+Appium | 🟡 draft active |
| `e2e-mobile/apppax-business-no3ds.e2e.spec.ts` | TC1017–TC1020, TC1025–TC1028 | P1 | `@mobile @hold` | Playwright+Appium | 🟡 draft active |
| `e2e-mobile/apppax-business-3ds.e2e.spec.ts` | TC1021–TC1024, TC1029–TC1032 | P1 | `@mobile @3ds @hold` | Playwright+Appium | 🟡 draft active |

**Leyenda:** ✅ verde · 🟡 parcial/draft · ⬜ pendiente · 🔴 bloqueado

---

## 7. Orden de implementación recomendado

### Sprint actual — desbloquear el núcleo
1. `carrier/hold/apppax-hold-3ds.spec.ts` — ya hay base en `test-3.spec.ts`, formalizar
2. `config/gateway-config.spec.ts` — TC1001–TC1008, solo web, riesgo bajo
3. `carrier/cargo-a-bordo/apppax-cargo-happy.spec.ts` — TC1081, smoke

### Siguiente sprint
4. Variantes hold sin 3DS (P2, bajo riesgo técnico, reutilizan mismos Page Objects)
5. Declines y antifraude (datos de tarjeta distintos, misma estructura)
6. Recurrentes + operaciones (requieren Page Objects nuevos)

### Bloqueados hasta Appium listo
- Los pasos de driver / post-trip que todavía dependen de evidencia dedicada en passenger.
## Passenger lane status

- The passenger Appium lane is implemented as a draft active path with `tests/mobile/appium/harness/PassengerTripHappyPathHarness.ts`, `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-no3ds.e2e.spec.ts`, `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-3ds.e2e.spec.ts`, `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-no3ds.e2e.spec.ts`, and `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-3ds.e2e.spec.ts`.
- The passenger home shell now exposes a profile toggle, so personal and business collaborator mode share the same screen objects with a different bootstrap state.
- The historical `TC1009â€“TC1032` rows remain in the architecture table for traceability, but should now be read as passenger-draft rather than fully blocked.
