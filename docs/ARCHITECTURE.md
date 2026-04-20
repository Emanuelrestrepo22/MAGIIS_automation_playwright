# Architecture — magiis-playwright

> Documento canónico de arquitectura del proyecto. Define principios heredados, escalamientos aplicados, y convenciones de evolución.

## 1. Principios base (heredados de proyectos Selenium/POM clásicos)

El proyecto sigue los 8 principios universales de testing automation:

| Principio | Implementación en magiis-playwright |
|---|---|
| **Page Object Model** | `tests/pages/` jerárquico (shared + carrier + contractor) |
| **Separación tests/pages/utilidades** | `tests/features/**/specs/` + `tests/pages/` + `tests/helpers/` |
| **Base class para tests** | `tests/TestBase.ts` con fixture de roles + storageState |
| **Fixtures globales** | `TestBase.ts` + fixtures por feature en `features/*/fixtures/` |
| **Credenciales fuera del repo** | `.env.test` gitignored; workflow CI inyecta desde secrets |
| **Naming trazable TC↔código** | `describe('[TS-STRIPE-TCxxxx] ...')` con ID de matriz |
| **CI/CD automatizado** | GitHub Actions + GitLab CI con auto-cancel interruptible |
| **Documentación versionada** | `docs/gateway-pg/stripe/matriz_cases*.md`, `CHANGELOG.md`, este archivo |

Estos principios están alineados con la referencia `Emanuelrestrepo22/selenium-py-POM`.

## 2. Escalamientos aplicados (por tamaño del proyecto)

La referencia cubre 1 web app con 1 portal. magiis-playwright cubre 4 portales + 2 apps móviles + flows híbridos. Los escalamientos:

### Eje 1 — Portales múltiples

```
pages/
├── shared/           común web (carrier + contractor)
├── carrier/          fuente canónica POMs (9 archivos)
└── contractor/       subclases carrier donde difiere
```

### Eje 2 — Stack híbrido web + mobile

```
tests/
├── pages/            web (Playwright)
├── mobile/appium/    mobile (WebdriverIO)
│   ├── driver/
│   ├── passenger/
│   └── harness/
└── e2e/              flows cross-stack
    ├── flow1-carrier-driver/
    ├── flow2-passenger-driver/
    └── flow3-contractor-driver/
```

### Eje 3 — Partición por feature

```
tests/features/
├── gateway-pg/
│   ├── specs/stripe/{carrier,contractor,e2e-mobile}/
│   ├── fixtures/
│   ├── helpers/
│   ├── data/              scenarios específicos del feature
│   └── context/           journey state persistence
└── smoke/
```

### Eje 4 — Trazabilidad formal TC → matriz → spec → xlsx → CI

```
docs/gateway-pg/stripe/
├── matriz_cases.md                  fuente (Stripe parte 1, ~120 TCs)
├── matriz_cases2.md                 fuente (parte 2, Portal Contractor, Quote, Recurrentes, ~90 TCs)
├── normalized-test-cases.json       derivado ejecutable
├── STRIPE_Test_Suite_Matriz_Sincronizado.xlsx   reporte operacional
├── TRACEABILITY.md                  mapa TC → sección → spec → xlsx row
├── AUDIT-REPORT.md                  auditoría coherencia
├── CHANGELOG.md                     historial correcciones
└── smoke-flakiness-report/          reportes de estabilidad
```

Los scripts de sincronización viven en `scripts/ai/matriz-coherencia/`.

### Eje 5 — Agentes IA en el pipeline

```
.claude/
├── agents/             5 agentes especializados con modelos asignados
├── docs/model-policy.md (tiers Crítico/Medium/Bajo)
└── skills/             magiis-playwright-docs-to-drafts, magiis-appium-hybrid-e2e
```

### Eje 6 — Datos de prueba con taxonomía SoT + scenarios

```
tests/fixtures/                      ← NUEVO — atómicos transversales
├── stripe/
│   ├── cards.ts                     source of truth
│   ├── card-policy.ts               CARDS.* namespace por intención
│   └── README.md
├── users/
│   └── passengers.ts
└── README.md

tests/features/<x>/data/             ← scenarios específicos del feature
├── cargo-a-bordo-scenarios.ts
├── hold-scenarios.ts
└── passenger-flow2-scenarios.ts
```

**Regla:** `fixtures/` es atómico y transversal; `features/<x>/data/` son scenarios combinatorios del feature.

## 3. Mapa de carpetas — responsabilidades

| Carpeta | Responsabilidad | Ejemplos |
|---|---|---|
| `tests/TestBase.ts` | Fixture base con auth por rol + storageState | — |
| `tests/config/` | Runtime configs, URLs por env | `runtime.ts`, `gatewayPortalRuntime.ts` |
| `tests/fixtures/` | **Datos atómicos transversales** (cards, users) | `stripe/cards.ts`, `users/passengers.ts` |
| `tests/pages/shared/` | POMs comunes carrier+contractor | `LoginPage.ts`, `SuperPage.ts` |
| `tests/pages/carrier/` | POMs canónicos carrier | `DashboardPage.ts`, `NewTravelPageBase.ts`, `ThreeDSModal.ts` |
| `tests/pages/contractor/` | Subclases carrier donde hay divergencia | `NewTravelPage.ts` (override fillMinimum) |
| `tests/selectors/` | Selectores web separados (no-POM) | — |
| `tests/shared/contracts/` | Contratos de datos compartidos | — |
| `tests/shared/utils/` | Utilidades compartidas (data generator faker) | `dataGenerator.ts` |
| `tests/utils/` | Utilidades técnicas puras (API clients, etc.) | `apiClient.ts`, `geminiClient.ts`, `scripts/` |
| `tests/helpers/` | **Helpers globales Playwright** (reservada — por poblar) | (pendiente) |
| `tests/features/<x>/specs/` | Specs Playwright del feature | `gateway-pg/specs/stripe/carrier/hold/*.spec.ts` |
| `tests/features/<x>/fixtures/` | Fixtures específicas del feature | `gateway.fixtures.ts` |
| `tests/features/<x>/helpers/` | Helpers específicos del feature | `stripe.helpers.ts`, `travel-cleanup.ts` |
| `tests/features/<x>/data/` | Scenarios específicos del feature | `cargo-a-bordo-scenarios.ts` |
| `tests/features/<x>/context/` | Persistencia de estado del journey | — |
| `tests/features/smoke/specs/` | Suite smoke cross-feature | `gateway-pg.smoke.spec.ts`, `portals.smoke.spec.ts` |
| `tests/mobile/appium/` | Stack Appium Android (WebdriverIO) | `base/`, `config/`, `driver/`, `passenger/`, `harness/` |
| `tests/e2e/` | Flows híbridos cross-stack | `flow1-carrier-driver/`, `flow2-passenger-driver/` |
| `tests/coverage/` | Cobertura por módulo | `app-driver/README.md` |
| `scripts/` | CLI scripts operacionales | `gitlab.ps1`, `cleanup/`, `ai/matriz-coherencia/` |
| `docs/` | Documentación técnica + de QA | `gateway-pg/stripe/`, `qa-scope/`, `codex-prompts/` |
| `.claude/` | Agentes IA + skills + docs de política | `agents/`, `docs/model-policy.md`, `skills/` |
| `evidence/` | Outputs de CI (gitignored) | Screenshots, videos, traces, junit.xml |

## 4. Convenciones de evolución

### Dónde agregar data nueva

- Atómico transversal (card, user, payload base) → `tests/fixtures/<dominio>/`
- Scenario específico (combinación card × user × flow) → `tests/features/<feature>/data/`

### Dónde agregar helper nuevo

- Wrapper sobre Playwright API reutilizable cross-feature (`waitForStableURL`, assertions custom) → `tests/helpers/` (crear si hace falta el archivo)
- Específico del feature (ej: cleanup de travels, stripe 3DS helpers) → `tests/features/<feature>/helpers/`
- Utilidad técnica pura (API client, parser) → `tests/utils/` o `tests/shared/utils/`

### Dónde agregar Page Object

- Común a carrier + contractor web → `tests/pages/shared/`
- Canónico carrier → `tests/pages/carrier/`
- Divergencia contractor → `tests/pages/contractor/` subclasando carrier
- Mobile (Android app) → `tests/mobile/appium/<app>/`

### Naming convention

- Specs: `<scope>-<flow>.spec.ts`, describe `[TS-STRIPE-TCxxxx] descripción corta`
- POMs: PascalCase con sufijo `Page` (`NewTravelPage.ts`)
- Helpers: kebab-case con sufijo semántico (`travel-cleanup.ts`, `stripe.helpers.ts`)
- Fixtures: `<domain>.fixtures.ts`

### TODO — Consolidación pendiente (TIER 1.5)

`tests/specs/gateway-pg/stripe/` (32 archivos wrapper) queda pendiente de eliminación. Razón: `package.json` tiene 4 scripts (`test:test:gateway-pg:stripe`, `test:test:gateway-pg:3ds`, `test:test:e2e:flow2`, `test:test:e2e:passenger`) que referencian directamente esa ruta, y `docs/gateway-pg/` la usan como entrypoint oficial.

**Antes de eliminar, auditar wrapper-por-wrapper** para confirmar que solo re-exportan (sin fixtures locales, sin `beforeAll` custom, sin orquestación). Luego:

1. Migrar 4 scripts de `package.json` a `tests/features/gateway-pg/specs/stripe/`
2. Actualizar `docs/gateway-pg/stripe/ARCHITECTURE.md` y `docs/gateway-pg/test-ids.md`
3. Eliminar `tests/specs/gateway-pg/` completa

Regla ESLint `no-restricted-imports` (MR !26) ya bloquea nuevos imports desde estos paths.

## 5. Política de modelos de IA (tier organizacional)

Ver `.claude/docs/model-policy.md`:

- **Crítico** (orchestration, doc-analysis, flow-prioritization): Claude Opus 4.7 (1M ctx)
- **Medium** (code generation): Codex GPT-5.1-codex
- **Bajo** (tareas repetitivas): Gemini 3.1 Flash

## 6. Política de cards Stripe (Fase 1-3 migración)

Ver `tests/fixtures/stripe/README.md`:

- **Default 3DS happy path**: `CARDS.HAPPY_3DS` (3184 — always_authenticate)
- **Pago sin 3DS**: `CARDS.SUCCESS_NO_3DS` (4242)
- **Decline**: `CARDS.DECLINE_AUTHORIZE` (0002) / `CARDS.DECLINE_CAPTURE` (9995)
- **Deprecated**: `CARDS.LEGACY_3DS_SUCCESS` (3155) — comportamiento variable → no usar en tests nuevos

### Estado de migración

| Área | Estado |
|---|---|
| Smoke suite (TC02, TC06, TC12) | ✅ Migrada a `CARDS.*` |
| Flows E2E (flow1, flow3 `resolveCardLast4ForConfig`) | ✅ Migrada |
| Scenarios files (`passenger-flow2`, `passenger-business`, `driver-happy-path`) | ⏸️ Pendiente — usan tipo `StripeTestCard` object, requiere refactor de types |
| Scripts mobile Appium | ⏸️ Pendiente — fuera de alcance del pipeline de smoke |
| Recorded specs | ⏸️ Pendiente — scripts one-shot, baja prioridad |

## 7. Patrones BDD-inspired (sin Gherkin completo)

El proyecto adopta **patrones de BDD** (Given/When/Then, scenarios declarativos, tags) pero **NO el formalismo Gherkin/Cucumber**. Motivación:

- Beneficios de BDD aplicables: legibilidad + trazabilidad + ejecución selectiva
- Costos de Gherkin evitados: refactor masivo, DSL adicional, herramientas menos maduras, velocidad de desarrollo

### 7.1 Tags en titles de test

Cada `test()` declara tags que permiten ejecución selectiva:

```typescript
test('@smoke @carrier @hold @3ds @happy [TS-STRIPE-TC1053] AppPax Hold ON 3DS → SEARCHING_DRIVER', async () => {
  ...
});
```

Ejecución selectiva:
```bash
pnpm playwright test --grep @3ds              # solo tests 3DS
pnpm playwright test --grep "@smoke.*@3ds"    # smoke y 3DS
pnpm playwright test --grep @unhappy          # solo flujos UNHAPPY
```

Tags canónicos:
- **Scope**: `@smoke`, `@regression`, `@e2e`, `@recovery`
- **Portal**: `@carrier`, `@contractor`, `@pax-app`, `@driver-app`
- **Feature**: `@hold`, `@no-hold`, `@3ds`, `@cargo-a-bordo`, `@auth`
- **Resultado**: `@happy`, `@unhappy`

### 7.2 Given/When/Then en test.step

Los `test.step` usan prefijos semánticos:

```typescript
test('[TC1057] fail 3DS → NO_AUTORIZADO', async ({ page }) => {
  await test.step('Given: dispatcher logueado con hold activado', async () => { ... });
  await test.step('And: formulario nuevo viaje abierto', async () => { ... });
  await test.step('When: envía viaje con card 9235 y rechaza 3DS', async () => { ... });
  await test.step('Then: viaje queda en "En conflicto" con NO_AUTORIZADO', async () => { ... });
});
```

Beneficios:
- Stack traces en failures expresan la intención (`When: submit formulario`)
- Onboarding: dev nuevo entiende el flujo sin leer la implementación
- No hace falta comentar cada step

### 7.3 Scenarios declarativos por intención

En lugar de copia-pega de 20 líneas por TC, usar **data-driven scenarios** (equivalente a Gherkin Scenario Outline):

```typescript
const CARRIER_HOLD_SCENARIOS = [
  { tcId: 'TC1049', passenger: 'AppPax',      cardId: 'SUCCESS_NO_3DS' },
  { tcId: 'TC1053', passenger: 'AppPax',      cardId: 'HAPPY_3DS' },
  { tcId: 'TC1033', passenger: 'Colaborador', cardId: 'SUCCESS_NO_3DS' },
] as const;

for (const s of CARRIER_HOLD_SCENARIOS) {
  test(`@smoke [${s.tcId}] ${s.passenger} ${s.cardId} → SEARCHING_DRIVER`, async ({ page }) => {
    // 1 implementación, N TCs
  });
}
```

### 7.4 Resolver helpers (step definitions equivalent)

En Gherkin, un step recibe un parámetro y un step definition decide qué hacer. Acá: scenarios declaran `cardId`, un helper **resuelve** al objeto técnico:

```typescript
// fixtures/stripe/card-resolver.ts
export function resolveCard(cardId: CardId): StripeTestCard { ... }

// uso en spec
const card = resolveCard(scenario.cardId);
await fillCardForm(card.number, card.exp, card.cvc);
```

### 7.5 Expect con mensaje descriptivo

Aserciones críticas llevan mensaje narrativo:

```typescript
await expect(
  page,
  'Tras crear viaje en contractor, URL debe redirigir a /dashboard'
).toHaveURL(/contractor\/dashboard/, { timeout: 20_000 });
```

Beneficio: failures muestran qué se esperaba, no solo el diff técnico.

### 7.6 Qué NO adoptamos de Gherkin

- Archivos `.feature` separados — nuestro enfoque es TypeScript directo
- Step definitions formales — usamos funciones TypeScript normales (`resolveCard`, helpers)
- Cucumber runner — seguimos con Playwright test runner nativo
- Escenarios en lenguaje natural con regex — preferimos tipado estático

## 8. CI/CD

- **GitHub Actions**: `.github/workflows/playwright.yml`, `playwright-prod-smoke.yml`
- **GitLab CI**: `.gitlab-ci.yml` con `workflow.auto_cancel.on_new_commit: interruptible` + `interruptible: true` en jobs
- **Reporters**: `list`, `html` (local), `junit` (para GitLab Tests tab), custom

## 8. Convención de commits

Ver `CLAUDE.md` → regla obligatoria de TC ID en commits:

```
<tipo>(<scope>): [TC-ID] descripción corta
```

## 9. Convención de ramas

Ver `docs/` → skill `magiis-branch-convention`:

- Portal-based: `carrier/`, `contractor/`, `mobile/pax-`, `mobile/driver-`
- Cross: `e2e/`, `smoke/`, `scripts/`
- IA multi-módulo: `feature/ai-` (excepción controlada)

## 10. Diferencias con la referencia `selenium-py-POM`

| Aspecto | selenium-py-POM | magiis-playwright | Razón |
|---|---|---|---|
| Stack | Python + Selenium + Pytest | TypeScript + Playwright + Appium | Stack actual del equipo |
| Portales | 1 (saucedemo) | 4 + 2 apps | Producto más complejo |
| Test data | `.env` plano | `fixtures/` + `features/*/data/` | Matriz combinatoria grande |
| Traceability | `test_plan/` documentos | Matriz .md sincronizada con xlsx + JSON normalizado + scripts de sync | 200+ TCs requieren automation |
| Reporting | Allure | Playwright HTML + JUnit | Allure pendiente (ver roadmap) |
| IA en pipeline | No | Agentes especializados en `.claude/` | Escala requiere automation |

---

**Última actualización**: 2026-04-19 (Fase 1-3 migración cards policy)
**Referencia externa**: https://github.com/Emanuelrestrepo22/selenium-py-POM
