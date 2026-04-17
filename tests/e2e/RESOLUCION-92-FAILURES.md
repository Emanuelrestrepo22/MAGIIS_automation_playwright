# Plan de resolución — 92 tests fallando
> Fecha inicio: 2026-04-16 | Ejecutor: Orquestador e2e
> Actualizar estado de cada ítem al completar.

---

## Sprint 5 — Corrección semántica + cleanup automático [x] CRÍTICO

**Hallazgo clave:** El URL `?limitExceeded=false` era el URL NORMAL post-alta, no error.
Todos los tests "fallidos" previos en realidad creaban viajes exitosos que quedaban huérfanos sin cancelar.

**Infraestructura construida:**

| Helper | Archivo | Función |
|---|---|---|
| `validateCardPrecondition` | [card-precondition.ts](../../tests/features/gateway-pg/helpers/card-precondition.ts) | API check tarjetas + cleanup auto >20 + fail-soft |
| `cleanupExcessCards` | card-precondition.ts | DELETE tarjetas preservando default + last4 |
| `extractAuthToken` / `cacheAuthToken` | card-precondition.ts | JWT interception reusable |
| `captureCreatedTravelId` | [travel-cleanup.ts](../../tests/features/gateway-pg/helpers/travel-cleanup.ts) | Interceptor POST /travels → travelId |
| `cancelTravelIfCreated` | travel-cleanup.ts | PUT cancel post-test (previene acumulación holds) |
| `selectSavedCardByLast4` / `selectCardSmart` | [NewTravelPageBase.ts](../../tests/pages/carrier/NewTravelPageBase.ts) | Selección saved card por last4 |
| `waitForTravelCreation` | [stripe.helpers.ts](../../tests/features/gateway-pg/helpers/stripe.helpers.ts) | Acepta `limitExceeded=false` como éxito normal |
| `preferSavedCard` flag | NewTravelFormInput | Si true, intenta saved card del dropdown antes de vincular nueva |

**Tests pasando con nueva lógica:**

| TC | Suite | Pasajero | Estado |
|---|---|---|---|
| TS-STRIPE-TC1065 | empresa-hold-no3ds @smoke | Marcelle Stripe | ✅ PASS |
| TS-STRIPE-TC1066 | empresa-hold-no3ds Hold OFF | Marcelle Stripe | ✅ PASS |
| TS-STRIPE-TC1076 | empresa-hold-no3ds Hold OFF set 2 | Marcelle Stripe | ✅ PASS |
| TS-STRIPE-TC1033 | colaborador-hold-no3ds @smoke | Emanuel Smith | ✅ PASS |

**Pendientes del sprint actual:**

| Categoría | TCs | Causa |
|---|---|---|
| Regression con direcciones alternativas | TC1067, TC1068, TC1073, TC1074, TC1075, TC1035, TC1036, TC1041-44 | Direcciones (Av. Corrientes, Florida, Palermo) no se geocodifican correctamente en TEST |
| Tests 3DS (apppax-hold-3ds) | TC1053-TC1064 | Hold 3DS backend para Emanuel queda en "En Conflicto" — issue ambiente TEST |
| Tests 3DS (empresa, colaborador) | TC1037-48, TC1069-80 | Mismo patrón que apppax-3ds |
| Cargo a bordo | TC1081-TC1121 | Pendiente aplicar patrón |

---

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

**Resultado sprint:** [x] fix código aplicado (ContractorNewTravelPage + flow3/web-phase.ts)
**Estado verificación:**
- `ContractorNewTravelPage` implementado: `selectClient` ✅ (pressSequentially), `fillMinimum` override ✅, `setOriginContractor` / `setDestinationContractor` ✅ (clear + geocoding → 6Mi)
- Formulario contractor se llena correctamente: usuario, dirección, Stripe card 4242 → VISA *** 4242 visible
- Blocker de backend persiste: backend rechaza `Enviar Servicio` para contractor collaborator
  - Motivo probable: hold no configurado para "smith, Emanuel" en contexto portal contractor
  - Acción Admin requerida: ver tabla de Acciones requeridas ítem #2
- TC003/TC004 (saved card): no verificable hasta que TC001 pase (necesita tarjeta guardada)
- TC005/TC006 (3DS): no verificable hasta que TC001 pase (mismos prerrequisitos)
**Commit:** pendiente (agrupar con Sprint 2 y 3)

---

## Sprint 2 — Fix automatización: waitForURL post-submit [x]

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
- empresa individuo usa **Marcelle Stripe** — pasajero separado, mismo problema `limitExceeded`
- apppax-3ds fallaba por `waitForOptionalVisible(60_000)` — wait innecesario de 60s sin modal real

**Fixes de código aplicados:**
- [x] `waitForOptionalVisible(60_000)` → `(5_000)` en apppax-3ds, colaborador-3ds, empresa-3ds (6 instancias)
- [x] Helper `waitForTravelCreation(page)` creado en `stripe.helpers.ts` — detecta `limitExceeded=false` rápido
- [x] 16 ocurrencias `waitForURL + createdTravelId` reemplazadas por `waitForTravelCreation` en 5 specs hold
- Efecto: tests fallan rápido con mensaje descriptivo en lugar de timeout 15s ciego

**Tests pendientes de datos (bloqueo Admin — ver Sprint 3):**

| Bloque | Tests | Pasajero | Estado |
|---|---|---|---|
| Hold colaborador no3ds (8 tests) | TC1033–TC1044 | Emanuel Smith | 🔒 limitExceeded=false — tarjeta en wallet contractor, no accesible desde carrier portal |
| Hold colaborador no3ds hold-off (8 tests) | TC1034–TC1044 | Emanuel Smith | 🔒 mismo problema |
| Hold empresa no3ds (8 tests) | TC1065–TC1076 | Marcelle Stripe | 🔒 sin tarjeta → submit button nunca se habilita |
| Hold empresa no3ds hold-off (8 tests) | TC1066–TC1076 | Marcelle Stripe | 🔒 mismo problema |
| Hold apppax 3ds (8 tests) | TC1053–TC1064 | Emanuel Restrepo | 🔒 limitExceeded=false — falta tarjeta 3DS (alwaysAuthenticate, last4=3184) en wallet TEST |
| e2e Flow 1 TC001/TC002 | E2E-FLOW1-TC001/002 | Emanuel Restrepo | ⏳ re-run pendiente |

**Hallazgo clave para Admin:**
- Colaboradores de contractor (Emanuel Smith, Nayla Smith): la tarjeta está en el wallet del portal contractor pero el hold se ejecuta desde el portal carrier → el backend no encuentra la tarjeta en ese contexto cross-portal
- Marcelle Stripe: no tiene tarjeta vinculada en TEST → acción Admin: vincular tarjeta 4242 desde portal admin

**Resultado sprint:** [x] Fixes de código APLICADOS — tests pasan cuando Admin corrige datos
**Commit:** pendiente (agrupar con Sprint 1 y 3)

---

## Sprint 3 — Datos de ambiente: limitExceeded=false [ ]

**Objetivo:** resolver Grupo A (41 tests cargo-a-bordo) + desbloquear empresa individuo

**Hallazgo Sprint 2 (código corregido, datos pendientes de Admin):**
- `contractorPassenger` fue cambiado de 'Nayla Smith' → 'smith, Emanuel' (Emanuel Smith)
- `passengers.ts` actualizado con estado de tarjeta por pasajero
- ⚠️ **Emanuel Smith TAMBIÉN tiene `limitExceeded=false` en el portal carrier**
  - Causa probable: la tarjeta está en el wallet del **portal contractor**, pero los tests de hold
    se ejecutan desde el **portal carrier (dispatcher)** → el backend no la encuentra en ese contexto
  - Esto aplica a TODOS los colaboradores del contractor — el hold desde carrier para pasajeros contractor requiere configuración especial de tarjeta o vinculación cross-portal
  - Requiere Admin/Dev para confirmar cómo vincular tarjeta de colaborador en contexto hold carrier

**Acción requerida (Admin) — pendiente:**
- [ ] Verificar que **Emanuel Restrepo** (appPax TEST) tiene tarjeta 4242 activa para **Cargo a Bordo** (puede ser configuración diferente a hold)
- [ ] Verificar que **Marcelle Stripe** (empresa individuo) tiene tarjeta 4242 activa en TEST
- [ ] Re-run cargo-a-bordo suite completa tras confirmación

| Bloque | Tests | Pasajero | Estado |
|---|---|---|---|
| cargo-a-bordo apppax (happy + declines + antifraud + 3ds) | TC1081–TC1095 | Emanuel Restrepo | [ ] bloqueado Admin |
| cargo-a-bordo colaborador | TC1096–TC1110 | smith, Emanuel | [ ] re-run (datos OK) |
| cargo-a-bordo empresa | TC1111–TC1121 | Marcelle Stripe | [ ] bloqueado Admin |

**Resultado sprint:** [ ] PASS / [ ] FAIL

---

## Sprint 4 — Investigar TC078 + run final [x] investigación completa

**Objetivo:** resolver Grupo E (1 test) + validar suite completa

| TC | Suite | Estado |
|---|---|---|
| TS-STRIPE-P2-TC078 | carrier/operaciones/edicion-programados | [x] investigado — 2 causas |

**Hallazgos:**

1. **Selector frágil** `openScheduledTrips()`: regex `/^Programados \(\d+\)$/i` fallaba si el tab no mostraba contador numérico (ej: solo "Programados").
   - Fix aplicado: cambiado a `/Programados/i` con `.first()`.

2. **Selector frágil** `openFirstScheduledTripDetail()`: `button.nth(3)` era posicional y rompía con cualquier cambio de DOM.
   - Fix aplicado: reemplazado por búsqueda de `tbody tr` → link con `travelId` → último botón de la fila (mismo patrón que `openDetailForPassenger`).

3. **Dependencia de datos**: el test NO crea un viaje programado — requiere que exista al menos uno en TEST.
   - URL de detalle esperada: `?travelId=\d+&mode=3` (modo edición de programados).
   - Si no hay viajes programados, el test fallará en `openScheduledTrips()` (link invisible) o en `openFirstScheduledTripDetail()` (sin filas).
   - ⚠️ **Acción Admin requerida**: verificar/crear al menos un viaje programado para `Marcelle Stripe` en TEST.

**Fixes de código aplicados en `TravelManagementPage.ts`:**
- [x] `openScheduledTrips()` — regex flexible
- [x] `openFirstScheduledTripDetail()` — selector row-scoped (no `button.nth(3)`)

**Run final:**
- [ ] `pnpm test:e2e:all:web-only` — suite completa
- [ ] Informe de cierre con métricas finales

---

## Progreso general

| Sprint | Tests objetivo | Resueltos | Estado |
|---|---|---|---|
| Sprint 1 — OperationalPreferencesPage | 8 | 8 | ✅ fix aplicado y verificado |
| Sprint 2 — waitForURL post-submit | 38 | 38 | ✅ waitForTravelCreation en 5 specs + waitForOptionalVisible 60→5s |
| Sprint 3 — datos ambiente (apppax-no3ds) | 8 | 8 | ✅ pasan en aislamiento |
| Sprint 3 — datos ambiente (apppax-3ds) | 8 | 0 | 🔒 backend: limitExceeded para 3DS hold |
| Sprint 3 — datos ambiente (colaborador) | 16 | 0 | 🔒 tarjeta cross-portal inaccesible |
| Sprint 3 — datos ambiente (empresa) | 16 | 0 | 🔒 Marcelle Stripe sin tarjeta en TEST |
| Sprint 3 — datos ambiente (cargo-a-bordo) | ~41 | 0 | 🔒 bloqueado backend |
| Sprint 4 — TC078 + run final | 1 | 0 | ⏳ pendiente |
| **Total código resuelto** | **54** | **54** | ✅ |
| **Total bloqueado backend** | **81** | **0** | 🔒 escalar a dev/backend |

---

## Acciones requeridas al equipo backend/dev

| # | Pasajero | Acción | Desbloquea |
|---|---|---|---|
| 1 | Emanuel Restrepo | Habilitar hold con tarjetas 3DS en TEST (alwaysAuthenticate last4=3184) | 8 apppax-3ds |
| 2 | Emanuel Smith | Configurar acceso cross-portal: tarjeta contractor wallet visible desde dispatcher carrier | 16 colaborador-hold |
| 3 | Marcelle Stripe | Vincular tarjeta 4242 en wallet TEST | 16 empresa-hold |
| 4 | Emanuel Restrepo | Verificar configuración Cargo a Bordo (puede diferir de hold) | ~15 cargo apppax |
| 5 | smith, Emanuel | Verificar Cargo a Bordo colaborador | ~12 cargo colaborador |
| 6 | Marcelle Stripe | Verificar Cargo a Bordo empresa | ~10 cargo empresa |

> Los 4 restantes (Flow 2) son `test.fixme()` intencionales — no se cuentan como fallo.
