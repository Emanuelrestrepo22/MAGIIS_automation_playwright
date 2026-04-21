# Excel Schema - QA Matrix Input

Reference for mapping Excel columns into the repo normalized contract.

## Expected columns

| Column | Accepted aliases | Type | Required |
|---|---|---|---|
| `ID` | `Case ID`, `TC-ID`, `Test ID` | string | Yes |
| `Module` | `Area`, `Feature`, `Módulo`, `Área` | string | Yes |
| `Flow` | `Scenario`, `Case`, `Flujo`, `Caso` | string | Yes |
| `Description` | `Title`, `Name`, `Descripción`, `Título`, `Nombre` | string | Yes |
| `Priority` | `Criticality`, `Prioridad`, `Criticidad` | string | Yes |
| `Type` | `Category`, `Tipo`, `Categoría` | string | No |
| `Preconditions` | `Setup`, `Precondiciones` | string | No |
| `Steps` | `Actions`, `Pasos`, `Acciones` | string | No |
| `Expected Result` | `Expected`, `Resultado esperado` | string | No |
| `Tags` | `Labels`, `Etiquetas` | string | No |
| `Automatable` | `Can Automate`, `Auto`, `Automatizable` | boolean | No |
| `Status` | `Execution Status`, `Estado`, `Estado ejecución` | string | No |
| `Portal` | `App`, `Domain` | string | No |

## Priority mapping

| Excel value | Internal priority |
|---|---|
| `Critical` | `P0` |
| `High` | `P1` |
| `Medium` | `P2` |
| `Low` | `P3` |
| empty | `P2` |

## Type to tags mapping

| Excel value | Playwright tag |
|---|---|
| `Smoke` | `@smoke` |
| `Regression` | `@regression` |
| `Stripe`, `Payment`, `Gateway` | `@stripe` |
| `3DS`, `3D Secure` | `@3ds` |
| `Hold On` | `@hold-on` |
| `Hold Off` | `@hold-off` |

## Normalization rules

1. If `ID` is missing, generate `TC-AUTO-001`, `TC-AUTO-002`, and so on.
2. If `Priority` is not mapped, assign `P2`.
3. If `Automatable` is empty, infer `true` for `P0` and `P1` by default.
4. Drop rows where `Description` is empty.
5. If `Steps` is free text, parse line by line using numbering or bullets.
6. Read the first active sheet unless the user points to a different sheet.
7. Detect duplicates by similarity across `Module + Flow + Description`, not only by ID.
