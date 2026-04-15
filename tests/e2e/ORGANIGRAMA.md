# Organigrama de implementación — Proyecto E2E

> Hoja de ruta para conectar los test cases existentes al proyecto e2e
> y garantizar que sean reutilizables entre flows, gateways y actores.

---

## Principio de reutilización

```
TEST CASE UNITARIO (features/gateway-pg/specs/)
        ↓  valida la fase web de forma aislada
WEB-PHASE (e2e/gateway/flow*/web-phase.ts)
        ↓  orquesta la fase web + escribe JourneyContext
FLOW SPEC  (e2e/gateway/flow*/flow*.e2e.spec.ts)
        ↓  agrega la fase mobile como child process
FLOW E2E COMPLETO  (web + mobile + validación final)
```

Un test case unitario ya existente **no se elimina ni duplica**.
El flow e2e lo reutiliza llamando a los mismos helpers, POMs y fixtures.
Lo único que agrega el flow es: orquestación + JourneyContext + fase mobile.

---

## Mapa de actores y portales

```
PORTALES WEB (Playwright)         APPS MÓVILES (Appium/WebdriverIO)
─────────────────────────         ────────────────────────────────
carrier   → dispatcher            driver    → acepta/ejecuta viaje
contractor → colaborador          passenger → crea viaje / paga
                                  (ambas Android)
```

---

## Nivel 1 — Flows por actor (visión general)

```
E2E PROJECT
│
├── Flow 1: Carrier Web  ──────────────► Driver App          [IMPLEMENTADO]
├── Flow 2: Passenger App ─────────────► Driver App          [DRAFT]
├── Flow 3: Contractor Web ────────────► Driver App          [PLANIFICADO]
└── Flow 4: Passenger App + Carrier Web ► Driver App         [FUTURO]
         (viaje creado por carrier, pagado por passenger)
```

---

## Nivel 2 — Desglose por gateway y modo de pago

Cada flow se parametriza con `GatewayFlowConfig`. El mismo spec corre para
todas las configs; solo cambia el objeto que se pasa a `runWebPhase`.

```
FLOW 1 — Carrier Web + Driver App
│
├── stripe-hold-no3ds   → tarjeta 4242, hold ON, sin 3DS     [TC: E2E-FLOW1-TC001]
├── stripe-hold-3ds     → tarjeta 3155, hold ON, con 3DS     [TC: E2E-FLOW1-TC002 — planificado]
├── stripe-no-hold      → tarjeta 4242, hold OFF             [TC: E2E-FLOW1-TC003 — planificado]
└── mercado-pago-hold   → tarjeta MP test, hold ON           [TC: E2E-FLOW1-TC004 — futuro]

FLOW 2 — Passenger App + Driver App
│
├── personal-no3ds      → tarjeta personal sin 3DS           [TC: E2E-FLOW2-TC001 — draft]
├── personal-3ds        → tarjeta personal con 3DS           [TC: E2E-FLOW2-TC002 — draft]
├── business-no3ds      → tarjeta negocio sin 3DS            [TC: E2E-FLOW2-TC003 — draft]
└── business-3ds        → tarjeta negocio con 3DS            [TC: E2E-FLOW2-TC004 — draft]

FLOW 3 — Contractor Web + Driver App
│
├── colaborador-no3ds   → tarjeta colaborador sin 3DS        [TC: E2E-FLOW3-TC001 — planificado]
└── colaborador-3ds     → tarjeta colaborador con 3DS        [TC: E2E-FLOW3-TC002 — planificado]
```

---

## Nivel 3 — Test cases existentes reutilizables por flow

Los test cases de `features/gateway-pg/specs/` cubren la **fase web aislada**.
El proyecto e2e los conecta a la fase mobile sin duplicar lógica.

### Flow 1 — fuente en specs unitarios carrier

| TC Unitario existente | Módulo | Qué reutiliza el Flow 1 |
|---|---|---|
| `TS-STRIPE-TC1033` (colaborador hold no3ds) | hold/colaborador-hold-no3ds | web-phase: fillMinimum, hold check, trip submit |
| `TS-STRIPE-TC1037` (colaborador hold 3ds) | hold/colaborador-hold-3ds | web-phase: fillMinimum + threeDS modal |
| `TS-STRIPE-TC1049` (apppax hold no3ds) | hold/apppax-hold-no3ds | web-phase: apppax passenger flow |
| `TS-STRIPE-TC1065` (empresa hold no3ds) | hold/empresa-hold-no3ds | web-phase: empresa individuo flow |

**Regla:** `web-phase.ts` no reimplementa estos casos — llama a los mismos
helpers (`loginAsDispatcher`, `NewTravelPage.fillMinimum`, `ThreeDSModal`) que
ya usan los specs unitarios. El TC e2e agrega solo el handoff mobile.

### Flow 2 — fuente en e2e-mobile existentes

| Spec existente | Módulo | Estado en Flow 2 |
|---|---|---|
| `apppax-personal-no3ds.e2e.spec.ts` | e2e-mobile | base para E2E-FLOW2-TC001 |
| `apppax-personal-3ds.e2e.spec.ts` | e2e-mobile | base para E2E-FLOW2-TC002 |
| `apppax-business-no3ds.e2e.spec.ts` | e2e-mobile | base para E2E-FLOW2-TC003 |
| `apppax-business-3ds.e2e.spec.ts` | e2e-mobile | base para E2E-FLOW2-TC004 |

Estos specs ya tienen la fase mobile. El Flow 2 los migra bajo la arquitectura
`JourneyBridge` para tener trazabilidad de estado y poder combinarlos con
una fase web si se necesita en el futuro.

---

## Nivel 4 — Componentes reutilizables (capa de infraestructura)

```
tests/e2e/gateway/shared/
├── e2eFlowConfig.ts        ← config de pasarela — REUSABLE por todos los flows
└── JourneyBridge.ts        ← estado JSON entre fases — REUSABLE por todos los flows

tests/features/gateway-pg/
├── fixtures/gateway.fixtures.ts    ← loginAsDispatcher, STRIPE_TEST_CARDS, TEST_DATA
├── context/gatewayJourneyContext.ts ← read/write del JSON de estado
└── helpers/                        ← (agregar helpers de negocio reutilizables aquí)

tests/pages/carrier/
├── NewTravelPage.ts         ← fillMinimum, submit, selectSavedCard
├── OperationalPreferencesPage.ts ← ensureHoldEnabled/Disabled
├── ThreeDSModal.ts          ← completeSuccess, completeFailure
└── TravelDetailPage.ts      ← expectStatus

tests/mobile/appium/harness/
└── DriverTripHappyPathHarness.ts ← runHappyPath — REUSABLE para todos los flows con driver
```

**Regla:** antes de escribir lógica nueva en un web-phase o mobile-phase,
verificar si ya existe como helper/POM/harness en estas carpetas.

---

## Roadmap de implementación

### Sprint actual — Flow 1 base

| # | Tarea | Estado |
|---|---|---|
| 1 | E2E-FLOW1-TC001: stripe-hold-no3ds web+mobile | **HECHO** |
| 2 | Documentación y organigrama | **HECHO** |
| 3 | E2E-FLOW1-TC002: stripe-hold-3ds (agregar 3DS modal a web-phase) | Planificado |
| 4 | E2E-FLOW1-TC003: stripe-no-hold (holdEnabled: false) | Planificado |

### Sprint siguiente — Flow 2 migración

| # | Tarea | Estado |
|---|---|---|
| 5 | Migrar apppax-personal-no3ds a arquitectura JourneyBridge | Planificado |
| 6 | Migrar apppax-personal-3ds a arquitectura JourneyBridge | Planificado |
| 7 | Migrar apppax-business-* a arquitectura JourneyBridge | Planificado |

### Sprint futuro — Flow 3 contractor

| # | Tarea | Estado |
|---|---|---|
| 8 | E2E-FLOW3-TC001: colaborador-no3ds web+mobile | Futuro |
| 9 | E2E-FLOW3-TC002: colaborador-3ds web+mobile | Futuro |

### Sprint futuro — nueva pasarela

| # | Tarea | Estado |
|---|---|---|
| 10 | Agregar MercadoPago config en GATEWAY_CONFIGS | Futuro |
| 11 | E2E-FLOW1-TC004: mercado-pago-hold web+mobile | Futuro |

---

## Convenciones para nuevos flows

### Nombrado de TC ID

```
E2E-FLOW<N>-TC<NNN>
│    │       └── número de caso dentro del flow (001, 002...)
│    └── número de flow (1, 2, 3...)
└── prefijo fijo del proyecto e2e
```

IDs del proyecto e2e son **independientes** de la matriz Stripe (`TS-STRIPE-TCxxxx`).
La trazabilidad se mantiene en la columna "TC Unitario existente" de este documento.

### Carpeta de un nuevo flow

```bash
tests/e2e/gateway/
└── flow<N>-<actorA>-<actorB>/
    ├── flow<N>.e2e.spec.ts    ← orquestador
    ├── web-phase.ts            ← si hay fase web (Playwright)
    └── mobile-phase-<actor>.ts ← si hay fase mobile (ts-node)
```

### Pasos obligatorios al agregar un flow

1. Agregar config en `GATEWAY_CONFIGS` si hay nueva pasarela
2. Implementar `web-phase.ts` y/o `mobile-phase.ts`
3. Crear `flow<N>.e2e.spec.ts` como orquestador
4. Agregar scripts en `package.json`: `test:e2e:flow<N>` y variantes
5. Actualizar tabla "Flujos implementados" en `tests/e2e/README.md`
6. Actualizar tabla "Roadmap" en este archivo

---

## Árbol final objetivo (estado deseado a largo plazo)

```
tests/e2e/
├── README.md
├── ORGANIGRAMA.md
└── gateway/
    ├── shared/
    │   ├── e2eFlowConfig.ts
    │   └── JourneyBridge.ts
    ├── flow1-carrier-driver/      [HECHO]
    │   ├── flow1.e2e.spec.ts
    │   ├── web-phase.ts
    │   └── mobile-phase.ts
    ├── flow2-passenger-driver/    [DRAFT]
    │   ├── flow2.e2e.spec.ts
    │   ├── mobile-phase-passenger.ts
    │   └── mobile-phase-driver.ts
    └── flow3-contractor-driver/   [PLANIFICADO]
        ├── flow3.e2e.spec.ts
        ├── web-phase.ts
        └── mobile-phase.ts
```
