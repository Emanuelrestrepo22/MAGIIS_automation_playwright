# Backlog operacional — magiis-playwright

> Fuente única de verdad para tareas pendientes, decisiones en espera y deuda técnica activa.
> **Regla:** toda sesión de trabajo debe arrancar validando este documento. Si un ítem aparece aquí como pendiente pero ya fue resuelto por otra vía, actualizar su estado en lugar de duplicarlo.

**Última revisión:** 2026-08-21 (Emanuel + Claude — instrumentación BL-049: la capa API de Authorize pasa de 7/12 a **11/12 verde**; el ticket se reduce a UN síntoma y su hipótesis principal queda refutada (es el ZIP del fixture happy, no la config de la cuenta). **BL-037 corregido**: pedía un codegen que ya no hace falta — el switching está implementado y la suite Authorize son 75 tests listos; el blocker pasó a ser de agenda (Stripe y Authorize compiten por el único ambiente donde se automatizan pasarelas). Anterior: 2026-08-11 (iteración completa Stripe web `carrier/stripe-full-iteration`: **BL-053** nuevo abierto (alta recurrente hold=ON+3DS=true no aterriza en Programados, confirmado en los 3 actores de la matriz recurrentes). Anterior: 2026-05-19 (Erika + Claude — análisis comparativo vs `https://playwright.dev/docs/intro` + best practices oficiales. **7 BLs nuevos abiertos** derivados del gap-analysis hacia estandarización y mejora continua: **BL-039** ESLint Playwright plugin (P1, guardrail estructural) + **BL-040** soft assertions + `expect.configure` por dominio (P3) + **BL-041** auth como project dependency reemplaza `global-setup.multi-role.ts` (P1, mitiga BL-002) + **BL-042** sharding CI con blob reporter (P1, alivia cuota GitLab — sinérgico con BL-035) + **BL-043** network mocking Stripe/Authorize + API project separado (P2, absorbe BL-036 al cerrarse) + **BL-044** visual regression dirigida modales 3DS + popups críticos (P2) + **BL-045** tags + grep para reemplazar 50 scripts npm proliferados (P3). Anterior: 2026-05-13 (15 hitos cerrados + 3 BLs nuevos abiertos. Hitos cerraron TIER 1/2/cleanup organización multi-gateway + BL-024 6 fases + BL-009 fases 3.0/3.1/3.2/4 + BL-025 docs Authorize (agent Opus) + BL-028 piloto + BL-035 cleanup + BL-036 frente B plantilla API + **mejora continua orquestador** DRY JOURNEY_DEFAULTS + STRIPE_CARD_BY_LAST4 extraído al fixture + JSDoc deuda Strategy Pattern; nuevos abiertos: BL-036 / BL-037 / BL-038).

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

- **Estado:** 🟡 Datos + docs QA listos (2026-07-20). Runtime (POM/specs) pendiente — bloqueado por modelo de integración backend + confirmación de uso en PROD LATAM.
- **Prioridad:** P2
- **Tipo:** Investigación
- **Reportado:** 2026-04-27
- **Avance 2026-07-20 (análisis doc oficial + poblado del slot):** analizada <https://www.mercadopago.com.ar/developers/es/docs/your-integrations/test/cards>. **Hallazgo:** el outcome lo determina el **nombre del titular** (keyword: APRO/OTHE/SECU/FUND…); número/CVV/exp fijos (`11/30`); approved usa DNI `12345678`; sin 3DS. Poblados `tests/fixtures/gateways/mercado-pago/{cards.ts, card-policy.ts, card-resolver.ts, README.md}` (16 keywords de estado + catálogo de 5 tarjetas). Conectado `_shared/resolver.ts` (`MERCADO_PAGO_INTENT_MAP`: `HAPPY_NO_AUTH`→APRO, `DECLINE_AUTHORIZE`→OTHE, `DECLINE_INVALID_CVC`→SECU + `normalizeMercadoPagoCard`, que pasa `holderName` como trigger). Doc QA completa en `docs/gateway-pg/mercado-pago/`. `tsc --noEmit` OK. **Falta runtime** — ver `docs/gateway-pg/mercado-pago/EXTERNAL-BLOCKERS.md`.
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

- **Estado:** 🟡 Datos + docs QA listos (2026-07-20). Runtime (POM/specs) pendiente — bloqueado por modelo de integración backend + confirmación de uso en PROD.
- **Prioridad:** P3
- **Tipo:** Investigación
- **Reportado:** 2026-04-27
- **Avance 2026-07-20 (análisis doc oficial + poblado del slot):** analizada <https://developer.ebizcharge.net/connect/docs/test-credit-card-numbers>. **Hallazgo:** el outcome lo determina el **número de tarjeta** (como Stripe, NO CVV/ZIP como Authorize); exp fija `0930`; sin 3DS. Poblados `tests/fixtures/gateways/ebizcharge/{cards.ts, card-policy.ts, card-resolver.ts, README.md}` (registry con outcome de negocio + tablas de referencia completas AVS/CVV2/CAVV/Card Level). Conectado `_shared/resolver.ts` (`EBIZCHARGE_INTENT_MAP`: `HAPPY_NO_AUTH`/`DECLINE_AUTHORIZE`/`DECLINE_INVALID_CVC` + `normalizeEbizchargeCard`). Doc QA completa en `docs/gateway-pg/ebizcharge/{README,ARCHITECTURE,matriz_cases,TRACEABILITY,EXTERNAL-BLOCKERS,CHANGELOG}.md`. `tsc --noEmit` OK. **Falta runtime** (POM+specs) — ver `docs/gateway-pg/ebizcharge/EXTERNAL-BLOCKERS.md`.
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

### BL-038 — Strategy Pattern para CardForm multi-gateway (POM)

- **Estado:** 🔴 Pendiente — deuda estructural identificada en auditoría de mejora continua 2026-05-13.
- **Prioridad:** P1 (precondición técnica para BL-025 runtime POM Authorize)
- **Tipo:** Arquitectura / refactor estructural
- **Reportado:** 2026-05-13
- **Contexto:** Auditoría de organización 2026-05-13 detectó que `tests/pages/carrier/NewTravelPageBase.ts:fillPreauthorizedCard(last4)` está atado a Stripe:
  - Importa constantes Stripe-specific (`STRIPE_EXPIRY`, `STRIPE_CVC`, `STRIPE_BILLING_ZIP`, `STRIPE_CARD_HOLDER_NAME`).
  - Llena 3 iframes Stripe Elements (`cardNumber`, `cardExpiry`, `cardCvc`) directamente.
  - El registry `STRIPE_CARD_BY_LAST4` fue extraído al fixture canónico en sesión 2026-05-13 (mitigación parcial), pero la lógica de llenado del form sigue 100% Stripe-coupled.
- **Impacto multi-gateway:** cuando entre Authorize en runtime (BL-025), su POM va a ser DIFERENTE — Authorize.net no usa iframes Stripe; usa Accept.js (iframe único o form embebido) o API directa. Hoy NO hay forma limpia de switchear sin duplicar el POM completo.
- **Solución propuesta (Strategy Pattern):**
  - Crear interfaz `CardFormStrategy { fill(card: GenericTestCard): Promise<void>; assertReady(): Promise<void> }`.
  - Implementaciones por gateway:
    - `tests/pages/carrier/stripe/StripeCardForm.ts` (extraer el método actual).
    - `tests/pages/carrier/authorize/AuthorizeCardForm.ts` (nuevo cuando entre POM Authorize).
  - `NewTravelPageBase` recibe la strategy por DI o resuelve por config global (gateway activo del sistema, ver BL-037 switching exclusivo).
  - `fillPreauthorizedCard(last4)` se vuelve thin wrapper que delega a la strategy.
- **Alcance estimado:** 17 archivos consumers afectados (14 specs + 2 helpers + 1 e2e). Refactor controlado por el patrón ya validado en TIER 1 (re-exports preservan API legacy).
- **Bloqueantes:** ninguno técnico. Recomendación: ejecutar cuando entre el POM real Authorize (BL-025 paso 4) para validar el diseño contra DOS implementaciones reales, evitando over-engineering basado solo en Stripe.
- **Mitigación aplicada 2026-05-13:**
  - `STRIPE_CARD_BY_LAST4` movido a `tests/fixtures/gateways/stripe/card-by-last4.ts` (centralizado en SoT).
  - JSDoc en `fillPreauthorizedCard` documenta la deuda y apunta a este BL.
  - Import directo desde `fixtures/gateways/stripe/cards.ts` (no más vía `stripeTestData` legacy).
- **Referencias:** auditoría 2026-05-13 (commit `c8bf677` + tier docs), BL-024 ✅ (umbrella + resolver cross-gateway), BL-025 (runtime POM Authorize), BL-037 (gateway switching que determina qué strategy activar).

### BL-036 — Pruebas API smoke: MAGIIS backend + Authorize.net sandbox

- **Estado:** 🟡 Frente B (Authorize sandbox) plantilla técnica completa (commit `8eda8b7`, 2026-05-13). Frente A (MAGIIS backend) pendiente. Ambos esperan ejecución contra ambiente real.
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

- **Avance 2026-05-13 (commit `8eda8b7` — frente B plantilla completa):**
  - NUEVO `tests/shared/utils/authorize-api-client.ts` (286L): wrapper Playwright sobre APIRequestContext con operaciones `authOnlyTransaction`, `authCaptureTransaction`, `priorAuthCapture`, `voidTransaction`. Helper `hasAuthorizeCredentials()` para skipear sin credenciales. Error tipado `AuthorizeApiError` con response + body para debug.
  - NUEVOS 3 specs piloto en `tests/features/gateway-pg/api/authorize-sandbox/`:
    - `contract-happy.api.spec.ts` (3 tests: Visa/MC/Amex + CVV 900 → Response Code 1).
    - `contract-decline.api.spec.ts` (1 test: ZIP 46282 → Response Code 2).
    - `contract-cvv-avs.api.spec.ts` (3 tests: CVV 901/904 mismatch + AVS 46205 no-match).
  - NUEVO `tests/features/gateway-pg/api/README.md`: documenta ambos frentes + patrón canónico + plan de extensión.
  - **Skip strategy:** sin `AUTHORIZE_API_LOGIN_ID` o `AUTHORIZE_TRANSACTION_KEY` en env, los 7 tests se skipean con mensaje. NO rompe la suite — diseñado para coexistir con BL-025 paso 1 (credenciales humano).
- **Próxima acción:**
  1. ~~Crear plantilla frente B~~ ✅ Hecho (commit `8eda8b7`).
  2. Setear credenciales sandbox en `.env.test` cuando lleguen → ejecutar los 7 tests → esperado verde.
  3. Frente A: confirmar con backend MAGIIS los endpoints reales (paths, payloads, auth) → crear plantilla análoga en `api/magiis-backend/`.
  4. Iterar: extender a Partial/Prepaid (ZIPs 46225-46228), Hold + Capture combinados, Void de hold no-settled.
- **Bloqueantes:** ejecución contra ambiente real depende de (a) credenciales sandbox Authorize para frente B, (b) documentación backend MAGIIS para frente A.
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
- **Bloqueantes:** ~~captura humana del flujo + URL real del panel admin + credenciales admin sandbox~~ → **YA NO APLICAN, ver Actualización 2026-08-21.**
- **Marker propuesto:** `@gateway-switching` (smoke crítico operacional, no concurrente con suites de cards).

#### Actualización 2026-08-21 — el codegen YA NO HACE FALTA; el blocker cambió de naturaleza

Auditoría del código contra este ticket: **la "Próxima acción" 1-4 está implementada.** No pedir el codegen otra vez.

| Lo que este ticket pedía | Dónde está hoy |
| --- | --- |
| Spec del switch + selectores estables | `AppStoreGatewaysPage.ts` (POM nativo, docstring "✅ RECONCILIADO EN VIVO") |
| Vincular / impedir link inválido | ATCs `MG-220` / `MG-221` (Authorize), `MG-212` / `MG-213` (Stripe OAuth Connect) |
| Desvincular (`cleaningWallets`) | ATCs `MG-223` / `MG-215` |
| Exclusividad una-pasarela-por-carrier | ATCs `MG-224` / `MG-216` — regla confirmada en vivo |
| Helper `ensureActiveGateway()` | `GatewaySwitchSteps.ensureActiveGateway()` |
| Suite de switching | `defineGatewayConfigSuite()` (factory multi-gateway) × 3 consumidores: `stripe/config/`, `authorize/.../config/authorize-link-unlink.spec.ts`, `ebizcharge/.../config/` |

Y la suite Authorize completa existe: **75 tests en 13 archivos** (`tests/features/gateway-pg/specs/authorize/`), varios rotulados `[requiere GATEWAY_ALLOW_DESTRUCTIVE_SWITCH]`.

**El blocker real, y es de agenda, no técnico.** Combinando dos restricciones ya confirmadas:

- Las pasarelas se automatizan **solo en TEST** (UAT usa tarjetas reales → gateway en UAT es manual). ⇒ un único ambiente disponible.
- MAGIIS permite **una sola pasarela activa por carrier** (exclusividad, verificada con el probe read-only).

⇒ **Stripe y Authorize compiten por el mismo y único recurso.** Vincular Authorize no agrega cobertura: la *intercambia*, dejando fuera de servicio la suite Stripe mientras dure el switch, y afectando a cualquier otra sesión que comparta el carrier 1521.

- **Próxima acción (revisada):** ya no hay tarea de automatización pendiente acá. Lo que falta es **decidir la ventana** para correr Authorize (con `GATEWAY_ALLOW_DESTRUCTIVE_SWITCH=true` + aviso a quien comparta el carrier) y revertir el switch al terminar. Los "side effects abiertos" (wallet al switchear, viajes con hold activo, propagación) siguen sin confirmar con backend — ésos sí son preguntas de negocio genuinas.
- **Estado sugerido:** de 🔴 Pendiente a 🟡 (código listo, esperando ventana operativa).
- **Actualización 2026-07-20 (release Stripe 3DS, owner Emanuel):** el flujo de desvincular se está desarrollando como ticket de producto **MG-25** `[Stripe][Carrier v1] Modal de desvinculación` (`cleaningWallets(provider)`, estado `CLEANING_WALLETS→UNLINKED`). MG-25 **es el insumo** de este BL: la captura del modal de desvinculación y su cobertura alimentan el helper `ensureActiveGateway()`. La regresión UI cross-gateway con switching real es la **meta elegida** para el portafolio, con gate interino (sin switching) para esta release. **Toda prueba de pago corre en TEST** (UAT usa tarjetas reales). Detalle en `docs/gateway-pg/RELEASE-3DS-multigateway-test-plan.md` + matriz maestra por intents `docs/gateway-pg/MATRIZ-MAESTRA-multigateway.md`. Capa API: `magiis-api-e2e/docs/RELEASE-MG3-payments-api-plan.md`.
- **Referencias:** `docs/gateway-pg/authorize/ARCHITECTURE.md` §1.bis (modelo exclusivo), BL-025 (runtime Authorize), BL-036 (API frente alternativo para validar el switch sin UI), MG-25 (desvinculación = insumo del switching), `docs/gateway-pg/RELEASE-3DS-multigateway-test-plan.md`

### BL-048 — POMs gateway bilingües (EN|ES) — quitar el puente "forzar ES"

- **Estado:** 🟡 Puente aplicado (2026-07-20); hardening bilingüe pendiente.
- **Prioridad:** P2
- **Tipo:** Deuda técnica / robustez de automatización
- **Contexto (hallazgo del review Stripe 2026-07-20):** la cuenta TEST canónica es **"Remises EEUU" (US1000, país United States)** → el portal arranca en **inglés**. Los POMs/specs de `gateway-pg` hardcodean texto en **español** (`'Configuración Parámetros'`, `'Usuario a Buscar'`, `'Por asignar'`, `'Buscando chofer'`, `/^Guardar$/`…), así que fallaban en masa por idioma (no por bug de producto). La app cachea las traducciones i18n en `localStorage` y el idioma se cambia por un toggle "EN/ES" en el banner (dropdown).
- **Puente aplicado (para desbloquear el review):**
  - `ensureSpanishLanguage(page)` en `tests/pages/shared/i18n.ts` — abre el toggle del banner y selecciona "ES". Llamado desde `loginAsDispatcher`/`loginAsContractor` (`tests/features/auth/helpers/login.helpers.ts`) tras `ensureDashboardLoaded`.
  - `OperationalPreferencesPage` migrado a selectores bilingües (`CARRIER_L` en `tests/pages/shared/i18n.ts`).
- **Pendiente (hardening durable):** migrar los POMs compartidos restantes a bilingüe EN|ES (patrón `service-type-quota/pages/i18n.ts` + `pages/shared/i18n.ts`): `NewTravelPageBase` (placeholders cliente/pasajero/dirección, botones vehículo/enviar), `TravelManagementPage` (grilla "Por asignar"/"Buscando chofer"), `ThreeDSModal`, `ErrorPopup`, y los strings ES hardcodeados en los specs. Al completar, **eliminar el puente `ensureSpanishLanguage`** (o dejarlo solo como opt-in). Confirmar los EN reales en vivo (varios marcados `TODO(i18n)`).
- **Relación:** el review Stripe (Anexo B del plan) corre hoy gracias al puente; BL-002 (auth intermitente en TEST) sigue afectando la estabilidad de las corridas.
- **Referencias:** `tests/pages/shared/i18n.ts`, `tests/features/service-type-quota/pages/i18n.ts` (patrón previo), `tests/features/auth/helpers/login.helpers.ts`.

### BL-039 — ESLint Playwright plugin + reglas anti-anti-pattern

- **Estado:** 🟡 Plugin implementado en rama `scripts/eslint-playwright-plugin` (commit `e658807`, 2026-05-19). Pendiente merge a main. Baseline documentado: 478 violations totales (186 expect-expect, 118 consistent-spacing, 95 no-conditional-in-test, 30 no-wait-for-timeout, 19 no-skipped-test, 16 no-conditional-expect, 14 no-force-option, 10 valid-title, 7 prefer-locator, 2 no-wait-for-selector, 1 valid-describe-callback). Todas como warning por `eslint-plugin-only-warn`. Migración del baseline incremental — no big-bang.
- **Prioridad:** P1
- **Tipo:** Mejora / Infra (guardrail estructural)
- **Reportado:** 2026-05-19
- **Contexto:** Hoy `eslint . --ext .ts` corre con reglas TypeScript genéricas pero **no usa `eslint-plugin-playwright`**, por lo que anti-patterns explícitamente prohibidos en `CLAUDE.md` ("Sin `waitForTimeout` salvo diagnóstico", "Assertions funcionales, no solo de visibilidad", locators preferidos sobre CSS) sólo se validan en code review humano. Detectado como gap en análisis comparativo vs <https://playwright.dev/docs/best-practices> + `https://playwright.dev/docs/intro` (2026-05-19).
- **Propuesta concreta:**
  1. Instalar `eslint-plugin-playwright` y agregar al config (`.eslintrc` o flat config existente).
  2. Activar `plugin:playwright/recommended` + reglas estrictas: `no-wait-for-timeout` (error), `no-force-option` (error), `expect-expect` (error), `no-page-pause` (error), `prefer-web-first-assertions` (error), `no-conditional-in-test` (error), `no-skipped-test` (warn), `no-networkidle` (warn).
  3. Correr `pnpm lint --fix` para autofix de las que lo permitan; documentar excepciones manuales con `// eslint-disable-next-line` + comentario justificando.
  4. Mover `@typescript-eslint/no-floating-promises` a `error` (Playwright lo recomienda explícitamente).
  5. Validar que el hook pre-push (`pnpm pp`) ya invoca lint → si no, agregarlo al Check.
- **Beneficio:** automatiza la auditoría manual de `CLAUDE.md` (sección "QA automation — Playwright"). Bloquea regresiones de estilo en pre-commit sin gasto humano. Trazable: cualquier infracción aparece como error de lint con su file:line.
- **Esfuerzo:** S (1-2 días). Riesgo: bajo; los fixes son mecánicos o `eslint-disable` puntual.
- **Próxima acción:** crear rama `scripts/eslint-playwright-plugin`, agregar plugin + reglas, correr `pnpm lint` y categorizar errores existentes (autofix vs manual). MR con baseline de violations existentes documentadas.
- **Referencias:** <https://github.com/playwright-community/eslint-plugin-playwright>, sección "QA automation — Playwright" en `CLAUDE.md`, BL-035 (CI desactivado — habilitar lint en CI cuando se reactive)

### BL-040 — Soft assertions en E2E híbridos + `expect.configure` por dominio

- **Estado:** 🟡 Trabajo en 2 ramas paralelas (2026-05-19):
  - `scripts/expect-configure-soft-assertions` (`b51c35f`, usuario original)
  - `scripts/soft-assertions-expect-extend` (`008cfad`, segunda iteración con helper `assertSoftThenFail` + piloto migrado en `flow1.e2e.spec.ts`)
  Decidir cuál mergear o consolidar en un MR único antes de cerrar.
- **Estado:** 🟡 Piloto implementado en rama `scripts/soft-assertions-expect-extend` (2026-05-19). NUEVO `tests/utils/expect-extend.ts` con 4 configures (expect3DS 30s, expectGatewaySettle 20s, expectFast 2s, expectAuth 15s) + helper `assertSoftThenFail(testInfo)` para fail consolidado. NUEVO `tests/utils/README.md` documentando convención. Spec piloto migrado: `tests/e2e/gateway/flow1-carrier-driver/flow1.e2e.spec.ts` con `expect.soft` en bloques BRIDGE + VALIDATE + cierre `assertSoftThenFail`. Migración bulk del resto pendiente.
- **Prioridad:** P3
- **Tipo:** Mejora (calidad de evidencia + claridad declarativa)
- **Reportado:** 2026-05-19
- **Contexto:** Dos mejoras menores acopladas detectadas en análisis vs best practices Playwright:
  1. **Soft assertions:** en `tests/e2e/gateway/flow1-carrier-driver/flow1.e2e.spec.ts` (y flows 2/3), un fallo en assertion 5 de 8 corta el spec y NO genera evidencia de 6/7/8. La fase móvil Appium queda sin contexto del estado web final. `expect.soft()` permite acumular fallos sin abortar.
  2. **`expect.configure` por dominio:** hoy hay timeouts manuales en specs Stripe 3DS (`actionTimeout: 15_000` global + custom en spec). Mejor patrón canónico: helpers tipados por dominio.
- **Propuesta concreta:**
  1. Crear `tests/utils/expect-extend.ts` con:
     - `expect3DS = expect.configure({ timeout: 30_000 })` — modales bancarios.
     - `expectFast = expect.configure({ timeout: 2_000 })` — assertions sincronicas DOM.
     - `expectGatewaySettle = expect.configure({ timeout: 20_000 })` — confirmaciones post-API.
  2. Migrar 5-8 specs de mayor impacto al patrón (no big-bang).
  3. En flows E2E híbridos (`tests/e2e/gateway/flow*`), reemplazar assertions secuenciales por `expect.soft()` cuando la pérdida temprana arruina la captura de contexto de la fase siguiente.
  4. Cerrar con `expect(test.info().errors).toHaveLength(0)` al final del spec para falla controlada.
- **Beneficio:** elimina magic numbers en specs, mejora dump de evidencia en E2E híbridos (menos re-runs), trazabilidad explícita por dominio.
- **Esfuerzo:** XS (medio día por capa).
- **Próxima acción:** crear `tests/utils/expect-extend.ts` con los 3 configures + migrar `flow1.e2e.spec.ts` como piloto. Documentar en `tests/utils/README.md` cuándo usar cada uno.
- **Referencias:** <https://playwright.dev/docs/test-assertions#soft-assertions>, <https://playwright.dev/docs/test-assertions#expectconfigure>, BL-024 (multi-gateway resolver — `expect.configure` por gateway es candidato natural)

### BL-041 — Auth como project dependency (reemplaza `global-setup.multi-role.ts`)

- **Estado:** 🔴 Pendiente
- **Prioridad:** P1
- **Tipo:** Refactor estructural / Deuda técnica
- **Reportado:** 2026-05-19
- **Contexto:** `global-setup.multi-role.ts` hace login secuencial para los 3 roles (carrier/contractor/web) antes de cualquier test. Si falla la auth de **cualquier rol** se aborta TODA la suite — bloqueante directo de BL-002 (TC1033 auth intermitente). Desde Playwright 1.31, el patrón canónico es **proyectos `setup` con `dependencies`**: cada rol tiene su setup project independiente que solo corre si el test consumidor lo requiere.
- **Propuesta concreta:**
  1. Crear `tests/setup/carrier.setup.ts`, `tests/setup/contractor.setup.ts`, `tests/setup/web.setup.ts` — cada uno hace login del rol + guarda `storageState`.
  2. Actualizar `playwright.config.ts`:

     ```ts
     projects: [
       { name: 'setup-carrier', testMatch: /carrier\.setup\.ts/ },
       { name: 'setup-contractor', testMatch: /contractor\.setup\.ts/ },
       { name: 'carrier', dependencies: ['setup-carrier'], use: { storageState: '...' } },
       { name: 'contractor', dependencies: ['setup-contractor'], use: { storageState: '...' } },
     ]
     ```

  3. Eliminar `globalSetup: './global-setup.multi-role.ts'` del config (queda como referencia hasta validar).
  4. Replicar el cambio en `playwright.gateway-pg.config.ts`.
  5. Migrar `tests/features/smoke/specs/portals.smoke.spec.ts` para que **consuma** el storageState del project en lugar de hacer login full en cada test (mitigación BL-002 — el smoke ya no replica el login).
- **Beneficio:**
  - Auths **paralelas** (hoy secuencial) → reduce tiempo de bootstrap ~50%.
  - Si corres solo `--project=carrier`, NO se ejecuta auth de contractor (hoy sí).
  - BL-002 (TC1033 intermitente) mitigado: el retry del setup project es independiente del test consumidor; smoke deja de duplicar auth.
  - UI Mode muestra fase setup como nodo visible → debugging visual de auth.
- **Esfuerzo:** M (3-4 días — refactor controlado + validación contra suite gateway).
- **Riesgo:** medio. Mitigación: feature branch obligatoria (`scripts/auth-project-dependency`), correr suite completa local antes de MR, mantener `global-setup.multi-role.ts` archivado 1 sprint por si hay rollback.
- **Próxima acción:** crear rama, refactor incremental (carrier primero), validar `pnpm test:test:smoke` en TEST live antes de migrar contractor.
- **Referencias:** <https://playwright.dev/docs/auth#authenticate-with-a-setup-project>, BL-002 (auth intermitente — primer beneficiario), `global-setup.multi-role.ts`, `tests/config/runtime.ts` (getStorageStatePath)

### BL-042 — Sharding CI con blob reporter (alivia cuota GitLab)

- **Estado:** 🔴 Pendiente
- **Prioridad:** P1
- **Tipo:** Mejora / Infra CI
- **Reportado:** 2026-05-19
- **Contexto:** La memoria global [`project_gitlab_ci_quota`](../../C:/Users/Erika/.claude/projects/c--Users-Erika-OneDrive---MAGIIS-USA-LLC--1--Escritorio-magiis-playwright/memory/project_gitlab_ci_quota.md) registra que el cupo mensual GitLab CI se agotó. Hoy los pipelines corren **secuenciales en 1 runner**, lo que multiplica el wall-clock por la cantidad de specs. Playwright soporta `--shard=N/M` nativo desde 1.20 + reporter `blob` para consolidar resultados de shards en un único HTML report.
- **Propuesta concreta:**
  1. Cuando se reactive CI (post BL-035), implementar matrix con 3-4 shards:

     ```yaml
     # .gitlab-ci.yml
     test:
       parallel:
         matrix:
           - SHARD: ["1/4", "2/4", "3/4", "4/4"]
       script:
         - npx playwright test --shard=$SHARD --reporter=blob
       artifacts:
         paths: [blob-report/]
     merge:
       needs: [test]
       script:
         - npx playwright merge-reports --reporter=html ./blob-report
       artifacts:
         paths: [playwright-report/]
     ```

  2. Validar que `fullyParallel: true` ya está activo en `playwright.config.ts` (✅ confirmado).
  3. Excluir suites con `--workers=1` requerido (Stripe 3DS) del sharding → correrlas como job separado serial.
  4. Documentar la matriz en `docs/ci/README.md` (a crear o anexar a MERGE-POLICY.md).
- **Beneficio:**
  - 4 shards = ~4x menos wall-clock por pipeline → más pipelines en la misma cuota mensual.
  - 1 sólo HTML report consolidado (mejor UX que 4 reports separados).
  - Cada shard en runner fresco → reduce flakiness por contaminación de estado.
- **Esfuerzo:** M (2-3 días — config CI + 1-2 corridas piloto + ajuste de balanceo).
- **Bloqueante operativo:** BL-035 (CI desactivado) — habilitar primero el pipeline base antes de optimizar.
- **Próxima acción:** rama `scripts/ci-sharding`, prototipar el YAML, correr piloto con `--shard=1/2 + 2/2` (sólo 2 shards primero para reducir riesgo), validar el merge-reports localmente.
- **Referencias:** <https://playwright.dev/docs/test-sharding>, <https://playwright.dev/docs/test-reporters#blob-reporter>, BL-035 (CI desactivado — precondición), `memory/project_gitlab_ci_quota.md`

### BL-043 — Network mocking Stripe/Authorize + API project separado

- **Estado:** 🟡 Estructura + piloto en rama `e2e/network-mocking-gateway` (commit `e15a578`, 2026-05-19). `playwright.gateway-pg.config.ts` gana 2 projects: `unit` (matchea `*.unit.spec.ts`, network mocking) + `api` (matchea `*.api.spec.ts`, testDir override `tests/features/gateway-pg/api/`). Piloto `tests/features/gateway-pg/specs/stripe/unit/stripe-card-declined.unit.spec.ts` mockea Stripe API → `card_declined` con `page.route()`. README explicativo + 2 scripts npm nuevos (`test:test:gateway-pg:unit`, `:api`). Cierra parcialmente BL-036 frente B (API project formalizado). Assertions UI específicas marcadas como TODO (requieren inspección manual vs MAGIIS TEST live).
- **Estado:** 🟡 Estructura + piloto en rama `e2e/network-mocking-gateway` (2026-05-19). `playwright.gateway-pg.config.ts` gana 2 projects nuevos: `unit` (network mocking, matchea `*.unit.spec.ts`) + `api` (contract tests Authorize sandbox, matchea `*.api.spec.ts` con testDir propio en `tests/features/gateway-pg/api/`). Spec piloto `tests/features/gateway-pg/specs/stripe/unit/stripe-card-declined.unit.spec.ts` con `page.route()` mockeando Stripe API → `card_declined` response. README explicando convención + cobertura recomendada. 2 scripts npm nuevos: `test:test:gateway-pg:unit` y `:api`. Assertions UI específicas marcadas como TODO (requieren inspección manual vs MAGIIS TEST live). Cierra parcialmente BL-036 frente B (API project formalizado).
- **Prioridad:** P2
- **Tipo:** Mejora / Cobertura
- **Reportado:** 2026-05-19
- **Contexto:** Hoy **el 100% de la suite gateway pega a sandbox Stripe/Authorize real**. Esto implica: (a) cualquier latencia o caída del sandbox flakea suite local + CI, (b) edge cases que sandbox no permite forzar fácil (timeouts SDK, network errors, JSON malformados de gateway) NO se prueban. Además, BL-036 frente B tiene plantilla de API tests pero no hay project Playwright dedicado a API (vive como specs que igual cargan browser).
- **Propuesta concreta dividida en 2 frentes acoplados:**
  1. **Network mocking** — capa nueva de specs `tests/features/gateway-pg/specs/<gateway>/unit/*.unit.spec.ts`:
     - `page.route('**/api.stripe.com/**', route => route.fulfill({ status: 402, json: { error: { code: 'card_declined' } } }))`.
     - Validar SÓLO el comportamiento MAGIIS frente a cada response del SDK (qué muestra la UI, qué redirige, cómo loggea).
     - <2s por spec vs >30s contra sandbox.
  2. **API project separado** — formalizar BL-036:

     ```ts
     {
       name: 'api',
       testDir: './tests/features/gateway-pg/api',
       use: { baseURL: process.env.API_BASE_URL ?? process.env.BASE_URL },
       // sin browser = corre 10x más rápido + libera CPU
     }
     ```

  3. Reporter separado para `api` (más austero, sin trace ni video).
- **Beneficio:**
  - Specs `unit` reproducibles 100% (sin dependencia de sandbox externo).
  - Coverage de edge cases hoy no probados (timeouts, network errors, response shapes inválidas).
  - API project sin browser → reduce uso CPU/memoria en CI, menos cuota consumida (sinérgico con BL-042).
  - Cierra BL-036 frente B en estado 🟢 al integrarlo como project formal.
- **Esfuerzo:** M (3-4 días — 1 día por project + 2 días por mocks piloto en 3-4 escenarios críticos).
- **Mantener:** specs E2E contra sandbox como segunda capa de validación (no reemplazar, complementar).
- **Próxima acción:** rama `e2e/network-mocking-gateway`, empezar con `card_declined` Stripe como piloto + agregar `api` project a `playwright.gateway-pg.config.ts`.
- **Referencias:** <https://playwright.dev/docs/mock>, <https://playwright.dev/docs/network>, <https://playwright.dev/docs/test-api-testing>, BL-036 (API frente B — se cierra al absorberlo), BL-027 (eBizCharge slot — patrón mocking reutilizable)

### BL-044 — Visual regression dirigida (modales 3DS + popups críticos)

- **Estado:** 🟡 Piloto en rama `e2e/visual-regression-3ds-modal` (commit `cfdb19b`, 2026-05-19). Modal 3DS Stripe taggeado para visual regression con `toHaveScreenshot`. Resto de componentes (popup unhappy, CardLinking, ThreeDSErrorPopup) pendientes.
- **Prioridad:** P2
- **Tipo:** Mejora / Cobertura
- **Reportado:** 2026-05-19
- **Contexto:** Hoy las assertions son textuales/estructurales. Si Stripe Elements cambia el layout de su iframe 3DS (cambio externo), los selectores actuales pueden seguir matcheando pero la UI estar visualmente rota. `toHaveScreenshot` de Playwright es el patrón canónico — pero el riesgo de adopción big-bang es alto (baselines a mantener). Solución: **scope quirúrgico**.
- **Propuesta concreta:**
  1. Identificar 5-8 componentes de alto riesgo de regresión visual:
     - Modal 3DS Stripe (challenge frame).
     - Popup "no se pudo realizar el pago" (referencia memoria [`project_bug_viaje_calle_unhappy`](../../C:/Users/Erika/.claude/projects/c--Users-Erika-OneDrive---MAGIIS-USA-LLC--1--Escritorio-magiis-playwright/memory/project_bug_viaje_calle_unhappy.md)).
     - Formulario CardLinking (Stripe).
     - Formulario CardLinking (Authorize) — pieza nueva BL-024.
     - ThreeDSErrorPopup.
  2. Crear suite `tests/features/gateway-pg/specs/visual/` con `await expect(component.frame).toHaveScreenshot('3ds-stripe-challenge.png', { maxDiffPixelRatio: 0.02, mask: [dynamicTimestamp] })`.
  3. **Scope acotado:** NO full-page. SOLO el componente (`locator.screenshot` con clipping).
  4. Documentar política de actualización de baselines en `tests/features/gateway-pg/specs/visual/README.md` (cuándo regenerar, quién aprueba).
  5. Integrar como project opcional (`--project=visual` solo en pipelines selectivos para no quemar cuota CI).
- **Beneficio:**
  - Detecta cambios de UI silenciosos en gateway donde un cambio de Stripe Elements puede romper UX sin que ningún test funcional falle.
  - Cobertura del bug histórico documentado en memoria global (popup unhappy paths).
- **Esfuerzo:** M (3-5 días — 1 día por componente con baseline + revisión cross-OS).
- **Riesgo:** mantenimiento de baselines. Mitigación: scope acotado a 5-8 componentes, no full-page, política clara de actualización.
- **Próxima acción:** rama `e2e/visual-regression-dirigida`, piloto con modal 3DS Stripe (componente más estable), iterar con popup unhappy.
- **Referencias:** <https://playwright.dev/docs/test-snapshots>, <https://playwright.dev/docs/screenshots>, BL-024 (Authorize CardForm — visual regression natural), `memory/project_bug_viaje_calle_unhappy.md`

### BL-045 — Tags + grep para reemplazar scripts npm proliferados

- **Estado:** 🟡 Implementado en rama `scripts/tags-canonical` (commit `b27caca`, 2026-05-19). NUEVO `docs/ci/TAGS.md` con convención de tags (capa/dominio/gateway/intent/estado). Tags aplicados a 41 specs Stripe (piloto). `package.json` con 11 scripts canónicos `test:*` (antes >50). 15 scripts deprecados con `echo + exit 1` (sprint de gracia). Scripts UAT/PROD migrados a `--grep`. Follow-ups: taggear Authorize post-BL-024, taggear suite smoke a nivel describe, taggear e2e híbridos, borrar wrappers DEPRECATED en sprint+1.
- **Prioridad:** P3
- **Tipo:** Mejora / Mantenibilidad
- **Reportado:** 2026-05-19
- **Contexto:** `package.json` tiene >50 scripts `test:*` (`test:test:gateway-pg:stripe:3ds`, `test:gateway:smoke`, `test:gateway:critical`, `test:gateway:cargo`, etc.). El patrón es **procedural por carpeta**; cada nueva combinación de scope requiere agregar un script. Esto rompe el principio "ejecución declarativa" + dificulta onboarding (cuál corro?). Playwright nativo soporta tags con `@` en describe/title + `--grep`.
- **Propuesta concreta:**
  1. Adoptar convención de tags en describe/title:
     - `@smoke @critical @regression` — capa de cobertura.
     - `@gateway @auth @navbar` — dominio.
     - `@stripe @authorize @mercadopago` — pasarela.
     - `@hold @3ds @capture @decline` — intent.
     - `@flaky` — known-flaky con retry alto.
  2. Reducir scripts npm a un set canónico chico (≤15):

     ```bash
     pnpm test:smoke          # --grep "@smoke"
     pnpm test:critical       # --grep "@critical"
     pnpm test:gateway-3ds    # --grep "@gateway @3ds"
     pnpm test:gateway-stripe # --grep "@stripe"
     ```

  3. Documentar matriz tag → cobertura en `docs/ci/TAGS.md`.
  4. Mover scripts deprecados a `package.json.archive` antes de borrar (sprint 1 de gracia).
- **Beneficio:**
  - Matriz declarativa: el slogan no procedural ("dame todo lo que sea 3DS + Stripe" en lugar de "corre el script test:test:gateway-pg:stripe:3ds").
  - Onboarding: 15 scripts < 50 scripts.
  - CI matrix más limpia (`--grep=@critical` en lugar de N jobs YAML).
- **Esfuerzo:** S (2 días — tag manual de specs existentes + actualizar package.json + docs).
- **Riesgo:** bajo. Mitigación: mantener scripts deprecados 1 sprint con `echo "DEPRECATED, use ..."`.
- **Próxima acción:** rama `scripts/tags-canonical`, taggear suite gateway primero (mayor impacto), reducir 50 scripts → 15.
- **Referencias:** <https://playwright.dev/docs/test-annotations#tag-tests>, sección "Convenciones de test cases" en `CLAUDE.md`, BL-042 (sharding — beneficio compuesto cuando el matrix CI usa grep en lugar de scripts)

### BL-046 — Rename del proyecto a `qa-gateway-magiis` (completo)

- **Estado:** 🟡 En progreso — capa interna (paquete + docs + scripts) aplicada en rama `scripts/rename-qa-gateway-magiis`. Rename de repos remotos + integraciones pendientes (acción humana).
- **Prioridad:** **P1 (crítico)**
- **Tipo:** Refactor / branding / infra
- **Reportado:** 2026-05-28
- **Motivación:** alinear el nombre del paquete con el alcance real (focalizado en gateway de pagos MAGIIS, no automatización genérica). Aprovechar para corregir el typo histórico `magiiss-playwright` (doble 's') en `package.json`.
- **Alcance acordado:** "rename completo (incluye repos)".

#### Capa 1 — Interno (aplicado por agente)

- ✅ `package.json` + `package-lock.json` — campo `name` actualizado a `qa-gateway-magiis`
- ✅ 18 archivos en `docs/`, `.env.example`, `.gitattributes`, `.husky/`, `commitlint.config.cjs`, `.github/CODEOWNERS` — 22 refs reemplazadas
- ✅ 6 archivos en `scripts/` + `tests/` — 11 refs reemplazadas
- ❌ `.claude/agents/**` y `.claude/skills/**` — **NO se tocaron**. Las refs en estos archivos apuntan a la identidad de la skill canónica `magiis-playwright-docs-to-drafts` (nombre del directorio + frontmatter `name:`), que es identidad propia, no del paquete. Renombrarlas rompería el contrato agent ↔ skill.
- ❌ `plugins/magiis-playwright-explorer/**` — **NO se tocó**. Plugin con identidad propia (displayName, brandColor).
- ❌ URLs `github.com/Emanuelrestrepo22/MAGIIS_automation_playwright` y `gitlab.com/repo.magiis/magiis-testing` — **NO se tocaron**. Esperan al rename del repo remoto (Capa 2).
- ❌ `docs/reports/CI-WEEKLY-*.md` + `docs/gateway-pg/stripe/CHANGELOG.md` — **NO se tocaron**. Snapshots históricos.

#### Capa 2 — Repos remotos (acción humana requerida)

Checklist (en orden):

1. **GitHub UI** → repo `MAGIIS_automation_playwright` → Settings → Rename → `qa-gateway-magiis`. Confirmar que GitHub configura redirect automático desde el nombre viejo.
2. **GitLab UI** → proyecto `magiis-testing` → Settings → General → Advanced → Change path → `qa-gateway-magiis`. Confirmar que GitLab configura redirect desde el path viejo.
3. **Local — actualizar remotes:**

   ```bash
   git remote set-url github https://github.com/Emanuelrestrepo22/qa-gateway-magiis.git
   git remote set-url gitlab https://gitlab.com/repo.magiis/qa-gateway-magiis.git
   git fetch --all  # verifica que los redirects funcionan
   ```

4. **Mirror push GitLab → GitHub:** GitLab Settings → Repository → Mirroring repositories → editar la URL de destino con el nuevo nombre. Probar con "Update now".
5. **GitHub Actions secrets:** revisar si algún workflow hardcodea el nombre del repo (`${{ github.repository }}` se actualiza solo, pero strings literales no).
6. **GitLab CI variables:** mismo chequeo en `.gitlab-ci.yml`.
7. **Integraciones externas:** verificar que sigan apuntando al repo correcto:
   - Trello board nombre / descripción
   - Slack / Teams channels asociados
   - Cualquier dashboard externo (Grafana, etc.)
8. **README badges:** las URLs de los badges (`actions/workflows/*.yml/badge.svg`) tendrán que regenerarse si los workflows ven el repo nuevo. Posiblemente actualizar las URLs en `README.md` Capa 1 después del rename UI.
9. **Carpeta local (opcional):** renombrar `magiis-playwright/` → `qa-gateway-magiis/`. Pausar OneDrive antes para evitar reparse points. No urgente — Git no depende del nombre del directorio.
10. **Verificación final:**

    ```bash
    git config --get remote.github.url    # debe contener qa-gateway-magiis
    git config --get remote.gitlab.url    # idem
    pnpm install                          # debe pasar sin warnings de "name"
    pnpm exec tsc --noEmit                # debe pasar
    ```

#### Riesgos

- Si las MRs/PRs abiertos al momento del rename usaban el path viejo, GitLab/GitHub deberían replicarlos via redirect. Si alguna integración usa la URL hardcoded de la API (no `${{ github.repository }}`), puede romperse.
- El mirror GitLab → GitHub puede dejar de funcionar hasta que se actualice la URL de destino (paso 4).
- Si `.gitlab-ci.yml` o GitHub Actions usan paths absolutos con el nombre del repo, deben actualizarse.

#### Próxima acción

- **Humano:** ejecutar Capa 2 (pasos 1-10). Estimación: 30-45 min si nada se rompe.
- **Agente:** abrir issue de seguimiento si surge fricción en algún paso, o agregar tarea de cleanup para URLs hardcoded en README después del rename del repo.

#### Referencias

- Rama: `scripts/rename-qa-gateway-magiis`
- PR GitHub / MR GitLab pendientes de abrir post-merge

---

### BL-052 — Config de pnpm 11: `.npmrc` muerto + placeholders de `allowBuilds` rompen `pnpm run`

- **Estado:** 🟢 Resuelto (2026-07-28)
- **Prioridad:** P1
- **Tipo:** Configuración
- **Reportado:** 2026-07-28
- **Contexto:** Dos defectos independientes en la config de pnpm, ambos detectados al verificar un install limpio en un worktree nuevo (pnpm 11.4.0). **(a)** `.npmrc` declaraba `node-linker=hoisted`, pero desde pnpm 11 ese archivo solo se lee para auth y registry: la clave se mudó a `pnpm-workspace.yaml` como `nodeLinker` (camelCase). Confirmado en vivo: `pnpm config get node-linker` → `undefined` con la línea en `.npmrc`, → `hoisted` con la clave en el YAML. npm además avisa `Unknown project config "node-linker"`. Efecto: todos los worktrees corrían con el linker `isolated` mientras el repo creía estar en `hoisted`. **(b)** `pnpm-workspace.yaml` tenía dos placeholders del codemod v10→v11 sin resolver (`edgedriver: set this to true or false`, `geckodriver: ...`). pnpm 11 corre un deps-status check antes de cualquier script, así que en un install limpio **cualquier** `pnpm run <script>` abortaba con `ERR_PNPM_IGNORED_BUILDS` y exit 1.
- **Decisión tomada:** NO restaurar `hoisted`. El linker `isolated` es justo lo que destapó la dependencia fantasma `allure-js-commons` (importada por `tests/utils/decorators.ts` sin estar declarada en `package.json`); volver a plano vuelve a enmascarar esa clase de bug. El motivo original del `hoisted` — symlinks colgados por OneDrive — sigue vigente solo para el clone bajo OneDrive, no para los worktrees de `C:\worktrees\*`. Si ese clone lo necesita, se configura local con `pnpm config set nodeLinker hoisted --location project`.
- **Próxima acción:** Ninguna. Verificado en worktree limpio: `pnpm install` sin `ERR_PNPM_IGNORED_BUILDS`, `pnpm run test:test:gateway:unit` arranca, `npx tsc --noEmit` exit 0.
- **Referencias:** `.npmrc`, `pnpm-workspace.yaml`, rama `scripts/allure-js-commons-dep`, commit `6e53441` (declaración de `allure-js-commons`), BL-023 (política de hotspot files)

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

### BL-046 — MX-6057: verificación de efecto vía endpoint de lectura de uso (alternativa a la capa DB)

- **Estado:** 🔴 Pendiente
- **Prioridad:** P2
- **Tipo:** Mejora / Validación
- **Reportado:** 2026-07-16
- **Contexto:** La capa DB del cupo (`oracledb` Thin mode) quedó implementada (`tests/features/gateway-pg/helpers/oracle-service-usage.ts` + `counts-reset-db.api.spec.ts`), pero requiere una conexión Oracle **alcanzable** — el Oracle de UAT probablemente esté firewalleado desde local. Alternativa sin Oracle: descubrir el endpoint de lectura de uso del app (el que alimenta el contador en Gestión de Empresas → Associates) y aseverar el efecto real (uso → 0, aislamiento) vía API.
- **Próxima acción:** Capturar por red el endpoint de lectura de uso (en Associates o al chequear cupo en alta de viaje, en un entorno estable), agregar helper de lectura API + aserción de efecto que complemente/reemplace la capa DB.
- **Referencias:** ATR MX-6122, `oracle-service-usage.ts`, `counts-reset-db.api.spec.ts`, BL-047

#### Avance 2026-07-29 — CONFIRMADO, y no es solo UAT: **TEST tampoco es alcanzable desde local**

Este registro suponía que el firewall afectaba a UAT ("el Oracle de UAT **probablemente** esté firewalleado desde local"). Medido hoy al intentar cerrar el eje DB de la Ronda 1 de Authorize: **el Oracle de TEST (`magiis-test-v2`) tampoco responde desde esta máquina.** La suposición pasa a hecho, y con alcance mayor al registrado.

Diagnóstico en tres niveles, para que quede descartado todo lo que no es:

| Prueba | Resultado |
| --- | --- |
| `oracleConfigFromEnv()` con `ENV=test` | ✅ resuelve (las 5 `ORACLE_*_TEST` de `.env.test` están pobladas) |
| DNS del host (`*.rds.amazonaws.com`) | ✅ resuelve a `52.15.107.228` |
| Control HTTPS a `apps-test.magiis.com:443` | ✅ 185 ms — la red del equipo funciona |
| **TCP crudo a `52.15.107.228:1521`** | ❌ **TIMEOUT** (dos intentos: 8 s y 12 s) |
| Oracle Thin (`select 1 from dual`) | ❌ `NJS-510: connection … timed out. Request exceeded "transportConnectTimeout" of 20 seconds` |

**Lo que esto descarta:** no son las credenciales (la config resuelve), no es DNS, no es Thin mode ni el verificador de contraseña (nunca se llega al handshake), no es el guard SELECT-only, no es el código. Es **acceso de red a la instancia RDS**: security group de AWS que no incluye la IP pública de esta máquina, o VPN requerida y ausente.

**Dato que vuelve esto accionable:** MG-166 (cascada de `cleaningWallets`) **sí** conectó contra `magiis-test-v2` el 2026-07-24 y dejó su verificación DB en verde. O sea que entre el 24 y el 29 **cambió algo** — el security group, o la red desde la que se corre. Vale preguntar a infra si se modificó la regla del puerto 1521, y desde qué IP/VPN se corrió aquella vez.

**Impacto medido en el release de pasarelas:** el eje DB de la trifuerza queda **no medible desde local**, y con él cuatro verificaciones que ya estaban diseñadas y listas:

1. **La más valiosa: AC9 idempotencia.** Existía la posibilidad de buscar `transaction_ref` con más de una fila aprobada en `MGW_TRANSACTIONS` — evidencia **directa** del doble cobro, sin crear ningún cobro. El veto CRITICAL del release sigue apoyado solo en "0 hits de `Idempotency` en el código", que es evidencia de ausencia.
2. Estado de vinculación de Authorize en `MGW_LINKED` (hoy solo hay evidencia de UI, vía probe).
3. Sustento en DB para MG-285 / `TS-AUTHORIZE-WAL-01`, la única key verde real del release, hoy acreditada solo por UI.
4. El contraste de tarjetas por pasajero que explicaría por qué TC1011/TC1051 pasaron y TC1061 falló con el mismo flujo (ver Avance de BL-050).

**Además queda sin verificar el esquema de `MGW_TRANSACTIONS`.** `oracle-wallet.ts` documenta `transaction_ref` y `status IN ('APPROVED','CONFIRM')` como **asumidos, nunca ejecutados**; la verificación contra `USER_TAB_COLUMNS` era el primer paso y no pudo correr.

- **Próxima acción ampliada:** la alternativa por API que este ticket ya propone **deja de ser opcional** para el release de pasarelas: sin acceso a Oracle es el único camino a la capa de datos. Sube de prioridad. En paralelo, confirmar con infra el acceso al 1521 desde la red de QA, porque cuatro verificaciones diseñadas dependen de eso.
- **Evidencia:** medición del 2026-07-29 registrada en `.context/reports/gonogo-pasarelas-2026-07-29.md` (repo `agentic-qa-boilerplate`), sección del eje DB.

#### Avance 2026-07-29 (más tarde) — DESBLOQUEADO: el CTO habilitó la IP y la capa DB quedó medida

Habilitada la IP `190.137.114.50/32` en el security group, **la conexión funciona: 2126 ms contra `magiis-test-v2`**. Se ejecutaron 14 queries, todas SELECT, cero escrituras, sin imprimir credenciales.

**Primera verificación de esquema que existe en el repo** (contra `all_tab_columns`), y corrige un dato del propio código:

| Tabla | Resultado |
| --- | --- |
| `MGW_TRANSACTIONS` (16 cols) | ✅ el supuesto era **correcto**: `TRANSACTION_REF` y `STATUS` existen. Bonus: `PAYMENT_PROVIDER`, `CARRIERACCOUNT_ID`, `AMOUNT`, `TRANSACTION_TYPE`, `APPROVED_DATE` |
| `MGW_LINKED` (8 cols) | ⚠️ **el comentario de `oracle-wallet.ts:9-17` está equivocado**: afirma *"NO existe columna STATUS en el esquema observado"* y **sí existe**. Se puebla con `UNLINKED` al desvincular y es `NULL` mientras está activa — de ahí el error de quien lo escribió mirando una fila activa. **Conviene corregir ese comentario**, porque induce a inferir la desvinculación de `ACTIVE`/`DELETE_DATE` cuando hay una columna directa. |
| `USER_WALLET` (8 cols) | ✅ `CARRIERACCOUNT_ID` (sin guion). Trae `FIRST_NAME`/`LAST_NAME`/`EMAIL` |
| `CARD` (17 cols) | ✅ `LAST_FOUR_DIGITS`, `USER_WALLET_ID`, `PAYMENT_METHOD_ID` |

Valores reales — `STATUS`: `APPROVED` 171 · `CONFIRM` 131 · `REJECTED` 86 · `REQUEST` 32 · `CANCEL` 19 · `REQUIRES_ACTION` 16 (total 455). `PAYMENT_PROVIDER`: `STRIPE` 343 · `MERCADOPAGO` 78 · `EBIZ` 27 · `AUTHORIZE` 7.

**Advertencia operativa:** la IP habilitada es de un ISP residencial y muy probablemente **dinámica** — la regla `/32` se va a romper al renovar DHCP. Alternativas más estables ya propuestas: VPN a la VPC, bastion/túnel SSH, o CIDR de oficina con IP fija.

- **Estado sugerido:** el bloqueo de acceso quedó resuelto; la alternativa de lectura por API que este ticket propone vuelve a ser **opcional** (deseable por robustez, no imprescindible). Queda a criterio del dueño cerrarlo o reorientarlo a la estabilidad del acceso.

### BL-047 — MX-6057: discovery + validación del blueprint UI en CI estable

- **Estado:** 🔴 Pendiente
- **Prioridad:** P3
- **Tipo:** Infra / Validación
- **Reportado:** 2026-07-16
- **Contexto:** La captura en vivo de selectores/endpoints (tabla Associates, mensaje "sin cupo", endpoint de lectura de uso) es inestable localmente por OneDrive + lentitud del SPA (dropdowns que no abren, form vacío, búsqueda de empresas que no filtra). En un runner CI limpio la discovery y la validación del blueprint UI `TS-MX6057-E2E-CUPO` serían confiables.
- **Próxima acción:** Ejecutar la discovery + completar los `TODO(codegen)` del blueprint UI (`tests/features/service-type-quota/`) en CI; quitar el `test.fixme` una vez validado.
- **Referencias:** `tests/features/service-type-quota/specs/cupo.e2e.spec.ts`, BL-046

### BL-049 — Cuenta Authorize.net del ambiente TEST: los magic triggers ZIP/CVV no se evalúan

- **Estado:** 🔴 Pendiente — diagnóstico avanzado, causa raíz no confirmada
- **Prioridad:** P2
- **Tipo:** Configuración / Investigación
- **Reportado:** 2026-07-27
- **Contexto:** Re-diagnóstico de los 11 fallos de BL-036 a partir de la evidencia recuperada (`%TEMP%/pw-logs/authorize-sandbox-final.log`). **El registro previo de BL-036 era incorrecto**: no es "credenciales sandbox sin habilitar para magic-number triggers" — las credenciales conectan y las transacciones **aprueban** (`resultCode: 'Ok'`, `responseCode: 1`). El request tampoco es el problema: `AuthorizeSandboxApi.buildAuthOnlyPayload()` arma el payload canónico correcto (`transactionType` → `amount` → `payment.creditCard.cardCode` → `billTo.zip`).

  Síntomas reales, que son **una sola causa** y no tres: (a) `cvvResultCode` vuelve **vacío incluso en el happy path con CVV 900**, donde debería ser `M`; (b) los ZIP `46205` y `46204`, que deben dar códigos AVS **distintos** (`N` y `G`), devuelven **el mismo valor**; (c) el ZIP `46282` aprueba (`RC 1`) en vez de declinar (`RC 2`). Dos ZIP distintos con idéntica respuesta ⇒ el ZIP no se evalúa; CVV válido sin result code ⇒ el card code no se evalúa; si el ZIP no se evalúa, el trigger de decline nunca aplica. El único test que pasó (*Discover + CVV 900 → RC 1*) es el único que asserta solo `responseCode` y ningún result code.

  Datos verificados: los triggers que usa la matriz están **todos correctos** según la [testing guide oficial](https://developer.authorize.net/hello_world/testing_guide.html) (ZIP 46282→decline · 46205→N · 46204→G · 46211/46214/46217/46207/46203→W/X/Z/R/E · CVV 900/901/902/903/904→M/N/S/U/P). El endpoint de los specs es `https://apitest.authorize.net/xml/v1/request.api` (sandbox). El `AUTHORIZE_API_LOGIN_ID` de `.env.test` **coincide** con el API Login ID vinculado en el MAGIIS App Store ⇒ specs API y pasarela de MAGIIS comparten la misma cuenta, así que un solo fix desbloquea ambas capas. Test Mode **descartado**: el dev confirmó que la cuenta está en **Live** y que se configuró así a propósito para el ambiente TEST.

  Hipótesis abierta principal: los magic triggers ZIP/CVV son una función del **sandbox** de Authorize, no del modo Live/Test. Si la cuenta se administra en `account.authorize.net` (producción) en vez de `sandbox.authorize.net`, el `46282` es un código postal cualquiera y ningún trigger aplica. Dato en contra que impide afirmarlo: las transacciones aprueban con Visa `4111111111111111`, que en procesamiento real se rechazaría. Hipótesis secundaria: filtros **AVS** y **Card Code Verification (CCV)** deshabilitados en la cuenta.
- **Próxima acción:** Dos verificaciones cortas en el Merchant Interface: (1) **Account → Settings → API Credentials & Keys** → confirmar si el API Login ID empieza en `9jJ` (el de `.env.test`); si no coincide, hay dos cuentas y se está midiendo la equivocada. (2) **Account → Settings → sección de seguridad / Fraud Detection Suite** → estado de *Address Verification Service (AVS)* y *Card Code Verification (CCV)*. Si el usuario no tiene permisos sobre Security Settings, escalar a quien administre la cuenta.
- **Impacto en la campaña Authorize:** mientras no se resuelva, los casos de outcome no-happy **no son provocables**: A3 (decline ZIP 46282) y A5 (CVV 901) de la Ola A, más los ~19 casos AVS/partial/CVV del bloque exploratorio. Los happy path (A1, A2, A4) **no se ven afectados**. La capa API (12 tests contract) queda como evidencia del gap, no como acreditación.
- **Defecto colateral detectado:** el `refId` de los specs `authorize-sandbox` excede el límite documentado. El propio código anota *"max 20 chars"* pero `bl-036-cvv-mismatch-${Date.now()}` produce ~33. No causó estos fallos (`resultCode: 'Ok'`), pero es riesgo de errores intermitentes → truncar a 20.
- **Referencias:** BL-036 (registro previo, diagnóstico a corregir), `tests/components/api/AuthorizeSandboxApi.ts`, `tests/features/gateway-pg/api/authorize-sandbox/*.api.spec.ts`, `docs/gateway-pg/authorize/EXTERNAL-BLOCKERS.md`, plan `~/.claude/plans/quiet-marinating-reddy.md` §1.5

#### Avance 2026-07-28 — el diagnóstico queda PARCIALMENTE REFUTADO por medición en vivo

Corrida de la Ronda 1 de Authorize (`--project=api`, 12 tests, ambiente `test`): **7 PASSED · 4 FAILED · 1 SKIPPED**. El registro anterior predecía 8 fallos sobre 12.

**Los magic triggers de CVV y AVS SÍ se evalúan ahora.** Tres casos que este ticket declara imposibles pasaron en verde:

| Caso | Esperado | Resultado 2026-07-28 |
| --- | --- | --- |
| CVV 901 → `cvvResultCode` `N` | síntoma (a): volvía vacío | ✅ PASSED |
| ZIP 46205 → `avsResultCode` `N` | síntoma (b): mismo valor que 46204 | ✅ PASSED |
| ZIP 46204 → `avsResultCode` `G` | síntoma (b) | ✅ PASSED |
| ZIP 46225 → aprobación parcial | ~19 casos no provocables | ✅ PASSED |
| ZIP 46228 → prepaid procesado | ídem | ✅ PASSED |

Lo más probable es que se hayan activado los filtros **AVS / Card Code Verification** en el Merchant Interface — exactamente la *Próxima acción* (2) de este ticket. Conviene confirmarlo con quien administre la cuenta y dejarlo asentado.

**Persisten dos síntomas, con alcance mucho menor al registrado:**

1. **El happy path con CVV 900 devuelve `cvvResultCode: "P"` (Is NOT Processed) donde debería dar `M`.** Reproducido en Amex (`contract-happy.api.spec.ts:73`). Es el síntoma (a), pero restringido al happy path — no a todos los casos de CVV.
2. **El ZIP 46282 sigue aprobando en vez de declinar** (síntoma (c), sin cambios).

**Tres de los cuatro fallos tienen `messages.resultCode: "Error"`**, no un código de resultado distinto del esperado: la transacción fue **rechazada por la API**, no evaluada. Afecta a `contract-cvv-avs` (CVV 904), `contract-decline` (ZIP 46282) y `contract-happy` (Visa y Amex).

**El `refId` queda DESCARTADO como causa** (contra lo que sugería el *Defecto colateral detectado*). Correlacionado uno a uno: los que fallan miden 31-32 caracteres y varios de los que pasan miden 33-35 (`bl-036-edge-avs-nonus-` = 35 ✅). La longitud no explica nada.

- **Próxima acción actualizada:** (1) confirmar con el administrador de la cuenta si se activaron AVS/CCV entre el 27 y el 28 de julio, y asentar la fecha; (2) **capturar `response.messages.message[0]` en los asserts de `authorize-sandbox`** — hoy los specs asertan `resultCode === 'Ok'` sin loguear el mensaje de error, así que un `Error` de la API es indiagnosticable desde el log y esa es la razón por la que la causa raíz de los 3 fallos sigue abierta; (3) recién con ese mensaje, decidir si el ticket se cierra parcialmente.
- **Evidencia:** `evidence/test/xray-results.authorize.api.json`, log de la corrida en `%TEMP%/claude/authorize-api-run.log`, reporte `.context/reports/gonogo-pasarelas-*.md` del repo `agentic-qa-boilerplate`.

#### Avance 2026-08-21 — instrumentación aplicada; el ticket se reduce a UN síntoma

Se ejecutó la *Próxima acción* (2): `describeAuthorizeFailure()` en `AuthorizeSandboxApi.ts` expone `messages.message[]` + `transactionResponse.errors[]` + `responseCode`, y los 11 asserts de `resultCode` de los 4 specs lo usan como mensaje de fallo. También se truncó `refId` al límite de 20 chars (conservando el SUFIJO, que es donde vive el timestamp que da unicidad).

**Resultado de la corrida (`--project=api`, 12 tests): 11 PASSED · 1 FAILED.** Progresión del ticket: 8 fallos previstos → 4 (Ronda 1) → **1**.

Lo que quedó CERRADO, con medición:

| Síntoma registrado | Estado 2026-08-21 |
| --- | --- |
| (c) ZIP 46282 aprueba en vez de declinar | ✅ **RESUELTO** — `responseCode: '2'` correcto |
| 3 fallos con `resultCode: "Error"` (API rechaza el request) | ✅ **NO REPRODUCEN** — los 11 asserts de `resultCode` pasan |
| `messages.length > 0` en el decline | ✅ **Era bug de test** — ver abajo |

**Bug de test corregido (no era del sandbox):** el spec de decline exigía el motivo en `transactionResponse.messages[]`. Medido en vivo, un RC 2 lo publica en `transactionResponse.errors[]` y deja `messages` vacío:

```json
{"responseCode":"2","avsResultCode":"Y","cvvResultCode":"M","transId":"80058532235",
 "testRequest":"0","errors":[{"errorCode":"2","errorText":"This transaction has been declined."}]}
```

El assert ahora acepta ambas fuentes sin relajar la exigencia de que el motivo exista.

**Único síntoma que PERSISTE — y su hipótesis principal queda REFUTADA.** El happy path con CVV 900 devuelve `cvvResultCode: "P"` donde debería dar `M`. Pero NO es "la cuenta no tiene CCV habilitado", porque los triggers de CVV **sí se evalúan**:

| CVV | ZIP | `cvvResultCode` | ¿Correcto? |
| --- | --- | --- | --- |
| 901 (no match) | 90210 | `N` | ✅ el trigger funciona con ZIP arbitrario |
| 904 (not processed) | 90210 | `P` | ✅ el trigger funciona |
| **900 (match)** | **90210** | **`P`** | ❌ esperado `M` |
| **900 (match)** | **46282** | **`M`** | ✅ el MISMO CVV 900 sí da `M` |

Misma card (Visa 4111), mismo CVV 900: con ZIP `46282` (trigger reconocido) reporta `M`; con ZIP `90210` (arbitrario) reporta `P`. Los triggers de *no-match* se reportan con cualquier ZIP; el de *match* parece necesitar que el ZIP también sea evaluable. Es decir: **el blocker se reduce a que el fixture del happy path usa un ZIP fuera de la tabla de triggers del sandbox** — no a configuración de cuenta ni a permisos. `testRequest: "0"` confirma además que la cuenta NO está en Test Mode.

- **Próxima acción (revisada):** decidir el fix del test `Echo CVV (M)` — cambiar el ZIP del fixture happy a uno que active la evaluación y siga aprobando (requiere identificar cuál en la testing guide), o re-encuadrar la expectativa a `P` documentando que con ZIP neutro el CVV no se confirma. **Es un cambio de sujeto de test → requiere decisión, no se aplicó.** Las verificaciones (1) en el Merchant Interface pierden urgencia: ya no son la causa raíz.
- **Evidencia 2026-08-21:** corrida `--project=api` 11/12 verde; payload del decline citado arriba (probe temporal, ya removido).

### BL-050 — Divergencia de negocio: duplicado de tarjetas en wallet (Authorize rechaza, Stripe permite)

- **Estado:** 🔴 Pendiente — regla de negocio confirmada en vivo, spec por desarrollar
- **Prioridad:** P2
- **Tipo:** Automatización (cobertura nueva) / Regla de negocio
- **Reportado:** 2026-07-27 (hallazgo del líder de QA, validado manualmente en TEST)
- **Contexto:** Comportamiento **divergente entre pasarelas** al intentar vincular una tarjeta que **ya existe** en la billetera del pasajero:
  - **Authorize.Net**: el sistema **no permite el duplicado** — el botón **`Valid`** (validar tarjeta) **no se habilita**. Comportamiento considerado **correcto** por negocio. Para poder volver a llenar el formulario hay que **eliminar** la tarjeta ya asociada; en el segundo intento el botón sí se habilita.
  - **Stripe**: **no distingue** duplicados y permite agregar **hasta 20 tarjetas idénticas** en una misma wallet.

  Flujo de borrado desde UI, capturado en la grabación `tests/test-3.spec.ts` (líneas 48-49): `.deselect-payment-method` (first) → botón **`Delete`**.
- **Impacto en la automatización (ya observado):** explica el `timedOut` de **TS-AUTHORIZE-WAL-01** (240s) en la corrida del 2026-07-27. La factory `wallet-add-card` tiene precondición de borrado **por API** (`deletePassengerCard` + `paxSearchQueries`), pero cuando la API no resuelve el pax la tarjeta queda y el botón `Valid` nunca habilita ⇒ el test agota el timeout esperando un botón que por diseño no se va a habilitar. Afecta a **todo** caso Authorize con `cardFlow: 'new'` (A1/TC1011, C1/TC1061, C2/TC1051, C3/TC1201…).
- **Próxima acción:**
  1. **Fallback UI de borrado** en la precondición de `cardFlow: 'new'`: si la API no encuentra/borra la tarjeta, borrarla por UI (`.deselect-payment-method` → `Delete`) antes de llenar el form. Desbloquea los casos con tarjeta nueva.
  2. **Fail-fast en vez de timeout**: si `Valid` no habilita en N segundos y la tarjeta ya estaba en la wallet, fallar con mensaje explícito ("duplicado no permitido — precondición no limpió la tarjeta") en lugar de agotar 240s. Patrón ya existente en `NewTravelPageBase` (*"Validar button never enabled"*, fail-fast 8s).
  3. **Spec nuevo de la divergencia** (pedido del líder de QA): cubrir que **Stripe permite N tarjetas iguales** en la wallet y que **Authorize lo bloquea**. Es cobertura que la matriz Authorize **no tiene** (§2.2 sólo cubre alta de tarjeta nueva válida/CVV/AVS/expiry/Luhn — no el duplicado). Antes de desarrollarlo hay que **crear el TC en la matriz** y asignarle ID canónico (regla de trazabilidad de CLAUDE.md: prohibido inventar IDs) — marcar como `[SIN-ID-MATRIZ]` hasta entonces.
- **Pregunta abierta para negocio/dev:** ¿el límite de 20 tarjetas de Stripe es una regla intencional de MAGIIS o el default del proveedor? ¿Debería MAGIIS unificar el comportamiento entre pasarelas (bloquear duplicados en todas)? Si la respuesta es sí, el comportamiento de Stripe pasa a ser un **defect**, no una divergencia aceptada.
- **Referencias:** `tests/test-3.spec.ts` (grabación del flujo, untracked), `tests/features/gateway-pg/specs/_parametrized/factories/wallet-add-card.factory.ts`, `tests/features/gateway-pg/helpers/card-precondition.ts`, `docs/gateway-pg/authorize/matriz_cases2.md` §2.2, BL-049

#### Avance 2026-07-28 — NO se reprodujo en la Ronda 1

Los tres casos que este ticket predecía en `timedOut` **pasaron en verde**:

| Caso | Predicción del ticket | Resultado 2026-07-28 |
| --- | --- | --- |
| `TS-AUTHORIZE-WAL-01` | `timedOut` 240 s (el botón *Válido* nunca se habilita) | ✅ PASSED — y exporta MG-285 |
| `TS-AUTHORIZE-TC1011` (A1, `cardFlow: new`) | afectado | ✅ PASSED |
| `TS-AUTHORIZE-TC1051` (C2, `cardFlow: new`) | afectado | ✅ PASSED |

O sea, la precondición de borrado por API (`cleanupCardsByLast4` → `deletePassengerCard`) **sí resolvió el pax y borró la tarjeta** en esta corrida, que es justamente el paso que el ticket describe como fallido. El mecanismo descrito no está refutado —la divergencia de negocio (Authorize rechaza duplicados, Stripe los permite) sigue siendo real y está confirmada en vivo— pero **su manifestación como timeout es intermitente, no determinista**.

Contraste útil dentro de la misma corrida: `TS-AUTHORIZE-TC1061` (C1, también `cardFlow: new`, cliente empresa individuo) **sí falló**, con timeout de 15 s en `selectPreauthorizedCardMethod("1111")` (`CarrierNewTravelPage.ts:524`) después de que su paso 3 borrara la tarjeta con éxito. Mismo patrón de flujo, resultado distinto según el cliente → apunta a estado del wallet por pasajero, no a la regla de duplicado en sí.

- **Próxima acción actualizada:** antes de invertir en el fix de la precondición, instrumentar por qué el borrado resuelve el pax para algunos clientes y no para otros (comparar TC1011/TC1051 contra TC1061 con el mismo dato). Bajar la prioridad del fix si se confirma que es intermitente y no bloqueante.
- **Evidencia:** log de la corrida UI en `%TEMP%/claude/authorize-ui-run.log`, `evidence/test/xray-results.authorize.ui.json`.

#### Avance 2026-07-29 (DB) — el fallo de TC1061 queda EXPLICADO, y no es este ticket

Con acceso a Oracle habilitado, la consulta de tarjetas por dueño en el carrier 1521 cierra la pregunta que este avance dejaba abierta:

| `userId` | Nombre | Tarjetas |
| --- | --- | --- |
| 15156 | Emanuel smith | `0015` (master), `0002` (amex) |
| **12055** | **Emanuel Restrepo** | **`1111` (visa)** |

La tarjeta `1111` pertenece **solo** al pasajero `12055`. **TC1061 es el caso de empresa individuo, cuyo pasajero es otro y nunca tuvo esa tarjeta vinculada** → el desplegable de Forma de Pago no la ofrece → `selectPreauthorizedCardMethod('1111')` agota sus 15 s (`CarrierNewTravelPage.ts:524`). Eso explica exactamente por qué TC1011 y TC1051 pasan y TC1061 no, con el mismo `cardFlow: 'new'`.

**Lo que queda descartado como causa:** la precondición de borrado por API, la regla de duplicado de Authorize, y cualquier defecto de producto. **Es un problema de DATOS DE PRUEBA**: el caso de empresa individuo apunta a una tarjeta que vive en el wallet de otro pasajero.

- **Próxima acción reorientada:** el fix no va en `card-precondition.ts` sino en los **datos del caso de empresa individuo** — o vincular la `1111` al pasajero de ese cliente como precondición explícita, o apuntar el caso a una tarjeta que ese pasajero sí tenga. Revisar `journey-defaults` / los datos del cliente de empresa. La divergencia de negocio que este ticket describe (Authorize rechaza duplicados) sigue siendo real y no se ve afectada por este hallazgo.
- **Evidencia:** 14 queries SELECT del 2026-07-29 registradas en `.context/reports/gonogo-pasarelas-2026-07-29.md` §5.bis (repo `agentic-qa-boilerplate`).

### BL-051 — El hold se aplica DOS veces (vinculación + viaje): ¿se libera el hold de vinculación?

- **Estado:** 🟢 **RESUELTO (2026-07-28)** — el hold de vinculación **SÍ se libera automáticamente**. Sin riesgo de fondos retenidos.
- **Prioridad:** ~~P1~~ cerrado
- **Tipo:** Regla de negocio / Investigación

- **RESOLUCIÓN — evidencia del dashboard del sandbox** (`demo.authorize.net` → Payments → Manage Transactions, acceso habilitado 2026-07-28). Las transacciones de la corrida automatizada muestran el patrón completo:

  | Hora (PDT) | Transaction ID | Monto | Estado | Qué es |
  |---|---|---|---|---|
  | 05:21:26 | `80057687426` | *(vacío)* | **Voided** | hold de VINCULACIÓN — anulado |
  | 05:21:35 | `80057687427` | **$180.31** | **Authorized** | hold del VIAJE |
  | 05:26:25 | `80057687495` | *(vacío)* | **Voided** | hold de vinculación — anulado |
  | 05:26:33 | `80057687497` | **$180.31** | **Authorized** | hold del viaje |

  Conclusiones, con las 3 preguntas del ítem respondidas:
  1. **¿Se emite void del hold de vinculación?** SÍ — queda en estado `Voided` automáticamente, 8-9 segundos antes del hold del viaje. **No hay holds huérfanos** sobre los fondos del cliente; el riesgo que motivó el P1 no existe.
  2. **¿De qué monto es?** El hold de vinculación **no registra monto** (columna Amount vacía) → verificación de $0.00. El hold del viaje sí lleva la tarifa completa (`$180.31`).
  3. **¿Difiere entre pasarelas?** Sin verificar para Stripe/MP — sólo se confirmó Authorize. No bloquea: el comportamiento observado es el correcto.

  La regla de las DOS transacciones por alta de viaje queda **confirmada por evidencia del lado de la pasarela**, no sólo por observación de UI.
- **Efecto en la automatización:** no hace falta cambiar las assertions. El oráculo sigue siendo la columna de la grilla; el dashboard queda como verificación de respaldo para triaje (ver la nota de BL-049 sobre cómo distinguir fallo de backend vs rechazo de gateway).
- **Reportado:** 2026-07-27 (aporte del líder de QA, validado en vivo en TEST)
- **Contexto:** El hold **no se aplica una sola vez**. En el flujo de alta de viaje con tarjeta nueva hay **dos** transacciones contra la pasarela:
  1. **Hold de vinculación** — el botón "Validar" / "Valid" del formulario de tarjeta **no es una validación de formato**: dispara una transacción de hold real contra la pasarela. Esto explica que el paso de validación pueda fallar con *"Error al validar tarjeta. Por favor, revise los datos ingresados."* aun con los 5 campos correctamente completados (verificado en el snapshot de la corrida TC1011 del 2026-07-27: número `4111 1111 1111 1111`, `12/30`, CVV `900`, titular `MAGIIS QA Test`, ZIP `90210` — todos presentes en el DOM y el error igual apareció). El fallo es de la pasarela, no del fill.
  2. **Hold del viaje** — al dar de alta el viaje, por el monto de la tarifa.

  Confirmado en las 3 grabaciones validadas en PASS por QA (2026-07-27), que cubren los 3 actores de la Ola A: `tests/test-3.spec.ts` (**app pax / personal**, TC1011), `tests/test-4.spec.ts` (**colaborador de contractor** `fast car` / `smith, Emanuel`, TC1051) y `tests/test-6.spec.ts` (**empresa individuo** `Stripe, Marcelle`, TC1061).
- **Pregunta abierta (el núcleo del ítem):** ¿el **hold de vinculación** se libera (void) después de validar la tarjeta, o queda retenido? Si queda retenido, **cada validación de tarjeta deja un hold huérfano** sobre los fondos del cliente. En una suite automatizada que revalida tarjetas en cada corrida el efecto se multiplica. Consultar con dev/backend:
  - ¿Se emite `voidTransaction` sobre el hold de vinculación?
  - ¿De qué monto es ese hold? (Authorize suele usar $0.00 o $0.01 para verificación; si usa el monto del viaje, el impacto es mayor.)
  - ¿Difiere el comportamiento entre pasarelas (Stripe usa `setupIntent` sin hold vs Authorize `authOnlyTransaction`)?
- **Próxima acción:** (1) preguntar a dev por el void del hold de vinculación y su monto; (2) verificarlo en el Merchant Interface de Authorize → Transaction Search, contando transacciones por alta de viaje (deberían aparecer 2 y, si hay void, una anulada); (3) si el hold de vinculación NO se libera, abrir defect en DEV/MX (nunca en MG — MG es sólo entidades Xray).
- **Impacto en la automatización:** las assertions de los TC de hold deberían contemplar **dos** transacciones, no una. Documentado en el JSDoc de `tests/features/gateway-pg/helpers/stepwise-hold-journey.ts`.
- **Referencias:** `tests/test-3.spec.ts`, `tests/test-4.spec.ts` (grabaciones, untracked), `tests/features/gateway-pg/helpers/stepwise-hold-journey.ts`, BL-049 (la pasarela no evalúa triggers), BL-050 (duplicado en wallet), `docs/gateway-pg/authorize/matriz_cases2.md` §5 (Voids)

### BL-053 — Alta recurrente hold=ON+3DS=true no aterriza en "Programados" (queda en "Asignar")

- **Estado:** 🔴 Pendiente
- **Prioridad:** P2
- **Tipo:** Bug (producto/backend)
- **Reportado:** 2026-08-11
- **Contexto:** En el alta de **Viaje Recurrente** (carrier, `POST carriers/{id}/travels` con `recurringValue`/`recurringEnd` en el payload — mismo endpoint que un alta normal), cuando la combinación es **hold=ON + tarjeta 3DS=true**, el challenge 3DS post-envío se aprueba correctamente (`completeSuccess` PASS, `travelId`/código web capturados del POST), pero el viaje **NO** aparece en la pestaña "Programados" de Gestión de Viajes — queda en "Asignar" indefinidamente. Confirmado que NO es latencia corta: se probó con re-fetch activo (búsqueda por código exacto + Enter cada 500ms) durante 30s continuos sin que el viaje migre de pestaña.
  **Aislamiento del eje roto** — confirmado reproducible 1:1 en los **3 actores** de la matriz de Viajes Recurrentes (misma falla exacta, mismo archivo:línea):
  - App Pax — `[TS-STRIPE-P2-TC052]` (`apppax-recurrente.spec.ts`)
  - Colaborador — `[TS-STRIPE-P2-TC045]` (`colaborador-recurrente.spec.ts`)
  - Empresa Individuo — `[TS-STRIPE-P2-TC058]` (`empresa-recurrente.spec.ts`)

  Los casos vecinos de cada matriz SÍ aterrizan bien en "Programados": mismo hold=ON sin 3DS (TC048/TC041/TC054) y mismo 3DS=true con hold=OFF (TC053/TC046/TC059) — el quiebre es específicamente la combinación **hold=ON + 3DS=true**, y específicamente en altas **recurrentes** (un alta normal — no recurrente — con la misma combinación no fue afectada en el resto de la suite `hold/`).
- **Evidencia:** Screenshot filtrando por el código exacto del viaje: `Asignar (1) / Programados (0) / En Conflicto (0)`. Los 3 tests fallan con el mismo `expect.poll` timeout en `TravelManagementPage.expectTripRowInCurrentTab` tras 30s de re-fetch activo.
- **Hipótesis:** el backend podría clasificar el estado inicial de un alta recurrente-con-3DS distinto a un alta recurrente simple — quizás por el timing del POST relativo a la resolución del challenge, o por una interacción entre `recurringValue`/`recurringEnd` y el motor de auto-asignación que no se dispara en altas recurrentes sin 3DS.
- **Próxima acción:** reportar a dev/backend con la evidencia de los 3 actores. Preguntar específicamente: ¿el motor de auto-asignación evalúa el viaje ANTES de que el 3DS post-envío se resuelva, clasificándolo por error como "pendiente de asignación inmediata" en vez de "programado para más tarde"?
- **Mitigación aplicada en tests:** los 3 TCs quedaron gateados con `test.skip` citando esta evidencia exacta — no se enmascaró bajando la severidad del assert ni ensanchando el timeout indefinidamente.
- **Referencias:** `tests/components/steps/RecurrentesSteps.ts`, `tests/pages/carrier/TravelManagementPage.ts` (`expectTripRowInCurrentTab`), commits `fcf2679` / `5333458` / `1707246` (worktree `carrier/stripe-full-iteration`)

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
