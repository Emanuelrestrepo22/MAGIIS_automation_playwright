# Driver App — Mapa de flujos y backlog de automatización

> Fuente: análisis del source `magiis-mobile-driver-v2` (Ionic 6 / Angular 14 / Cordova) cruzado con el framework Appium/Playwright existente.
> Generado: 2026-07-21 (workflow autónomo de mapeo, 7 lectores + síntesis). 54 flujos crudos → consolidados.

**Convención de cobertura:** **DONE** = validado en device / spec verde · **PARCIAL** = piezas listas y compilando, falta validar o cablear · **SCRIPT** = utilitario suelto, no integrado a spec · **NONE** = sin automatización.

## Mapa de flujos

| Flujo (unificado) | Área | Criticidad | Cobertura | Ramas principales |
|---|---|---|---|---|
| Login driver (email+pwd, ROLE_DRIVER) | auth | crítica | **SCRIPT** — `driver-login-*.ts`; harness asume sesión logueada (`noReset`). Sin spec ni assert token | ok → RequiredPermission · vacío/rechazo → modal · rememberPassword |
| Bootstrap / redirección de root | routing-shell | media | **NONE** | storageVersion vieja → logout+alerta MG-001/002/003 · isLogged → pre-home vs login |
| Gate de permisos (ubicación + movimiento) | routing/auth | alta | **NONE** — prompts nativos; se asume `autoGrantPermissions`/adb | android vs iOS · v≥10 exige movimiento · denegado → goToSettings |
| Pre-home: init servicios + overlay bienvenida | routing/auth | alta | **PARCIAL** — `dismissPreHomeOverlayIfPresent()` en `prewarm()`. Sin spec | allowed → home(FROM_LOGIN) · error init → pegado en overlay |
| Navigator: tab shell inferior | routing-shell | media | **NONE** | canTouch invierte Home · Call → CALL_CARRIER · Account → menú |
| Menú lateral: cuenta / fuera de servicio / logout | routing-shell | media | **NONE** | logout → OFFLINE+clear+login · toggle out_of_service |
| Gate de versión desactualizada | routing-shell | baja | **NONE** | required → update obligatorio · opcional → update_later |
| Recuperar contraseña (RestorePass) | auth | media | **NONE** | email inválido → disabled · 401/403/0 → modales · 404 → éxito |
| Selección de ambiente / showHost | auth | baja | **NONE** — flag `ENVIROMENT_SELECTION_ENABLED=false` | PROD/DEMO/TEST · 5 taps → toast host |
| Toggle Disponible / No disponible (ONLINE↔OFFLINE) | home | crítica | **PARCIAL** — `goOnline()/isDriverOnline()` + `driver-go-online.ts` en `prewarm()`. Sin spec de ramas | version REQUIRED → OutdatedVersion · errores 400/428/409 → modales |
| Recepción / render viajes disponibles (RTDB) | home | crítica | **PARCIAL** — `waitForTripRequest/…ConfirmPage`; render/distancia no asertados; depende de dispatch real | notif null → vacío · length>0 → setNextAssignedTravel |
| Tomar / aceptar viaje asignado | home/trip | crítica | **DONE** — `acceptTrip()`/`acceptTripRobust()` validado en device (t+1.7s con pre-warm) | appDrvAssign bloquea disponibles |
| Auto-asignación (appDrvAssign) | home | alta | **NONE** | true → reduce por cercanía → auto-navega |
| Aceptar → goingToClient (confirm) | trip | crítica | **DONE** — `waitForTripConfirmPage` + accept | goingToClient POST confirm · createChat |
| Empezar viaje + gate de geocerca | trip | crítica | **DONE (in-range)** — `startTripHandlingGeofence` (14m). Código out-of-range NO validado | en-rango → Si → InProgress · fuera → "Ingresar código" (last4 travelId) |
| Viaje en progreso → Finalizar | trip | crítica | **DONE** — `DriverTripNavigationScreen` | Finalizar → "¿Finalizar Viaje?" → Si → Resume |
| Resumen: método de pago + cerrar viaje | trip | crítica | **DONE** — `selectPaymentMethod/confirmAndFinish` (happy path → `closed`) | "Cerrar Viaje" vs "Firmar y Cerrar" · botón disabled hasta seleccionar método |
| **Cobro Cargo a Bordo (Stripe Elements: fill + COBRAR + decline + 3DS)** | trip | **crítica** | **PARCIAL** — harness+selectores+3DS handler listos y compilando, **NO validados en device**. Reescrito 2026-07-21 para iframe `elements-inner-card` | decline → `alert-modal-atention` · 3DS → challenge en iframes anidados (`#test-source-authorize-3ds`) · firma → `app-page-signer` · trip-lost → `app-alert-modal` |
| Extras: peaje / estacionamiento | trip | baja | **PARCIAL** — `addToll/addParking` sólo tap; modal de monto = TODO | tap → modal monto (sin implementar) |
| Viaje de calle / pasajero (startStreetTravel) | home | alta | **SCRIPT** — `start-viaje-calle-flow.ts`, `viaje-calle-unhappy-paths.ts`. No en spec | ONLINE/OFFLINE → inicia · IN_TRAVEL → driverOnTripAlert |
| Toggle En Base / En Calle (sub-state + cola) | home | media | **NONE** | fuera de rango → botón inactivo · refreshToken/GPS error → modales |
| Restauración de estado / fault-tolerance (getAppStatus) | home | alta | **SCRIPT** — `driver-free-stale-trip.ts` + `prewarm` home-check. Sin spec | IN_TRAVEL → navega al viaje · PAX canceló → reset · DONE/CANCELLED → modal |
| Geocerca de base — refresco 60s | home | baja | **NONE** | in-range → habilita En Base · sale de rango IN_BASE → salida automática |
| Conectividad de red / salida de app | home | baja | **NONE** | NONE/UNKNOWN → modales · backButton → exitApp |

## Backlog priorizado

### P1 — camino crítico viaje + cobro (desbloquear el E2E casi listo)
1. **Cerrar el cobro Cargo a Bordo en device (Stripe Elements)** — único eslabón crítico PARCIAL con todo el código escrito; 12 specs web verdes cuelgan de esto vía `test.fixme`. Acción: validar `withStripeFrame`/`switchFrame`+`addValue` contra iframe `elements-inner-card` con **viaje sostenido manual** (`driver-cargo-payment-validate.ts`/`dump-resume-payment.ts`, sin carrera); confirmar `TODO[device]` de `switchFrame` en WDIO v9; cerrar assert.
2. **Resolver bloqueo web `Send Manual` con Cargo a Bordo** — bloquea `manualAssign`. Acción: (confirmado con debugger) el manual-assign requiere **viaje plano** (sin seleccionar método); el driver elige tarjeta en el resumen.
3. **Validar 3DS del cobro en device** — `handle3DSChallenge` recorre iframes; botón real `#test-source-authorize-3ds`. Acción: ejecutar con card `4000000000003220`.
4. **Spec de login driver con assertions** — hoy sólo scripts; promover `driver-login-smoke.ts` a spec (assert URL `/navigator/*` + `#availability`).
5. **Spec toggle Disponible/No disponible con ramas** — cubrir ramas de error (400/428/409) + gate de versión.

### P2 — generación/recuperación y negativos
6. Integrar **Viaje de Calle** a spec (harness análogo a `DriverCargoDeclineHarness`).
7. Spec de **recuperación de estado** (getAppStatus): matar app / cancelación PAX / viaje finalizado.
8. **Gate de permisos**: forzar `autoGrantPermissions` + `adb grant` + smoke sin `RequiredPermissionPage`.
9. **Auto-asignación (appDrvAssign)**: spec parametrizado por flag.
10. **En Base/En Calle + código geocerca out-of-range** (mock de ubicación fuera de radio).
11. **RestorePass + menú lateral** (logout/out-of-service).
12. **Extras peaje/estacionamiento**: modal de monto.

### P3 — bordes e infraestructura
13. Bootstrap/redirección root (alertas MG-001/002/003). 14. Gate de versión. 15. Navigator tabs. 16. Geocerca base 60s. 17. Conectividad/salida. 18. Selección de ambiente (desactivado por flag).

## Gaps y riesgos
1. **Cobro + 3DS nunca ejecutados end-to-end en device** — todo el fill Stripe Elements / `submitPayment` / `handle3DSChallenge` está verificado por typecheck, no por ejecución. `switchFrame` WDIO v9 = `TODO[device]`.
2. **Modelo de dominio del gate de cobro** — RESUELTO por walkthrough en vivo del dev (2026-07-21): el cobro está **al FINAL** (Resumen → "Ingresar tarjeta"), no al inicio. (La caracterización "gate al inicio" de una iteración previa fue un artefacto y quedó superada.)
3. **Timing del driver-candidato** — ventana corta; mitigado por pre-warm + asignación manual (viaje plano), no eliminado si el fill del iframe es lento.
4. **Dependencia de dispatch real / RTDB / GPS** — recepción, geocerca y street travel dependen de Firebase RTDB + ubicación real; sin mocks → no deterministas en CI; requieren backend TEST + device físico en pickup (~500m).
5. **Login no determinista** — harness asume `noReset` con sesión abierta; tras reinstall cae en pre-home (overlay "Cargando Servicios") que hoy se pasa manual. Sin spec de login robusto, toda corrida limpia falla.
6. **Sin route guards** — el gating es imperativo (`initializeApp`/`ionViewDidEnter`), no `canActivate`; recuperación exige controlar background→foreground (`platform.resume`) en Appium.
7. **Cobertura concentrada en happy path** — ramas negativas (declines, 3DS-fail, trip-lost, 409) en `test.fixme` o sin cablear.
8. **Ramas post-COBRAR no deterministas** — 3DS puede emerger tras COBRAR o tras Guardar (firma); puede cerrar directo. Requiere state-machine de polling (3DS→complete `#test-source-authorize-3ds` / signer→firmar+guardar / success / alert).

## Archivos clave del framework
- `tests/mobile/appium/harness/DriverCargoDeclineHarness.ts`
- `tests/mobile/appium/driver/DriverTripPaymentScreen.ts`
- `tests/components/steps/CargoABordoSteps.ts`
- `tests/features/gateway-pg/specs/stripe/web/carrier/cargo-a-bordo/` (12 specs)
- `tests/mobile/appium/harness/DriverTripHappyPathHarness.ts`
