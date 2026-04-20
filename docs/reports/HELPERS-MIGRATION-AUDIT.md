# HELPERS-MIGRATION-AUDIT

**Fecha:** 2026-04-19
**Rama:** feat/tier2-migrate-helpers-usage
**Scope:** Migración de usos existentes a helpers en `tests/helpers/` (MR !29)
**Ejecutado por:** Agente TIER 2

---

## 1. Análisis de densidad

### Tarea A — `console.log` en specs (`tests/features/**/*.spec.ts`)

| Archivo | Ocurrencias | Acción |
|---|---|---|
| `tests/features/smoke/specs/gateway-pg.smoke.spec.ts` | 23 | **MIGRAR** (mayor densidad) |
| `tests/features/auth/specs/login-success.e2e.spec.ts` | 4 | **MIGRAR** |
| `tests/features/smoke/specs/portals.smoke.spec.ts` | 3 | **MIGRAR** |
| `tests/features/auth/specs/login-failure.e2e.spec.ts` | 3 | **MIGRAR** |
| `tests/features/gateway-pg/specs/stripe/web/carrier/hold/empresa-hold-no3ds.spec.ts` | 2 | **MIGRAR** (5º más denso) |
| `tests/features/gateway-pg/specs/.../apppax-hold-3ds.spec.ts` | 2 | Diferido (fuera top 5) |
| `tests/features/gateway-pg/specs/.../colaborador-hold-3ds.spec.ts` | 1 | Diferido |
| `tests/features/gateway-pg/specs/.../colaborador-hold-no3ds.spec.ts` | 1 | Diferido |
| `tests/features/gateway-pg/specs/.../empresa-hold-3ds.spec.ts` | 1 | Diferido |
| `tests/features/gateway-pg/specs/.../empresa-cargo-happy.spec.ts` | 1 | Diferido |

**Total migrado en este MR:** 5 archivos, ~35 ocurrencias
**Total diferido:** 5+ archivos con 1-2 ocurrencias c/u — se migran en tier siguiente

### Tarea B — `waitForTimeout` (todos los `.ts` en `tests/`)

| Archivo | Ocurrencias | Acción |
|---|---|---|
| `tests/pages/carrier/NewTravelPageBase.ts` | 25 | Fuera de scope (pages/) |
| `tests/pages/contractor/NewTravelPage.ts` | 9 | Fuera de scope (pages/) |
| `tests/pages/carrier/ThreeDSModal.ts` | 5 | Fuera de scope (pages/) |
| `tests/helpers/browser.ts` | 4 | Fuera de scope (helpers/) |
| `tests/pages/carrier/OperationalPreferencesPage.ts` | 2 | Fuera de scope (pages/) |
| `tests/pages/carrier/TravelManagementPage.ts` | 1 | Fuera de scope (pages/) |
| `tests/pages/carrier/ErrorPopup.ts` | 1 | Fuera de scope (pages/) |
| `tests/helpers/retry.ts` | 1 | Fuera de scope (helpers/) |
| `tests/helpers/assertions.ts` | 1 | Fuera de scope (helpers/) |
| `tests/e2e/create-trip-for-driver.spec.ts` | 1 | **TODO anotado** (solo 1 ocurrencia — bajo umbral de 5) |

**Criterio:** solo anotar archivos con 5+ ocurrencias en `tests/features/` o `tests/e2e/`.
**Resultado:** ningún archivo en `tests/features/` tiene `waitForTimeout`. El único en `tests/e2e/` tiene 1 ocurrencia (bajo umbral).
**Todos los `waitForTimeout` con ≥5 ocurrencias están en `tests/pages/` — fuera del scope de este MR.**
**Decisión:** se documenta el único caso e2e con TODO inline pero no se crea un commit dedicado (bajo umbral).

### Tarea C — `expect.poll` drop-in a `expectEventuallyVisible`

| Archivo | Ocurrencias | Equivalencia | Acción |
|---|---|---|---|
| `tests/helpers/assertions.ts` | 2 | N/A — es la implementación | Fuera de scope |
| `tests/pages/carrier/TravelManagementPage.ts` | 1 | Custom (intervalos/cascade) | Fuera de scope (pages/) |
| `tests/pages/carrier/NewTravelPageBase.ts` | 1 | Custom (text match custom fn) | Fuera de scope (pages/) |

**Resultado:** no hay `expect.poll` en `tests/features/`. Tarea C no aplica en este MR.

---

## 2. Lo que se migra en este MR

| Tarea | Archivos | Cambio |
|---|---|---|
| A — debugLog | 5 specs (smoke + auth + gateway-pg) | `console.log` → `debugLog(ns, ...)` + import |
| B — TODO waitForTimeout | 0 archivos (bajo umbral en scope) | — |
| C — expectEventuallyVisible | 0 archivos (no aplica en scope) | — |

---

## 3. Namespaces debugLog usados

| Namespace | Scope |
|---|---|
| `'smoke'` | `tests/features/smoke/specs/` |
| `'auth'` | `tests/features/auth/specs/` |
| `'gateway-pg'` | `tests/features/gateway-pg/specs/` |

---

## 4. Diferidos para tier siguiente

- `waitForTimeout` en `tests/pages/carrier/NewTravelPageBase.ts` (25 ocurrencias) — requiere análisis de semántica por método antes de reemplazar.
- `waitForTimeout` en `tests/pages/contractor/NewTravelPage.ts` (9 ocurrencias) — ídem.
- `console.log` en 5+ specs gateway-pg con 1-2 ocurrencias c/u — migrar en batch posterior.
- `expect.poll` en `tests/pages/carrier/` — custom logic, no drop-in, requiere refactor manual.

---

## 5. Criterio de decisión

- **Migrar:** `console.log` en spec `.spec.ts` dentro de `tests/features/`, es mensaje de debug/observabilidad, no está en bloque `if (process.env.DEBUG)`.
- **Diferir:** fuera de `tests/features/` o `tests/e2e/`; lógica custom no equivalente; bajo umbral de densidad.
- **No tocar:** `tests/pages/`, `tests/helpers/`, `tests/mobile/`, `tests/fixtures/`.
