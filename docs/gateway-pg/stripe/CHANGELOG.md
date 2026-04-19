# Stripe Matrix Changelog

Registro histórico de cambios aplicados a la documentación de la matriz Stripe / Gateway PG.

Sigue convenciones tipo [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
IDs canónicos: ver `matriz_cases.md` y `matriz_cases2.md` (fuente de verdad).

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
