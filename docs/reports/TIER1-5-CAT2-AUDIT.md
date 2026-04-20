# TIER 1.5 — Categoría 2: Auditoría de wrappers `tests/specs/gateway-pg/stripe/`

**Fecha:** 2026-04-19
**Rama:** `scripts/tier1-5-categoria-2-audit`
**Base:** main @ 89cbda7
**Agente:** TIER 1.5 — Categoría 2

---

## Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Total wrappers auditados | 32 |
| Safe-to-delete | 32 |
| Con lógica custom (escalar) | 0 |
| Target faltante en features/ | 0 |
| Eliminados | 32 |

Todos los 32 archivos son puros re-imports de 1-2 líneas (`import '...features/...'`), sin test(), beforeAll, beforeEach ni fixtures. Todos sus targets existen en `tests/features/gateway-pg/specs/stripe/`.

---

## Tabla wrapper → target → decisión

| # | Wrapper | Lines | test() | before/fixture | Target en features/ | Decisión |
|---|---|---|---|---|---|---|
| 01 | `3ds-failure.spec.ts` | 2 | 0 | 0 | `stripe/3ds-failure.spec.ts` | SAFE DELETE |
| 02 | `3ds-retry-card-change.spec.ts` | 2 | 0 | 0 | `stripe/3ds-retry-card-change.spec.ts` | SAFE DELETE |
| 03 | `hold-capture.spec.ts` | 2 | 0 | 0 | `stripe/hold-capture.spec.ts` | SAFE DELETE |
| 04 | `recorded-3ds-happy-path.spec.ts` | 2 | 0 | 0 | `stripe/recorded-3ds-happy-path.spec.ts` | SAFE DELETE |
| 05 | `recorded-3ds-preauth-failure.spec.ts` | 2 | 0 | 0 | `stripe/recorded-3ds-preauth-failure.spec.ts` | SAFE DELETE |
| 06 | `carrier/cargo-a-bordo/apppax-cargo-3ds.spec.ts` | 2 | 0 | 0 | `stripe/carrier/cargo-a-bordo/apppax-cargo-3ds.spec.ts` | SAFE DELETE |
| 07 | `carrier/cargo-a-bordo/apppax-cargo-antifraud.spec.ts` | 2 | 0 | 0 | `stripe/carrier/cargo-a-bordo/apppax-cargo-antifraud.spec.ts` | SAFE DELETE |
| 08 | `carrier/cargo-a-bordo/apppax-cargo-declines.spec.ts` | 2 | 0 | 0 | `stripe/carrier/cargo-a-bordo/apppax-cargo-declines.spec.ts` | SAFE DELETE |
| 09 | `carrier/cargo-a-bordo/apppax-cargo-happy.spec.ts` | 2 | 0 | 0 | `stripe/carrier/cargo-a-bordo/apppax-cargo-happy.spec.ts` | SAFE DELETE |
| 10 | `carrier/cargo-a-bordo/contractor-cargo-3ds.spec.ts` | 2 | 0 | 0 | `stripe/carrier/cargo-a-bordo/contractor-cargo-3ds.spec.ts` | SAFE DELETE |
| 11 | `carrier/hold/apppax-hold-3ds.spec.ts` | 2 | 0 | 0 | `stripe/carrier/hold/apppax-hold-3ds.spec.ts` | SAFE DELETE |
| 12 | `carrier/hold/apppax-hold-no3ds.spec.ts` | 2 | 0 | 0 | `stripe/carrier/hold/apppax-hold-no3ds.spec.ts` | SAFE DELETE |
| 13 | `carrier/hold/colaborador-hold-3ds.spec.ts` | 2 | 0 | 0 | `stripe/carrier/hold/colaborador-hold-3ds.spec.ts` | SAFE DELETE |
| 14 | `carrier/hold/colaborador-hold-no3ds.spec.ts` | 2 | 0 | 0 | `stripe/carrier/hold/colaborador-hold-no3ds.spec.ts` | SAFE DELETE |
| 15 | `carrier/hold/empresa-hold-3ds.spec.ts` | 2 | 0 | 0 | `stripe/carrier/hold/empresa-hold-3ds.spec.ts` | SAFE DELETE |
| 16 | `carrier/hold/empresa-hold-no3ds.spec.ts` | 2 | 0 | 0 | `stripe/carrier/hold/empresa-hold-no3ds.spec.ts` | SAFE DELETE |
| 17 | `carrier/operaciones/clonacion-cancelados.spec.ts` | 2 | 0 | 0 | `stripe/carrier/operaciones/clonacion-cancelados.spec.ts` | SAFE DELETE |
| 18 | `carrier/operaciones/clonacion-finalizados.spec.ts` | 2 | 0 | 0 | `stripe/carrier/operaciones/clonacion-finalizados.spec.ts` | SAFE DELETE |
| 19 | `carrier/operaciones/edicion-conflicto.spec.ts` | 2 | 0 | 0 | `stripe/carrier/operaciones/edicion-conflicto.spec.ts` | SAFE DELETE |
| 20 | `carrier/operaciones/edicion-programados.spec.ts` | 2 | 0 | 0 | `stripe/carrier/operaciones/edicion-programados.spec.ts` | SAFE DELETE |
| 21 | `carrier/operaciones/reactivacion.spec.ts` | 2 | 0 | 0 | `stripe/carrier/operaciones/reactivacion.spec.ts` | SAFE DELETE |
| 22 | `carrier/recurrentes/apppax-recurrente.spec.ts` | 2 | 0 | 0 | `stripe/carrier/recurrentes/apppax-recurrente.spec.ts` | SAFE DELETE |
| 23 | `carrier/recurrentes/colaborador-recurrente.spec.ts` | 2 | 0 | 0 | `stripe/carrier/recurrentes/colaborador-recurrente.spec.ts` | SAFE DELETE |
| 24 | `carrier/recurrentes/empresa-recurrente.spec.ts` | 2 | 0 | 0 | `stripe/carrier/recurrentes/empresa-recurrente.spec.ts` | SAFE DELETE |
| 25 | `config/gateway-config.spec.ts` | 2 | 0 | 0 | `stripe/config/gateway-config.spec.ts` | SAFE DELETE |
| 26 | `contractor/vinculacion-tarjeta.spec.ts` | 2 | 0 | 0 | `stripe/contractor/vinculacion-tarjeta.spec.ts` | SAFE DELETE |
| 27 | `e2e-mobile/apppax-business-3ds.e2e.spec.ts` | 1 | 0 | 0 | `stripe/e2e-mobile/apppax-business-3ds.e2e.spec.ts` | SAFE DELETE |
| 28 | `e2e-mobile/apppax-business-no3ds.e2e.spec.ts` | 1 | 0 | 0 | `stripe/e2e-mobile/apppax-business-no3ds.e2e.spec.ts` | SAFE DELETE |
| 29 | `e2e-mobile/apppax-personal-3ds.e2e.spec.ts` | 2 | 0 | 0 | `stripe/e2e-mobile/apppax-personal-3ds.e2e.spec.ts` | SAFE DELETE |
| 30 | `e2e-mobile/apppax-personal-no3ds.e2e.spec.ts` | 1 | 0 | 0 | `stripe/e2e-mobile/apppax-personal-no3ds.e2e.spec.ts` | SAFE DELETE |
| 31 | `e2e-mobile/carrier-driver-happy-path-template.spec.ts` | 2 | 0 | 0 | `stripe/e2e-mobile/carrier-driver-happy-path-template.spec.ts` | SAFE DELETE |
| 32 | `quote/quote-colaborador.spec.ts` | 2 | 0 | 0 | `stripe/quote/quote-colaborador.spec.ts` | SAFE DELETE |

---

## Scripts package.json actualizados

| Script | Antes | Después |
|---|---|---|
| `test:test:gateway-pg:stripe` | `tests/specs/gateway-pg/stripe` | `tests/features/gateway-pg/specs/stripe` |
| `test:test:gateway-pg:3ds` | `tests/specs/gateway-pg/stripe/recorded-3ds-happy-path.spec.ts` | `tests/features/gateway-pg/specs/stripe/recorded-3ds-happy-path.spec.ts` |
| `test:test:e2e:flow2` | 4 paths `tests/specs/gateway-pg/stripe/e2e-mobile/...` | 4 paths `tests/features/gateway-pg/specs/stripe/e2e-mobile/...` |
| `test:test:e2e:passenger` | 4 paths `tests/specs/gateway-pg/stripe/e2e-mobile/...` | 4 paths `tests/features/gateway-pg/specs/stripe/e2e-mobile/...` |

---

## Docs actualizadas

| Archivo | Cambio |
|---|---|
| `docs/gateway-pg/stripe/ARCHITECTURE.md` | Reemplazadas 2 menciones de `tests/specs/gateway-pg/stripe/**` por path canónico `tests/features/gateway-pg/specs/stripe/**` |
| `docs/gateway-pg/test-ids.md` | Actualizadas 9 filas columna "Archivo" de `tests/specs/` a `tests/features/` |
| `docs/codex-prompts/README.md` | Actualizada 1 mención del path legacy |

---

## Wrappers escalados / pendiente humano

Ninguno. Todos los 32 fueron eliminados con seguridad.
