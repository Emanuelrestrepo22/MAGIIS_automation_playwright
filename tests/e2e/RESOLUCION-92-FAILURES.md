# Plan de resolución — 92 tests fallando
> Fecha inicio: 2026-04-16 | Ejecutor: Orquestador e2e
> Actualizar estado de cada ítem al completar.

---

## Clasificación por causa raíz

| Grupo | Causa | Tests | Tipo |
|---|---|---|---|
| **A** | `limitExceeded=false` — pasajero appPax sin tarjeta activa en TEST | ~41 | Datos de ambiente |
| **B** | `waitForURL` timeout — URL redirige a `?limitExceeded=false` en lugar de `/travels/<id>` | ~36 | Bug automatización |
| **C** | `OperationalPreferencesPage.goto()` hardcodea `/home/carrier/` — falla en contractor | ~8 | Bug automatización |
| **D** | e2e Flow 1 — mismo patrón que Grupo B (`waitForURL` post-submit) | 2 | Bug automatización |
| **E** | TC078 edicion-programados — causa a investigar | 1 | Investigar |

---

## Sprint 1 — Fix automatización: OperationalPreferencesPage [ ]

**Objetivo:** resolver Grupo C (8 tests)
**Archivos:** `tests/pages/carrier/OperationalPreferencesPage.ts`
**Fix:** `goto()` debe detectar portal desde `page.url()` igual que `TravelManagementPage`

| TC | Suite | Estado |
|---|---|---|
| TS-STRIPE-P2-TC001 | contractor/colaborador-hold-no3ds | [ ] pendiente |
| TS-STRIPE-P2-TC002 | contractor/colaborador-hold-no3ds | [ ] pendiente |
| TS-STRIPE-P2-TC003 | contractor/colaborador-hold-no3ds | [ ] pendiente |
| TS-STRIPE-P2-TC004 | contractor/colaborador-hold-no3ds | [ ] pendiente |
| TS-STRIPE-P2-TC005 | contractor/colaborador-hold-3ds   | [ ] pendiente |
| TS-STRIPE-P2-TC006 | contractor/colaborador-hold-3ds   | [ ] pendiente |
| E2E-FLOW3-TC001   | e2e/flow3-contractor-driver       | [ ] pendiente |
| E2E-FLOW3-TC002   | e2e/flow3-contractor-driver       | [ ] pendiente |

**Resultado sprint:** [x] PASS — fix aplicado
**Commit:** pendiente (agrupado con Sprint 2)

---

## Sprint 2 — Fix automatización: waitForURL post-submit [ ]

**Objetivo:** resolver Grupo B + D (hasta 38 tests)

**Diagnóstico completado — hallazgos del agente:**

| Aspecto | apppax-no3ds (PASA) | colaborador-no3ds (FALLA) |
|---|---|---|
| Pasajero | Emanuel Restrepo | Nayla Smith |
| Cliente | Emanuel Restrepo | fast car |
| `waitForURL /travels/<id>` después submit | **NO lo usa** | **SÍ lo usa** (timeout 15s) |
| storageState | `{ cookies: [], origins: [] }` | `undefined` |
| Causa probable | Tarjeta/límite OK | `limitExceeded=false` — Nayla sin tarjeta o límite bloqueado |

**Conclusión crítica:**
- apppax-no3ds pasa porque NO espera redirección a `/travels/<id>` — valida por `TravelManagementPage`
- colaborador falla porque SÍ espera la URL y el backend redirige a `?limitExceeded=false`
- **La causa real es de datos (Nayla Smith sin tarjeta activa en TEST)**, no de código
- Estos tests se mueven al Sprint 3 (datos de ambiente)

**Acción de código pendiente:**
- [ ] Verificar si `empresa-hold` usa el mismo pasajero que colaborador o uno propio
- [ ] Verificar `apppax-hold-3ds` — usa Emanuel Restrepo pero falla → diferente causa

**Diagnóstico requerido:**
- [ ] ¿Por qué falla apppax-3ds si usa el mismo pasajero que apppax-no3ds (que pasa)?
- [ ] Revisar diferencia entre la lógica post-submit de 3DS vs no3DS

| Bloque | Tests | Estado |
|---|---|---|
| Hold colaborador no3ds (16 tests) | TC1033–TC1048 | [ ] pendiente |
| Hold empresa no3ds + 3ds (16 tests) | TC1065–TC1080 | [ ] pendiente |
| Hold apppax 3ds (8 tests) | TC1053–TC1064 | [ ] pendiente |
| e2e Flow 1 TC001/TC002 | E2E-FLOW1-TC001/002 | [ ] pendiente |

**Resultado sprint:** [ ] PASS / [ ] FAIL
**Commit:** pendiente

---

## Sprint 3 — Datos de ambiente: limitExceeded=false [ ]

**Objetivo:** resolver Grupo A (41 tests cargo-a-bordo)
**Acción requerida (Admin):**
- [ ] Verificar que Emanuel Restrepo (appPax TEST) tiene tarjeta 4242 activa para Cargo a Bordo
- [ ] Si no: vincular tarjeta desde portal admin TEST
- [ ] Re-run cargo-a-bordo suite completa

| Bloque | Tests | Estado |
|---|---|---|
| cargo-a-bordo apppax (happy + declines + antifraud + 3ds) | TC1081–TC1095 | [ ] bloqueado Admin |
| cargo-a-bordo colaborador | TC1096–TC1110 | [ ] bloqueado Admin |
| cargo-a-bordo empresa | TC1111–TC1121 | [ ] bloqueado Admin |

**Resultado sprint:** [ ] PASS / [ ] FAIL

---

## Sprint 4 — Investigar TC078 + run final [ ]

**Objetivo:** resolver Grupo E (1 test) + validar suite completa

| TC | Suite | Estado |
|---|---|---|
| TS-STRIPE-P2-TC078 | carrier/operaciones/edicion-programados | [ ] investigar |

**Run final:**
- [ ] `pnpm test:e2e:all:web-only` — suite completa
- [ ] Informe de cierre con métricas finales

---

## Progreso general

| Sprint | Tests objetivo | Resueltos | Estado |
|---|---|---|---|
| Sprint 1 — OperationalPreferencesPage | 8 | 0 | 🔴 en progreso |
| Sprint 2 — waitForURL post-submit | 38 | 0 | ⏳ pendiente |
| Sprint 3 — datos ambiente | 41 | 0 | 🔒 bloqueado Admin |
| Sprint 4 — TC078 + run final | 1 | 0 | ⏳ pendiente |
| **Total** | **88** | **0** | |

> Los 4 restantes (Flow 2) son `test.fixme()` intencionales — no se cuentan como fallo.
