# CI Gates — Plan de Implementación Progresivo

**Proyecto:** magiis-playwright
**Owner:** Emanuel Restrepo (QA Automation)
**Inicio:** 2026-04-20
**Horizonte:** 12-18 meses
**Strategy:** Quality gates progresivos (Shift-left testing)

---

## Timeline Macro

```
Semana 1    | Semana 2-4    | Mes 2-3    | Trigger: +1 dev | Mes 4+    | Mes 12+
FASE 0      | FASE 1        | FASE 2     | FASE 3          | FASE 4    | FASE 5
Preparación | Ritual deploy | Adopción + | Onboarding +    | Hook      | Branch
            |               | Medición   | activar hook    | maduro    | protection
```

## Fases

### Fase 0 — Preparación (1-2 días) ✅ COMPLETADA 2026-04-20

- Audit workflow actual
- Baseline de métricas
- Decisión go/no-go

### Fase 1 — Ritual Deploy (3-5 días) ✅ COMPLETADA 2026-04-20

- `scripts/ci/pre-push.mjs` con 10 checks
- Alias `pnpm pp` / `pnpm prepush`
- Doc `CI-USAGE-GUIDELINES.md` sección Ritual
- BL-015 y BL-016 registrados

### Fase 2 — Adopción y Medición (2-4 semanas) 🟡 EN CURSO

- Uso voluntario del ritual
- Medir ahorro real
- Retro semanal
- Ajustar checks según falsos positivos

### Fase 3 — Activación Hook (1 semana) 🟢 COMPLETADA 2026-04-20 (acelerada)

- husky@9 como devDependency
- `.husky/pre-push` invocando `pnpm pp` con SKIP_HOOKS como escape válvula
- `prepare` script en package.json instala hook automáticamente con `pnpm install`
- Cierra BL-015

### Fase 4 — Hook Maduro (1 mes) 🟢 COMPLETADA 2026-04-20 (acelerada — commitlint activo, gitleaks opcional)

- `@commitlint/cli` + `@commitlint/config-conventional` instalados
- `.husky/commit-msg` valida formato `<tipo>(<scope>): [TC-ID?] descripción`
- `commitlint.config.js` con reglas del proyecto (español OK, header 150 chars)
- Mejoras al ritual `pre-push.mjs`:
  - Check 8: detecta remote dinámicamente (gitlab > origin > primero disponible)
  - Checks 3 y 4: escanean solo paths existentes (no `src/` que no existe)
  - Check 11 opcional: gitleaks si está en PATH (warning-only, skip silencioso si no instalado)
- Script esqueleto `scripts/ci/weekly-ci-report.mjs` para futuro dashboard (BL-018)

### Fase 5 — Branch Protection Estricta 🟡 Parcial — CODEOWNERS creado, branch protection UI documentada (trigger: equipo ≥2 devs)

- `.github/CODEOWNERS` con rules por path apuntando a `@emanuel.restrepo` (actualizable cuando escale)
- `docs/ci/BRANCH-PROTECTION-SETTINGS.md` documenta configuración manual UI GitLab + GitHub
- Branch protection real pendiente de activación manual (BL-017) — requiere equipo ≥2 devs para no auto-bloquearse

---

## Red flags y Kill Switches

| Fase | Riesgo | Early warning | Kill switch |
|---|---|---|---|
| 1 | Script no se usa | <50% pushes con pp sem 1 | Revertir MR |
| 2 | Falsos positivos | >2/semana | Quitar check |
| 3 | Hook molesta | >20% SKIP_HOOKS | Revertir a ritual manual |
| 4 | Tiempo crece | >60s/push | Quitar checks lentos |
| 5 | Force-push bypass | git log evidence | Enable "prevent force push" |

---

## Roles

| Rol | Fases | Responsabilidad |
|---|---|---|
| Erika (QA Automation) | 0-5 | Owner principal |
| Claude Code + skill magiis-ci-efficiency | 0-5 | Asistente implementación |
| Jefe / Tech Lead | 3, 5 | Aprobación presupuesto + políticas |
| Nuevo dev (cuando llegue) | 3+ | Consumidor del sistema |
| DevOps (si existe) | 4, 5 | Integración infra |

---

## Dashboard de Salud Mensual

Revisar cada mes:

- CI Minutes consumidos: target <70% cupo
- Pipeline p95 duration: target <15 min
- Success rate: target >95%
- Hook activations / bypasses: ratio <5%
- Flaky offenders count: target <5

---

## Referencias

- `docs/ci/CI-USAGE-GUIDELINES.md` — guía de uso del equipo
- `docs/ops/BACKLOG.md` — BL-015 (activar hook), BL-016 (plan implementación)
- `.claude/skills/magiis-ci-efficiency/` — skill senior
- `scripts/ci/pre-push.mjs` — script del ritual
