# Backlog operacional — magiis-playwright

> Fuente única de verdad para tareas pendientes, decisiones en espera y deuda técnica activa.
> **Regla:** toda sesión de trabajo debe arrancar validando este documento. Si un ítem aparece aquí como pendiente pero ya fue resuelto por otra vía, actualizar su estado en lugar de duplicarlo.

**Última revisión:** 2026-04-20 (Erika + Claude — BL-006 cerrado, BL-014 agregado, CI-USAGE-GUIDELINES.md creado)

---

## Cómo usar este documento

### Convenciones de estado

| Icono | Estado | Significado |
|---|---|---|
| 🟢 | Hecho | Completado y verificado |
| 🟡 | En progreso | Con owner y fecha estimada |
| 🔴 | Pendiente | Sin asignar o bloqueado |
| ⚫ | Cancelado | No se hará — con razón documentada |
| 🔵 | Resuelto por otro medio | Alguien/otro proceso lo solucionó — registrar cómo |

### Convenciones de prioridad

- **P1:** Bloquea trabajo de QA / afecta main en producción
- **P2:** Afecta productividad o calidad pero tiene workaround
- **P3:** Mejora incremental, no urgente

### Protocolo de inicio de sesión (obligatorio para agentes e humanos)

1. Abrir este archivo
2. Revisar sección **"Pendientes activos"**
3. Para cada ítem relevante al trabajo en curso:
   - ¿Sigue aplicando? (verificar con `git log`, código actual, reportes)
   - Si ya fue resuelto por otro medio → marcar 🔵 con referencia al MR/commit/reporte
   - Si se avanzó parcialmente → actualizar "Próxima acción" y "Última actualización"
4. Para ítems nuevos detectados durante la sesión → agregar al final de "Pendientes activos"
5. Al cerrar sesión → actualizar "Última revisión" en el header

---

## Pendientes activos

### BL-001 — Habilitar "Cargo a Bordo" para AppPax en backend TEST

- **Estado:** 🔴 Pendiente
- **Prioridad:** P1
- **Tipo:** Configuración de ambiente (acción humana)
- **Reportado:** 2026-04-19
- **Contexto:** TC04 (TS-STRIPE-TC1081) falla intermitentemente con `?limitExceeded=false` cuando el método "Cargo a Bordo / Tarjeta de Crédito" no está habilitado para Emanuel Restrepo (AppPax). **No existe UI ni endpoint público para habilitarlo** — requiere intervención admin de backend.
- **Próxima acción:** Coordinar con DevOps/backend para habilitar el método para `emanuel.restrepo@yopmail.com` en TEST.
- **Referencias:**
  - `docs/reports/TC1081-FLAKINESS-DIAGNOSIS.md`
  - `docs/gateway-pg/stripe/EXTERNAL-BLOCKERS.md` §TC1081
  - MR !26 (fix precondición rápida)

### BL-002 — Root cause TC1033 auth intermitente

- **Estado:** 🔴 Pendiente (mitigación aplicada con `retry(1)`)
- **Prioridad:** P2
- **Tipo:** Investigación
- **Reportado:** 2026-04-19
- **Contexto:** Falla intermitente en login dispatcher al inicio de TC05. `retry(1)` enmascara el síntoma pero no resuelve la raíz.
- **Próxima acción:** Revisar TTL del storageState en `global-setup.multi-role.ts`; correlacionar con logs backend; si retry >20% escalar a bug de infra.
- **Referencias:**
  - `docs/reports/TC1033-MITIGATION.md`
  - MR !31 (retry aplicado)

### BL-003 — Validar empíricamente TC09 (Marcelle) y TC04 (AppPax)

- **Estado:** 🔴 Pendiente (sin impacto actual)
- **Prioridad:** P3
- **Tipo:** Validación
- **Contexto:** Ni TC09 (empresa-individuo) ni TC04 (AppPax personal) tienen endpoint de reset disponible. Hay que validar si fallan con el ambiente actual para decidir si requieren mitigación.
- **Próxima acción:** Correr `pnpm run test:test:smoke -g "TS-STRIPE-TC1081|TS-STRIPE-TC1111" --headed` local una vez que haya CI o en local.
- **Referencias:** EXTERNAL-BLOCKERS.md §TC1081 / §TC1111

### BL-004 — Cupo CI GitLab agotado

- **Estado:** 🟡 Mitigado temporalmente (usando GitHub Actions)
- **Prioridad:** P1
- **Tipo:** Infraestructura
- **Contexto:** Pipelines GitLab fallan con `ci_quota_exceeded` desde 2026-04-20. Resetea 1° de mayo.
- **Próxima acción:**
  1. Durante abril: usar GitHub Actions como canal principal de CI
  2. Evaluar runner propio (local Docker, AWS EC2 o Spot Autoscaler) — decisión diferida con equipo + jefe
  3. Optimizar `.github/workflows/playwright.yml` con concurrency + paths-ignore + cache playwright
- **Referencias:**
  - `memory/project_gitlab_ci_quota.md` (memoria global)
  - MR !37, !38, !40 pendientes de validar cuando vuelva cupo

### BL-005 — Optimizar GitHub Actions y crear guía uso CI

- **Estado:** 🔴 Pendiente (propuesto hoy)
- **Prioridad:** P2
- **Tipo:** Mejora CI
- **Reportado:** 2026-04-20
- **Contexto:** GitHub Actions no tiene concurrency group ni paths-ignore. Docs-only PRs disparan smoke completo.
- **Próxima acción:** PR `chore/github-actions-ci-efficiency`:
  - `concurrency.group` con cancel-in-progress
  - `paths-ignore` en `.github/workflows/playwright.yml`
  - Cache de Playwright browsers
  - Job `quick-checks` fail-fast antes del smoke
  - Timeout 30 min
  - Reducir retention artifacts (14→7 / 7→3 días)
  - Nuevo doc `docs/ci/CI-USAGE-GUIDELINES.md` con decálogo de uso responsable
- **Referencias:** `.github/workflows/playwright.yml`

### BL-006 — Cleanup 5 worktrees OneDrive con lock

- **Estado:** 🟢 Hecho (2026-04-20)
- **Prioridad:** P3
- **Tipo:** Operacional
- **Contexto:** 5 worktrees huérfanos (`magiis-wt-tc0709`, `magiis-wt-tc14`, `magiis-wt-docs`, `magiis-wt-legacy3ds`, `magiis-wt-collab-reset`) con reparse points de OneDrive impidiendo borrado.
- **Resolución:** OneDrive detenido + scheduled task `ResumeOneDrive_8h` para reanudar a las 22:07. Pasos: robocopy $empty /MIR sobre cada dir → Remove-Item del árbol de trabajo → `attrib -r -s -h /s /d` + `cmd rmdir /s /q` sobre metadata en `.git/worktrees/<n>` (reparse points de OneDrive) → Remove-Item del dir padre `.git/worktrees/` (ya vacío). `git worktree list` solo devuelve el main.
- **Referencias:** `memory/project_worktrees_onedrive_cleanup.md`

### BL-007 — Decisión: runner CI propio (local vs AWS EC2 vs Spot)

- **Estado:** 🟡 En discusión con jefe
- **Prioridad:** P2
- **Tipo:** Decisión
- **Contexto:** Debate abierto entre Docker Desktop local (gratis, SPOF), AWS EC2 on-demand (~$10/mes), Spot Autoscaler (~$2-10/mes) y optimizar solo YAML.
- **Próxima acción:** Pausado hasta fin de mes. Revisar con equipo + jefe en nueva sesión.
- **Referencias:** Brief ejecutivo + matriz comparativa en conversación 2026-04-20.

### BL-008 — TIER 4.A v2: precondición tolerante a API-fail para TC07/TC09

- **Estado:** 🔴 Pendiente (MR !36 revertido por regresión)
- **Prioridad:** P3
- **Tipo:** Mejora
- **Contexto:** MR !36 falló porque `validateCardPrecondition` devuelve defaults cuando no encuentra al pasajero vía API, y el check nuevo disparaba throw engañoso.
- **Próxima acción:** Reimplementar con guard: solo fallar si el helper confirmó API exitosa y `!hasRequiredCard`. En otro caso, solo `debugLog` warning.
- **Referencias:** MR !39 (revert), MR !40 (TIER 5 aplicado para TC07 vía endpoint DELETE — puede hacer esto obsoleto).

### BL-009 — Poblar `tests/fixtures/users/`

- **Estado:** 🔴 Pendiente (diferido)
- **Prioridad:** P3
- **Tipo:** Deuda técnica / organización
- **Contexto:** Usuarios dispersos hardcoded en specs/fixtures. Centralizarlos como SoT — complementa `fixtures/stripe/` y `fixtures/users/passengers.ts` ya existente.
- **Próxima acción:** Auditar dispatcher, colaborador, empresa, appPax; extraer a `tests/fixtures/users/` con re-exports desde legacy paths.
- **Referencias:** `docs/ARCHITECTURE.md` §4 "Dónde agregar data nueva"

### BL-010 — Mobile Appium Pattern 2 consolidation

- **Estado:** 🔴 Pendiente (diferido TIER 5+)
- **Prioridad:** P3
- **Tipo:** Arquitectura
- **Contexto:** `tests/mobile/appium/{driver,passenger}/` puede reorganizarse a `tests/mobile/appium/android/{driver,passenger}/` para futuro iOS.
- **Próxima acción:** Evaluar cuando se active trabajo Appium.
- **Referencias:** `docs/ARCHITECTURE.md` §2 Eje 2

### BL-011 — Migrar auth specs a feature-first (`specs/web/`)

- **Estado:** 🔴 Pendiente (diferido)
- **Prioridad:** P3
- **Tipo:** Arquitectura
- **Contexto:** `tests/features/auth/specs/**` podría seguir el patrón `web/` como gateway-pg.
- **Próxima acción:** Evaluar si el valor justifica el movimiento de archivos. Bajo impacto real hoy.

### BL-012 — 27 `waitForTimeout` conservados con `NOTE(tier3-kept)`

- **Estado:** 🔴 Pendiente (revisión continua)
- **Prioridad:** P3
- **Tipo:** Deuda técnica
- **Contexto:** 27 ocurrencias en `tests/pages/` quedaron con `NOTE(tier3-kept)` porque no tienen señal observable (debounce Angular, estabilización Stripe). Revisar periódicamente si aparecen eventos/APIs que permitan eliminarlos.
- **Próxima acción:** Revisión trimestral de cada NOTE.
- **Referencias:** `docs/reports/WAITFORTIMEOUT-MIGRATION.md`

### BL-013 — Refactor `dataGenerator.ts` — mover lógica Stripe residual

- **Estado:** 🔴 Pendiente
- **Prioridad:** P3
- **Tipo:** Deuda técnica
- **Contexto:** Posible lógica Stripe residual en `tests/shared/utils/dataGenerator.ts` que debería vivir en `fixtures/stripe/`.
- **Próxima acción:** Auditar exports y mover si aplica.
- **Referencias:** MR !29 (TIER 2.1)

### BL-014 — Aplicar templates YAML optimizados cuando vuelva cupo CI

- **Estado:** 🔴 Pendiente (bloqueado por cupo CI agotado, ver BL-004)
- **Prioridad:** P2
- **Tipo:** Mejora CI
- **Reportado:** 2026-04-20
- **Contexto:** Los templates YAML optimizados (concurrency, paths-ignore, cache multi-capa, quick-checks fail-fast, timeout 30 min) existen en `.claude/skills/magiis-ci-efficiency/assets/templates/`. Aplicarlos al repo ahora tiene riesgo alto porque sin cupo CI no se puede validar que no rompan el pipeline existente. Diferido hasta que GitLab resetee (1 de mayo) o se active runner propio.
- **Próxima acción:**
  1. Esperar que vuelva cupo CI (reset mensual o runner propio operativo).
  2. PR `chore/ci-optimize-github-actions` copiando `assets/templates/github-actions-playwright-optimized.yml` → `.github/workflows/playwright.yml`.
  3. PR análogo para `.gitlab-ci.yml` con el template GitLab.
  4. Validar pipeline post-aplicación (duración esperada: 13 min → 7-8 min).
  5. Actualizar métricas baseline en `docs/ci/CI-USAGE-GUIDELINES.md`.
- **Referencias:**
  - `.claude/skills/magiis-ci-efficiency/assets/templates/`
  - `docs/ci/CI-USAGE-GUIDELINES.md` (guía de equipo, ya en main)
  - BL-004 (cupo CI agotado), BL-005 (propuesta original pre-cupo)

---

## Resuelto recientemente (últimos 30 días)

### BL-RES-001 — Consolidación TIER 1-5 (14 MRs + 1 revert)

- **Estado:** 🟢 Hecho (2026-04-19 a 2026-04-20)
- **Resolución:** 10 MRs mergeados en TIER 1-3, 4 en TIER 4, 1 en TIER 5. Cleanup legacy, feature-first, helpers transversales, ESLint guardrails, TC14 estabilización, TC1096 reset colaborador.
- **Referencias:** MR !25-!40, `docs/gateway-pg/stripe/CHANGELOG.md`, `docs/reports/README.md`

### BL-RES-002 — Worktrees OneDrive TIER 1 (bdd, scenarios)

- **Estado:** 🟢 Hecho (2026-04-20)
- **Resolución:** Borrados físicamente con robocopy + OneDrive pause + VS Code cerrado + prune `.git/worktrees/`.
- **Referencias:** `memory/project_worktrees_onedrive_cleanup.md`

### BL-RES-004 — Worktrees OneDrive TIER 4+5 (tc0709, tc14, docs, legacy3ds, collab-reset)

- **Estado:** 🟢 Hecho (2026-04-20)
- **Resolución:** Mismo patrón de BL-RES-002 + clave adicional: los contenidos de `.git/worktrees/<n>/` (logs, refs, ORIG_HEAD) tenían atributo ReparsePoint de OneDrive y fallaban con Permission denied. Se resolvió con `attrib -r -s -h /s /d` + `cmd rmdir /s /q` (no sigue reparse points, a diferencia de Remove-Item).
- **Referencias:** BL-006, `memory/project_worktrees_onedrive_cleanup.md`

### BL-RES-003 — EXTERNAL-BLOCKERS.md diagnóstico corregido

- **Estado:** 🟢 Hecho (2026-04-20, MR !40)
- **Resolución:** Eliminada mención errónea a "límite diario" en TC1081. Agregadas secciones TC1096 y TC1111 con diagnóstico real. Tabla de estado actualizada.

---

## Archivo (cerrado, >30 días)

*Vacío por ahora — los ítems se movieron acá cuando superen 30 días desde su cierre.*

---

## Plantilla para nuevos ítems

```markdown
### BL-NNN — Título corto

- **Estado:** 🔴 Pendiente
- **Prioridad:** P1 / P2 / P3
- **Tipo:** Bug / Mejora / Infra / Deuda técnica / Decisión / Validación / Configuración
- **Reportado:** YYYY-MM-DD
- **Contexto:** 1-2 párrafos explicando el problema/tarea
- **Próxima acción:** Lo más concreto posible. Si tiene owner, mencionarlo.
- **Referencias:** MRs, PRs, reportes, TCs, memorias globales
```
