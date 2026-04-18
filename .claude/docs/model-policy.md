# Política de Modelos IA — MAGIIS Automation

> Política oficial para la asignación de modelos a agentes del pipeline de automatización MAGIIS. Optimiza el balance entre calidad (impacto en retroalimentación organizacional) y costo (admin de recursos).

## Tiers de criticidad

| Tier | Criterio | Modelo fijo | Modelo reemplazo | Cuándo reemplazar |
|---|---|---|---|---|
| **Crítico** | Input del pipeline, orquestación, decisiones que propagan a todo downstream. Error contamina los artefactos de todo el flujo. | **Claude Opus 4.7 (1M ctx)** | **Claude Sonnet 4.6** | Context ≤ 200K tokens o ahorro de costos sin degradar calidad |
| **Medium** | Generación de código / artifacts que son revisados antes de merge. Output controlable por revisión humana. | **Codex GPT-5.1-codex** (o `gpt-4.1-mini` si cuota agotada) | **Claude Sonnet 4.6** | Codex out of quota, rate limit, o tarea requiere consistencia con agentes Crítico (Claude) |
| **Bajo** | Tareas repetitivas, transformaciones mecánicas, formateo, búsqueda/indexado, reporting. | **Gemini 3.1 Flash** | **Claude Haiku 4.5** | Gemini out of quota / rate limit |

## Criterios de clasificación (para futuros agentes)

### Es Crítico si cumple al menos una:
- Es la primera etapa del pipeline (input humano → estructura).
- Orquesta y coordina otros agentes.
- Decide qué se automatiza / qué se deja manual.
- Genera artefactos de trazabilidad (IDs, cobertura, backlog) que otros agentes consumen.
- Maneja contexto > 200K tokens (matrices completas, docs voluminosas).

### Es Medium si cumple al menos una:
- Genera código productivo (specs, POM, fixtures, helpers).
- El output se revisa antes de merge (MR, PR, code review).
- Opera sobre un scope acotado (un feature, un flujo).
- Requiere alineación con framework existente pero no decide estrategia global.

### Es Bajo si cumple al menos una:
- Transformación determinística (parse, format, convert).
- Loop de ejecución repetitiva sin toma de decisión.
- Agregación / reporting sobre outputs de otros agentes.
- Busqueda / indexado / clasificación sin razonamiento complejo.

## Asignación actual (agentes existentes)

| Agente | Tier | Fijo | Reemplazo | Razón |
|---|---|---|---|---|
| `playwright-docs-orchestrator` | Crítico | Claude Opus 4.7 (1M) | Claude Sonnet 4.6 | Orquesta todo el pipeline; ve matriz + backlog + drafts simultáneos |
| `qa-doc-analyst` | Crítico | Claude Opus 4.7 (1M) | Claude Sonnet 4.6 | Fuente de verdad del pipeline; matrices xlsx > 100K tokens; trazabilidad ID |
| `critical-flow-prioritizer` | Crítico | Claude Opus 4.7 (1M) | Claude Sonnet 4.6 | Decisión de backlog propaga a toda la capa de drafts downstream |
| `playwright-draft-generator` | Medium | Codex GPT-5.1-codex | Claude Sonnet 4.6 | Drafts TS/Playwright revisados pre-merge |
| `appium-hybrid-collaborator` | Medium | Codex GPT-5.1-codex | Claude Sonnet 4.6 | Drafts WebdriverIO/Appium revisados pre-merge |

## Asignación planificada (agentes futuros)

| Agente | Tier propuesto | Fijo sugerido |
|---|---|---|
| `qa-reporter` (genera reporte desde logs/Jira) | Bajo | Gemini 3.1 Flash |
| `regression-runner` (ejecuta suite + consolida) | Bajo | Gemini 3.1 Flash |
| `test-coverage-analyzer` (gap spec↔matriz) | Medium | Codex GPT-5.1-codex |
| `security-review-qa` (compliance, riesgo) | Crítico | Claude Opus 4.7 |

## Separación de uso: Pipeline vs Personal

| Contexto | Modelos permitidos |
|---|---|
| **Pipeline agentes MAGIIS (organizacional)** | Solo los definidos en esta política |
| **Codex local / experimentación personal** | Cualquier modelo con API key personal del dev (ej. `gpt-4o-mini` con key propia de OpenAI) |

La API key de Codex personal **NO debe ser usada** para ejecutar agentes del pipeline MAGIIS. El gasto en agentes organizacionales se liquida contra la cuenta corporativa.

## Revisión periódica

Esta política se revisa cada **3 meses** o cuando:
- Un proveedor lanza nuevo modelo que cambia la relación precio/calidad.
- El pipeline introduce un agente con requerimientos que no encajan en los tiers actuales.
- El consumo mensual supera el budget asignado por tier.

---

**Actualizado:** 2026-04-18
**Responsable:** QA Automation Lead
