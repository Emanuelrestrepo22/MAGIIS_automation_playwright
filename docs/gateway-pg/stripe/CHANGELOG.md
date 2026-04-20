# Stripe Matrix Changelog

Registro histórico de cambios aplicados a la documentación de la matriz Stripe / Gateway PG.

Sigue convenciones tipo [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
IDs canónicos: ver `matriz_cases.md` y `matriz_cases2.md` (fuente de verdad).

---

## [2026-04-19] feature/cards-policy-full-migration

### Added

- **`tests/fixtures/`** — nueva ubicación canónica para datos de prueba atómicos transversales, alineada con patrón industry-standard (Stripe SDK, Shopify, Adyen, selenium-py-POM referencia).
  - `fixtures/stripe/cards.ts` — SoT re-export del registry
  - `fixtures/stripe/card-policy.ts` — namespace `CARDS.*` por intención
  - `fixtures/users/passengers.ts` — re-export de passengers
  - `fixtures/README.md` + `fixtures/stripe/README.md` — taxonomía y políticas
- **`docs/ARCHITECTURE.md`** — documento canónico de arquitectura + comparativa con `selenium-py-POM` + convenciones de evolución.

### Changed

- **Smoke spec migrado a `CARDS.*`:**
  - TC02 (AppPax · 3DS): `STRIPE_TEST_CARDS.success3DS` (3155 flaky) → `CARDS.HAPPY_3DS` (3184 always_authenticate).
  - TC06 (Colaborador · 3DS): idem.
  - TC12 (Contractor · 3DS + hold): `STRIPE_TEST_CARDS.alwaysAuthenticate` → `CARDS.HAPPY_3DS_HOLD_CAPTURE` (alias explícito).
- **Flows E2E migrados:**
  - `flow1-carrier-driver/web-phase.ts` `resolveCardLast4ForConfig`: 3155 → `CARDS.HAPPY_3DS` (3184).
  - `flow3-contractor-driver/web-phase.ts` `resolveCardLast4ForConfig`: 3155 → `CARDS.HAPPY_3DS_HOLD_CAPTURE` (3184).

### Rationale

Card 3155 (`visa_3ds_success`) tiene comportamiento variable en Stripe TEST — Stripe decide si desafía según risk score, generando flakiness intermitente. Card 3184 (`always_authenticate`) siempre pide challenge, elimina esa variabilidad.

La policy `CARDS.*` agrupa cards por **intención** del test en vez de alias técnico, alineado con patrón industry-standard y facilitando:
- Auto-documentación del intent
- Centralización (un solo lugar para cambiar defaults)
- Prevención de uso casual de cards deprecadas

### Deferred (scope futuro)

Los siguientes usos de `STRIPE_TEST_CARDS.visa_3ds_success` (3155) **NO** se migraron en este MR porque usan tipo `StripeTestCard` object (no `string`) — requieren refactor de types:

- `tests/features/gateway-pg/data/passenger-flow2-scenarios.ts`
- `tests/features/gateway-pg/data/passenger-business-scenarios.ts`
- `tests/features/gateway-pg/data/driver-happy-path-scenarios.ts`
- `tests/mobile/appium/scripts/*.ts` (scripts one-shot)

Plan: sprint separada — refactor de tipo para aceptar tanto `CARDS.*` (string) como `StripeTestCard` (object).

---

## [2026-04-19] contractor/tc14-v3-decline-timeout

### Changed

- **TS-STRIPE-P2-TC090 SMOKE-GW-TC14:** segundo ajuste del flujo tras diagnóstico del pipeline `2463749983` (commit `cc2996a1`).
  - Card 0002 pasa el SetupIntent, pero el portal contractor NO habilita el botón "Seleccionar Vehículo" post-validación (Stripe rechaza el attach del PaymentMethod al viaje).
  - El STEP-04 original asumía que el flujo avanzaba hasta submit — ahora refactorizado para **validar que el botón vehículo NO se habilita** con timeout corto (8s). Eso ES el flujo UNHAPPY correcto: card declinada bloquea el avance del formulario.
  - Removido el STEP-06 de validación de error texto — el portal no muestra mensaje visible; la validación es el botón bloqueado + URL no cambia.

### Rationale

El mensaje de error de Stripe no siempre aparece en UI del contractor con cards declinadas. El indicador confiable del flujo UNHAPPY es que el botón de avance queda inhabilitado → viaje no se crea → URL no cambia. Esto es más robusto que buscar un texto de error.

---

## [2026-04-19] contractor/tc14-authorize-decline

### Changed

- **TS-STRIPE-P2-TC090:** cambio de card `4000 0000 0000 9995` (insufficient_funds) → `4000 0000 0000 0002` (generic_decline) y descripción reescrita.
  - **Razón:** Card 9995 pasa el SetupIntent y el hold authorize; solo rechaza en capture (cuando el driver finaliza el viaje). El smoke no alcanza a capture, entonces TC14 con 9995 daba falso positivo (no validaba ningún error). Card 0002 rechaza directamente en authorize, que es el momento correcto para validar el flujo UNHAPPY "viaje no creado".
  - **Impacto:** smoke `gateway-pg.smoke.spec.ts` TC14 actualizado al nuevo flow (fillMinimum normal + waitForVehicleSelectionReady + clickSelectVehicle + clickSendService + expect NOT redirect a dashboard + expect error visible).

### Infrastructure

- Removida dependencia de `skipCardValidation` / `clickValidateCardAllowingReject` en TC14. Esos assets del POM (Fix F) siguen disponibles para tests futuros que sí rechacen en setup.

---

## [2026-04-19] docs/matriz-cleanup-final

### Changed

- **`matriz_cases.md` sección 2.2 (TC1013-1016):** homogeneizar redacción al patrón canónico `Validar Alta de Viaje desde app pax para usuario personal con Tarjeta Preautorizada [Hold|sin Hold] desde Alta de Viaje y Cobro desde App Driver [con validación 3DS]`. TC1013/1014 reordenados (`"para usuario personal desde app pax"` → `"desde app pax para usuario personal"`). TC1015 incorporó `"desde app pax"` que antes omitía. Alineamiento de pipes de la tabla recalculado.
- **`normalized-test-cases.json`:** títulos TC1013/1014/1015 sincronizados al nuevo orden canónico del md.
- **`STRIPE_Test_Suite_Matriz_Sincronizado.xlsx`:** regenerado desde matriz `.md` canónica. 215 filas actualizadas en TEST_SUITE + TEST_SUITE 2.0 (184 con título canónico del md, 31 por normalización mecánica). Removido prefijo `"E2E "` (pre=347 → post=0) y formato corto `"Hold y Cobro desde App Driver"` expandido a `"Hold desde Alta de Viaje y Cobro desde App Driver"` (pre=146 → post=0). Artefacto `"app modo personal"` limpiado; doble `"desde app pax ... desde app pax"` colapsado.

### Added

- **`scripts/ai/matriz-coherencia/sync-xlsx-canonical.py`:** script de sync idempotente que lee `matriz_cases.md` + `matriz_cases2.md` (incluye IDs `TS-STRIPE-P2-TCxxx`), construye mapa ID→título canónico y aplica tanto override con título del md como sustituciones mecánicas (E2E, Hold y Cobro, app modo personal). `openpyxl` preserva estilos/colores.

### Infrastructure

- Cierre de las 2 observaciones fuera-de-scope detectadas en el MR !8 (auditoría coherencia Stripe 2026-04-18).

---

## [2026-04-19] contractor/tc-matrix-ids

### Fixed

- **P2-TC001/TC002/TC003/TC004/TC005/TC006:** descripciones `"desde app pax"` → `"desde portal contractor"` (Regla 2 coherencia sección ↔ descripción). La sección "## 1. Portal Contractor – Alta de Tarjetas y Vinculación" declaraba contexto Portal Contractor pero las 6 filas mencionaban `"app pax"`, generando ambigüedad sobre el portal de origen del alta de viaje. Adicionalmente se eliminó la redundancia `"de contractor"` tras `"colaborador"` porque el nuevo contexto explícito `"desde portal contractor"` ya la cubre.

### Added

- **TS-STRIPE-P2-TC090:** nuevo TC bajo subsección `"### 1.3 Colaborador de Contractor – Tarjetas con fallo de pago"` para cubrir el flujo UNHAPPY de fondos insuficientes (card `4000 0000 0000 9995`) Hold ON desde portal contractor — error visible, viaje no creado. Hasta ahora el caso existía como `SMOKE-GW-TC14` en `tests/features/smoke/specs/gateway-pg.smoke.spec.ts` pero estaba huérfano de ID canónico (etiquetado como `[TC-PENDIENTE]`).

### Changed

- **Smoke spec `tests/features/smoke/specs/gateway-pg.smoke.spec.ts`:** reemplazados 4 placeholders por IDs P2 canónicos:
  - `SMOKE-GW-TC11`: `[SIN-ID-MATRIZ]` → `[TS-STRIPE-P2-TC001]`
  - `SMOKE-GW-TC12`: `[SIN-ID-MATRIZ]` → `[TS-STRIPE-P2-TC005]`
  - `SMOKE-GW-TC13`: `[SIN-ID-MATRIZ]` → `[TS-STRIPE-P2-TC002]`
  - `SMOKE-GW-TC14`: `[TC-PENDIENTE]` → `[TS-STRIPE-P2-TC090]`
  - Solo reemplazo textual en strings `test()` + comentario de trazabilidad. Sin cambios de lógica, POMs, fixtures ni helpers.
- **normalized-test-cases.json:** sincronizado manualmente (el `sync-json.py` tiene allowlist acotada a TC1011/12/16). 6 titles actualizados + 1 entry nueva (TC090) con metadata completa. Total cases: 219 → 220. Nota incorporada en `notes[]`.

### Infrastructure

- **Cumplimiento total de Regla 1** (trazabilidad TC → matriz → spec → CI) en smoke contractor: el pipeline Tests tab ahora muestra los 4 TCs con sus IDs canónicos en lugar de placeholders. Última pieza de cobertura contractor quedó ligada a la matriz.
- **xlsx sync:** no aplicable en este MR. `STRIPE_Test_Suite_Matriz_Sincronizado.xlsx` solo contiene entries `TS-STRIPE-TC1xxx` (Parte 1); no tiene hojas ni filas para P2-TCxxx. Los cambios P2 viven exclusivamente en `matriz_cases2.md` + `normalized-test-cases.json`.

---

## [2026-04-19] feature/ai-matriz-sources-rename

### Changed

- **Rename semántico Eje 2 (tipo de usuario):** `Usuario App Pax` → `Usuario Personal` en todos los contextos donde identifica al tipo de usuario. Preservado `App Pax` / `desde App Pax` cuando identifica el Eje 1 (portal de origen del viaje). Afecta:
  - `docs/gateway-pg/stripe/matriz_cases.md`
    - Sección 2: `Alta de Viaje desde App Pax – Usuario App Pax (Modo Personal)` → `Alta de Viaje desde App Pax – Usuario Personal`.
    - Sección 3: `Alta de Viaje desde App Pax – Usuario App Pax (Modo Business / Colaborador)` → `Alta de Viaje desde App Pax – Usuario Business / Colaborador`.
    - Sección 5: `Alta de Viaje desde Carrier – Usuario App Pax` → `Alta de Viaje desde Carrier – Usuario Personal`.
    - Sección 7: `Cargo a Bordo – Tarjeta de Crédito – Usuario App Pax (desde Carrier)` → `Cargo a Bordo – Tarjeta de Crédito – Usuario Personal (desde Carrier)`.
    - Descripciones: `usuario app pax modo personal` → `usuario personal`; `usuario app pax modo business` → `usuario business`; `usuario app pax` → `usuario personal`.
  - `docs/gateway-pg/stripe/matriz_cases2.md`
    - Sección 2.4: `App Pax – sin 3DS` → `Personal – sin 3DS`.
    - Sección 2.5: `App Pax – con 3DS` → `Personal – con 3DS`.
    - Sección 5: `Viajes Recurrentes – Portal Carrier (Usuario App Pax)` → `Viajes Recurrentes – Portal Carrier (Usuario Personal)`.
    - Descripciones: `usuario app pax existente` → `usuario personal existente`; `para usuario app pax con` → `para usuario personal con`.
  - `docs/gateway-pg/stripe/normalized-test-cases.json`
    - 77 titles renombrados.
    - 70 sections renombrados.
    - 8 subsections renombrados.
  - `docs/gateway-pg/stripe/STRIPE_Test_Suite_Matriz_Sincronizado.xlsx`
    - 128 renames aplicados en columnas B (Título) y C (Descripción).

- **Tipos finales del Eje 2:** `Personal` · `Business` · `Colaborador` · `Empresa Individuo`.

### Fixed

Errores conocidos de la fuente original corregidos directamente:

- **TS-STRIPE-TC1009** *(corregido previamente en MR !8 — referenciado por trazabilidad)*: removida redundancia `"desde app pax desde app pax"` → `"desde app pax"`. Fuente original tenía doble mención accidental.
- **TS-STRIPE-TC1011** *(corregido previamente en MR !8)*: `"Alta carrier de Viaje"` → `"Alta de Viaje desde app pax"` para respetar sección 2 (“desde App Pax”).
- **TS-STRIPE-TC1012** *(corregido previamente en MR !8)*: idem TC1011.
- **TS-STRIPE-TC1016** *(corregido previamente en MR !8)*: idem TC1011.
- **TS-STRIPE-P2-TC082**: título `"Validar Clonación de viaje finalizado desde carrier ..."` → `"Validar Edición de viaje programado desde carrier ..."`. Alinea con sección 10 (`Edición de Viajes Programados`). Flag histórico `fuera-de-sección` removido.
- **TS-STRIPE-P2-TC083**: título `"Validar Clonación de viaje finalizado para usuario ..."` → `"Validar Edición de viaje programado para usuario ..."`. Alinea con sección 10. Flag `fuera-de-sección` removido.
- **TS-STRIPE-P2-TC088**: título `"Validar Clonación de viaje finalizado desde carrier ..."` → `"Validar Edición en conflicto desde carrier ..."`. Alinea con sección 11 (`Edición en conflicto`). Flag `fuera-de-sección` removido.
- **TS-STRIPE-P2-TC089**: título `"Validar Clonación de viaje finalizado para usuario ..."` → `"Validar Edición en conflicto para usuario ..."`. Alinea con sección 11. Flag `fuera-de-sección` removido.

### Infrastructure

- Nueva sección en `.claude/skills/magiis-playwright-docs-to-drafts/SKILL.md`: `Reglas de Trazabilidad y Anti-Ambigüedad (OBLIGATORIAS)` con 9 reglas:
  1. Trazabilidad TC → matriz → spec → xlsx → reportes.
  2. Coherencia sección ↔ descripción.
  3. Parámetros diferenciadores obligatorios (6 Ejes).
  4. Anti-duplicación pares card-flow.
  5. Workflow obligatorio al agregar TC nuevo.
  6. Casos especiales (aliases, fuera-de-sección, `[SIN-ID-MATRIZ]`).
  7. Herramientas de verificación.
  8. Técnicas QA formales (decision table, particiones equivalentes, valores límite).
  9. Errores conocidos corregidos (este changelog).
- Nuevos scripts de sincronización en `scripts/ai/matriz-coherencia/`:
  - `sync-rename-personal.py` — rename masivo Eje 2 sobre `normalized-test-cases.json`.
  - `sync-xlsx-rename-personal.py` — rename masivo Eje 2 sobre `STRIPE_Test_Suite_Matriz_Sincronizado.xlsx`.

### Scope

- **No tocado:** specs `.spec.ts`, constantes en código (`PASSENGERS.appPaxPassenger`, etc.), Page Objects, fixtures, CI config, `tests/`.
- **Tocado:** únicamente `docs/gateway-pg/stripe/**`, `.claude/skills/magiis-playwright-docs-to-drafts/SKILL.md`, y scripts auxiliares de `scripts/ai/matriz-coherencia/`.

---

## [2026-04-19] TIER 1 — Cleanup legacy + guardrails (MRs !25–!28)

### Removed

- **MR !25 (TIER 1.1)** — eliminados 29 archivos re-export legacy + migrados 6 imports a rutas canónicas.
- **MR !28 (TIER 1.5)** — eliminados 32 wrappers de `tests/specs/gateway-pg/stripe/`; scripts `package.json` y docs migrados a path canónico.

### Added

- **MR !26 (TIER 1.2)** — regla ESLint `no-restricted-imports` para paths legacy; fix TC1081 (`creditCardEnabled` añadido a precondición).
- **MR !27** — docs: anotación Categoría 2 pendiente registrada en `ARCHITECTURE.md`.

---

## [2026-04-19] TIER 2 — Arquitectura feature-first + helpers (MRs !29–!32)

### Added

- **MR !29 (TIER 2.1)** — creado `tests/helpers/` con módulos `retry`, `assertions`, `browser` y `debug`; refactor `dataGenerator.ts`.
- **MR !30 (TIER 2.2)** — reorganización de `gateway-pg/specs/stripe/` al patrón feature-first con sub-plataformas `web/{carrier,contractor}`.

### Changed

- **MR !31 (TIER 2.3)** — TC1033: `retry(1)` temporal añadido; regla ESLint anti-card-3155 (card deprecada) activada.
- **MR !32 (TIER 2.4)** — migrados 35 `console.log` a `debugLog` en 5 specs de alta densidad.

---

## [2026-04-20] TIER 3 — Deuda técnica residual (MRs !33–!34)

### Changed

- **MR !33 (TIER 3.1)** — cerrada migración `console.log` → `debugLog`: 8 ocurrencias restantes en specs de baja densidad.
- **MR !34 (TIER 3.2)** — análisis semántico `waitForTimeout` en `tests/pages/`: 12/39 ocurrencias migradas a esperas por estado observable; 27 conservadas con `NOTE(tier3-kept)` y justificación técnica por caso. Ver `docs/reports/WAITFORTIMEOUT-MIGRATION.md`.

### Documentation

- Ver `docs/reports/README.md` para el índice completo de reportes generados en TIER 1-3.

---

## [2026-04-18] feature/ai-matriz-desambiguacion (MR !8 — histórico)

### Fixed

- `TS-STRIPE-TC1011 / TC1012 / TC1016` (matriz_cases.md Sección 2): `"Alta carrier de Viaje"` → `"Alta de Viaje desde app pax"`. Sincronizado vía `scripts/ai/matriz-coherencia/sync-json.py` y `sync-xlsx.py`.
- `TS-STRIPE-TC1009` (matriz_cases.md Sección 2): removida redundancia `"desde app pax desde app pax"`.

### Added

- Aliases RV (`TS-STRIPE-TC-RV001..RV008`) colapsados a canónicos vía `canonical_ref`.
- Campo `card_flow` a todos los casos (`new` / `existing` / `n/a`).
- Campo `phase2_status` (`active-canonical`, `active-card-existing`, `deprecated-redundant`, `collapsed-alias`).
- Scripts de coherencia iniciales en `scripts/ai/matriz-coherencia/`.

---

*Documento mantenido por el skill `magiis-playwright-docs-to-drafts`. Toda corrección futura de fuente debe registrarse aquí con racional + referencia de MR.*
