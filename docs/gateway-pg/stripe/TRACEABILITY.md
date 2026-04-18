# Trazabilidad — Matrices Stripe Gateway PG

> **Propósito**: mapa de impacto y orden canónico de sincronización cuando cambia la documentación fuente de test cases Stripe (matrices, JSON normalizado). Todo cambio debe propagarse por las capas siguientes en el mismo sprint para evitar drift.

---

## 1. Capas y fuentes de verdad

| Capa | Archivos | Rol | Fuente / Generado |
| --- | --- | --- | --- |
| **L0 — Fuente humana** | `matriz_cases.md`, `matriz_cases2.md` | Documentación QA editable por humanos | Fuente |
| **L1 — Fuente estructurada** | `normalized-test-cases.json` | Contrato canónico consumible por scripts y agentes | Generado desde L0 |
| **L2 — Fuente binaria** | `STRIPE_Test_Suite_Matriz_Sincronizado.xlsx` (docs + .claude/skills) | Matriz operativa para QA manual | Sincronizado desde L1 |
| **L3 — Documentos derivados** | `duplicados-detectados.md`, `pares-resueltos.md`, `ARCHITECTURE.md` | Reportes de fases del pipeline | Generado desde L0/L1 |
| **L4 — Código Playwright** | `tests/features/gateway-pg/specs/stripe/**/*.spec.ts` | Implementación de los TCs | Referencia L1 vía IDs y títulos |
| **L5 — Cobertura** | `tests/coverage/*.md` + `coverage-manifest.json` | Mapa TC ↔ spec, estado de cobertura | Generado desde L1 + L4 (gitignored) |

---

## 2. Mapa de impacto — qué tocar según el tipo de cambio

| Tipo de cambio | L0 | L1 | L2 | L3 | L4 | L5 |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Renombrar descriptor (ej: `E2E`→`Validar`) | ✅ | ✅ | ✅ | ✅ | ✅ (`describe`) | ✅ |
| Agregar TC nuevo | ✅ | ✅ | ✅ | — | ✅ (draft) | ✅ |
| Resolver duplicado (diferenciar flujos) | ✅ | ✅ | ✅ | ✅ | ⚠ evaluar | ✅ |
| Cambiar prioridad | ✅ | ✅ | ✅ | — | — | ✅ |
| Cambiar `spec_file` objetivo | — | ✅ | — | — | — | ✅ |
| Deprecar TC redundante | ✅ | ✅ | ✅ | ✅ | 📝 comentario | ✅ |
| Desambiguar redacción funcional (ej: `Hold y Cobro`) | ✅ | ✅ | ✅ | ✅ | ✅ (títulos) | ✅ |

**Leyenda**: ✅ obligatorio · ⚠ solo si cambia la estructura del spec · 📝 comentario inline · — no aplica

---

## 3. Orden canónico de sincronización (CRÍTICO)

Siempre propagar en este orden. Saltar una capa genera drift silencioso.

```text
L0 (md)  ──►  L1 (json)  ──►  L2 (xlsx)  ──►  L3 (derivados)  ──►  L4 (specs)  ──►  L5 (coverage)
```

### Pipeline operativo

```bash
# 1. Cambio manual o asistido en L0 (matrices .md)
#    Si es un reemplazo bulk, usar siempre un script reproducible en scripts/ai/.

# 2. Regenerar L1 desde L0 (agente qa-doc-analyst o script)
#    Ver: docs/gateway-pg/stripe/normalized-test-cases.json

# 3. Sincronizar L2 (xlsx) desde L1
pnpm exec ts-node --esm tests/utils/scripts/update-matriz-xlsx.ts            # dry-run
pnpm exec ts-node --esm tests/utils/scripts/update-matriz-xlsx.ts --apply    # aplicar
# Requisitos: pnpm add -D exceljs (ya instalado)
# Backups: *.xlsx.bak (gitignored)

# 4. Actualizar L3 cuando el cambio toca duplicados / pares / arquitectura
#    Archivos: duplicados-detectados.md, pares-resueltos.md, ARCHITECTURE.md

# 5. Sync L4 (specs) — títulos describe() alineados al JSON
#    Solo afecta strings humanos; nunca IDs técnicos ([E2E-FLOW-*], E2EFlowType, E2E_*, test:e2e:*)

# 6. Sync L5 (coverage) — local al dev, gitignored
node scripts/ai/phase6-sync-coverage.mjs             # dry-run
node scripts/ai/phase6-sync-coverage.mjs --apply     # aplicar
```

---

## 4. Scripts reutilizables

| Script | Fase | Propósito |
| --- | --- | --- |
| `scripts/ai/phase2-apply-card-flow.mjs` | 2 | Aplicar diferenciación card-new / card-existing + deprecaciones + alias RV |
| `tests/utils/scripts/update-matriz-xlsx.ts` | 3 | Sincronizar xlsx desde JSON con safeguards contra IDs técnicos |
| `scripts/ai/phase6-sync-coverage.mjs` | 6 | Sync coverage/*.md + manifest desde las matrices |
| `scripts/ai/phase7-sync-hold-cobro.mjs` | 7 | Desambiguar `Hold y Cobro` → `Hold desde Alta de Viaje y Cobro desde App Driver` |

**Convención**: todo script de sincronización debe soportar `--apply` (default dry-run), validar strings protegidos (ver §5) y reportar `matched / orphans / missing / blocked`.

---

## 5. Strings técnicos protegidos (NUNCA reemplazar)

Estos identificadores tienen significado arquitectónico y no deben ser alterados por scripts bulk:

- `[E2E-FLOW-*]`, `[E2E]` — IDs técnicos de suite
- `E2EFlowType` — tipo exportado en `tests/features/gateway-pg/contracts/gateway-pg.types.ts`
- `E2E_*` — variables de entorno (flow1/2/3)
- `@e2e` — tag Playwright
- `test:e2e:*` — scripts npm
- `tests/e2e/`, `*.e2e.spec.ts` — paths de convención Playwright

Todo script de sync debe detectar estos patrones en celdas y abortar o reportar `blocked`.

---

## 6. Convenciones de naming (post-Fase 7)

### IDs de test cases
- Canónico: `TS-STRIPE-TC####` (parte 1) o `TS-STRIPE-P2-TC###` (parte 2)
- Alias `-CARD-EXISTING`: mismo ID canónico con sufijo indicando flujo de tarjeta existente
- Alias RV: `TS-STRIPE-TC-RV###` — solo trazabilidad, apunta a canónico via `canonical_ref`

### Terminología en títulos
| Concepto | Usar | Evitar |
| --- | --- | --- |
| Acción del caso | `Validar ...` | `E2E ...` |
| Agregar tarjeta nueva | `Vincular tarjeta nueva` | `Agregar`, `Adicionar` |
| Usar tarjeta existente | `Usar tarjeta vinculada existente` | `Seleccionar`, `Tarjeta guardada` |
| Evento Hold | `Hold desde Alta de Viaje` | `Hold y ...` (solo) |
| Evento Cobro | `Cobro desde App Driver` | `y Cobro desde App Driver` (aislado) |
| Pasarela | `Vincular pasarela Stripe` | `Vincular` sin calificador |

**Regla crítica**: `vincular` nunca va solo — siempre `vincular tarjeta` o `vincular pasarela` para desambiguar del flujo de setup.

---

## 7. Checklist antes de mergear un cambio en matrices

- [ ] `grep "E2E " docs/gateway-pg/stripe/matriz_cases*.md` → 0 resultados (solo `Validar`)
- [ ] `grep "Hold y Cobro" docs/ tests/ scripts/` → 0 resultados (solo la redacción nueva)
- [ ] `normalized-test-cases.json` regenerado y validado por `qa-doc-analyst` o diff manual
- [ ] `pnpm exec ts-node --esm tests/utils/scripts/update-matriz-xlsx.ts` → reporta `matched` esperado, `blocked=0`
- [ ] `pnpm exec tsc --noEmit` → 0 errores
- [ ] `pnpm exec playwright test --list <spec-tocado>` → tests siguen listándose con títulos canónicos
- [ ] `node scripts/ai/phase6-sync-coverage.mjs --apply` → 0 `E2E` residual y 0 `Hold y Cobro` residual
- [ ] `.xlsx.bak` y `.apk` no aparecen en `git status`
- [ ] Commit por capa (no mezclar L0+L2 en un commit para que el PR sea auditable)
- [ ] `pnpm run validate:terminology` → 0 violaciones (lo fuerza el workflow `doc-terminology-check.yml` en cada PR)

---

## 8. Archivos que NO se versionan pero se mantienen localmente

- `tests/coverage/**` (gitignored por regla `coverage/`). Cada dev lo regenera con `phase6-sync-coverage.mjs`.
- `*.xlsx.bak` — backups generados por scripts de sync.
- `*.apk` — binarios de aplicación para Appium.

Si un coverage doc se necesita compartir, exportalo como PR de artefacto o subilo como evidencia en Jira, no como commit al repo.

---

## 9. Quién ejecuta qué — delegación a agentes

| Fase | Agente responsable | Entrada | Salida |
| --- | --- | --- | --- |
| Análisis L0 → L1 | `qa-doc-analyst` | matrices .md | `normalized-test-cases.json`, `duplicados-detectados.md` |
| Priorización y decisiones L1 → L3 | `critical-flow-prioritizer` | duplicados + pares | `pares-resueltos.md`, JSON actualizado |
| Drafts nuevos L1 → L4 | `playwright-draft-generator` | JSON | specs con `test.fixme()` |
| Refactor de specs existentes L4 | `playwright-draft-generator` | JSON + specs actuales | specs con describes canónicos |
| Sync xlsx L1 → L2 | `general-purpose` + `update-matriz-xlsx.ts` | JSON + xlsx | xlsx sincronizado |
| Sync coverage L1+L4 → L5 | orquestador + `phase6-sync-coverage.mjs` | JSON + specs | `tests/coverage/*.md` |

El orquestador (Opus) decide el orden y delega; no edita directamente a menos que la tarea sea puramente mecánica (scripts bulk, commits, verificación).

---

## 10. Historial de cambios canónicos (referencia)

Rama `feature/ai-matriz-desambiguacion`:

| Commit | Capa impactada | Descripción |
| --- | --- | --- |
| `ad416cc` | L0, L1, L3 | Fase 1 — normalizar `E2E`→`Validar` + detectar duplicados |
| `3a0af0f` | L0, L1, L3 | Fase 2 — resolver 52 pares con card-new/card-existing |
| `0504d9d` | tooling | Script `update-matriz-xlsx.ts` |
| `e681167` | L4 | Fase 4 — sync títulos en specs + anotaciones DEPRECATED |
| `d90ee2d` | L4 | Fase 5 — drafts app-pax-business TC1017–TC1024 |
| `d7a7283` | tooling | Script `phase6-sync-coverage.mjs` |
| `e4f8197` | L0, L1, L3, L4 | Fase 7 — desambiguar Hold (alta) / Cobro (App Driver) |
| `ad6e900` | deps, L2 | `pnpm add -D exceljs` + apply xlsx sync |

Rama `feature/ai-matriz-coherencia` (2026-04-18):

| Capa impactada | Descripción |
| --- | --- |
| tooling | Auditoría de coherencia sección ↔ descripción — `AUDIT-REPORT.md` (219 TCs: 185 OK, 3 MISMATCH, 30 deprecated, 4 necesita-contexto) |
| L0 | Fix `TS-STRIPE-TC1011/TC1012/TC1016` en `matriz_cases.md` Sección 2: `Alta carrier de Viaje` → `Alta de Viaje desde app pax` |
| L1 | Sync `normalized-test-cases.json` — 3 canónicos + 3 aliases RV003/RV004/RV008 |
| L2 | Sync `STRIPE_Test_Suite_Matriz_Sincronizado.xlsx` — 6 celdas (cols B/C de 3 filas), formato/colores preservados |
| storage | Sync `storage/normalized-test-cases.json` + `storage/traceability-map.json` — 4 títulos cada uno |

Para cambios futuros: actualizar esta tabla en el mismo PR que los introduce.
