# REF-CARRIER-MANUAL-ASSIGN — Referencia: Asignación Manual del Viaje (Carrier Web · fase web completa)

> **Estado:** REFERENCIA — flujo verificado en vivo contra TEST (UI carrier `v1.72.8`, 2026-07-23).
> **Tipo:** caso de referencia de **flujo** (no un TC de matriz 1:1). Sirve de plantilla y fuente
> de selectores para todos los casos que asignan el viaje manualmente al conductor (`manualAssign:true`).
> **Primer caso de referencia de carrier web** del repo (los demás en `docs/test-cases/` son mobile).

---

## 1. Identidad del caso

| Campo | Valor |
| --- | --- |
| `reference_id` | `REF-CARRIER-MANUAL-ASSIGN` |
| Título | Validar alta de viaje plano + asignación manual directa al conductor desde el portal Carrier |
| Módulo | `carrier-web/trip-create-manual-assign` |
| Portal | `carrier` (100% web, sin fase mobile en esta referencia) |
| Ambiente | TEST |
| Prioridad | P1 (habilita el journey híbrido cargo-a-bordo asignado + cobro driver) |
| `critical_flow` | true |
| `source_type` | live-capture (`ariaSnapshot` + HTML) |
| Fuente de selectores | Captura en vivo 2026-07-23, UI `v1.72.8` |
| Mapeo cobertura | MG-161 (área F — cobro; mapeo por área, no 1:1 con TC UI) |
| Tags | `@carrier`, `@cargo-a-bordo`, `@manual-assign` |

**Qué NO es:** no reemplaza a los TC de matriz (`TS-STRIPE-TC11xx`). Es el mapa del **cómo** (pasos +
selectores reales) que esos TC reutilizan al ejercer la asignación manual.

**Por qué "viaje plano":** seleccionar el método "Cargo a Bordo" en el formulario **oculta** el botón
"Enviar Manual". Por eso la asignación manual parte de un viaje sin método de pago (el conductor
elige la tarjeta recién en el Resumen de la Driver App).

---

## 2. Precondiciones

### Técnicas

- [ ] Portal Carrier TEST accesible (`BASE_URL=https://apps-test.magiis.com`, login `/#/authentication/login/carrier`).
- [ ] Usuario dispatcher con permiso de alta de viaje + asignación de conductores.
- [ ] Idioma forzado a **ES** tras login (`ensureSpanishLanguage` — las cuentas US arrancan en EN y rompen selectores por texto).

### De datos

- [ ] Dispatcher: `DISPATCHER.test` (resuelto desde `USER_CARRIER_TEST | USER_CARRIER`; en el run verificado fue `remiseriamagiis@gmail.com` / pass `123`, carrier ARG id 1040).
- [ ] Cliente/pasajero: `TEST_DATA.appPaxPassenger` = **`Emanuel Restrepo`** (app-pax personal; auto-asigna el pasajero al seleccionar el cliente).
- [ ] Origen: **`Reconquista 661, Buenos Aires, Argentina`**.
- [ ] Destino: **`Cazadores 1987, Buenos Aires, Argentina`**.
- [ ] **Al menos 1 conductor en estado "Disponible"** en la flota del carrier. En el run verificado la pantalla mostró `Total Flota (12)` / `Disponible (7)` / `En Viaje (1)` / `Candidatos (8)`.

> **Nota — variación por caso:** los datos de cliente/origen/destino cambian según el caso consumidor.
> Ej.: `empresa-cargo-3ds.spec.ts` usa un escenario distinto (`client: 'Restrepo, Emanuel'`,
> `origin: 'Ciudad de la Paz 2238, ...'`) porque el device físico del driver debe caer dentro de la
> geocerca del origen. El **flujo y los selectores de esta referencia son invariantes**; solo cambian los datos.

### De ambiente

- [ ] La "Asignación automática" de la grilla de viajes puede estar activada o desactivada — **no bloquea** el flujo de asignación manual.
- [ ] Viaje **plano**: NO seleccionar método de pago "Cargo a Bordo" en el formulario (oculta "Enviar Manual").

---

## 3. Flujo canónico (pasos)

### Fase A — Alta del viaje plano

1. Login dispatcher en portal Carrier → dashboard (`#/home/carrier/dashboard`).
2. Click **"Nuevo Viaje"** (banner o menú) → formulario de alta (`#/home/carrier/travel/create`).
3. Seleccionar **Cliente** (`#clientSelect` → buscar → elegir de la lista).
4. **Pasajero (adaptativo):** si el cliente lo auto-asigna (campo `#passenger` con `ng-reflect-is-disabled="true"`) → validar que no quede vacío. Si no → seleccionar pasajero explícito. Para `Emanuel Restrepo` (app-pax) se auto-asigna.
5. Completar **Origen** (autocompletar → elegir sugerencia).
6. Completar **Destino** (autocompletar → elegir sugerencia).
7. **NO** seleccionar método de pago (viaje plano).

### Fase B — Selección de vehículo + Enviar Manual

8. Click **"Seleccionar Vehículo"** (esperar que el botón esté habilitado + overlay de carga disipado).
9. Click **"Enviar Manual"** → **navega a la pantalla "Gestión de Choferes / Asignar"** (una **TABLA de conductores candidatos**, NO un modal). Breadcrumb: `Choferes / Gestión de Choferes / Asignar`.

### Fase C — Asignación directa

10. En la tabla de candidatos, click en la acción **"Asignar"** de la **primera fila** (candidato más cercano/disponible; el run ordenó por TEA con `0089 Restrepo Emanuel · Disponible · 0 min` primero).
11. La asignación es **DIRECTA** — **NO hay paso de confirmación posterior**. La UI navega a **"Gestión de Viajes"** (`#/home/carrier/travel/dashboard`) y la fila del viaje muestra estado **"Chofer Asignado"**.

---

## 4. Resultado esperado

> **Debería** crear el viaje y **asignarlo directamente** al conductor elegido (sin timer de
> oferta-candidato), navegando a "Gestión de Viajes" con la fila del viaje en estado **"Chofer Asignado"**.
> El conductor queda dueño del viaje y puede aceptar/finalizar/cobrar a bordo desde la Driver App.

Assertions concretas:

- Texto **"Chofer Asignado"** visible en la grilla de Gestión de Viajes tras la asignación.
- `POST /travels` interceptado devuelve un `travelId` (alta confirmada — fuente de verdad, ver `captureCreatedTravelId`).
- La celda **Chofer** de la fila muestra el conductor asignado (ej. `Restrepo, Emanuel`).
- **No** aparece modal 3DS en la fase web (el cobro ocurre luego en la Driver App).

---

## 5. Selectores conocidos (verificados en vivo 2026-07-23, UI `v1.72.8`)

| Pantalla / elemento | Selector | Notas |
| --- | --- | --- |
| "Nuevo Viaje" | `banner` → `link "Nuevo Viaje"` (`/url: #/home/carrier/travel/create`) | También en el menú lateral (Viajes → Nuevo Viaje). |
| "Seleccionar Vehículo" | `getByRole('button', { name: /Seleccionar Veh[íi]culo|Select Vehicle/i })` | Esperar habilitación + overlay disipado. |
| **"Enviar Manual"** | `getByRole('button', { name: /Enviar Manual\|Send Manual/i })` | Solo visible en viaje **plano** (Cargo a Bordo lo oculta). Navega a la pantalla de asignación. |
| Pantalla de asignación | breadcrumb `Choferes / Gestión de Choferes / Asignar` | Es una **página completa**, NO un modal. |
| Filtros de flota | `button "Total Flota (N)"` / `button "Disponible (N)"` / `button "En Viaje (N)"` / `button "Candidatos (N)"` | Contadores dinámicos. |
| Tabla de candidatos | `table` con columnas `Código · Nombre · Género · Vehículo · Estado · TEA · Prioridad · Origen · Calificación · Acciones` | Ordenada por proximidad/TEA; primera fila = mejor candidato. |
| **Acción "Asignar" de fila** | `div.driver-btn` (clase completa `btn btn-primary btn-sm driver-btn not-clicked`, `href="javascript:void(0)"`, con `<div>` anidado texto `"Asignar"`) | **Es un DIV estilizado como botón, SIN role ARIA** → por eso `getByRole('button', {name:/Asignar/})` fallaba. Locator estable: `page.locator('.driver-btn').filter({ hasText: /Asignar\|Assign/i }).first()`. |
| Cancelar asignación | `button "Cancelar"` | Aborta sin asignar. |
| Post-asignación | breadcrumb `Viajes / Gestión de Viajes`; celda de fila `"Chofer Asignado"` | Navegación automática tras asignar. |

> ### ⚠️ Trampa documentada — `link "Asignar (1)"`
> Tras la asignación, la grilla de Gestión de Viajes muestra un `link "Asignar (1)"`. **NO es parte
> del flujo de asignación**: es el **tab de filtro** de la grilla (viajes pendientes de asignar = 1).
> Esperar ese link como "botón de confirmación" fue la causa del diagnóstico erróneo original
> (el POM esperaba un `button "Asignar"` de confirmación que **ya no existe**).

---

## 6. Mapeo a POM / código (fuente de verdad del flujo actual)

| Fase | Método / helper | Ruta |
| --- | --- | --- |
| Login dispatcher | `loginAsDispatcher(page)` | `tests/features/auth/helpers/login.helpers.ts:49` |
| Abrir Nuevo Viaje | `CarrierDashboardPage.openNewTravel()` | `tests/components/ui/carrier/CarrierDashboardPage.ts:38` |
| Alta viaje plano (A) | `CarrierNewTravelPage.fillPlain(opts)` | `tests/components/ui/carrier/CarrierNewTravelPage.ts:108` |
| Seleccionar Vehículo (B) | `CarrierNewTravelPage.clickSelectVehicle()` | `tests/components/ui/carrier/CarrierNewTravelPage.ts:131` |
| **Enviar Manual + Asignar (B+C)** | `CarrierNewTravelPage.clickSendManualAndAssign(driverName?)` → delega a legacy | `tests/components/ui/carrier/CarrierNewTravelPage.ts:143` |
| **Implementación real del flujo** | `NewTravelPageBase.clickSendManualAndAssign(driverName?)` | `tests/pages/carrier/NewTravelPageBase.ts:894` |
| Orquestador reutilizable | `CargoABordoSteps.runCargoScenario(scenario, { manualAssign:true })` | `tests/components/steps/CargoABordoSteps.ts:111` |

> **Parámetro `driverName?`:** sin nombre → asigna el **primer candidato** (más cercano por TEA,
> comportamiento histórico). Con nombre → asignación **determinista** al conductor cuya fila contiene
> todos los tokens del nombre (usado por el E2E driver estable, ej. `create-flat-trip-far-origin.spec.ts`).

Datos canónicos: `tests/features/gateway-pg/data/journey-defaults.ts` (`JOURNEY_DEFAULTS` / alias `TEST_DATA`)
y `tests/fixtures/users/passengers.ts` (`PASSENGERS.appPax` = `Emanuel Restrepo`).

---

## 7. Casos similares (quién reutiliza esta referencia)

Specs que ejercen la asignación manual (`manualAssign: true` vía `runCargoScenario`):

| Spec | TC-ID / título | Notas |
| --- | --- | --- |
| `tests/features/gateway-pg/specs/stripe/web/carrier/cargo-a-bordo/empresa-cargo-3ds.spec.ts` | `[TS-STRIPE-TC1123]` — empresa Cargo a Bordo · cobro 3DS desde Driver App | Escenario con datos propios (geocerca device: origen `Ciudad de la Paz 2238`). |
| `tests/features/gateway-pg/specs/stripe/e2e-mobile/cargo-a-bordo/apppax-cargo-asignado-3ds.e2e.spec.ts` | `[CARGO-ASIGNADO-3DS]` — alta + asignación manual → driver cobra a bordo 3DS → success | Grupo C del plan MP (referencia Stripe). |
| `tests/e2e/create-flat-trip-far-origin.spec.ts` | Viaje plano + asignación manual al device driver (por nombre) | Mismo patrón; gated `GEOCERCA_2A=1`; selecciona el driver por nombre en vez de primera fila. |

---

## 8. Trazabilidad

| Artefacto | Path / referencia |
| --- | --- |
| Matriz fuente | `docs/gateway-pg/stripe/matriz_cases.md` §9.3 (Cargo a Bordo Empresa · 3DS → TC1123) |
| Cobertura MG | `docs/gateway-pg/COBERTURA-MG178-automatizacion.md` (área cargo → MG-161) |
| POM (implementación) | `tests/pages/carrier/NewTravelPageBase.ts:894` |
| Componente KATA | `tests/components/ui/carrier/CarrierNewTravelPage.ts:143` |
| Orquestador | `tests/components/steps/CargoABordoSteps.ts:111` |
| Datos de journey | `tests/features/gateway-pg/data/journey-defaults.ts` |
| Fuente de pasajeros | `tests/fixtures/users/passengers.ts` |
| Captura de selectores | `ariaSnapshot` + HTML en vivo, 2026-07-23, UI `v1.72.8` |

---

## 9. Comandos de verificación

Re-verificar que la referencia sigue vigente corriendo un caso consumidor (la **fase web** valida los
selectores de asignación manual aunque Appium no esté disponible — la fase driver hace `test.fixme`):

```bash
ENV=test npx playwright test tests/features/gateway-pg/specs/stripe/web/carrier/cargo-a-bordo/empresa-cargo-3ds.spec.ts -c playwright.gateway-pg.config.ts --project=cargo-a-bordo --workers=1
```

**Señal de éxito de la fase web:** el viaje se crea (POST /travels con `travelId`) y la grilla de
Gestión de Viajes muestra la fila en estado **"Chofer Asignado"**. Si el paso de asignación vuelve a
fallar con timeout, **re-capturar el DOM** (la UI cambió): comparar el nuevo `ariaSnapshot` de la
pantalla "Gestión de Choferes / Asignar" contra la §5 de este documento y actualizar el selector
`.driver-btn` en `NewTravelPageBase.ts:894`.
