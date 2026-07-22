# Driver App — Mapa de flujos y backlog de automatización (canónico)

> **Doc canónico** del feature Driver App. Fusiona el análisis del source `magiis-mobile-driver-v2`
> (Ionic 6 / Angular 14 / Cordova) con la **validación en device físico** `R92XB0B8F3J` (Appium 3.5.2).
> Detalle device-validado (selectores reales por pantalla + transiciones): **[`driver-app-appium-flow-map.md`](./driver-app-appium-flow-map.md)**.
> Última actualización: 2026-07-22.

**Convención de cobertura:** **DONE** = validado en device / spec verde · **PARCIAL** = piezas listas y compilando, falta validar o cablear · **SCRIPT** = utilitario suelto, no integrado a spec · **NONE** = sin automatización · **BLOCKED** = no automatizable en el entorno actual (ver gaps).

## Mapa de flujos

| Flujo (unificado) | Área | Criticidad | Cobertura | Ramas principales |
|---|---|---|---|---|
| Login driver (email+pwd, ROLE_DRIVER) | auth | crítica | **SCRIPT** — `driver-login-*.ts`, `driver-relogin-and-home.ts`; harness asume sesión (`noReset`). Sin spec/assert | ok → pre-home · vacío/rechazo → modal · restore-pass |
| Bootstrap / redirección de root | routing | media | **NONE** | storageVersion vieja → logout+alerta MG-001/002/003 · isLogged → pre-home vs login |
| Gate de permisos (ubicación + movimiento) | routing/auth | alta | **NONE** — prompts nativos; se asume `autoGrantPermissions`/adb | android vs iOS · v≥10 exige movimiento · denegado → goToSettings |
| Pre-home: init servicios + overlay bienvenida | routing/auth | alta | **PARCIAL** — continue = `button.btn.primary` "Aceptar" (validado); sin spec | servicios OK → home(FROM_LOGIN) · stale → rebota a /login (re-login) |
| Navigator: tab-bar (4 tabs) | routing | media | **PARCIAL (device)** — Home/Notificaciones/Viajes/Llamar validados; sin spec | Llamar → CALL_CARRIER (no navega sin viaje) |
| Menú lateral (Preferencias/Estadísticas/Cambiar Vehículo/Fuera de servicio/Cerrar sesión) | routing | media | **DONE (device)** — navegación validada `[2026-07-22]`; sin spec | logout → OFFLINE+/login · toggle out_of_service |
| Gate de versión desactualizada | routing | baja | **NONE** | required → update obligatorio · opcional → update_later |
| Recuperar contraseña (`/RestorePassPage`) | auth | media | **DONE (device)** — apertura+retorno validados `[2026-07-22]` | input "Correo" + "Recuperar"/"Aceptar" |
| Selección de ambiente / showHost | auth | baja | **NONE** — flag `ENVIROMENT_SELECTION_ENABLED=false` | PROD/DEMO/TEST · 5 taps → toast host |
| Toggle Disponible / No disponible (ONLINE↔OFFLINE) | home | crítica | **PARCIAL** — `goOnline()/isDriverOnline()` + `driver-go-online.ts`; sin spec de ramas de error | version REQUIRED → OutdatedVersion · errores 400/428/409 → modales |
| Recepción / render viajes disponibles (RTDB) | home | crítica | **PARCIAL** — `waitForTripRequest`; depende de dispatch real | notif null → vacío · length>0 → setNextAssignedTravel |
| Tomar / aceptar viaje asignado | home/trip | crítica | **DONE** — `acceptTrip()`/`acceptTripRobust()` en device (request t≈2.3s con pre-warm) | appDrvAssign bloquea disponibles |
| Aceptar → goingToClient (confirm) | trip | crítica | **DONE** — `waitForTripConfirmPage` + accept | goingToClient POST confirm · createChat |
| Empezar viaje + gate de geocerca | trip | crítica | **DONE (in-range)** — in-range validado (14m, origin Ciudad de la Paz 2238). Out-of-range = **BLOCKED** (ver gaps) | en-rango → "Si" → InProgress · fuera → "Ingresar código" (last4 travelId) |
| Viaje en progreso → Finalizar | trip | crítica | **DONE** — `DriverTripNavigationScreen` | Finalizar → "¿Finalizar Viaje?" → Si → Resume |
| Resumen: método de pago + cerrar viaje | trip | crítica | **DONE** — `selectPaymentMethod/confirmAndFinish` | "Cerrar Viaje" disabled hasta seleccionar método (`.travel-payment button.payment`) |
| **Cobro Cargo a Bordo 3DS (Stripe Elements + firma + challenge)** | trip | **crítica** | **DONE (device)** — E2E 3DS verde `[2026-07-22]` (travelId 66699); spec `empresa-cargo-3ds.spec.ts` (TS-STRIPE-TC1123) | decline → `ion-modal.alert-modal-atention` · 3DS → `#test-source-authorize-3ds` · firma → `app-page-signer` · trip-lost → `app-alert-modal` |
| Viaje de calle / pasajero (startStreetTravel) | home | alta | **DONE (device)** — trigger validado `[2026-07-22]`: `div.driver-pass.home-icon` → confirm "Empezar Viaje" → InProgress. `tapViajeCalleButton()` corregido | ONLINE/OFFLINE → inicia · IN_TRAVEL → driverOnTripAlert |
| "En Base" (botón central home) | home | baja | **DONE (device)** — `button.driver-home.home-icon-base` abre `app-bases-information-modal` (Bases Cercanas), **NO es toggle** `[2026-07-22]` | seleccionar fila cambiaría base (no exercitado) |
| Restauración de estado / fault-tolerance (getAppStatus) | home | alta | **SCRIPT** — `driver-free-stale-trip.ts` + `prewarm` home-check. Sin spec | IN_TRAVEL → navega al viaje · PAX canceló → reset · DONE/CANCELLED → modal |
| Extras: peaje / estacionamiento | trip | baja | **PARCIAL** — `addToll/addParking` sólo tap; modal de monto = TODO | tap → modal monto (sin implementar) |
| Geocerca de base / conectividad de red | home | baja | **NONE** | in-range → habilita base · red NONE/UNKNOWN → modales · backButton → exitApp |

## Selectores device-validados (resumen) `[LIVE 2026-07-22]`
Detalle completo por pantalla + transiciones en **[`driver-app-appium-flow-map.md`](./driver-app-appium-flow-map.md)**.

| Pantalla / control | Selector real | Nota |
|---|---|---|
| Home (componente) | `page-home` (no `app-page-home`) | rutas `/navigator/home;FROM_LOGIN=true` / `;FROM_TRAVEL_CLOSED=true` |
| Disponibilidad | `#availability` | ONLINE↔OFFLINE |
| Botón "Pasajero" (viaje calle) | `div.driver-pass.home-icon` | → confirm `button.btn.primary` "Empezar Viaje" → InProgress |
| Botón central "En Base" | `button.driver-home.home-icon-base` | abre `app-bases-information-modal` (NO toggle) |
| Menú | `ion-menu-toggle` (icon `person-circle-outline`); ítems `ion-item.menu-link-url` | clickear el `ion-item`, no el wrapper |
| Tabs | `#tab-button-home` / `#tab-button-notifications` / `#tab-button-TravelListPage` / tab `call` (sin id) | tab-bar = 4 tabs |
| Rutas menú | `/Settings` · `/Stats` · `/Vehicles?fromPreHome=false` · `/RestorePassPage` | capitalizadas fuera de `/navigator/` |
| Fuera de servicio / Logout | `ion-toggle` (drawer) · `button.log-out-menu` | |
| Cobro (Stripe Elements clásico) | 1 iframe/campo por `title` ES (número/vencimiento/CVC), input real `input.InputElement`; titular/postal = ion-input nativo | COBRAR = `credit-card-payment-data ion-content form button` |
| 3DS challenge | `#test-source-authorize-3ds` (COMPLETE) / `#test-source-fail-3ds` (FAIL) | en iframes anidados |
| Firma | canvas `app-page-signer ion-content div canvas` · Guardar `app-page-signer ion-footer ion-row button.btn.primary` | |

## Backlog priorizado
### P1 — camino crítico (lo que falta del núcleo viaje+cobro)
1. **Geocerca pickup out-of-range** — handler listo (`startTripHandlingGeofence` + `driver-geocerca-out-of-range.ts`) pero **BLOCKED en device** (el backend no entrega un viaje out-of-range al device driver, ni con asignación manual). Desbloqueo: pickup moderado dentro del radio de push / mover device / forzar entrega backend. (Ver gaps.)
2. **Spec de login driver con assertions** — hoy sólo scripts; promover a spec (assert URL `/navigator/*` + `#availability`).
3. **Spec toggle Disponible/No disponible con ramas** — cubrir ramas de error (400/428/409) + gate de versión.
4. **Extender el patrón validado (manual-assign plano + resume-gate + state-machine)** a decline/antifraud Cargo a Bordo (cambiar card + `expectedOutcome`). El 3DS ya está verde.

### P2 — generación/recuperación y negativos
5. Integrar **Viaje de Calle** a spec (trigger + confirm ya validados; harness análogo a `DriverCargoDeclineHarness`).
6. Spec de **recuperación de estado** (getAppStatus): matar app / cancelación PAX / viaje finalizado (apoyarse en `driver-free-stale-trip.ts`).
7. **Gate de permisos**: forzar `autoGrantPermissions` + `adb grant` + smoke sin `RequiredPermissionPage`.
8. **Auto-asignación (appDrvAssign)**: spec parametrizado por flag.
9. **Extras peaje/estacionamiento**: modal de monto.
10. **Cleanup automático**: integrar `driver-free-stale-trip.ts` al pre-warm (el home-check ya detecta el stale) o limpiar por API en `finally`.

### P3 — bordes e infraestructura
11. Bootstrap/redirección root (MG-001/002/003). 12. Gate de versión. 13. Geocerca base 60s. 14. Conectividad/salida de app. 15. Selección de ambiente (desactivado por flag). 16. Semántica de toggles/selects de Settings, métricas de Stats.

## Gaps y riesgos
1. **Geocerca out-of-range = BLOCKED en device (chicken-and-egg).** Pickup lejano (>500 m) para gatillar "Ingresar código" **impide** que el backend entregue el viaje al device driver fijo en Belgrano (asignación manual ordena por proximidad; no hay push fuera de rango). 3 corridas (travelId 66776/66782/66787) confirmaron: viaje "Chofer Asignado" carrier-side pero nunca llega al device. Desbloqueo fuera de scope. Detalle: `driver-app-appium-flow-map.md` §6.1.
2. **Cobro + 3DS: RESUELTO** — validado end-to-end en device `[2026-07-22]` (travelId 66699; firma + challenge 3DS `#test-source-authorize-3ds` + cierre). El cobro es **Stripe Elements CLÁSICO (1 iframe por campo)**, NO un iframe único; el gate de cobro está **al FINAL** (Resumen → "Ingresar tarjeta").
3. **Dependencia de dispatch real / RTDB / GPS** — recepción, geocerca y street-travel dependen de Firebase RTDB + GPS real (Transistor; el mock GPS NO es viable). No deterministas en CI; requieren backend TEST + device físico en el pickup.
4. **Login no determinista** — `noReset` con sesión abierta; tras reinstall/idle cae en pre-home ("Cargando Servicios") y rebota a /login. Mitigación: `driver-relogin-and-home.ts`.
5. **Sin route guards** — el gating es imperativo (`initializeApp`/`ionViewDidEnter`), no `canActivate`; recuperación exige controlar background→foreground en Appium.
6. **Cobertura concentrada en el núcleo viaje+cobro** — ramas negativas (declines, 3DS-fail, trip-lost, 409) aún sin spec cableado (el 3DS success ya está verde).
7. **`ion-menu-toggle` ambiguo** — envuelve la hamburguesa y cada ítem; con drawer abierto targetear `ion-item.menu-link-url`.

## Archivos clave del framework
- Screens: `tests/mobile/appium/driver/{DriverHomeScreen,DriverTripRequestScreen,DriverTripNavigationScreen,DriverTripSummaryScreen,DriverTripPaymentScreen}.ts`
- Harness: `tests/mobile/appium/harness/{DriverCargoDeclineHarness,DriverTripHappyPathHarness}.ts`
- Steps: `tests/components/steps/CargoABordoSteps.ts`
- Spec 3DS: `tests/features/gateway-pg/specs/stripe/web/carrier/cargo-a-bordo/empresa-cargo-3ds.spec.ts` (TS-STRIPE-TC1123)
- Scripts device: `tests/mobile/appium/scripts/{driver-go-online,driver-free-stale-trip,driver-relogin-and-home,driver-validate-home-street-base,driver-validate-menu-destructive,driver-geocerca-out-of-range}.ts`
- Detalle device-validado: `docs/mobile/driver-app-appium-flow-map.md`
