# Reportes técnicos — magiis-playwright

Índice de reportes de diagnóstico, migraciones y mitigaciones generados durante la consolidación TIER 1-3.

## Flakiness y mitigaciones

| Reporte | TC afectado | Tipo | Estado | Archivo |
|---|---|---|---|---|
| TC1081 Flakiness Diagnosis | TS-STRIPE-TC1081 (SMOKE-GW-TC04) | ENV/DATA | Mitigado — pendiente acción humana | [TC1081-FLAKINESS-DIAGNOSIS.md](TC1081-FLAKINESS-DIAGNOSIS.md) |
| TC1033 Mitigation | TS-STRIPE-TC1033 (SMOKE-GW-TC05) | ENV auth | `retry(1)` temporal — root cause pendiente | [TC1033-MITIGATION.md](TC1033-MITIGATION.md) |

## Auditorías de consolidación

| Reporte | Scope | Estado | Archivo |
|---|---|---|---|
| TIER 1.5 Categoría 2 Audit | 32 wrappers `tests/specs/gateway-pg/stripe/` | Completado — todos eliminados | [TIER1-5-CAT2-AUDIT.md](TIER1-5-CAT2-AUDIT.md) |
| Helpers Migration Audit | Densidad `waitForTimeout` / `console.log` / `expect.poll` | Informativo — base de MR !32/!33/!34 | [HELPERS-MIGRATION-AUDIT.md](HELPERS-MIGRATION-AUDIT.md) |
| waitForTimeout Migration | 39 ocurrencias en `tests/pages/` | 12 migrados / 27 conservados con NOTE | [WAITFORTIMEOUT-MIGRATION.md](WAITFORTIMEOUT-MIGRATION.md) |

## Cuándo leer qué

- **Smoke falla:** revisar TC1081-FLAKINESS-DIAGNOSIS y TC1033-MITIGATION primero.
- **Adoptar un helper nuevo:** leer HELPERS-MIGRATION-AUDIT para contexto de densidad y cobertura.
- **Tocar `waitForTimeout` en un POM:** leer WAITFORTIMEOUT-MIGRATION — cada caso conservado tiene razón técnica documentada.
- **Preguntar por qué se eliminaron los wrappers legacy:** TIER1-5-CAT2-AUDIT tiene la tabla completa con origen y destino canónico.

## Ubicación de reportes futuros

Por convención, los reportes TIER x.y viven en `docs/reports/`. Si un reporte pertenece a un módulo específico (ej: autenticación), puede vivir en `docs/<modulo>/reports/` y referenciarse aquí.

Última actualización: 2026-04-20
