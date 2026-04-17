# Duplicados detectados — Matriz Stripe

> **Fase:** 1 (qa-doc-analyst)
> **Fecha:** 2026-04-16
> **Fuentes:** `docs/gateway-pg/stripe/matriz_cases.md` + `docs/gateway-pg/stripe/matriz_cases2.md`
> **Handoff destino:** `critical-flow-prioritizer` (Fase 2)

## Resumen

- **52 pares duplicados** detectados por exact-title-within-subsection o por referencia RV explícita.
- **8 pares RV** (`TC-RV001..RV008`) con canónico ya declarado en la columna "TC Canónico" de la matriz — no requieren diferenciación, son alias que deberán colapsarse o reetiquetarse con el sufijo `-CARD-*` en Fase 2.
- **44 pares de título idéntico dentro de la misma subsección** — candidatos a diferenciación por flujo de tarjeta (`-CARD-NEW` vs `-CARD-EXISTING`), o bien a deprecación si representan copias sin valor incremental.
- **Referencia de estilo:** `TC1063` (selección tarjeta guardada) y `TC1064` (vinculación tarjeta nueva) ya están diferenciados correctamente — usar su narrativa como plantilla en Fase 2.

## Criterio de diferenciación propuesto (para Fase 2)

Para cada par `canonical` ↔ `derived` donde la descripción es idéntica y el contexto lo permite, aplicar sufijos sobre el **ID canónico** (no sobre el derivado, que será deprecado):

- `<canonical>-CARD-NEW` → flujo **"Vincular tarjeta nueva al wallet antes del alta de viaje"**.
- `<canonical>-CARD-EXISTING` → flujo **"Usar tarjeta vinculada existente seleccionada desde el wallet"**.

El ID derivado queda marcado como `deprecated-alias-of` el canónico hasta que Fase 3 reescriba el xlsx.

## Pares detectados

### A. Pares exact-title-within-subsection (candidatos a diferenciación por flujo)

| Par # | ID canónico | ID derivado/sospechoso | Similitud | Diferencia de flujo propuesta | Sección matriz |
|---|---|---|---|---|---|
| 1 | TS-STRIPE-TC1017 | TS-STRIPE-TC1019 | exact-title | CARD-NEW vs CARD-EXISTING | 3.1 App Pax business — sin 3DS — Hold |
| 2 | TS-STRIPE-TC1017 | TS-STRIPE-TC1025 | exact-title | CARD-NEW vs CARD-EXISTING | 3.1 App Pax business — sin 3DS — Hold |
| 3 | TS-STRIPE-TC1017 | TS-STRIPE-TC1027 | exact-title | Revisar si representa variante distinta; si no, deprecar | 3.1 App Pax business — sin 3DS — Hold |
| 4 | TS-STRIPE-TC1018 | TS-STRIPE-TC1020 | exact-title | CARD-NEW vs CARD-EXISTING | 3.1 App Pax business — sin 3DS — No-Hold |
| 5 | TS-STRIPE-TC1018 | TS-STRIPE-TC1026 | exact-title | CARD-NEW vs CARD-EXISTING | 3.1 App Pax business — sin 3DS — No-Hold |
| 6 | TS-STRIPE-TC1018 | TS-STRIPE-TC1028 | exact-title | Revisar si representa variante distinta; si no, deprecar | 3.1 App Pax business — sin 3DS — No-Hold |
| 7 | TS-STRIPE-TC1021 | TS-STRIPE-TC1023 | exact-title | CARD-NEW vs CARD-EXISTING | 3.2 App Pax business — 3DS — Hold |
| 8 | TS-STRIPE-TC1021 | TS-STRIPE-TC1029 | exact-title | CARD-NEW vs CARD-EXISTING | 3.2 App Pax business — 3DS — Hold |
| 9 | TS-STRIPE-TC1021 | TS-STRIPE-TC1031 | exact-title | Revisar si representa variante distinta; si no, deprecar | 3.2 App Pax business — 3DS — Hold |
| 10 | TS-STRIPE-TC1022 | TS-STRIPE-TC1024 | exact-title | CARD-NEW vs CARD-EXISTING | 3.2 App Pax business — 3DS — No-Hold |
| 11 | TS-STRIPE-TC1022 | TS-STRIPE-TC1030 | exact-title | CARD-NEW vs CARD-EXISTING | 3.2 App Pax business — 3DS — No-Hold |
| 12 | TS-STRIPE-TC1022 | TS-STRIPE-TC1032 | exact-title | Revisar si representa variante distinta; si no, deprecar | 3.2 App Pax business — 3DS — No-Hold |
| 13 | TS-STRIPE-TC1034 | TS-STRIPE-TC1036 | exact-title | CARD-NEW vs CARD-EXISTING | 4.1 Carrier colaborador — sin 3DS — No-Hold |
| 14 | TS-STRIPE-TC1034 | TS-STRIPE-TC1042 | exact-title | CARD-NEW vs CARD-EXISTING | 4.1 Carrier colaborador — sin 3DS — No-Hold |
| 15 | TS-STRIPE-TC1034 | TS-STRIPE-TC1044 | exact-title | Revisar si representa variante distinta; si no, deprecar | 4.1 Carrier colaborador — sin 3DS — No-Hold |
| 16 | TS-STRIPE-TC1035 | TS-STRIPE-TC1041 | exact-title | CARD-NEW vs CARD-EXISTING | 4.1 Carrier colaborador — sin 3DS — Hold |
| 17 | TS-STRIPE-TC1035 | TS-STRIPE-TC1043 | exact-title | CARD-NEW vs CARD-EXISTING | 4.1 Carrier colaborador — sin 3DS — Hold |
| 18 | TS-STRIPE-TC1037 | TS-STRIPE-TC1045 | exact-title | CARD-NEW vs CARD-EXISTING | 4.2 Carrier colaborador — 3DS — Hold |
| 19 | TS-STRIPE-TC1037 | TS-STRIPE-TC1047 | exact-title | CARD-NEW vs CARD-EXISTING | 4.2 Carrier colaborador — 3DS — Hold |
| 20 | TS-STRIPE-TC1038 | TS-STRIPE-TC1040 | exact-title | CARD-NEW vs CARD-EXISTING | 4.2 Carrier colaborador — 3DS — No-Hold |
| 21 | TS-STRIPE-TC1038 | TS-STRIPE-TC1046 | exact-title | CARD-NEW vs CARD-EXISTING | 4.2 Carrier colaborador — 3DS — No-Hold |
| 22 | TS-STRIPE-TC1038 | TS-STRIPE-TC1048 | exact-title | Revisar si representa variante distinta; si no, deprecar | 4.2 Carrier colaborador — 3DS — No-Hold |
| 23 | TS-STRIPE-TC1065 | TS-STRIPE-TC1067 | exact-title | CARD-NEW vs CARD-EXISTING | 6.1 Carrier empresa — sin 3DS — Hold |
| 24 | TS-STRIPE-TC1065 | TS-STRIPE-TC1073 | exact-title | CARD-NEW vs CARD-EXISTING | 6.1 Carrier empresa — sin 3DS — Hold |
| 25 | TS-STRIPE-TC1065 | TS-STRIPE-TC1075 | exact-title | Revisar si representa variante distinta; si no, deprecar | 6.1 Carrier empresa — sin 3DS — Hold |
| 26 | TS-STRIPE-TC1066 | TS-STRIPE-TC1068 | exact-title | CARD-NEW vs CARD-EXISTING | 6.1 Carrier empresa — sin 3DS — No-Hold |
| 27 | TS-STRIPE-TC1066 | TS-STRIPE-TC1074 | exact-title | CARD-NEW vs CARD-EXISTING | 6.1 Carrier empresa — sin 3DS — No-Hold |
| 28 | TS-STRIPE-TC1066 | TS-STRIPE-TC1076 | exact-title | Revisar si representa variante distinta; si no, deprecar | 6.1 Carrier empresa — sin 3DS — No-Hold |
| 29 | TS-STRIPE-TC1069 | TS-STRIPE-TC1071 | exact-title | CARD-NEW vs CARD-EXISTING | 6.2 Carrier empresa — 3DS — Hold |
| 30 | TS-STRIPE-TC1069 | TS-STRIPE-TC1077 | exact-title | CARD-NEW vs CARD-EXISTING | 6.2 Carrier empresa — 3DS — Hold |
| 31 | TS-STRIPE-TC1069 | TS-STRIPE-TC1079 | exact-title | Revisar si representa variante distinta; si no, deprecar | 6.2 Carrier empresa — 3DS — Hold |
| 32 | TS-STRIPE-TC1070 | TS-STRIPE-TC1072 | exact-title | CARD-NEW vs CARD-EXISTING | 6.2 Carrier empresa — 3DS — No-Hold |
| 33 | TS-STRIPE-TC1070 | TS-STRIPE-TC1078 | exact-title | CARD-NEW vs CARD-EXISTING | 6.2 Carrier empresa — 3DS — No-Hold |
| 34 | TS-STRIPE-TC1070 | TS-STRIPE-TC1080 | exact-title | Revisar si representa variante distinta; si no, deprecar | 6.2 Carrier empresa — 3DS — No-Hold |
| 35 | TS-STRIPE-P2-TC060 | TS-STRIPE-P2-TC062 | exact-title | Reactivación — distinguir tarjeta origen vs tarjeta reasignada | 7. Reactivación empresa — Hold |
| 36 | TS-STRIPE-P2-TC061 | TS-STRIPE-P2-TC063 | exact-title | Reactivación — distinguir tarjeta origen vs tarjeta reasignada | 7. Reactivación empresa — No-Hold |
| 37 | TS-STRIPE-P2-TC066 | TS-STRIPE-P2-TC068 | exact-title | Clonación cancelado — CARD-NEW vs CARD-EXISTING | 8. Clonación cancelado empresa — Hold |
| 38 | TS-STRIPE-P2-TC067 | TS-STRIPE-P2-TC069 | exact-title | Clonación cancelado — CARD-NEW vs CARD-EXISTING | 8. Clonación cancelado empresa — No-Hold |
| 39 | TS-STRIPE-P2-TC072 | TS-STRIPE-P2-TC074 | exact-title | Clonación finalizado — CARD-NEW vs CARD-EXISTING | 9. Clonación finalizado empresa — Hold |
| 40 | TS-STRIPE-P2-TC073 | TS-STRIPE-P2-TC075 | exact-title | Clonación finalizado — CARD-NEW vs CARD-EXISTING | 9. Clonación finalizado empresa — No-Hold |
| 41 | TS-STRIPE-P2-TC078 | TS-STRIPE-P2-TC080 | exact-title | Edición — CARD-NEW vs CARD-EXISTING | 10. Edición empresa — Hold |
| 42 | TS-STRIPE-P2-TC079 | TS-STRIPE-P2-TC081 | exact-title | Edición — CARD-NEW vs CARD-EXISTING | 10. Edición empresa — No-Hold |
| 43 | TS-STRIPE-P2-TC084 | TS-STRIPE-P2-TC086 | exact-title | Edición conflicto — CARD-NEW vs CARD-EXISTING | 11. Edición conflicto — Hold |
| 44 | TS-STRIPE-P2-TC085 | TS-STRIPE-P2-TC087 | exact-title | Edición conflicto — CARD-NEW vs CARD-EXISTING | 11. Edición conflicto — No-Hold |

### B. Pares RV explícitos (alias a colapsar)

| Par # | ID canónico | ID derivado (RV) | Similitud | Diferencia de flujo propuesta | Sección matriz |
|---|---|---|---|---|---|
| 45 | TS-STRIPE-TC1017 | TS-STRIPE-TC-RV001 | explicit-rv-alias | Alias declarado en matriz; colapsar como referencia en Fase 2 | 2.3 Variantes exploratorias |
| 46 | TS-STRIPE-TC1018 | TS-STRIPE-TC-RV002 | explicit-rv-alias | Alias; colapsar | 2.3 Variantes exploratorias |
| 47 | TS-STRIPE-TC1011 | TS-STRIPE-TC-RV003 | explicit-rv-alias | Alias; colapsar | 2.3 Variantes exploratorias |
| 48 | TS-STRIPE-TC1012 | TS-STRIPE-TC-RV004 | explicit-rv-alias | Alias; colapsar | 2.3 Variantes exploratorias |
| 49 | TS-STRIPE-TC1013 | TS-STRIPE-TC-RV005 | explicit-rv-alias | Alias; colapsar | 2.3 Variantes exploratorias |
| 50 | TS-STRIPE-TC1014 | TS-STRIPE-TC-RV006 | explicit-rv-alias | Alias; colapsar | 2.3 Variantes exploratorias |
| 51 | TS-STRIPE-TC1015 | TS-STRIPE-TC-RV007 | explicit-rv-alias | Alias; colapsar | 2.3 Variantes exploratorias |
| 52 | TS-STRIPE-TC1016 | TS-STRIPE-TC-RV008 | explicit-rv-alias | Alias; colapsar | 2.3 Variantes exploratorias |

## Observación importante — tripletes

Las subsecciones 3.1, 3.2, 4.1, 4.2, 6.1 y 6.2 de `matriz_cases.md` contienen **tripletes** de título idéntico (3 TCs con la misma descripción). Esto sugiere:

1. 2 flujos reales diferentes (CARD-NEW vs CARD-EXISTING).
2. Un tercer TC probablemente copiado por error humano en la redacción original.

**Ejemplo:** `TC1017 / TC1019 / TC1025 / TC1027` — cuatro TCs idénticos en 3.1 sin 3DS Hold. El par primario debe diferenciarse por flujo de tarjeta; el resto (TC1025, TC1027) debe revisarse en Fase 2 contra la xlsx original para decidir si hay variante no documentada (ambiente, tipo de pasajero huésped, wallet-clear-state, etc.) o si son pura redundancia.

## Gaps / bloqueos detectados para el pipeline

- `tests/coverage/app-driver/README.md` todavía tiene los títulos antiguos ("E2E ..."). Se desincronizó con la matriz tras esta edición. Regenerar tras Fase 4.
- `docs/gateway-pg/stripe/ARCHITECTURE.md` línea 151 menciona "E2E híbridos" — es uso arquitectónico correcto (concepto, no descriptor de TC). **Preservado.**
- 8 IDs `TC-RV*` siguen marcados como P1 por heurística; en Fase 2 deben re-priorizarse a P2/P3 según decisión de negocio (si se mantienen como cobertura exploratoria o se deprecan).
- `matriz_cases2.md` sección 12 ("Re-validación 3DS Post Fallo") declara "sección pendiente de desarrollo" — hueco documental explícito, no requiere acción inmediata pero sí flag para Fase 2.
- Las secciones 10 y 11 de `matriz_cases2.md` (edición / edición en conflicto) tienen filas con descripción "Clonación de viaje finalizado..." (TC082, TC083, TC088, TC089) que **no corresponden al tema de la sección**. Posible bug de redacción; reportar a QA.

## Handoff — qué espera Fase 2

1. Consumir `normalized-test-cases.json` (219 casos) como input canónico.
2. Para cada par de la tabla A: asignar flujo de tarjeta y generar los IDs derivados `-CARD-NEW` / `-CARD-EXISTING` o marcar deprecación.
3. Para los alias RV (tabla B): decidir colapsar o preservar como referencia cruzada en el traceability-map.
4. Repriorizar P1/P2/P3 una vez resueltos los duplicados.
5. Reportar a Fase 3 (script xlsx) la lista final de filas a insertar/actualizar.
