# CI/CD Usage Guidelines — magiis-playwright

Guía obligatoria de uso del sistema CI/CD para el equipo. Lectura requerida en onboarding.

**Última actualización:** 2026-04-20
**Owner:** Emanuel Restrepo (QA Automation)
**Repositorios:** GitLab (`repo.magiis/magiis-testing`) + GitHub (mirror)

---

## 🎯 Objetivo

Mantener los pipelines **rápidos, baratos y confiables** para que todo el equipo tenga feedback oportuno sin quemar cupo innecesario.

Contexto histórico de por qué existe esta guía:
- **2026-04-20:** el cupo mensual GitLab CI se agotó (`ci_quota_exceeded`) tras una sesión de consolidación intensa. Identificamos consumo ineficiente por pipelines redundantes + falta de filtros path + retries de flakies. Esta guía busca prevenir repetición.

---

## 📜 Decálogo — cuándo correr CI

### ✅ CORRÉ CI si:

1. Merge a `main`
2. PR/MR listo para review con cambios en `tests/`, `src/`, `pages/`, `fixtures/`
3. PR/MR con cambios en `package.json`, `playwright.config.ts`, `.github/workflows/`, `.gitlab-ci.yml`
4. Post-merge de revert o hotfix
5. Antes de un release o tag

### ❌ NO CORRAS CI si:

1. PR solo toca archivos `.md` en `docs/` (agregar `paths-ignore` en el YAML para prevenir esto automático)
2. PR solo toca `.claude/`, `scripts/` no relacionados al CI, `README.md`
3. Commits WIP tempranos — consolidá con `git rebase -i` antes de abrir PR/MR
4. Tras pipeline verde reciente sin cambios relevantes
5. Rebase sin cambios de código (solo alineación con main)
6. Experimentar localmente (usá `pnpm run test:test:smoke -g "..."` en tu máquina)

---

## 🛠️ Flujo de trabajo recomendado

```
┌─ DESARROLLO LOCAL ─────────────────────────────────┐
│  1. Hacer cambios                                   │
│  2. pnpm exec tsc --noEmit                          │
│  3. pnpm lint                                       │
│  4. pnpm run test:test:smoke -g "TC..." (focalizado)│
│  5. Iterar hasta verde local                        │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─ COMMITS LIMPIOS ──────────────────────────────────┐
│  6. git commit con formato convencional + TC-ID     │
│  7. git rebase -i para consolidar commits WIP       │
└──────────────────┬──────────────────────────────────┘
                   ▼
┌─ PUSH + PR/MR ─────────────────────────────────────┐
│  8. git push  (dispara CI una vez)                  │
│  9. Abrir PR/MR con descripción completa            │
│  10. Esperar CI verde                               │
│  11. Code review                                    │
│  12. Merge (GitLab: squash OK, no forzar)           │
└─────────────────────────────────────────────────────┘
```

---

## 📝 Convenciones de commit

### Formato obligatorio para TCs

```
<tipo>(<scope>): [TC-ID] descripción corta

Cuerpo opcional con detalle técnico / link al issue.
```

Ejemplos reales del proyecto:
- `feat(mobile/pax): [TC-PAX-HOLD-STEPS] Flujo 1 pasos 9-16 completados con evidencia`
- `fix(smoke): [TS-STRIPE-TC1033] aplicar retry(1) temporal + documentar mitigacion`
- `docs(architecture): [scripts] anotar TIER 1.5 Categoría 2 pendiente`

Ver reglas completas en `.claude/skills/magiis-branch-convention/`.

### `[skip ci]` para commits triviales

Usalo cuando:
- Fix de typo en `.md`
- Update de `.gitignore` sin impacto en código
- Comentario aclaratorio sin cambio funcional

```bash
git commit -m "docs: fix typo en README [skip ci]"
```

---

## 🏃 Comandos locales del día a día

```bash
# Pre-push (obligatorio)
pnpm exec tsc --noEmit                         # 10-20s — valida TypeScript
pnpm lint                                       # 30-60s — valida estilo y reglas

# Test focalizado (variable, típicamente 1-3 min)
pnpm run test:test:smoke -g "TS-STRIPE-TC01"
pnpm run test:test:smoke -g "TS-STRIPE-TC01" --headed   # browser visible

# Suite completa local (~10-13 min — equivalente al CI)
pnpm run test:test:smoke

# Verificar no quedaron .only() olvidados
grep -rn "test.only\|describe.only\|it.only" tests/

# Fix lint automático
pnpm lint --fix
```

---

## 🚦 Quality gates — qué bloquea el merge

Configurar una sola vez en Settings del repo:

1. **Pipeline verde obligatorio** — no se mergea en rojo
2. **Code review aprobado** — mínimo 1 approver (GitLab Settings → Merge requests → Approvals)
3. **TypeScript compila** — `tsc --noEmit` sin errores
4. **Sin `test.only` / `describe.only`** — bloqueado por pre-push hook (pendiente BL-005)
5. **Commit messages con TC-ID** cuando aplique

---

## ⚠️ Qué hacer si...

### Main está rojo

1. **Stop the line.** No pushear más MRs hasta resolver.
2. Identificar responsable (último merge).
3. Si es fix rápido (<30 min): hotfix directo.
4. Si es complejo: revert + MR separado.
5. Post-mortem breve (10 min) en retro de equipo.

### Un test es flaky

1. **Investigar antes de re-trigger.** Leer trace/logs.
2. Si es flaky conocido (ver catálogo abajo): re-trigger 1 vez máximo.
3. Si es nuevo: abrir ítem en `docs/ops/BACKLOG.md`.
4. NO aplicar `retry: 3` como solución — oculta regresiones reales.

### Pipeline tarda demasiado

1. Avisar al QA Automation owner.
2. Auditoría con la skill `magiis-ci-efficiency` (Claude Code):
   ```bash
   node ~/.claude/skills/magiis-ci-efficiency/scripts/audit-workflow.mjs .github/workflows/playwright.yml
   ```
3. Optimizar cache/sharding/paths-ignore según diagnóstico.

### Cupo CI se agota

1. **No entrar en pánico.** Todos los pipelines nuevos fallan instantáneo con `ci_quota_exceeded`.
2. Revisar causa (ver `memory/project_gitlab_ci_quota.md` en Claude).
3. Fallback: usar plataforma secundaria (si GitLab se agota, GitHub Actions y viceversa).
4. Opciones a mediano plazo:
   - Runner propio (AWS EC2 ~$10/mes)
   - Comprar paquete de minutos extra
   - Upgrade plan

---

## 🔍 Flaky offenders conocidos

| TC ID | Descripción | Mitigación actual | Status | Referencia |
|---|---|---|---|---|
| `TS-STRIPE-TC1033` | Auth intermitente dispatcher | `retry(1)` acotado | 🟡 Investigación pendiente | BL-002 + `docs/reports/TC1033-MITIGATION.md` |
| `TS-STRIPE-P2-TC090` (TC14) | Card 0002 declinada timing | Fix POM MR !38 (tolerar declined) | 🟢 Resuelto | `docs/reports/TC14-STABILIZATION.md` |
| `TS-STRIPE-TC1081` (TC04) | Cargo a Bordo `limitExceeded=false` | Precondición `creditCardEnabled` check | 🟡 Acción humana backend | BL-001 + `EXTERNAL-BLOCKERS.md §TC1081` |
| `TS-STRIPE-TC1096` (TC07) | Colaborador Cargo a Bordo | Helper `resetCollaboratorServiceUsage` automático | 🟢 Resuelto | MR !40 + `EXTERNAL-BLOCKERS.md §TC1096` |

*Actualizar esta tabla cada vez que se detecta/resuelve un flaky. Debería reflejar estado en `docs/ops/BACKLOG.md`.*

---

## 📊 Métricas que trackeamos (objetivo mensual)

- **Pipeline duration p95** — target <15 min
- **Success rate** — target >95%
- **Flaky test rate** — target <2%
- **CI minutes consumed** — target <70% del cupo
- **MR lead time** (open → merged) — target <2 días

**Dashboards disponibles:**
- GitLab Analytics built-in: `Analyze → CI/CD analytics` (por pipeline, duration trend, success rate)
- GitHub Insights: `Actions → Usage`

---

## 📞 Escalamiento

| Problema | Primera línea | Escalamiento |
|---|---|---|
| Pipeline individual falla | Leer logs, re-trigger si es infra | QA Automation owner |
| Main rojo | Último merger | QA Automation owner + Tech Lead |
| Pipeline sistemáticamente lento | QA Automation owner investiga | Tech Lead + DevOps |
| Infra CI caída | Esperar a GitHub/GitLab | DevOps organizacional |
| Secrets expirados/rotados | DevOps | Tech Lead + Security |
| Cupo CI agotado inesperadamente | Retro breve | QA Automation owner |

---

## 📚 Referencias internas

- **Backlog operacional:** `docs/ops/BACKLOG.md`
- **External blockers:** `docs/gateway-pg/stripe/EXTERNAL-BLOCKERS.md`
- **Reportes de flakiness:** `docs/reports/`
- **CHANGELOG:** `docs/gateway-pg/stripe/CHANGELOG.md`
- **Architecture:** `docs/ARCHITECTURE.md`
- **Skills Claude (asesor senior CI):**
  - `.claude/skills/magiis-ci-efficiency/` — auditoría, optimización, best practices senior
  - `.claude/skills/magiis-branch-convention/` — convención de ramas y commits
  - `.claude/skills/playwright-magiis/` — guía Playwright + TypeScript

---

## 🤖 Uso de Claude Code con la skill `magiis-ci-efficiency`

Cuando trabajes sobre CI/CD, Claude puede consultarla automáticamente. Ejemplos de pedidos:

- *"Auditá el workflow `playwright.yml` y decime qué optimizar"*
- *"¿Debería disparar pipeline para este commit que solo toca docs?"*
- *"Calculá el presupuesto de minutos si hacemos 8 MRs/día"*
- *"Optimizá el cache del GitLab CI"*
- *"Generá plan de quality gates para branch protection"*

También podés correr los scripts directamente:

```bash
# Auditoría automática
node ~/.claude/skills/magiis-ci-efficiency/scripts/audit-workflow.mjs <path/to/workflow.yml>

# Estimación de presupuesto
node ~/.claude/skills/magiis-ci-efficiency/scripts/estimate-ci-budget.mjs \
  --pipelines-per-day=5 --pipeline-duration=13 --quota=2000
```

---

## ✅ Contrato del equipo

> Me comprometo a:
>
> 1. Leer esta guía antes de mi primer push.
> 2. No mergear con pipeline rojo salvo emergencia documentada.
> 3. Investigar cualquier test que falla antes de re-triggerearlo.
> 4. Consolidar commits antes de push (rebase -i o squash en merge).
> 5. Notificar al equipo si voy a correr scheduled/manual pesado.
> 6. Actualizar `docs/ops/BACKLOG.md` cuando identifico un ítem nuevo.
> 7. Rotar como guardián del main según calendario.
>
> Firma: ________________ Fecha: ________

---

## 🛡️ Ritual pre-push (15-30 segundos que ahorran 13 min CI)

Antes de cada `git push`, correr localmente:

```bash
pnpm pp    # alias corto
# o
pnpm prepush    # alias largo
```

### Qué chequea (10 validaciones)

| # | Check | Tipo |
|---|---|---|
| 1 | Sin `test.only / describe.only / it.only` | 🔴 FAIL |
| 2 | Sin card 3155 (deprecated) fuera de overrides | 🔴 FAIL |
| 3 | Sin `TODO(temp) / FIXME(urgent)` sin resolver | 🔴 FAIL |
| 4 | Sin credenciales hardcodeadas | 🔴 FAIL |
| 5 | Sin `.env` files staged | 🔴 FAIL |
| 6 | Sin `console.log` nuevos en specs (usar `debugLog`) | ⚠️ WARN |
| 7 | `test.fixme` con justificación comentario | ⚠️ WARN |
| 8 | Branch cerca de `origin/main` (<5 commits behind) | ⚠️ WARN |
| 9 | Trazabilidad `BL-NNN / TC-xxx` en branch o commit | ⚠️ WARN |
| 10 | TypeScript compila (`tsc --noEmit`) | 🔴 FAIL |

🔴 FAIL = bloqueante si el hook está activo (Fase 3 futura)
⚠️ WARN = informativo, no bloquea

### Tiempo esperado

~15-30s en total. Si supera 60s, abrir issue y optimizar.

### Si algún check da falso positivo

Ejemplo: pushear un WIP intencional con `test.fixme` sin justificación todavía.

```bash
# Si el hook está activo:
SKIP_HOOKS=true git push

# Si corrés el ritual manual, simplemente ignorá los warnings y pushá:
git push
```

Siempre documentar el bypass en el commit message.

### Evolución futura

Este ritual es **Fase 1** de un plan progresivo. Fases futuras:
- **Fase 3** (cuando se sume dev nuevo): activar hook husky automático
- **Fase 4** (1 mes post-hook): agregar gitleaks + commitlint
- **Fase 5** (equipo ≥3): branch protection estricta

Ver `docs/ops/CI-GATES-IMPLEMENTATION-PLAN.md` para el plan completo.

---

## 📆 Pendientes de este documento

Ver `docs/ops/BACKLOG.md`:
- **BL-005** — aplicar optimizaciones al `.github/workflows/playwright.yml` (concurrency, paths-ignore, cache)
- **BL-014** — aplicar template optimizado al YAML cuando vuelva cupo CI para poder validar (pendiente de esta guía)

---

*Esta guía es un documento vivo. Proponé cambios via MR.*
*Basado en `.claude/skills/magiis-ci-efficiency/assets/templates/CI-USAGE-GUIDELINES.md` (template genérico) — personalizado para MAGIIS.*
