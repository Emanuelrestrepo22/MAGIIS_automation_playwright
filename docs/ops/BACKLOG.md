# Backlog operacional — magiis-playwright

> Fuente única de verdad para tareas pendientes, decisiones en espera y deuda técnica activa.
> **Regla:** toda sesión de trabajo debe arrancar validando este documento. Si un ítem aparece aquí como pendiente pero ya fue resuelto por otra vía, actualizar su estado en lugar de duplicarlo.

**Última revisión:** 2026-04-20 (Erika + Claude — post PR #12 cerrado por conflict: detectado BL-023 🔴 — github/main y gitlab/main divergentes. MR GitLab sigue viable para `integration/pre-main`. Previo en misma fecha: BL-002 🟡, BL-008 🟡, BL-013 🟢 + ronda 2 agencia: BL-009/BL-012/BL-021)

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

### BL-001 — ~~Habilitar "Cargo a Bordo" para AppPax en backend TEST~~ — FALSA ALARMA

- **Estado:** 🟢 Resuelto (2026-04-20 — falsa alarma, era bug de automation)
- **Prioridad:** P1
- **Tipo:** Configuración de ambiente (acción humana) → reclasificado como bug de automation
- **Reportado:** 2026-04-19
- **Resolución:** Root cause real: el spec asumía redirect a `/travels/:id` post-submit, pero el comportamiento normal del producto es quedarse en `/travel/create?limitExceeded=false` con el viaje igualmente creado. El guard `Promise.race` interpretaba ese query param como error. Fix: migración de 11 specs Cargo a Bordo (apppax/contractor/empresa × happy/3ds/antifraud/declines) a network interception del `POST /travels` usando `captureCreatedTravelId` + patrón de validación post-alta ya probado en `SMOKE-GW-TC04`. **Regla de negocio confirmada:** tipo "Regular" es ilimitado por diseño, Cargo a Bordo no usa tarjeta en carrier (cobro en Driver App), los toggles de limitación son solo para colaboradores (TC1096). No se requiere intervención backend.
- **Evidencia:** Recorder `tests/test-4.spec.ts` reproduce el mismo flow manual con idéntica URL final. Run focalizado TC1081 PASS 1.9m.
- **Referencias:**
  - GitHub PR #10 → commit `26766de` (squash merge en github/main)
  - GitLab MR !49 → replica del fix en GitLab
  - `docs/gateway-pg/stripe/EXTERNAL-BLOCKERS.md` §TC1081 → estado 🟢
  - `docs/reports/TC1081-FLAKINESS-DIAGNOSIS.md` (diagnóstico original identificó guard como misleading)

### BL-002 — Root cause TC1033 auth intermitente

- **Estado:** 🟡 Instrumentación aplicada — pendiente primera corrida CI para clasificar falla
- **Prioridad:** P2
- **Tipo:** Investigación
- **Reportado:** 2026-04-19
- **Contexto:** Falla intermitente en login dispatcher al inicio de TC05. `retry(1)` enmascara el síntoma pero no resuelve la raíz.
- **Avance 2026-04-20:** hallazgo de arquitectura — el smoke corre `--project=chromium` y NO consume el storageState preautenticado del `global-setup.multi-role.ts`. Cada test del smoke hace `loginAsDispatcher` completo (clearCookies + re-goto + login + ensureDashboardLoaded). Instrumenté `loginAsDispatcher` y `loginAsContractor` con `runLoginPhase` para taggear la fase exacta que falla (`[login:goto]`, `[login:submit]`, `[login:dashboard]`) y emitir duración vía `debugLog('auth', ...)`. Sin cambio de control flow ni de timeouts.
- **Próxima acción:** primera corrida CI post-instrumentación → clasificar el bucket dominante de falla → aplicar fix focalizado según qué fase domine. Sin cupo CI activo esperar reset 1 mayo o usar GitHub Actions.
- **Referencias:**
  - `tests/features/gateway-pg/fixtures/gateway.fixtures.ts` (instrumentación)
  - `docs/reports/TC1033-MITIGATION.md` (§ "Hallazgo de arquitectura 2026-04-20")
  - MR !31 (retry aplicado)

### BL-003 — Validar empíricamente TC09 (Marcelle) y TC04 (AppPax)

- **Estado:** 🟢 Hecho (2026-04-20 — smoke local verde tras fix TC1111)
- **Prioridad:** P3
- **Tipo:** Validación
- **Resolución:**
  - **TC1081 (TC04 — AppPax Cargo a Bordo):** ✅ PASS sin modificaciones. 34.2s. Viaje creado visible en grilla por nombre del pasajero (appPax = cliente).
  - **TC1111 (TC09 — Empresa Cargo a Bordo):** ❌ FAIL inicial por assertion errónea. **Root cause:** para empresa individuo (Marcelle), la grilla de gestión muestra al cliente titular como pasajero en formato `apellido, nombre` (ej: `Stripe, Marcelle`), NO al sub-passenger seleccionado en el formulario. El spec buscaba por `TEST_DATA.passenger` (`Emanuel Restrepo`) que no aparece en la grilla.
  - **Fix aplicado:** `expectPassengerInPorAsignar(TEST_DATA.client, ...)` en TC1111 + título actualizado a "alta de viaje exitosa" (alineado con la regla de negocio BL-022: Cargo a Bordo no valida tarjeta desde web). Evidencia: 2 passed (2.3m) local ENV=test.
- **Impacto cross-test:** la misma lógica debe revisarse en otros TCs de empresa-individuo que usen `expectPassengerInPorAsignar`. TC08 (TS-STRIPE-TC1068) también usa cliente empresa — validar en próxima run completa.
- **Referencias:** `tests/features/smoke/specs/gateway-pg.smoke.spec.ts` líneas 546-600, EXTERNAL-BLOCKERS.md §TC1081 / §TC1111

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

- **Estado:** 🟢 Hecho (2026-04-20 — via GitHub PR #11)
- **Prioridad:** P2
- **Tipo:** Mejora CI
- **Reportado:** 2026-04-20
- **Resolución:** GitHub PR #11 `chore/ci-quality-gates-foundation` mergeado (commit `e85befd`). Trae al repo GitHub toda la infraestructura Quality Gates ya aplicada en GitLab: workflow `playwright.yml` con concurrency cancel-in-progress, paths-ignore (docs/.claude/.md), cache multi-capa (node_modules + playwright browsers), job `quick-checks` fail-fast (tsc+lint), timeout 30min, artifacts retention 3/7/30, `workflow_dispatch` con inputs `test_filter` y `headed`. También: husky 9.1.7 + commitlint 20.5.0, ritual `pnpm pp` (10 checks <30s), CODEOWNERS, docs/ci/CI-USAGE-GUIDELINES.md. Runs #52 y #55 ya pasaron post-merge.
- **Referencias:** GitHub PR #11 → commit `e85befd`, `.github/workflows/playwright.yml`, `docs/ci/CI-USAGE-GUIDELINES.md`

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

- **Estado:** 🟡 Guard `apiResolved` aplicado — falta migrar consumers para usar el nuevo campo cuando sea necesario
- **Prioridad:** P3
- **Tipo:** Mejora
- **Contexto:** MR !36 falló porque `validateCardPrecondition` devolvía defaults cuando la API fallaba, y el check nuevo disparaba throw engañoso sin poder distinguir "API cayó" vs "API ok pero no hay tarjeta".
- **Avance 2026-04-20:** agregué campo `apiResolved: boolean` al `CardPreconditionResult` (aditivo, no rompe consumers). Se setea `false` cuando falla `getPassengerId` o `getPassengerCards`, `true` solo si la cadena API completó. El try/catch del segundo endpoint (paymentMethodsByPax) ahora también atrapa fallos en vez de lanzar. Guía de uso en el JSDoc del helper.
- **Próxima acción:** cuando se reabra el trabajo en TC07/TC09 (cargo-a-bordo / hold), el consumer puede hacer `if (result.apiResolved && !result.hasRequiredCard) throw ...`. No hay migración masiva pendiente — el campo es opt-in.
- **Referencias:**
  - `tests/features/gateway-pg/helpers/card-precondition.ts` (JSDoc §"BL-008 — Guard tolerante a API-fail")
  - MR !39 (revert), MR !40 (TIER 5 para TC07 vía endpoint DELETE — puede hacer esto obsoleto).

### BL-009 — Poblar `tests/fixtures/users/`

- **Estado:** 🟡 Fase 2 implementada (2026-04-20) — Fase 1/3/4 pendientes
- **Prioridad:** P2 (elevada desde P3 por hallazgo crítico credenciales PROD)
- **Tipo:** Deuda técnica / organización + Seguridad
- **Contexto:** Usuarios dispersos hardcoded en specs/fixtures. Centralizarlos como SoT — complementa `fixtures/stripe/` y `fixtures/users/passengers.ts` ya existente.
- **Auditoría (2026-04-20):** 10 puntos de dispersión detectados. Patrón canónico válido en `passengers.ts` pero sin credenciales ni mobile roles. 3 puntos de entrada de resolución: `runtime.ts`, `gatewayPortalRuntime.ts`, `gateway.fixtures.ts`.
- **🚨 Hallazgo crítico:** `.env.prod` trackeado en git con `USER_CARRIER` y (probablemente) `PASS_CARRIER` en claro → rotación de credenciales + `.env.prod.local` ignorado. **Acción urgente antes de cualquier PR/merge.**
- **Plan de ejecución (4 fases):**
  1. **🔴 Emergencia creds** (pendiente acción humana): mover `.env.prod` → `.env.prod.local` (gitignored) + rotar `PASS_CARRIER_PROD` + audit git history.
  2. **🟢 SoT build** (commit `90b7da7`, 2026-04-20): creados `tests/fixtures/users/{types.ts, internal/env-resolver.ts, web-portals/{dispatcher,contractor-collaborator}.ts, mobile/{driver,passenger}.ts, index.ts, README.md}`. Getters lazy de email/password via `process.env.*` con fallback sufijo env (USER_CARRIER_TEST → USER_CARRIER). `tsc --noEmit` OK.
  3. **🔴 Adopción gradual**: migrar `runtime.ts` + `gatewayPortalRuntime.ts` + `gateway.fixtures.ts` + mobile scripts a los fixtures nuevos (consumers de los legacy intactos).
  4. **🔴 Legacy cleanup**: deprecar `features/gateway-pg/data/passengers.ts`, quitar hardcoding en `travel-cleanup.ts` (`DEFAULT_CARRIER_USER_ID = '6715'`) y mobile harness.
- **Próxima acción:** Fase 1 requiere rotación humana coordinada con infra. Fase 3 es el siguiente paso técnico ejecutable (adoptar los fixtures nuevos en los 3 puntos de entrada).
- **Referencias:** commit `90b7da7`, `tests/fixtures/users/README.md`, `docs/ARCHITECTURE.md` §4 "Dónde agregar data nueva"

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

### BL-012 — `waitForTimeout` conservados con `NOTE(tier3-kept)` — conteo real 30 (+3 vs 27)

- **Estado:** 🟡 Fase 1 contractor completa (2026-04-20) — Fase 1 carrier + bloqueo Stripe pendientes
- **Prioridad:** P3
- **Tipo:** Deuda técnica
- **Contexto:** 30 ocurrencias actuales (3 adicionales vs 27 documentados en WAITFORTIMEOUT-MIGRATION.md; probable causa: refactors post-TIER3.2 en loops submit/vehicle carrier `NewTravelPageBase.ts:805, 815`).
- **Clasificación (auditoría 2026-04-20):**
  - **Cat A (eliminable hoy sin cambios):** 0 ocurrencias.
  - **Cat B (instrumentable):** 12 ocurrencias — debounce autocomplete (6) + post-click re-render (6). **Feasibility piloto validada: Opción A Playwright puro sin tocar frontend** — `expect.poll` sobre `.count()` de opciones + `expect.not.toBeVisible` sobre `.placeholder`.
  - **Cat C (conservar legítimo — Stripe + loops con condición compuesta):** 18 ocurrencias — incluye los 4 críticos (`97, 107, 657, 908` del carrier/NewTravelPageBase + ThreeDSModal).
- **Distribución por archivo:** `ThreeDSModal.ts` 5 (todos C) · `contractor/NewTravelPage.ts` 5 (**todos migrados 🟢**) · `carrier/NewTravelPageBase.ts` 20 (7 B + 13 C).
- **Plan priorizado — estimación real tras piloto:**
  1. **🟢 Fase 1 contractor** (commit `1a3de3f`, 2026-04-20): 5 `waitForTimeout` (líneas 159, 164, 185, 189, 204) migrados a `expect.poll` / `expect.not.toBeVisible` via helpers `waitForAutocompleteOptionsReady` + `waitForPlaceFieldSelected`. Esfuerzo real: ~30 min vs estimación original 8-10h.
  2. **🔴 Fase 1 carrier** (3-4h, aplicable misma técnica): 9 casos Cat B en `carrier/NewTravelPageBase.ts` líneas 238, 327, 346, 355, 362, 377, 382, 389 + ajustes en 759, 883. Patrón idéntico al contractor.
  3. **🔴 Bloqueo Stripe** (Opción B, requiere coordinación backend): 4 casos críticos (ThreeDSModal 97/107 + NewTravelPageBase 657/908). Sin señal DOM observable; requiere webhook/backend instrumentado para eliminar.
- **Métrica actualizada:** 5/30 migrados (17%). Queda ~12 Cat B + 13 Cat C conservables por diseño.
- **Próxima acción:** aplicar Fase 1 carrier en otra sesión dedicada (3-4h); medir tiempos reales en CI para ajustar timeouts conservadores si son excesivos.
- **Referencias:** commit `1a3de3f`, `docs/reports/WAITFORTIMEOUT-MIGRATION.md`, auditoría 2026-04-20

### BL-013 — Refactor `dataGenerator.ts` — mover lógica Stripe residual

- **Estado:** 🟢 Hecho (2026-04-20) — confirmado que no hay lógica Stripe que mover
- **Prioridad:** P3
- **Tipo:** Deuda técnica
- **Resolución:** auditoría del módulo. `dataGenerator.ts` sólo contiene helpers de auth (emails/passwords random con faker). No hay generadores Stripe allí. El TODO histórico "mover faker bruto de stripe-cards.ts → aquí" fue descartado porque contradice la regla canónica del proyecto: **la respuesta esperada de un test de gateway la determina el número de la tarjeta** (`4242` aprobado, `9235` falla 3DS, etc.), no data aleatoria. Las tarjetas son SoT fija en `tests/fixtures/stripe/cards.ts` + `card-policy.ts`; los campos auxiliares (holderName, zip) son inertes al outcome y pueden quedar random sin impacto. Apliqué: `console.log` → `debugLog('datagen', ...)`, removí los TODOs obsoletos, docblock explícito sobre el alcance del módulo, nueva sección "Regla canónica" en `tests/fixtures/stripe/README.md`.
- **Referencias:**
  - `tests/shared/utils/dataGenerator.ts` (docblock actualizado)
  - `tests/fixtures/stripe/README.md` (§"Regla canónica — la respuesta la define el número de tarjeta")
  - MR !29 (TIER 2.1)

### BL-014a — Aplicar template GitHub Actions optimizado ✅

- **Estado:** 🟢 Hecho (2026-04-20 — acelerado, cupo GitHub disponible)
- **Prioridad:** P2
- **Tipo:** Mejora CI
- **Reportado:** 2026-04-20
- **Resolución:** `.github/workflows/playwright.yml` reemplazado por template optimizado: concurrency group con cancel-in-progress, paths-ignore (docs/.claude/.md), cache multi-capa (node_modules + playwright browsers), quick-checks fail-fast (tsc+lint antes de e2e), timeout 30 min por job, artifacts retention 3/7/30 según tipo, workflow_dispatch con inputs útiles (test_filter, headed).
- **Impacto esperado:** duración efectiva 13 min → 7-8 min cuando cache está caliente. Cero pipelines docs-only.
- **Validación:** el próximo push al repo dispara el workflow optimizado en GitHub Actions (cupo disponible).
- **Referencias:** `.claude/skills/magiis-ci-efficiency/assets/templates/github-actions-playwright-optimized.yml`

### BL-014b — Aplicar template GitLab CI optimizado (pendiente cupo)

- **Estado:** 🔴 Pendiente (bloqueado por cupo CI GitLab agotado, ver BL-004)
- **Prioridad:** P2
- **Tipo:** Mejora CI
- **Reportado:** 2026-04-20
- **Contexto:** Template `gitlab-ci-playwright-optimized.yml` listo para aplicar. Sin cupo CI no se puede validar post-aplicación.
- **Próxima acción:** tras reset del cupo GitLab (1 de mayo) o activación de runner propio, copiar `assets/templates/gitlab-ci-playwright-optimized.yml` → `.gitlab-ci.yml` y validar pipeline.
- **Referencias:** `.claude/skills/magiis-ci-efficiency/assets/templates/gitlab-ci-playwright-optimized.yml`, BL-004

### BL-015 — Evaluar activar hook husky pre-push

- **Estado:** 🟢 Hecho (2026-04-20 — acelerado via MR Fases 3-5)
- **Prioridad:** P2
- **Tipo:** Mejora CI
- **Reportado:** 2026-04-20
- **Resolución:** Husky instalado, `.husky/pre-push` invocando `pnpm pp`. Escape `SKIP_HOOKS=true`. Hook `commit-msg` con commitlint activado. `prepare` script instala automáticamente con `pnpm install`.
- **Referencias:** `docs/ops/CI-GATES-IMPLEMENTATION-PLAN.md` §Fase 3, BL-016

### BL-016 — Implementación plan Quality Gates progresivos

- **Estado:** 🟡 Fases 3-4 completadas, Fase 5 parcial (branch protection pendiente trigger)
- **Prioridad:** P2
- **Tipo:** Mejora CI
- **Reportado:** 2026-04-20
- **Contexto:** Plan de 5 fases acelerado. Fases 0, 1, 3 y 4 completadas 2026-04-20. Fase 5: CODEOWNERS creado, branch protection documentada en `docs/ci/BRANCH-PROTECTION-SETTINGS.md`, activación manual pendiente (trigger: equipo ≥2 devs).
- **Próxima acción:** Activar branch protection settings (UI) cuando se sume primer dev adicional. Ver BL-017.
- **Referencias:** `docs/ops/CI-GATES-IMPLEMENTATION-PLAN.md` (plan completo), `scripts/ci/pre-push.mjs`, `docs/ci/CI-USAGE-GUIDELINES.md`

### BL-017a — Branch protection settings seguros ✅

- **Estado:** 🟢 Hecho (2026-04-20 — acelerado, settings sin requirement de otro dev)
- **Prioridad:** P3
- **Tipo:** Configuración
- **Reportado:** 2026-04-20
- **Resolución:** Activados via GitLab API lo aplicable sin equipo ≥2:
  - `only_allow_merge_if_all_discussions_are_resolved: true` — obligatorio resolver threads
  - `remove_source_branch_after_merge: true` — cleanup automático
  - Protected branch main: `allow_force_push: false` (ya estaba)
  - Protected branch main: push/merge access = Maintainers (ya estaba)
- **No activado (peligro auto-bloqueo):** `only_allow_merge_if_pipeline_succeeds` → bloqueado por cupo CI agotado (sin pipelines, nada mergearía). Activar cuando vuelva el cupo.
- **Referencias:** `docs/ci/BRANCH-PROTECTION-SETTINGS.md`

### BL-017b — Branch protection estricta (pendiente equipo/cupo)

- **Estado:** 🔴 Pendiente (trigger dual: equipo ≥2 + cupo CI disponible)
- **Prioridad:** P3
- **Tipo:** Configuración
- **Reportado:** 2026-04-20
- **Contexto:** Settings que requieren triggers externos:
  - `only_allow_merge_if_pipeline_succeeds` → espera reset cupo CI (1 mayo) o runner propio
  - `approvals_before_merge ≥ 1` → espera equipo ≥ 2 devs
  - `Require code owner approval` → idem
  - GitHub Settings → Branches → main rule → status checks required → espera cupo CI
- **Próxima acción:** activar según corresponda cada trigger. Comandos listos en `docs/ci/BRANCH-PROTECTION-SETTINGS.md`.
- **Referencias:** `docs/ci/BRANCH-PROTECTION-SETTINGS.md` §"Cómo re-aplicar via GitLab API"

### BL-018 — Completar script weekly-ci-report.mjs

- **Estado:** 🟢 Hecho (2026-04-20, acelerado)
- **Prioridad:** P3
- **Tipo:** Mejora
- **Reportado:** 2026-04-20
- **Resolución:** `scripts/ci/weekly-ci-report.mjs` implementado con parser completo para GitLab y GitHub API. Soporta `--platform`, `--days`, `--output=file`. Genera reporte markdown con métricas ejecutivas (success rate, duration p50/p95, consumo proyectado), breakdown por status y branch, top 5 pipelines más lentos, y observaciones automatizadas con umbrales. Primera corrida real con data 30d reveló success rate 41% (22 fallos) — input útil para retro.
- **Output:** `docs/reports/CI-WEEKLY-<date>.md` generado correctamente. Primer reporte: `docs/reports/CI-WEEKLY-2026-04-20.md`.
- **Próxima acción:** opcional — schedulear corrida semanal (cron / GitHub Actions scheduled). Ejecutar manualmente `pnpm ci:report` antes de retros.
- **Referencias:** `scripts/ci/weekly-ci-report.mjs`

### BL-019 — Integrar gitleaks al hook pre-push

- **Estado:** ⚫ Cancelado (2026-04-20) — ROI marginal vs capas existentes
- **Prioridad:** P3
- **Tipo:** Mejora seguridad
- **Reportado:** 2026-04-20
- **Contexto original:** Gitleaks es un scanner de secrets más robusto que el check 4 grep. Instalación manual documentada en `docs/ci/CI-USAGE-GUIDELINES.md` sección "Secrets scanning". El script `pre-push.mjs` ya contempla un check 11 opcional que solo corre si gitleaks está en PATH.
- **Razón de cancelación:** El perímetro de secrets del proyecto está definido por política empresa:
  - Zero secret keys de producción en el repo (Stripe real, AWS, tokens externos) — prohibido por ley
  - Todas las credenciales sensibles viven en `.env` local (gitignored)
  - CI usa Masked + Protected variables (GitLab) / Secrets (GitHub)
  - 3 capas ya cubren los casos realistas: check 4 (patrones hardcoded) + check 5 (.env staged) + GitHub automatic secret scanning
  - gitleaks agregaría ceremonia con falsos positivos probables (IDs, hashes, card numbers test Stripe) sin beneficio proporcional
- **Triggers de reactivación** (re-abrir como 🔴 si aparecen):
  - Se agrega integración con API externa que requiera secret keys reales en runtime (Stripe SDK con webhook secret, AWS SDK, Sentry/Datadog tokens)
  - Se suma dev nuevo y se detecta al menos 1 near-miss de leak
  - Cambia la política empresa sobre manejo de secrets
  - Aparece necesidad de compliance/audit que lo exija
- **Infrastructure ya lista si se reactiva:** check 11 del script existe, doc de instalación en guidelines. Tiempo de reactivación: ~15 min instalación + eventual `.gitleaks.toml` para falsos positivos.
- **Referencias:** `docs/ci/CI-USAGE-GUIDELINES.md` sección "Secrets scanning", conversación de decisión 2026-04-20

### BL-020 — Consolidar recordings codegen en specs productivos

- **Estado:** 🔴 Pendiente (baja prioridad, housekeeping)
- **Prioridad:** P3
- **Tipo:** Deuda técnica
- **Reportado:** 2026-04-20
- **Contexto:** 7 recordings movidos a `tests/recordings/` (antes `tests/test-{5,7,8,9,10,18}.spec.ts` + `test-4`). Capturaron flows reales de Cargo a Bordo y Preautorizada+3DS vía `npx playwright codegen`. Los flows tienen specs productivos equivalentes en `tests/features/gateway-pg/specs/stripe/web/carrier/`, pero los recordings son útiles como referencia de selectores reales + debugging de cambios del DOM.
- **Próxima acción:**
  1. Revisión trimestral — si un recording no se consulta en 90 días → eliminar (queda en git history).
  2. Si durante refactor de un POM se detecta pérdida de selectores útiles → extraer al POM y eliminar el recording.
  3. Máximo 10-12 recordings vivos; si crece más → consolidar o archivar.
- **Referencias:** `tests/recordings/README.md`, MR de cleanup TIER 1 codegens

### BL-021 — TC1011 — Alta de viaje AppPax con tarjeta Preautorizada (Hold) + Cobro en App Driver (Appium)

- **Estado:** 🟡 Draft trazable completo (2026-04-20) — implementación funcional pendiente sesión Appium
- **Prioridad:** P2
- **Tipo:** Automatización nueva (E2E híbrido Playwright + Appium)
- **Reportado:** 2026-04-20
- **Contexto:** TS-STRIPE-TC1011 — "Validar Alta de Viaje desde app pax para usuario personal con Tarjeta Preautorizada — Hold desde Alta de Viaje y Cobro desde App Driver". Todo el flujo vive en mobile: alta desde App Pax (con hold Stripe) + cobro desde App Driver. No hay fase web.
- **Avance 2026-04-20 (commit `94bb3bc`):** draft completo en `docs/test-cases/mobile/TC1011-DRAFT.md` (12 secciones: identidad, precondiciones, flujo canónico por fases, gap analysis, selectores conocidos vs TODO, handoff contract, riesgos, trazabilidad).
- **Gap identificado:**
  - **Passenger (Fase A):** sin gaps críticos. Screens + selectores validados en `TC-PAX-HOLD-STEPS.md`. Falta formalizar `PassengerTripStatusScreen`.
  - **Driver (Fase B):** sin gap estructural. Checkpoints en `DriverFlowSelectors.ts` + `DriverTripHappyPathHarness`. Requieren validación live contra Driver App actual.
  - **Orquestación (Fase A↔B):** GAP CRÍTICO — `JourneyBridge.buildJourneyId()` hardcodea prefijo `flow1-*` y `initJourneyContext()` asume `flowType='carrier-web-driver-app'`. Ambos requieren parametrización antes de soportar TC1011.
- **Estimación implementación funcional:** 3.5-4 días-persona. Bloquea: dispositivo/emulador dual (passenger+driver APKs) + Appium server activo + validación selectores Driver live.
- **Decisión tomada:** NO crear spec propio `flow1-appPax-*` (violaría taxonomía MAGIIS). Agregar `test.describe('[TS-STRIPE-TC1011]')` dentro del `flow2-passenger-driver/flow2.e2e.spec.ts` existente cuando se active sesión Appium.
- **Próxima acción:** activar sesión Appium dedicada → extender `JourneyBridge` con `flowType` parametrizable → implementar spec TC1011 dentro de flow2 → validación E2E.
- **Referencias:** commit `94bb3bc`, `docs/test-cases/mobile/TC1011-DRAFT.md`, `memory/project_pax_hold_steps.md`, CLAUDE.md §Flujos E2E híbridos Flow 2

### BL-023 — Sincronizar github/main con gitlab/main (remotes divergentes)

- **Estado:** 🟡 Fases 2-4-6 aplicadas local (pre-push bloqueante + .gitattributes + MERGE-POLICY.md + ci:sync-check). Fase 1 (activar mirror en UI GitLab) pendiente acción humana. Fase 0b reducida: solo 6 test-N recordings obsoletos en GitHub, no rescate necesario.
- **Prioridad:** P2
- **Tipo:** Infraestructura / deuda técnica
- **Reportado:** 2026-04-20
- **Contexto:** Los dos remotes del proyecto (`github` y `gitlab`) tienen historiales fuertemente divergentes. Al abrir PR #12 (`integration/pre-main` → `github/main`) se detectaron conflictos porque:
  - `github/main` tiene 38 commits ausentes en `integration/pre-main` (PRs #8, #10, #11 y 35 commits previos de la rama GitHub)
  - `gitlab/main` tiene ~100 commits ausentes en `github/main` (toda la cadena TIER 1-5, BL-014-020, feature-first)
  - Ambos comparten raíz histórica pero llevan meses sin sync bidireccional
- **Impacto:** cualquier rama basada en `gitlab/main` genera conflict masivo al intentar PR a GitHub. Actualmente PRs se abren en uno u otro remote, nunca en ambos sin esfuerzo manual.
- **Workaround aplicado 2026-04-20:** `integration/pre-main` se mergeó solo vía MR a `gitlab/main` (donde fue la base). PR #12 en GitHub queda cerrado con referencia a este BL.
- **Próxima acción (opciones a evaluar con equipo + jefe):**
  1. **Unificar un remote como canonical** y deprecar el otro (recomendado GitLab porque tiene el historial más completo).
  2. **Merge forzado bidireccional** — traer `gitlab/main` a `github/main` con merge commit gigante explicativo. Una vez igualados, mantener sync via `git push github main && git push gitlab main` en cada release.
  3. **Mirror automático** — configurar GitLab mirror push a GitHub (feature nativa GitLab) para que `gitlab/main` se replique automático.
- **Bloqueantes:** decisión estratégica del equipo. No es urgente mientras se trabaje solo en GitLab.
- **Referencias:**
  - PR GitHub #12 (cerrado por este motivo)
  - Diagnóstico completo: `git log integration/pre-main..github/main` muestra los 38 commits ausentes

### BL-022 — Regla de negocio: Cargo a Bordo no valida tarjeta desde Carrier/Contractor web

- **Estado:** 🟢 Documentada (2026-04-20)
- **Prioridad:** P2
- **Tipo:** Documentación de regla de negocio
- **Reportado:** 2026-04-20
- **Contexto:** Aprendizaje confirmado por PO durante sesión TC1111:
  - **Cargo a Bordo (Carrier/Contractor web)** — NO valida tarjeta desde el portal web. La validación y gestión de tarjeta ocurre en la **App Driver**. Desde el portal web solo se valida el alta exitosa del viaje (creación + aparición en grilla).
  - **Tarjetas vinculadas previamente + Tarjetas Preautorizadas** — SÍ se validan desde los portales web (Stripe hold, 3DS, declinaciones, etc.).
- **Impacto en smokes/specs:**
  - Todo spec `@cargo-a-bordo` debe verificar solo alta exitosa (viaje en grilla + sin modal 3DS esperado).
  - No verificar estado de pago, declinaciones de tarjeta, ni 3DS en Cargo a Bordo desde Carrier/Contractor. Aplica a TC1081 (TC04), TC1101, TC1111 (TC09) y futuros.
  - Para empresa individuo: la grilla de gestión muestra al cliente titular como pasajero (formato `apellido, nombre`), no al sub-passenger del formulario.
- **Próxima acción:** actualizar `CLAUDE.md` §"Glosario de dominio MAGIIS" o crear `docs/domain/cargo-a-bordo-rule.md` si crece el volumen de tests del feature. Por ahora la regla vive en comentarios del spec smoke.
- **Referencias:** commit fix TC1111 (2026-04-20), mensaje del PO en sesión 2026-04-20

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
