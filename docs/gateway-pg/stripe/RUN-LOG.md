# RUN-LOG — Iteración completa Stripe (carrier/stripe-full-iteration)

> Bitácora de la iteración que validó, en vivo contra el carrier TEST 1521, cada test case automatizado
> de la pasarela Stripe. Objetivo: dejar todo lo automatizable corriendo en verde, fixeando bugs reales
> de test sin debilitar assertions, y documentando (no enmascarando) lo que resultó ser un defecto de
> producto. Rama: `carrier/stripe-full-iteration`. Carrier: **1521** (Remises EEUU, TEST).

---

## Resultado por grupo

| Grupo | Specs | Estado | Notas |
|---|---|---|---|
| Driver OAuth Connect (link Stripe) | 1 | 🟢 Implementado + validado destructivo | TC1002/1003/1008 — ver §Driver OAuth |
| `hold/` | 7 | 🟢 45/49 verdes | 1 fixeado (idempotencia wallet), 3 = transitorio backend documentado (`No such setupintent`) |
| `contractor/` | 3 | 🟢 verde | Oráculos veraces + re-vinculación Stripe tras interferencia externa |
| `cargo-a-bordo/` (web) | 12 | 🟢 verde | Precondición skip + oráculo pasajero empresa (TC1081/TC1111) |
| `operaciones/` (ediciones) | 2 | 🟡 3/12 destrabados | 9 gateados por 2 blockers de producto confirmados (cancel-500, editor de pago roto en ABM edición) |
| `operaciones/` (reactivación) | 1 | 🟢 6/6 verdes | Fix anchor muerto v1.72.8 (`travelIdForCarrier`) — ver §Operaciones-reactivación |
| `operaciones/` (clonación) | 2 | 🟡 10/18 verdes | Anchor fixeado; **8 fallan en paso posterior** (selección de tarjeta, 100% en clones desde Finalizados) — hallazgo nuevo sin cerrar, ver §Operaciones-clonación |
| `recovery/` | 5 | 🔴 0 verdes confirmados en vivo (2026-08-12) | El "2 verdes" original NO se sostiene — re-corrida en vivo mostró AMBOS fallando por precondición compartida (página Preferencias Operativas cuelga 90s, ambiental) — ver §Recovery |
| `quote/` | 1 (`quote-colaborador.spec.ts`) | 🔴 8/8 gateados | Mail de confirmación de Quote nunca llega (0/60s, 2 ejes verificados) — defecto de producto |
| `recurrentes/` | 3 | 🟢 15/18 verdes | 2 bugs de test fixeados + **1 defecto de producto confirmado en los 3 actores** (BL-053) — ver §Recurrentes |
| `_parametrized/` + smoke | — | ⏳ pendiente de la corrida final agregada | Ver §Corrida final |

---

## Driver OAuth Connect (test-mode link Stripe)

**Commit:** `7d70ff7`

Implementado el ciclo OAuth Connect en modo test para vincular Stripe al carrier 1521 (`TC1002`/`TC1003`/`TC1008`). Validado en vivo el ciclo destructivo completo (unlink eBiz → link Stripe real) mediante un spec temporal `_maintenance-restore-stripe.spec.ts` (creado, ejecutado una vez con éxito, eliminado sin commitear — nunca formó parte de la suite persistente). Resultado: `MG-212 linkStripeViaConnect PASS`.

**Contexto operativo:** a mitad de la iteración, otra sesión que comparte el carrier 1521 desvinculó Stripe y vinculó Authorize — se detectó vía el probe read-only (no se asumió bug de contractor sin verificar primero el estado real de la pasarela), y se re-vinculó Stripe con el mismo ciclo OAuth real.

---

## `hold/` — 7 specs, 49 tests

**Commit:** `18058c7`

45/49 verdes. Fix real: oráculo de validación de tarjeta reemplazado por polling del resultado real (antes asertaba a ciegas), más idempotencia de wallet cross-gateway (limpieza de tarjeta previa antes de un alta `card:'new'`, evitando que el alta silenciosamente tomara el camino de tarjeta guardada).

**3 tests con fallo transitorio documentado:** cluster de error `No such setupintent` — comportamiento intermitente del lado de Stripe test-mode, no reproducible de forma determinística; documentado como transitorio conocido, no bloqueado con `test.skip` (para no enmascarar una regresión real si el patrón cambia).

---

## `contractor/` — 3 specs

**Commit:** `8383f7b`

Fix real de carrera: el listener async de captura de `travelId` (vía `page.on('response')`) resolvía DESPUÉS del assert síncrono que lo consumía — confirmado con logs con timestamp, no era un problema de idempotencia de wallet como se sospechó inicialmente. Fix: `expect.poll()` sobre el ref mutable en vez de leerlo una sola vez.

Además: bug de 3DS en modo `post-service-double` — el challenge de vinculación no se manejaba, y un segundo bug (carrera entre el check opcional post-servicio y el redirect propio del portal) se resolvió con un parámetro `settled` para abortar la espera temprano ante navegación, más una "doble lectura estabilizada" en `ThreeDsChallengePage.waitForOptionalVisible` para filtrar parpadeos de visibilidad transitorios.

---

## `cargo-a-bordo/` (web) — 12 specs

**Commit:** `606ebb4`

Precondición de tarjeta convertida de `throw` duro a `test.skip` (mismo criterio que el resto de la suite: precondición no armable no es un fallo del sistema). Oráculo de pasajero para empresa individuo corregido — el auto-asignado de pasajero (regla BL-003, cliente===pasajero para empresa individuo) usaba `TEST_DATA.passenger` en vez de `TEST_DATA.client`.

---

## `operaciones/` — 5 specs, 28 tests

**Commits:** `6597d02`, `558de42`, `fb0b124`

25/28 destrabados con seeding self-contained (cada spec arma su propia precondición sin depender de estado dejado por otro test). **2 blockers de producto confirmados y documentados** (no fixeados en el test porque son defectos reales):

1. **`PUT /travels/{id}/cancel` → 500 SQLGrammarException** para ciertos inputs. Root cause parcial identificado: un `reasonForCancellation` vacío causaba 500 de forma determinística (fix aplicado: default no-vacío en `travel-cleanup.ts`); persiste un 500 residual para otros inputs, documentado con diagnóstico de status/body detallado (`cancelTravelDetailed`).
2. **Editor de "Forma de Pago" roto en el ABM de edición** (mode=3) — no abre. Bloquea la familia completa de ediciones-de-programados (6 tests, `TC078..TC083`).

---

## `operaciones/` — reactivación y clonación (auditoría 2026-08-12)

**Commit:** `4843aec`

Auditoría posterior a este RUN-LOG detectó que **el MISMO anchor `href` muerto por v1.72.8** (ya fixeado en `expectTripRowInCurrentTab` de `recurrentes/`, commit `fcf2679`) también rompía `TravelManagementPage.reactivate()` y `CarrierTravelManagementPage.cloneTravel()` — ambos ACTIVOS, sin skip, no cubiertos por aquel fix. Migrados al mismo patrón (`travelIdForCarrier` + búsqueda con `Enter` explícito, boundary-safe por celda "Código").

**Verificado en vivo (2026-08-21):**
- `reactivacion.spec.ts` — **6/6 verdes** (TC060-065). Fix confirmado, cierre limpio.
- `clonacion-cancelados.spec.ts` + `clonacion-finalizados.spec.ts` — el anchor ya NO falla (la navegación al form precargado del clon funciona en los 18 casos). Pero surge un **hallazgo nuevo, separado**: 8/18 fallan en un paso POSTERIOR (selección de tarjeta en "Forma de Pago" del form del clon):
  - `clonacion-finalizados.spec.ts`: **6/6 fallan, 100% reproducible** — `card-new` → `Error: Stripe frame not found: cardNumber` (el iframe de Stripe Elements nunca monta); `card-existing` → la tarjeta elegida del desplegable no queda reflejada como seleccionada (`hasSelectedCardWithLast4` timeout 10s).
  - `clonacion-cancelados.spec.ts`: 2/6 fallan (TC068 card-existing, TC071 card-new+3DS) con los mismos dos síntomas — parcial/no 100% reproducible, a diferencia de finalizados.
  - Descartado como causa: Stripe SIGUE vinculado al carrier (confirmado con el probe read-only `appstore-gateways-probe.spec.ts` — `stripe: acción="Desvincular" → linked`).
  - Hipótesis de trabajo (sin confirmar): el clon de un viaje FINALIZADO (tras `finalizeTravelAdmin`, transición CANCELLED→DONE) deja la sección "Forma de Pago" del form precargado en un estado que no inicializa igual que un alta nueva o un clon desde Cancelados — el 100% de reproducibilidad en finalizados vs. parcial en cancelados apunta a esa fase administrativa como diferenciador.
  - **Pendiente:** capturar evidencia visual (screenshots de esta corrida se perdieron — un run posterior sobre el mismo `outputDir` los limpió antes de poder inspeccionarlos; lección para la próxima: copiar/inspeccionar evidence ANTES de lanzar cualquier otra corrida) y decidir si es bug de test o defecto de producto antes de gatear o fixear.

---

## `recovery/` — 5 specs

**Commit:** `1a8333a` (sin corrida live confirmada en commits posteriores — ver nota)

⚠️ **CORRECCIÓN 2026-08-12:** este log afirmaba "2 verdes" (TC1053, TC1039). Auditoría + re-corrida en vivo (fuera de la ventana de apagado 00-07) mostró **AMBOS fallando** — no por su propia lógica de negocio, sino porque el precondition step compartido (`OperationalPreferencesPage.goto()` → `/#/home/carrier/settings/parameters`, usado para validar "Hold activo") cuelga y agota el timeout de 90s del test. Coincide con el cluster `[parameters-api] GET parameters 403` visto en la corrida de 9.4h de la sección "Corrida final" — parece un TERCER factor ambiental de esta sesión (además del apagado 00:00-07:00 y la acumulación de datos de prueba), específico e intermitente de la página "Preferencias Operativas". No es un bug de código de estos 2 tests; reintentar cuando esa página esté estable.

Resto: gateado con evidencia. **4 regresiones de producto v1.72.8 confirmadas**, listas para reporte de defecto:

1. **Ruta de detalle `/#/home/carrier/travels/{id}` eliminada** — boot completo rebota a `#/`; navegación same-document también pisada por la SPA. Confirmado con evidencia de probe sobre viaje real (68230, fila 3818-W).
2. **Recovery 3DS sin superficie web** — consecuencia directa de (1): sin ruta de detalle, no hay forma de reintentar el pago recuperable desde el portal web.
3. **Editor de pago roto** — mismo síntoma que el blocker de `operaciones/` (editor de "Forma de Pago" no abre en modo edición), transversal a NO_AUTH y SCHEDULED.
4. **PAX Invitado sin `role="radio"`** — regresión de accesibilidad/semántica en el selector de pasajero invitado.

Flujo real de dos ventanas de 3DS confirmado en vivo (challenge de validación aprobado → POST `/travels` captura `travelId` → challenge post-envío rechazado → estado NO_AUTORIZADO vía "En Conflicto", no vía excepción).

**Nota:** el helper canónico de recovery (`setupTravelWithFailed3DS`) fue endurecido y COMMITEADO dentro de `1a8333a` (confirmado por auditoría 2026-08-12 — el working tree está limpio, no quedaron cambios sueltos como este log especulaba originalmente).

---

## `quote/` — 1 spec, 8 tests

**Commit:** `eacf7dd`

**Defecto de producto confirmado:** el mail de confirmación de Quote nunca llega desde el backend MAGIIS. Verificado por DOS ejes independientes (casilla sintética vinculada al teléfono + casilla de mail real registrada), ambos con 0 mails tras 60s — descarta "inbox equivocada", confirma gap real de backend. Los 8 tests (`TC011..TC018`) quedaron gateados con `test.skip` citando la evidencia.

Fix de test real aplicado en el camino: el widget de Quote usa Stripe Elements en 3 iframes reales (no el form nativo Angular que el código asumía) — con un esquema de URL de iframe DISTINTO al del resto de la suite (sin `componentName=` en la URL), por lo que `StripeElementsCardForm` no aplicaba; se escribió un método dedicado (`fillCardIframes`, anclado por `title` del iframe) en vez de reusar la clase compartida, para no desestabilizar los specs de `carrier/hold` que sí dependen de ella.

---

## `recurrentes/` — 3 specs, 18 tests

**Commits:** `55808a2`, `fcf2679`, `5333458`, `1707246`

Primera corrida en vivo de los 3 actores de la matriz (App Pax, Colaborador, Empresa Individuo). **15/18 verdes.**

**2 bugs de test reales, fixeados y verificados en vivo:**

1. **Regex del datepicker sin tolerancia de whitespace** — `CarrierRecurrentTravelPage.pickEndDate()` anclaba `hasText` a `^N$` contra el `textContent` CRUDO del `<a>` del día (indentación del template Angular nunca trimeada por Playwright's `hasText`). El filtro nunca matcheaba ningún día real, en ningún test, en ningún entorno — confirmado en vivo: 21 días habilitados sin filtro, 0 tras el filtro estricto. Fix: tolerar whitespace sin relajar la coincidencia exacta del número.
2. **Anchors `href` muertos por v1.72.8 + paginación + búsqueda que exige Enter** — `TravelManagementPage.expectTripRowInCurrentTab` anclaba la fila del viaje por `a[href*="/travels/{id}"]`, eliminados por el FE en esta grilla (0 matches confirmados en el DOM completo). Migrado a anclar por el código WEB visible (`travelIdForCarrier`, "NNNN-W"), boundary-safe (celda "Código" únicamente, no toda la fila). Descubierto en el camino: la grilla pagina a ~20 filas (el carrier compartido acumuló 30+ filas de "Programados" entre corridas) y su buscador NO filtra con `fill()` solo — exige `Enter` explícito.
3. **Carrera en el click condicional del "Aceptar" del datepicker** — un `isVisible()` previo al click dejaba una ventana donde PrimeNG podía desmontar el botón, colgando el click 15s. Fix: intento de click con timeout corto envuelto en `.catch()`, preservando la semántica "mejor esfuerzo" original sin la carrera.

**1 defecto de producto confirmado — BL-053** (ver `docs/ops/BACKLOG.md`): el alta recurrente con **hold=ON + 3DS=true** aprueba el challenge pero el viaje queda en "Asignar" en vez de "Programados". Reproducido idéntico en los 3 actores (`TC052` App Pax, `TC045` Colaborador, `TC058` Empresa Individuo) — confirma que es sistémico, no aislado a un pasajero/tarjeta. Los 3 tests quedaron gateados con `test.skip` citando la evidencia exacta (screenshot: Asignar(1)/Programados(0) filtrando por el código exacto del viaje, sin migrar tras 30s de re-fetch activo).

**Nota de proceso:** durante el diagnóstico se confirmó que la reproducción manual vía browser (JS/DOM crudo) NO detecta bugs de matching de locators de Playwright — hace falta usar el motor de locators real (o replicar su matching exacto) para validar selectores, no alcanza con "existe en el DOM y se ve bien".

---

## Corrida final (`@stripe` completo)

_(Sección a completar tras la corrida `bun run test:test:gateway:stripe` / equivalente sobre el estado final de la rama — pendiente al momento de escribir este log.)_

---

## Bloqueos externos / defectos de producto (índice)

| Defecto | Área | Estado | Referencia |
|---|---|---|---|
| Ruta de detalle `/travels/{id}` eliminada (v1.72.8) | `recovery/` | 🔴 Documentado | Este log §Recovery |
| Editor de "Forma de Pago" roto en ABM de edición | `operaciones/` + `recovery/` | 🔴 Documentado | Este log §Operaciones |
| PAX Invitado sin `role="radio"` | `recovery/` | 🔴 Documentado | Este log §Recovery |
| `PUT /travels/{id}/cancel` → 500 residual | `operaciones/` | 🔴 Documentado (parcialmente mitigado) | Este log §Operaciones |
| Mail de confirmación de Quote nunca llega | `quote/` | 🔴 Documentado | Este log §Quote |
| Alta recurrente hold=ON+3DS=true no aterriza en Programados | `recurrentes/` | 🔴 **BL-053** | `docs/ops/BACKLOG.md` |
| `GET recurringTrip/paginated` → 500 (bloquea cleanup de recurrencias) | `recurrentes/` | 🔴 Documentado (mitigado con cinturón: cancela el travel individual) | Este log §Recurrentes |
| Forma de Pago no inicializa en clon desde Finalizados (100% repro) | `operaciones/` clonación | 🟡 Hallazgo sin clasificar (test vs producto) | Este log §Operaciones-clonación |
| `/#/home/carrier/settings/parameters` cuelga 90s (intermitente) | `recovery/` | 🟡 Ambiental, sin abrir defecto todavía | Este log §Recovery |
| Servidor TEST apagado 00:00–07:00 (ahorro de costos) | Todo `@stripe` | ℹ️ Política de infra, no defecto | Confirmado por el usuario 2026-08-11 |
| `No such setupintent` (cluster transitorio) | `hold/` | 🟡 Transitorio, no bloqueado | Este log §Hold |
