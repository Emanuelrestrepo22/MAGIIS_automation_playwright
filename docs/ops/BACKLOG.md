# Backlog operacional — magiis-playwright

> Fuente única de verdad para tareas pendientes, decisiones en espera y deuda técnica activa.
> **Regla:** toda sesión de trabajo debe arrancar validando este documento. Si un ítem aparece aquí como pendiente pero ya fue resuelto por otra vía, actualizar su estado en lugar de duplicarlo.

**Última revisión:** 2026-05-13 (Erika + Claude — 10 hitos cerrados + 2 BLs nuevos abiertos. Hitos: BL-033 falso positivo + BL-012 Fase 1 carrier (`1fe01e5`) + **BL-024 6 fases** (`4b80d45`/`02617b7`/`a26aa35`/`d4bafa9`/`e13ff92`/`6cbac28`) + **BL-009 Fase 3.0** (`d916c96`) + **BL-035 cleanup** (`cdbdba2`) + **BL-028 piloto** (`f24305b`) + **BL-009 Fase 3.2** (`74dd559`) + **BL-009 Fase 3.1** (`fb0d475`) + **BL-009 Fase 4** (`25f6ebb`) + **BL-025 docs Authorize** (`c2bcb16` + `3862664` — agent Opus). Nuevos: **BL-036** (pruebas API smoke MAGIIS + Authorize sandbox) y **BL-037** (test switching de pasarela Stripe↔Authorize, P1 precondición operacional). Documentado switching exclusivo en `docs/gateway-pg/authorize/ARCHITECTURE.md` §1.bis. Anterior: 2026-04-20.

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
- **Próxima acción:** corrida local repetida N=5-10 con `pnpm test:test:smoke` para acumular muestra y clasificar el bucket dominante de falla → aplicar fix focalizado según qué fase domine. **Requiere acción humana**: ambiente live activo + decisión sobre interpretación de buckets (`[login:goto]` / `[login:submit]` / `[login:dashboard]`). NO es automatizable por agent sin servidor de pruebas accesible.
- **Bloqueo operativo (2026-05-13):** este item requiere ejecución humana porque (a) los agents no tienen acceso al portal MAGIIS TEST live, (b) la clasificación de buckets demanda criterio humano sobre flakiness intermitente. La instrumentación BL-002 ya está aplicada en `gateway.fixtures.ts` desde `0299955`; sólo falta correr y analizar.
- **Nota 2026-05-13:** el SHA original `c0b708a` referenciado en avances anteriores quedó fuera del grafo accesible desde main. El contenido fue consolidado a `main` en el commit integrador `0299955` (2026-04-21, squash MR `integration/pre-main` → `main`). Ver BL-033 para detalle del falso positivo de pérdida.
- **Referencias:**
  - `tests/features/gateway-pg/fixtures/gateway.fixtures.ts` (instrumentación — en main vía `0299955`)
  - `docs/reports/TC1033-MITIGATION.md` (§ "Hallazgo de arquitectura 2026-04-20")
  - MR !31 (retry aplicado), BL-033 (falso positivo huérfanos), BL-035 (CI desactivado)

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

### BL-004 — ~~Cupo CI GitLab agotado~~ — CANCELADO POR BL-035

- **Estado:** ⚫ Cancelado (2026-05-13) — BL-035 desactivó el CI automático tanto en GitLab como en GitHub el 2026-04-27. Sin pipelines automáticos, el cupo no se consume → este item no aplica.
- **Prioridad:** ~~P1~~ N/A
- **Tipo:** Infraestructura
- **Razón de cancelación:** la decisión del líder de mover la validación a `pnpm pp` local (BL-035) eliminó la dependencia del cupo CI. Si en el futuro se reactiva CI automático, abrir un BL nuevo en vez de reusar este.
- **Referencias:**
  - BL-035 (decisión que lo dejó obsoleto)
  - `memory/project_gitlab_ci_quota.md` (memoria global — sigue válida como referencia histórica)

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
- **Nota 2026-05-13:** el SHA original `8ad9370` referenciado en avances anteriores quedó fuera del grafo accesible desde main. El contenido fue consolidado a `main` en el commit integrador `0299955` (2026-04-21). Ver BL-033 para detalle del falso positivo.
- **Referencias:**
  - `tests/features/gateway-pg/helpers/card-precondition.ts` (JSDoc §"BL-008 — Guard tolerante a API-fail" — en main vía `0299955`)
  - MR !39 (revert), MR !40 (TIER 5 para TC07 vía endpoint DELETE — puede hacer esto obsoleto), BL-033 (falso positivo).

### BL-009 — Poblar `tests/fixtures/users/`

- **Estado:** 🟡 Fases 2 / 3.0 / 3.1 / 3.2 / 4 completas — sólo Fase 1 (rotación creds PROD) pendiente con acción humana.
- **Prioridad:** P2 (elevada desde P3 por hallazgo crítico credenciales PROD)
- **Tipo:** Deuda técnica / organización + Seguridad
- **Contexto:** Usuarios dispersos hardcoded en specs/fixtures. Centralizarlos como SoT — complementa `fixtures/gateways/` y `fixtures/users/passengers.ts`.
- **Auditoría (2026-04-20):** 10 puntos de dispersión detectados. 3 puntos de entrada de resolución: `runtime.ts`, `gatewayPortalRuntime.ts`, `gateway.fixtures.ts` (+ 3 consumers polimórficos: `global-setup.multi-role.ts`, `TestBase.ts`, `apiClient.ts`).
- **🚨 Hallazgo crítico:** `.env.prod` trackeado en git con `USER_CARRIER` y (probablemente) `PASS_CARRIER` en claro → rotación de credenciales + `.env.prod.local` ignorado. **Acción urgente antes de cualquier PR/merge.**
- **Plan de ejecución:**
  1. **🔴 Emergencia creds** (pendiente acción humana): mover `.env.prod` → `.env.prod.local` (gitignored) + rotar `PASS_CARRIER_PROD` + audit git history.
  2. **🟢 SoT build** (commit consolidado `0299955`, 2026-04-21): creados `tests/fixtures/users/{types.ts, internal/env-resolver.ts, web-portals/{dispatcher,contractor-collaborator}.ts, mobile/{driver,passenger}.ts, index.ts, README.md}`. Getters lazy de email/password via `process.env.*` con fallback sufijo env. `tsc --noEmit` OK.
  3. **🟢 Adopción gradual** — sub-fases:
     - **🟢 Fase 3.0** (commit `d916c96`, 2026-05-13): `gateway.fixtures.ts` adopta `DISPATCHER[env]` y `CONTRACTOR_COLLABORATOR[env]` para `loginAsDispatcher` y `loginAsContractor`. Helper `getCurrentUserEnvironment()` agregado.
     - **🟢 Fase 3.1** (commit `fb0d475` cherry-pick de `8d783f0`, 2026-05-13 — agent paralelo): NUEVO fixture `PAX_WEB` en `tests/fixtures/users/web-portals/pax-web.ts` (suffix por env + fallback legacy `PAX_USER`/`PAX_PASS`). `PortalRole` gana valor `'pax-web'`. `loginAsPax` en `gateway.fixtures.ts` migrado a `PAX_WEB[env]`.
     - **🟢 Fase 3.2** (commit `74dd559`, 2026-05-13 — agent paralelo): bridge polimórfico `getCredentialsForRole(role: AppRole, env?: UserEnvironment)` con mapping `'carrier'/'web' → DISPATCHER[env]` y `'contractor' → CONTRACTOR_COLLABORATOR[env]`. Los 3 consumers polimórficos migrados.
  4. **🟢 Fase 4 — Legacy cleanup** (commit `25f6ebb`, 2026-05-13 — agent paralelo):
     - `tests/features/gateway-pg/data/passengers.ts` invertido a thin re-export `@deprecated` desde `tests/fixtures/users/passengers.ts` (SoT canónica).
     - `travel-cleanup.ts:DEFAULT_CARRIER_USER_ID = '6715'` validado: ya tenía override por env (`process.env.CARRIER_USER_ID`), agregado JSDoc explicando que `6715`/`1521`/`'  Remises EEUU'` son IDs estables del dispatcher TEST (no credenciales rotables). Refactor mayor (resolución dinámica vía `GET /users/me`) sólo aplica si en el futuro estos IDs varían por test/ambiente.
- **Próxima acción:** Fase 1 — rotación PROD humana + audit git history. Sin bloqueante técnico (todo el código adoptó la SoT).
- **Referencias:** commits `fb0d475` (Fase 3.1), `25f6ebb` (Fase 4), `74dd559` (Fase 3.2), `d916c96` (Fase 3.0), commit consolidado `0299955` (Fase 2 SoT), `tests/fixtures/users/README.md`, BL-024 ✅ (umbrella gateways relacionado).

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

- **Estado:** 🟡 Fase 1 contractor + Fase 1 carrier completas (2026-05-13) — bloqueo Stripe pendiente
- **Prioridad:** P3
- **Tipo:** Deuda técnica
- **Contexto:** 30 ocurrencias detectadas en auditoría 2026-04-20 (3 adicionales vs 27 documentados en WAITFORTIMEOUT-MIGRATION.md; probable causa: refactors post-TIER3.2 en loops submit/vehicle carrier `NewTravelPageBase.ts:805, 815`).
- **Clasificación reconfirmada (auditoría 2026-05-13 sobre código actual):**
  - **Cat A (eliminable hoy sin cambios):** 0 ocurrencias.
  - **Cat B (instrumentable con `expect.poll`):** 8 ocurrencias — debounce Angular autocomplete. **Todas migradas.**
  - **Cat C (conservar legítimo — Stripe + loops con condición compuesta + post-click sin verificable en scope):** ~22 ocurrencias.
- **Distribución actual:** `ThreeDSModal.ts` 5 (todos C) · `contractor/NewTravelPage.ts` 0 (todos migrados 🟢) · `carrier/NewTravelPageBase.ts` 17 (todos C, los Cat B ya migrados 🟢).
- **Plan priorizado — estimación real tras piloto:**
  1. **🟢 Fase 1 contractor** (commit consolidado `0299955`, 2026-04-21 — SHA original `1a3de3f` del 2026-04-20 quedó fuera del grafo; ver BL-033): 5 `waitForTimeout` (líneas 159, 164, 185, 189, 204) migrados a `expect.poll` / `expect.not.toBeVisible` via helpers `waitForAutocompleteOptionsReady` + `waitForPlaceFieldSelected`. Esfuerzo real: ~30 min vs estimación original 8-10h.
  2. **🟢 Fase 1 carrier** (commit `1fe01e5`, 2026-05-13): 3 `waitForTimeout` Cat B migrados en `carrier/NewTravelPageBase.ts` (líneas 238 `selectAutocompleteOption` debounce, 346 `searchPlace` debounce happy, 377 `searchPlace` debounce retry). Nuevo helper `protected waitForAutocompleteOptionsReady()` en NewTravelPageBase con triple polling (select-dropdown nativo, listitems inline, CDK overlay). Helper privado duplicado en contractor eliminado — ahora hereda del base. Esfuerzo real: ~1h. Las líneas 327/355/362/382/389 originalmente marcadas como Cat B en el BACKLOG resultaron Cat C tras auditoría in-situ (post-click sin elemento verificable en scope antes del return; ya tienen `NOTE(tier3-kept)`).
  3. **🔴 Bloqueo Stripe** (Opción B, requiere coordinación backend): 4 casos críticos (ThreeDSModal 93/102 + NewTravelPageBase 659/910). Sin señal DOM observable; requiere webhook/backend instrumentado para eliminar.
- **Métrica actualizada:** 8/30 migrados (27%). Quedan ~22 Cat C conservables por diseño.
- **Próxima acción:** evaluar si vale la pena escalar a Cat C (Stripe estabilización) — requiere coordinación backend para instrumentar webhooks. Por ahora la deuda restante es por diseño y aceptable.
- **Referencias:** commit `1fe01e5` (Fase 1 carrier, 2026-05-13), commit consolidado `0299955` (Fase 1 contractor, 2026-04-21), `docs/reports/WAITFORTIMEOUT-MIGRATION.md`, BL-033 (falso positivo SHAs).

### BL-013 — Refactor `dataGenerator.ts` — mover lógica Stripe residual

- **Estado:** 🟢 Hecho (2026-04-20) — confirmado que no hay lógica Stripe que mover
- **Prioridad:** P3
- **Tipo:** Deuda técnica
- **Resolución:** auditoría del módulo. `dataGenerator.ts` sólo contiene helpers de auth (emails/passwords random con faker). No hay generadores Stripe allí. El TODO histórico "mover faker bruto de stripe-cards.ts → aquí" fue descartado porque contradice la regla canónica del proyecto: **la respuesta esperada de un test de gateway la determina el número de la tarjeta** (`4242` aprobado, `9235` falla 3DS, etc.), no data aleatoria. Las tarjetas son SoT fija en `tests/fixtures/stripe/cards.ts` + `card-policy.ts`; los campos auxiliares (holderName, zip) son inertes al outcome y pueden quedar random sin impacto. Apliqué: `console.log` → `debugLog('datagen', ...)`, removí los TODOs obsoletos, docblock explícito sobre el alcance del módulo, nueva sección "Regla canónica" en `tests/fixtures/stripe/README.md`.
- **Nota 2026-05-13:** el SHA original `01ad7a9` quedó fuera del grafo accesible desde main. El contenido vive en main vía commit consolidado `0299955` (2026-04-21). Ver BL-033.
- **Referencias:**
  - `tests/shared/utils/dataGenerator.ts` (docblock actualizado — en main vía `0299955`)
  - `tests/fixtures/stripe/README.md` (§"Regla canónica — la respuesta la define el número de tarjeta")
  - MR !29 (TIER 2.1), BL-033 (falso positivo huérfanos).

### BL-014a — Aplicar template GitHub Actions optimizado ✅

- **Estado:** 🟢 Hecho (2026-04-20 — acelerado, cupo GitHub disponible)
- **Prioridad:** P2
- **Tipo:** Mejora CI
- **Reportado:** 2026-04-20
- **Resolución:** `.github/workflows/playwright.yml` reemplazado por template optimizado: concurrency group con cancel-in-progress, paths-ignore (docs/.claude/.md), cache multi-capa (node_modules + playwright browsers), quick-checks fail-fast (tsc+lint antes de e2e), timeout 30 min por job, artifacts retention 3/7/30 según tipo, workflow_dispatch con inputs útiles (test_filter, headed).
- **Impacto esperado:** duración efectiva 13 min → 7-8 min cuando cache está caliente. Cero pipelines docs-only.
- **Validación:** el próximo push al repo dispara el workflow optimizado en GitHub Actions (cupo disponible).
- **Referencias:** `.claude/skills/magiis-ci-efficiency/assets/templates/github-actions-playwright-optimized.yml`

### BL-014b — ~~Aplicar template GitLab CI optimizado~~ — CANCELADO POR BL-035

- **Estado:** ⚫ Cancelado (2026-05-13) — BL-035 desactivó CI automático en GitLab (`workflow.rules: when: never`). Aplicar un template optimizado no aporta valor mientras no haya pipelines automáticos.
- **Prioridad:** ~~P2~~ N/A
- **Tipo:** Mejora CI
- **Razón de cancelación:** el template optimizado optimizaba lo que ya no existe. Si se reactiva CI cloud en el futuro, el template sigue disponible en `.claude/skills/magiis-ci-efficiency/assets/templates/` y se puede abrir un BL nuevo.
- **Referencias:**
  - BL-035 (decisión que lo dejó obsoleto)
  - `.claude/skills/magiis-ci-efficiency/assets/templates/gitlab-ci-playwright-optimized.yml` (preservado como referencia)

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

### BL-017b — Branch protection estricta (pendiente equipo)

- **Estado:** 🔴 Pendiente (alcance reducido por BL-035) — trigger único restante: equipo ≥ 2 devs.
- **Prioridad:** P3
- **Tipo:** Configuración
- **Reportado:** 2026-04-20
- **Contexto post BL-035 (2026-05-13):** los settings que dependían de CI fueron retirados de scope:
  - ~~`only_allow_merge_if_pipeline_succeeds`~~ → CANCELADO. BL-035 desactivó CI automático; no hay pipeline obligatorio que esperar. La validación de calidad pasa por `pnpm pp` local (pre-push hook).
  - ~~GitHub Settings → status checks required~~ → CANCELADO por la misma razón.
  - `approvals_before_merge ≥ 1` → sigue válido cuando se sume el segundo dev.
  - `Require code owner approval` → sigue válido cuando se sume el segundo dev.
- **Próxima acción:** activar `approvals_before_merge` + `code_owner_approval` cuando el equipo crezca a 2+ devs. Comandos listos en `docs/ci/BRANCH-PROTECTION-SETTINGS.md`.
- **Referencias:** BL-035 (canceló settings dependientes de CI), `docs/ci/BRANCH-PROTECTION-SETTINGS.md` §"Cómo re-aplicar via GitLab API"

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
- **Avance 2026-04-20 (commit consolidado `0299955`, 2026-04-21 — SHA original `94bb3bc` del 2026-04-20 quedó fuera del grafo de main; ver BL-033):** draft completo en `docs/test-cases/mobile/TC1011-DRAFT.md` (12 secciones: identidad, precondiciones, flujo canónico por fases, gap analysis, selectores conocidos vs TODO, handoff contract, riesgos, trazabilidad).
- **Gap identificado:**
  - **Passenger (Fase A):** sin gaps críticos. Screens + selectores validados en `TC-PAX-HOLD-STEPS.md`. Falta formalizar `PassengerTripStatusScreen`.
  - **Driver (Fase B):** sin gap estructural. Checkpoints en `DriverFlowSelectors.ts` + `DriverTripHappyPathHarness`. Requieren validación live contra Driver App actual.
  - **Orquestación (Fase A↔B):** GAP CRÍTICO — `JourneyBridge.buildJourneyId()` hardcodea prefijo `flow1-*` y `initJourneyContext()` asume `flowType='carrier-web-driver-app'`. Ambos requieren parametrización antes de soportar TC1011.
- **Estimación implementación funcional:** 3.5-4 días-persona. Bloquea: dispositivo/emulador dual (passenger+driver APKs) + Appium server activo + validación selectores Driver live.
- **Decisión tomada:** NO crear spec propio `flow1-appPax-*` (violaría taxonomía MAGIIS). Agregar `test.describe('[TS-STRIPE-TC1011]')` dentro del `flow2-passenger-driver/flow2.e2e.spec.ts` existente cuando se active sesión Appium.
- **Próxima acción:** activar sesión Appium dedicada → extender `JourneyBridge` con `flowType` parametrizable → implementar spec TC1011 dentro de flow2 → validación E2E.
- **Referencias:** commit consolidado `0299955` (squash MR pre-main → main 2026-04-21), `docs/test-cases/mobile/TC1011-DRAFT.md`, `memory/project_pax_hold_steps.md`, CLAUDE.md §Flujos E2E híbridos Flow 2, BL-033 (falso positivo).

### BL-023 — Sincronizar github/main con gitlab/main (remotes divergentes)

- **Estado:** 🟢 Resuelto (2026-04-21) — remotes sincronizados en `8b41c04`, política operativa activa, pre-push check 11 bloqueante en producción.
- **Resolución:** Fases 2-4-6 aplicadas vía MR GitLab → `main` (commit de merge `8b41c04`). Fase 1: sincronización inicial de `github/main` vía `git push github main --force-with-lease` autorizado por Erika — aligned los 139 commits de drift. Los 37 commits únicos previos de GitHub quedan en reflog (recuperables si fuese necesario). `pnpm ci:sync-check` reporta ✅ Remotes sincronizados.
- **Mirror automático pendiente (follow-up):** el mirror GitLab → GitHub en UI quedó configurado pero no se validó end-to-end. Próximo push a `gitlab/main` dirá si el mirror replica solo. Si falla, el workaround es repetir el `ci:sync-check` + force-push manual. Sin urgencia operativa.
- **Aprendizajes incorporados:**
  - Pre-push check 11 (merge dry-run) previene reingreso del problema
  - `.gitattributes` merge=union neutraliza conflicts en hotspot files
  - MERGE-POLICY.md formaliza el flujo uni-agente vs multi-agente
  - `pnpm ci:sync-check` da alerta temprana de drift futuro
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
- **Nota 2026-05-13:** el SHA original `62beb78` (fix TC1111) quedó fuera del grafo accesible desde main. El contenido vive en main vía commit consolidado `0299955` (2026-04-21). Ver BL-033.
- **Referencias:** commit consolidado `0299955` (squash MR pre-main → main 2026-04-21), mensaje del PO en sesión 2026-04-20, BL-033 (falso positivo).

### BL-024 — Generalizar CardResolver multi-gateway (extender contracts existentes)

- **Estado:** 🟢 Hecho (2026-05-13) — 6 fases completadas en una sesión, todo funcional, pre-push 11/11 OK en cada commit.
- **Prioridad:** P2
- **Tipo:** Arquitectura
- **Reportado:** 2026-04-27
- **Resolución (6 fases):**
  1. **Fase 1 — Invertir dirección SoT Stripe** (commit `4b80d45`): el contenido real (registries, env-resolution, types) se movió de `features/gateway-pg/data/stripe-cards.ts` + `stripeTestData.ts` (legacy) a `tests/fixtures/stripe/cards.ts`. Los legacy quedaron como thin re-exports. API pública sin cambios.
  2. **Fase 2 — Separar dominio de gateway** (commit `02617b7`): `TEST_DATA` (client, passenger, origin, destination) extraído a `tests/features/gateway-pg/data/journey-defaults.ts` (archivo neutro). `stripeTestData.ts` queda 100% re-export. Habilita que tests Authorize/MP/Ebiz reutilicen los datos de dominio sin importar un archivo Stripe-named.
  3. **Fase 3 — Crear umbrella `fixtures/gateways/`** (commit `a26aa35`): nueva estructura unificada con `_shared/` (types comunes + resolver polimórfico) + `stripe/` + `authorize/` + slots `mercado-pago/` + `ebizcharge/`. SoT canónica REAL bajo `gateways/<gateway>/`; el path anterior `fixtures/<gateway>/` quedó como thin re-export. Resolver `resolveCard({ gateway, intent })` normaliza a `GenericTestCard` con campos comunes. Mapping `STRIPE_INTENT_MAP` (6 intents soportados) y `AUTHORIZE_INTENT_MAP` (3 intents — sin 3DS, sin DECLINE_CAPTURE).
  4. **Fase 4 — Conectar adapters con fixtures** (commit `d4bafa9`): `helpers/adapters/index.ts` re-exporta el resolver cross-gateway + tipos. Nueva `assertAdapterFixtureConsistency()` valida en runtime que `requires3ds` matchee con el comportamiento real. JSDoc de cada adapter linkea a su fixture. Armonizado naming `'mercado-pago'` (con guion) entre `GatewayName` y `PaymentGateway`.
  5. **Fase 5 — Slot `specs/authorize/` reservado** (commit `e13ff92`): directorio espejo de `specs/stripe/` con README plantilla que documenta por qué está vacío, estructura propuesta, patrón parametrizado recomendado y checklist de activación.
  6. **Fase 6 — Documentación canónica** (commit `6cbac28`): `fixtures/gateways/stripe/README.md` y `fixtures/gateways/authorize/README.md` con contenido completo (tablas, política de elección, patrón resolver shared). `fixtures/stripe/README.md` y `fixtures/authorize/README.md` marcados como pointers. CLAUDE.md (local, gitignored) gana sección "Multi-gateway: dónde vive qué".
- **Principio rector consolidado:** *El comportamiento esperado del sistema es constante; sólo los datos de entrada cambian por pasarela.* Permite specs parametrizables `test.describe.each(GATEWAYS)` con `resolveCard({ gateway, intent })` + `JOURNEY_DEFAULTS` constantes.
- **Aprendizajes incorporados:**
  - Pre-push check 2 (cards 3155) requirió ampliar allowlist a los nuevos paths SoT.
  - `GatewayName` (`_shared/types.ts`) debe coincidir EXACTAMENTE con `PaymentGateway` (`contracts/gateway-pg.types.ts`) — naming `'mercado-pago'` con guion.
  - Thin re-exports preservan 100% de la API legacy → migración sin romper specs existentes.
- **Habilita ahora:**
  - **BL-025**: Authorize SoT ya vive en `fixtures/gateways/authorize/` ✓. Falta runtime (POM/spec).
  - **BL-026**: slot `mercado-pago/` reservado con README — esperando confirmación uso.
  - **BL-027**: slot `ebizcharge/` reservado con README — esperando confirmación uso.
  - **BL-028**: resolver cross-gateway listo. Falta solo el spec piloto parametrizado.
- **Referencias:** commits Fase 1-6, `tests/fixtures/gateways/README.md`, `tests/fixtures/gateways/_shared/`, `tests/features/gateway-pg/helpers/adapters/index.ts`, BL-025/026/027/028 (consumidores), `CLAUDE.md` §"Multi-gateway: dónde vive qué".

### BL-025 — Test data Authorize.net (CVC-based outcomes)

- **Estado:** 🟡 Fixtures + documentación QA oficial completos. Runtime POM + spec piloto pendientes (bloqueado en credenciales sandbox + decisión líder + modelo integración backend).
- **Avance 2026-05-13 (agent Opus paralelo, commits `c2bcb16` + `3862664`):** documentación oficial QA generada en `docs/gateway-pg/authorize/` espejando estructura Stripe — 7 archivos / 1529 líneas:
  - `README.md` (64L) — overview + onboarding
  - `ARCHITECTURE.md` (393L) — arquitectura, mapping MAGIIS↔Authorize (Hold→authOnly, Capture→priorAuthCapture), endpoints, triggers CVV/ZIP completos, response codes, stored credentials con networkTransId
  - `matriz_cases.md` (247L) — matriz canónica TS-AUTHORIZE-TC1001..TC1130 (happy paths, declines, CVV, AVS, partial/prepaid)
  - `matriz_cases2.md` (212L) — edge cases TC1201..TC1323 (reembolsos, voids, stored creds reuse, ARB, Held for Review, E2E híbridos)
  - `TRACEABILITY.md` (229L) — 25 pares Stripe↔Authorize mapeados + ~80 Stripe que NO migran + ~25 Authorize exclusivos + tabla de intents canónicos del resolver
  - `EXTERNAL-BLOCKERS.md` (240L) — sandbox keys, decisión líder PROD, modelo integración, POM Authorize, backend hooks E2E
  - `CHANGELOG.md` (144L) — historial BL-024 Fase 3 + pendientes BL-025
- **Hallazgo:** `.gitignore:66` ignoraba `ARCHITECTURE.md` genéricamente y solo Stripe tenía excepción. Agregadas anticipadamente las excepciones para `mercado-pago/` y `ebizcharge/` (commit pendiente).
- **Prioridad:** P2
- **Tipo:** Investigación
- **Reportado:** 2026-04-27
- **Contexto:** Authorize.net sandbox usa **CVV y ZIP** para disparar outcomes específicos sobre un set fijo de tarjetas por marca. **No requiere 3DS** en el flujo MAGIIS estándar. Hallazgo: el número de tarjeta NO determina el outcome (a diferencia de Stripe), sino la combinación (CVV, ZIP).
- **Avance 2026-04-27:** estructura de datos completa creada en `tests/fixtures/authorize/` espejando el patrón Stripe:
  - `cards.ts` — `AuthorizeTestCard` type + registry `AUTHORIZE_TEST_CARDS` con 11 entries cubriendo happy paths (Visa/MC/Amex/Discover) + unhappy (decline genérico, CVV mismatch/not-processed, AVS no-match/non-US, partial/prepaid auth).
  - `card-policy.ts` — namespace semántico `AUTHORIZE_CARDS` con keys por intención (`SUCCESS`, `DECLINE_GENERIC`, `DECLINE_CVV`, `AVS_NO_MATCH`, etc.).
  - `card-resolver.ts` — `resolveCard(cardId)` análogo al de Stripe pero sin "número directo" (porque varios outcomes comparten el mismo number).
  - `README.md` — guía con tabla de triggers CVV (900/901/904) y ZIP (46282 declined, 46205 AVS, 46225-28 partial/prepaid), referencia a doc oficial.
  - `tsc --noEmit` OK — no rompe ningún consumer de Stripe.
- **Próxima acción** (orden recomendado, derivado de `docs/gateway-pg/authorize/EXTERNAL-BLOCKERS.md`):
  1. ~~BL-024~~ ✅ Resolver polimórfico creado en `tests/fixtures/gateways/_shared/resolver.ts`.
  2. ~~Documentación QA oficial~~ ✅ Generada en `docs/gateway-pg/authorize/` (2026-05-13).
  3. **§EXTERNAL-BLOCKERS.md §1** — solicitar Merchant Interface sandbox + generar `AUTHORIZE_API_LOGIN_ID` + `AUTHORIZE_TRANSACTION_KEY`, cargar en `.env.test`. Acción humana coordinada con infra.
  4. **§EXTERNAL-BLOCKERS.md §2** — sesión con líder técnico para confirmar si MAGIIS PROD usa Authorize.net. Si no, deprioritizar a P3.
  5. **§EXTERNAL-BLOCKERS.md §3** — sesión con backend MAGIIS para confirmar modelo de integración (Accept.js iframe / Accept Hosted / API directa). Probable: Accept.js.
  6. **§EXTERNAL-BLOCKERS.md §4** — DOM dump del form Authorize en portal MAGIIS y crear POM Authorize en `tests/pages/carrier/` (si difiere de Stripe Elements).
  7. **Runtime spec piloto** — primer spec en `tests/features/gateway-pg/specs/authorize/web/carrier/hold/apppax-hold-no3ds.spec.ts` con intent HAPPY_NO_AUTH. Validar contra sandbox real.
  8. **BL-028 ampliación** — agregar `'authorize'` al array `ACTIVE_GATEWAYS` en `tests/features/gateway-pg/specs/_parametrized/hold-happy-no3ds.parametrized.spec.ts`.
  9. **§EXTERNAL-BLOCKERS.md §5** — validar que backend MAGIIS routea capture por `gateway` para habilitar E2E híbridos (TC1301-TC1312 en matriz_cases2).
- **Bloqueantes:** pasos 3-9 dependen secuencialmente de acción humana (3) → decisión líder (4) → coordinación backend (5).
- **Referencias:** `docs/gateway-pg/authorize/` (documentación QA completa — leer README.md primero), `tests/fixtures/gateways/authorize/` (SoT canónica), `tests/features/gateway-pg/specs/authorize/README.md`, BL-024 ✅, <https://developer.authorize.net/hello_world/testing_guide.html>, <https://developer.authorize.net/api/reference/index.html>

### BL-026 — Test data MercadoPago (holderName-based outcomes)

- **Estado:** 🔴 Pendiente — slot `tests/fixtures/gateways/mercado-pago/` reservado con README (BL-024 Fase 3, 2026-05-13). Resolver cross-gateway lanza "no soportado" hasta que se pueble.
- **Prioridad:** P2
- **Tipo:** Investigación
- **Reportado:** 2026-04-27
- **Contexto:** MercadoPago sandbox usa el **nombre del titular** como trigger de outcome (`APRO` → approved, `OTHE` → other_error, `CONT` → pending, etc), combinado con un set fijo de tarjetas de prueba por marca. No requiere 3DS para los flujos MAGIIS habituales.
- **Próxima acción:**
  1. Recolectar matriz holderName→outcome de la doc oficial MP (sección "Probar integración").
  2. Poblar `tests/fixtures/gateways/mercado-pago/cards.ts` + `card-policy.ts` + `card-resolver.ts` (slot ya creado).
  3. Agregar mapping en `tests/fixtures/gateways/_shared/resolver.ts` (`MERCADO_PAGO_INTENT_MAP`).
  4. Verificar `mercadoPagoGatewayAdapter.requires3ds = false`.
  5. Validar acceso a sandbox keys en `.env`.
- **Bloqueantes:** confirmar con líder si MAGIIS PROD integra MercadoPago.
- **Referencias:** `tests/fixtures/gateways/mercado-pago/README.md`, BL-024 ✅ (umbrella listo), <https://www.mercadopago.com.ar/developers/es/docs/checkout-api/integration-test/test-cards>

### BL-027 — Test data eBizCharge (matriz a investigar)

- **Estado:** 🔴 Pendiente — slot `tests/fixtures/gateways/ebizcharge/` reservado con README (BL-024 Fase 3, 2026-05-13). Resolver cross-gateway lanza "no soportado" hasta que se pueble.
- **Prioridad:** P3
- **Tipo:** Investigación
- **Reportado:** 2026-04-27
- **Contexto:** eBizCharge es el menos documentado de los 4 gateways. Hay que investigar:
  - ¿Qué dispara cada outcome? (CVC, número, otro)
  - ¿Requiere 3DS o es flat charge/hold?
  - ¿Hay sandbox público o requiere account?
- **Próxima acción:**
  1. Investigar docs oficiales eBizCharge testing.
  2. Confirmar con backend MAGIIS qué tipo de integración hay (REST API, hosted iframe, JS SDK).
  3. Si se confirma uso, poblar `tests/fixtures/gateways/ebizcharge/cards.ts` + `card-policy.ts` + `card-resolver.ts` (slot ya creado).
  4. Agregar mapping en `_shared/resolver.ts` (`EBIZCHARGE_INTENT_MAP`).
- **Bloqueantes:** confirmar con líder si MAGIIS realmente usa eBizCharge en algún portal/PROD. Si no se usa, cancelar.
- **Referencias:** `tests/fixtures/gateways/ebizcharge/README.md`, BL-024 ✅ (umbrella listo)

### BL-028 — Parametrizar specs Stripe con `gateway` param + skip-3DS condicional

- **Estado:** 🟡 Piloto creado y verde (commit `f24305b`, 2026-05-13). Migración del resto de specs pendiente.
- **Prioridad:** P2
- **Tipo:** Automatización (refactor)
- **Reportado:** 2026-04-27
- **Avance 2026-05-13 (ejecutado en agent paralelo, integrado a main):** primer spec piloto creado en `tests/features/gateway-pg/specs/_parametrized/hold-happy-no3ds.parametrized.spec.ts` + README. Demuestra el patrón habilitado por BL-024:
  - `ACTIVE_GATEWAYS: GatewayName[] = ['stripe']` (Authorize se sumará cuando BL-025 tenga runtime).
  - `for (const gateway of ACTIVE_GATEWAYS)` iterando con `test.describe(`gateway=${gateway}`)`.
  - `resolveCard({ gateway, intent: 'HAPPY_NO_AUTH' })` resuelve el dato variable.
  - `JOURNEY_DEFAULTS` aporta dominio constante.
  - Assertion final replicada del spec canónico `apppax-hold-no3ds.spec.ts`: `management.expectPassengerInPorAsignar(passenger, undefined, 'Buscando chofer')` (equivalente al estado MAGIIS `SEARCHING_DRIVER`).
  - Sanity checks sobre `card.gateway`, `card.requires3ds`, `card.last4`.
- **Ajustes del piloto vs esqueleto sugerido:** `test`/`expect` se importan de `TestBase` (no `@playwright/test`) por el patrón `test.use({ role: 'carrier', storageState: {...} })`. Necesario importar `DashboardPage` + `OperationalPreferencesPage` para `preferences.ensureHoldEnabled()` + `dashboard.openNewTravel()` antes de `travel.ensureLoaded()`.
- **Próxima acción:**
  1. ~~Crear umbrella + resolver~~ ✅ Hecho en BL-024.
  2. ~~Spec piloto~~ ✅ Hecho (commit `f24305b`).
  3. Iterar sobre el resto de specs por feature (hold, cargo-a-bordo, declines, recurrentes), reemplazando el `gateway: 'stripe'` hardcoded por loop sobre `ACTIVE_GATEWAYS`.
  4. Cuando Authorize tenga runtime (BL-025), agregar `gateway: 'authorize'` a `ACTIVE_GATEWAYS` y validar specs con intents soportados.
- **Bloqueantes:** ya ningún técnico. Bloqueante de scope: depende de BL-025 para validar parametrización contra un segundo gateway real (con el piloto actual no se valida la utilidad porque solo corre Stripe).
- **Referencias:** commit `f24305b` (piloto), BL-024 ✅, BL-025, `tests/features/gateway-pg/specs/_parametrized/`, `tests/fixtures/gateways/_shared/resolver.ts`, `tests/features/gateway-pg/specs/authorize/README.md`

### BL-029 — Definir contrato de reporte de pruebas para Microsoft Teams

- **Estado:** 🔴 Pendiente — esperando decisión del líder
- **Prioridad:** P2
- **Tipo:** Decisión
- **Reportado:** 2026-04-27
- **Contexto:** El líder pidió un espacio en Teams donde el equipo pueda ver el informe de las pruebas automatizadas. Antes de implementar, hay que decidir el contrato del mensaje:
  - Métricas a incluir (passed/failed/skipped, duración, branch/commit, autor, link al reporte).
  - Formato (Adaptive Card rich vs markdown plain).
  - Frecuencia (post-run CI, nightly, semanal, on-failure-only).
- **Próxima acción:** sesión con líder para validar:
  1. Canal Teams destino (qué team/channel).
  2. Trigger de envío (cada PR, nightly, weekly, on-failure).
  3. Métricas mínimas viables vs ricas.
  4. Quién crea el flow Power Automate (líder vs IT).
- **Referencias:** BL-030 (depende), BL-031 (depende), BL-032 (depende)

### BL-030 — Crear flow Power Automate en canal Teams MAGIIS

- **Estado:** 🔴 Pendiente — bloqueado por BL-029
- **Prioridad:** P2
- **Tipo:** Configuración
- **Reportado:** 2026-04-27
- **Contexto:** El path oficial Microsoft 2026+ para postear desde un sistema externo a un canal Teams es vía Power Automate workflow trigger HTTP. El antiguo Office 365 Connector Webhook está deprecado (EOL enero 2026). No requiere App Registration en Azure AD.
- **Próxima acción:**
  1. Líder o admin Teams crea flow en Power Automate: trigger `When a HTTP request is received` (genera URL secreta).
  2. Acción siguiente: `Post adaptive card to a chat or channel` apuntando al canal acordado en BL-029.
  3. Compartir trigger URL con QA → guardar como `TEAMS_WORKFLOW_URL` en GitHub Secrets / GitLab Masked Variables (NO commitear).
- **Bloqueantes:** definición de canal y formato (BL-029).
- **Referencias:** BL-029, <https://learn.microsoft.com/en-us/power-automate/teams/overview>

### BL-031 — Script `scripts/teams/post-run-report.ts`

- **Estado:** 🔴 Pendiente — bloqueado por BL-030
- **Prioridad:** P2
- **Tipo:** Mejora CI
- **Reportado:** 2026-04-27
- **Contexto:** Script que parsee el JSON reporter de Playwright (`test-results/results.json`) y postee un Adaptive Card al webhook URL del flow Power Automate (BL-030). Debe ser idempotente, fallar gracefully si el JSON no existe (por ejemplo si Playwright crasheó), y soportar modo `--dry` para preview.
- **Próxima acción:**
  1. Diseñar el shape del Adaptive Card según contrato BL-029.
  2. Implementar parser del `playwright-report/results.json`.
  3. Agregar `pnpm report:teams` y `pnpm report:teams:dry` a `package.json`.
  4. Probar local con webhook real antes de meter al CI.
- **Bloqueantes:** webhook URL del flow (BL-030).
- **Referencias:** patrón existente en `scripts/trello/sync-backlog-to-trello.ts`, BL-030

### BL-032 — Integrar reporte Teams al pipeline CI

- **Estado:** 🔴 Pendiente — bloqueado por BL-031
- **Prioridad:** P2
- **Tipo:** Mejora CI
- **Reportado:** 2026-04-27
- **Contexto:** Sumar step en `.github/workflows/playwright.yml` (y `.gitlab-ci.yml` cuando vuelva el cupo) que llame a `pnpm report:teams` después de la fase de tests, con `if: always()` para reportar incluso fallos.
- **Próxima acción:**
  1. Agregar step `Report results to Teams` post-tests con env `TEAMS_WORKFLOW_URL` desde Secrets.
  2. Validar primer run completo (PR de prueba con cambio mínimo).
  3. Documentar el flujo en `docs/ci/CI-USAGE-GUIDELINES.md` (sección "Notificaciones").
- **Bloqueantes:** script funcional (BL-031).
- **Referencias:** BL-031, `.github/workflows/playwright.yml`, `docs/ci/CI-USAGE-GUIDELINES.md`

### BL-033 — ~~Reconciliar `integration/pre-main` con `main` (trabajo huérfano post-BL-023)~~ — FALSO POSITIVO

- **Estado:** 🟢 Resuelto (2026-05-13) — falso positivo, diagnóstico invertido. Sin acción técnica requerida.
- **Prioridad:** ~~P1~~ → N/A
- **Tipo:** Infraestructura / deuda crítica → reclasificado como diagnóstico erróneo
- **Reportado:** 2026-04-27
- **Resolución (2026-05-13):** auditoría con `git diff --name-status main..integration/pre-main` muestra **únicamente deletes y modifications, ningún add** — lo que prueba que `pre-main` está ATRASADO respecto a `main`, no al revés. La hipótesis original confundió la dirección del diff (lo que falta en `pre-main` vs lo que falta en `main`). Las 2302 líneas declaradas "huérfanas" YA están en `main` desde el commit integrador `0299955` "chore(integration): pre-main sesión 2026-04-20 — 8 BL + TC1111" (2026-04-21, **45 archivos / 2302 insertions — cifra exacta**), un squash merge de `integration/pre-main → main` vía MR GitLab ejecutado ANTES del force-push BL-023.
- **Verificación cruzada:** `git log -1 main -- <archivo>` para cada archivo declarado huérfano devuelve `0299955`:
  - `tests/fixtures/users/types.ts` (BL-009) → `0299955` ✓
  - `tests/pages/contractor/NewTravelPage.ts` waitForTimeout migrados (BL-012) → `0299955` ✓
  - `docs/test-cases/mobile/TC1011-DRAFT.md` (BL-021) → `0299955` ✓
  - `tests/shared/utils/dataGenerator.ts` desacoplado (BL-013) → `0299955` ✓
  - `tests/features/gateway-pg/helpers/card-precondition.ts` apiResolved guard (BL-008) → `0299955` ✓
  - `tests/features/gateway-pg/fixtures/gateway.fixtures.ts` instrumentación (BL-002) → `0299955` ✓
  - `tests/features/smoke/specs/gateway-pg.smoke.spec.ts` fix TC1111 (BL-022) → `0299955` ✓
- **Línea de tiempo real:**
  1. `0299955` (2026-04-21) — squash integrador `integration/pre-main → main` (2302 líneas, 45 archivos)
  2. `270b1b9` (2026-04-21) — merge commit del MR GitLab
  3. `8b41c04` (2026-04-21) — BL-023 force-push (sync remotes — NO eliminó el integrador, lo preservó en main)
  4. `63c3e93` (2026-04-21) — creación de este BL-033 con diagnóstico erróneo
  5. `0299955` y todo el trabajo posterior (BL-025/034/035) conviven sanos en main desde entonces.
- **Estado de SHAs originales:** los 7 SHAs (`90b7da7`, `1a3de3f`, `94bb3bc`, `01ad7a9`, `8ad9370`, `c0b708a`, `62beb78`) sobreviven como objetos git pero no son alcanzables desde `main` por la cadena de parents normal — solo desde `integration/pre-main`. Su contenido está consolidado en `main` bajo el SHA único `0299955`.
- **Acciones aplicadas (2026-05-13):**
  1. Corregir SHAs referenciados en BL-002/008/009/012/013/021/022 al consolidado `0299955` con nota de la consolidación.
  2. Resincronizar `integration/pre-main` con hard-reset desde `main` para que vuelva a ser espejo UAT (opción elegida por dev).
  3. Borrar `scripts/backlog-bl002-008-013` (local) — la subrama subsidiaria ya no tiene función.
- **Aprendizaje:** todo diagnóstico de "trabajo huérfano" debe validarse con `git log main -- <archivo>` antes de declarar pérdida. El diff `main..rama` muestra el delta desde main hacia rama; el inverso `rama..main` muestra lo opuesto. En caso de duda, contar archivos `A` en ambas direcciones.
- **Referencias:** commit `0299955`, BL-023 (causa del falso positivo por reescritura de historia que confundió la auditoría posterior), commits `270b1b9` y `8b41c04`.

### BL-035 — Desactivar CI en GitHub Actions y GitLab — decisión 2026-04-27

- **Estado:** 🟢 Hecho (2026-04-27)
- **Prioridad:** P1
- **Tipo:** Configuración
- **Reportado:** 2026-04-27
- **Contexto:** El líder pidió no usar CI automático ni en GitHub Actions ni en GitLab CI. La validación de calidad pasa exclusivamente por el ritual local pre-push (`pnpm pp` — 11 checks <30s) y corridas manuales `workflow_dispatch` cuando sea estrictamente necesario.
- **Resolución:**
  - **`.github/workflows/playwright.yml`:** triggers `push` y `pull_request` removidos. Sólo `workflow_dispatch` con inputs (`test_filter`, `headed`).
  - **`.github/workflows/doc-terminology-check.yml`:** triggers `pull_request` y `push` removidos. Sólo `workflow_dispatch`.
  - **`.github/workflows/playwright-prod-smoke.yml`:** ya estaba inerte (workflow_dispatch only desde abril). Sin cambios.
  - **`.gitlab-ci.yml`:** agregado `workflow.rules: when: never` al inicio. Skip de todos los pipelines automáticos. Manual only desde UI GitLab "Run pipeline".
  - Comentarios `⚠️ CI DESACTIVADO 2026-04-27 — decisión BL-035` agregados como header en cada archivo + instrucciones de reactivación apuntando al historial git.
- **Política operativa post-decisión:**
  - **Pre-push hook husky** (`pnpm pp`) sigue siendo la primera y única línea de defensa antes de pushear. 11 checks: tsc, lint, no-test-only, no-cards-deprecadas, no-credenciales-hardcodeadas, no-env-staged, no-console.log, justificación test.fixme, branch ahead-of-main, traceability BL-/TC-, merge dry-run.
  - **Corridas Playwright** se ejecutan exclusivamente local (`pnpm test:test:smoke` etc.) o manualmente desde UI cloud cuando se quiera.
  - **Items afectados** en otros BL- (a actualizar en commit separado per regla BACKLOG):
    - BL-004 (Cupo CI GitLab agotado) → ya no aplica, el cupo no se consume.
    - BL-007 (Decisión runner CI propio) → decisión tomada: no runner, no CI cloud.
    - BL-014b (Aplicar template GitLab CI optimizado) → cancelar.
    - BL-016 (Quality Gates progresivos) → mantener Fases 0-4 (pre-push hook), Fase 5 branch-protection sigue válida pero ahora sin status-checks-required.
- **Push pendiente:** los cambios viven en commit local, no toman efecto en `gitlab/main` ni `github/main` hasta que se autorice el push. Mientras tanto los workflows remotos siguen activos (aunque GitLab tiene cupo agotado hasta 1 mayo).
- **Reversibilidad:** trivial — `git revert <sha>` o restaurar manualmente los triggers removidos desde el historial.
- **Referencias:** decisión líder 2026-04-27, BL-004, BL-007, BL-014b

### BL-034 — Cleanup auditoría de ramas — 21 ramas eliminadas

- **Estado:** 🟢 Hecho (2026-04-27)
- **Prioridad:** P3
- **Tipo:** Operacional
- **Reportado:** 2026-04-27
- **Resolución:** auditoría completa de ramas locales (22) + remotas (gitlab 1, github 6). Clasificación en 3 categorías:
  - **Cat A — MERGED clean (15 locales, ahead=0):** `feature/ai-matriz-coherencia`, `feature/ai-matriz-sources-rename`, `feature/cards-policy-full-migration`, `contractor/{smoke-cleanup-edge-cards,tc-matrix-ids,tc12-optional-second-3ds,tc12-second-3ds-longer-timeout,tc14-authorize-decline,tc14-v3-decline-timeout}`, `docs/matriz-cleanup-final`, `scripts/{ci-auto-cancel,fixtures-stripe-policy}`, `smoke/nonfatal-cleanup-hold`, `carrier/cargo-a-bordo-tc1081-fix`, `chore/backlog-sync-post-tc1081` → **borradas**.
  - **Cat B — Squash-merged confirmadas en BACKLOG (3 locales + 3 remotas github):** `chore/ci-quality-gates-foundation` (BL-005 PR #11 commit `e85befd`), `scripts/bl023-merge-policy` (BL-023 commit `8b41c04`), `carrier/cargo-a-bordo-tc1081-fix-v2` (BL-001 PR #10 commit `26766de`) → **borradas locales + push --delete a github**.
  - **Cat C — requieren decisión (4 ramas, NO borradas):** `integration/pre-main` (espejo UAT, ver BL-033), `scripts/backlog-bl002-008-013` (subrama pre-main, ver BL-033), `scripts/ci-interruptible` (1 commit huérfano `a587184` fix matriz), `github/carrier/cargo-a-bordo-tc1081-fix` (residuo pre-sync GitHub).
- **Validación:** pre-push hook corrió en `push --delete` con 11/11 checks verdes (38s). Merge dry-run contra `gitlab/main` OK. `git status` limpio.
- **Estado final:** locales restantes: `main`, `integration/pre-main`, `scripts/backlog-bl002-008-013`, `scripts/ci-interruptible`. Remotas github: `main`, `integration/pre-main`, `carrier/cargo-a-bordo-tc1081-fix`. GitLab: sólo `main`.
- **Hallazgo derivado:** BL-033 abierto (P1) — la auditoría reveló que pre-main contiene 13 commits con código BL-009/012/013/021/022 huérfanos no presentes en main.
- **Referencias:** sesión 2026-04-27, BL-033 (hallazgo derivado), commits del cleanup en historial git

### BL-036 — Pruebas API smoke: MAGIIS backend + Authorize.net sandbox

- **Estado:** 🔴 Pendiente — pedido por el líder (sesión 2026-05-13)
- **Prioridad:** P2
- **Tipo:** Automatización (testing nuevo de tipo API)
- **Reportado:** 2026-05-13
- **Contexto:** Hoy las pruebas de gateway se ejecutan al 100% por UI (Playwright + browser). Falta una capa de tests API que (a) valide que las llamadas al backend MAGIIS funcionan tras integraciones nuevas, (b) actúe como red de seguridad ante regresiones cuando cambia algo del backend o del gateway. La estrategia es **arrancar básico**: primero confirmar que las llamadas funcionan, después escalar profundidad.
- **Objetivo del líder (textual):** *"primero evaluamos las llamadas funcionan en el proceso y después implementamos, para evaluar que en cambios si se llega a romper tenemos nuestra prueba"*.
- **Alcance acotado a 2 frentes**:
  1. **API contra MAGIIS backend** — validar el contrato MAGIIS ↔ gateway:
     - Hold (`POST /travels` o equivalente) responde 2xx + estado `SEARCHING_DRIVER`.
     - Capture (cobro al finalizar) actualiza el viaje a `FINALIZADO` con `paymentReference`.
     - Webhook callback de gateway → backend actualiza estado correctamente.
     - Vincular tarjeta al wallet → endpoint responde + tarjeta aparece en listado.
     - Reutilizar `tests/shared/utils/apiClient.ts` (ya integrado con `getCredentialsForRole`).
  2. **API directa contra Authorize.net sandbox** — validar el contrato externo:
     - `POST https://apitest.authorize.net/xml/v1/request.api` con `authOnlyTransaction` + Visa 4111 + CVV 900 → `responseCode = "1"`.
     - Mismo con ZIP 46282 → `responseCode = "2"` (declined).
     - Mismo con CVV 901 → CVV "N: Does NOT Match".
     - Útil como contrato externo: si Authorize cambia el sandbox, los tests fallan ANTES que los E2E.
- **Estructura sugerida**:

  ```text
  tests/features/gateway-pg/api/
  ├── magiis-backend/
  │   ├── hold-capture.api.spec.ts
  │   ├── webhook-callback.api.spec.ts
  │   └── wallet-link.api.spec.ts
  └── authorize-sandbox/
      ├── contract-happy.api.spec.ts
      ├── contract-decline.api.spec.ts
      └── contract-cvv-avs.api.spec.ts
  ```

- **Próxima acción:**
  1. Confirmar con backend MAGIIS los endpoints reales (paths, payloads, auth).
  2. Crear `tests/features/gateway-pg/api/` con primer spec piloto `authorize-sandbox/contract-happy.api.spec.ts` (no requiere ambiente MAGIIS — solo Authorize sandbox + credenciales).
  3. Iterar: smoke básicos primero, después profundidad.
- **Bloqueantes:** credenciales sandbox Authorize (paso 1 de BL-025) para el frente "API directa". Para el frente "MAGIIS backend" depende de documentación del backend.
- **Beneficio (palabras del líder):** red de seguridad para detectar regresiones cuando cambia código de integración — falla rápido a nivel API sin necesidad de correr la suite E2E completa.
- **Referencias:** `tests/shared/utils/apiClient.ts`, `docs/gateway-pg/authorize/ARCHITECTURE.md` §6 (endpoints), <https://developer.authorize.net/api/reference/index.html>, BL-025 (credenciales), BL-037 (switching)

### BL-037 — Test del switching de pasarela (Stripe ↔ Authorize)

- **Estado:** 🔴 Pendiente — bloqueado en captura de flujo
- **Prioridad:** P1 (precondición para habilitar suite Authorize)
- **Tipo:** Automatización (testing nuevo crítico)
- **Reportado:** 2026-05-13
- **Contexto:** MAGIIS opera con **una sola pasarela activa a nivel global**. Para activar Authorize hay que **desvincular Stripe → vincular Authorize**. NO es toggle por usuario ni por viaje — afecta todo el sistema. Documentado en `docs/gateway-pg/authorize/ARCHITECTURE.md` §1.bis.
- **Por qué P1:** sin este flujo automatizado, cada corrida de la suite Authorize requiere intervención humana previa. Es la precondición operacional para cualquier test de Authorize.
- **Side effects abiertos (TODO confirmar con backend):**
  1. Tarjetas guardadas en wallet bajo Stripe al momento del switch ¿quedan inválidas? ¿se purgan? ¿se migran como tokens externos?
  2. Viajes en estado `SEARCHING_DRIVER` o con `Hold` activo al momento del switch ¿qué pasa con el capture posterior?
  3. ¿Hay tiempo de propagación del cambio? ¿Algún viaje creado en la ventana entre desvinculación y vinculación rompe?
- **Plan de captura (acordado 2026-05-13)** — Playwright codegen:

  ```bash
  # Vos, con sandbox admin login activo:
  npx playwright codegen <URL_PANEL_ADMIN_SWITCHING>
  # Pasos a capturar:
  #   1. Login admin
  #   2. Navegar a configuración de pasarela
  #   3. Desvincular Stripe (capturar modal de confirmación)
  #   4. Vincular Authorize (capturar inputs API_LOGIN_ID + TRANSACTION_KEY)
  #   5. Confirmar el cambio
  #   6. Validar indicador visual del estado post-switch
  # Pegar spec generado en tests/features/gateway-pg/specs/authorize/admin/gateway-switching.spec.ts
  ```

- **Próxima acción:**
  1. Vos ejecutás el codegen contra sandbox admin → entregás spec crudo.
  2. Yo estabilizo selectores (`getByRole` / `getByTestId`), parametrizo credenciales con fixture users (a crear: `ADMIN_GATEWAY` en `tests/fixtures/users/web-portals/admin-gateway.ts`).
  3. Agregar helper `ensureActiveGateway('authorize' | 'stripe')` en `tests/features/gateway-pg/helpers/` con verificación + intentar switch si no coincide.
  4. Agregar suite `@gateway-switching` con 2 tests críticos:
     - Test 1: switch Stripe → Authorize. Asserts: indicador UI, side effect wallet (TODO), side effect transacciones pendientes (TODO).
     - Test 2: switch Authorize → Stripe (reset). Mismo set de asserts.
  5. Documentar en `docs/gateway-pg/authorize/matriz_cases.md` (sección admin) los TCs nuevos.
- **Bloqueantes:** captura humana del flujo + URL real del panel admin + credenciales admin sandbox.
- **Marker propuesto:** `@gateway-switching` (smoke crítico operacional, no concurrente con suites de cards).
- **Referencias:** `docs/gateway-pg/authorize/ARCHITECTURE.md` §1.bis (modelo exclusivo), BL-025 (runtime Authorize), BL-036 (API frente alternativo para validar el switch sin UI)

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
