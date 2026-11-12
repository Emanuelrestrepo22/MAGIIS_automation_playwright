# Inventario y clasificacion de scripts Appium (T0.3)

Fecha: 2026-11-12 · Rama: `mobile/cleanup-scripts` (base `mobile/foundation-wip`) · Alcance: `tests/mobile/appium/scripts/` incluido `diagnostics/` y `_shared/`.

Este documento es solo analisis estatico (grep + git log): ningun script se ejecuto, no se movio ni se borro nada. Las clases `cuarentena` y `borrar` son propuestas a revisar antes de T0.4.

## 1. Resumen

Verificacion de conteo: filas de la tabla del punto 3 = **114**; `git ls-files "tests/mobile/appium/scripts/**" | grep -E "\.(ts|mjs|js)$" | wc -l` = **114**. Coinciden.

| Clase | Scripts | Criterio aplicado |
|---|---|---|
| vivo | 35 | Referenciado por package.json, por un spec/flow/doc vigente, o cubre algo que la capa PBO aun no cubre |
| migrar | 10 | Util, pero debe pasar a screens/PBO (se indica a cual) |
| cuarentena | 65 | Sin referencias y superado, o duenio dudoso (default ante la duda) |
| borrar (propuesto) | 4 | Temporal/duplicado, 0 referencias y superado |
| **Total** | **114** | |

Otras cifras relevantes (detalle en los puntos 4, 5 y 6):

| Indicador | Valor |
|---|---|
| Scripts con EFECTO SIN GATE sobre datos de negocio (viajes, cobros, wallet) | 29 |
| Scripts con efecto menor sin gate (login, disponibilidad, GPS mock, preferencias) | 11 |
| Scripts con gate real (dry-run por defecto, `--confirm`, `F5_APP_CLOSE=1`, `--unblock`) | 7 |
| Scripts con UDID literal en codigo (no comentario) | 47 (45 con `R92XB0B8F3J`, 2 con `emulator-5554`) |
| Scripts que mencionan `R92XB0B8F3J` en total (codigo + comentarios) | 55 |
| Scripts que llaman `remote(` de webdriverio directo | 0 (la auditoria del 11/11 contaba 72; ya migrados por el commit `47fd9ff`) |
| Apertura de sesion: MobileSession.open / PBO-Flow / Harness-Screen / sin sesion | 72 / 4 / 25 / 13 |
| Scripts `_tmp-mg626-*` | 5 (propuesta: 2 borrar, 3 cuarentena) |
| Hallazgos SECURITY | ver punto 6 |

Notas de lectura:

- Columna **Refs**: `pk` = menciones en package.json; `cod` = archivos no-script ni .md que lo mencionan (specs, harness, config, html); `scr` = otros scripts que lo mencionan; `doc` = archivos .md que lo mencionan. Una mencion en comentario cuenta como referencia, pero se indica en el motivo cuando es solo documental.
- Columna **Ult. commit**: la fecha 2026-11-11 corresponde al commit masivo `47fd9ff` (migracion a `MobileSession.open` y mover dumps a `diagnostics/`); entre parentesis va la fecha del ultimo commit sustantivo cuando difiere.
- Columna **Sesion**: `MobileSession.open` directo; `PBO/Flow` abre via PBO o `F5AppCloseFlow`; `Harness/Screen` abre via harness o screen (sesion indirecta); `n/a` no abre sesion Appium (DB, adb, fs).
- Columna **Env**: `ENV por .env, sin default` = el script usa `resolveDriverTarget` (exige UDID y URL en env; el ambiente sale de `ENV`); el valor entre parentesis es el ambiente que cita su cabecera. Para el resto se infiere del paquete (`com.magiis.app.test.*` = TEST, sin infijo = PROD) o de `ENV=`/`.env.*`.
- Los gates se verificaron leyendo el codigo (`core/Gates.ts`: `F5_APP_CLOSE` exacto `1` + flag `--confirm`). Los parametros `confirmed: true` de los PBO no cuentan como gate de usuario.

## 2. Lectura rapida para el orquestador

- **Gates bien resueltos (7):** `driver-accept-complete-trip`, `f5-driver-close-trip`, `f5-driver-resume-close`, `fr-driver-s3-closure`, `validate-driver-happy-path`, `driver-ghost-trips-purge`, `driverStateDiagnostic`.  `validate-driver-happy-path` evalua el gate antes de abrir sesion.
- **Efectos de negocio sin gate (29):** 13 de driver (aceptar/iniciar/finalizar/cerrar/cobrar/liberar), 13 de pax (viaje, cancelacion, wallet) y 3 `_tmp-mg626`. 15 estan en cuarentena/borrar; los 14 restantes son `vivo`/`migrar` y necesitan gate antes de seguir usandose (punto 4).
- **`passenger-schedule-trip.ts` tiene dry-run opt-in** (`MG116_DRY=1`): por defecto confirma el viaje. Es el patron inverso al de `driver-ghost-trips-purge`; conviene invertirlo.
- **`passenger-confirm-scheduled-trip.ts`** solo comprueba que el medio de pago sea efectivo/cuenta corriente; no hay flag de confirmacion explicito.
- **Paquete PROD:** `probe-prod-webview.ts` y `prod-smoke-address-native.ts` apuntan a build de PRODUCCION (`com.magiis.app.ateg.passenger`) por doc; son solo lectura, pero conviene mantenerlos separados de los de TEST.
- **`passenger-mg116-regression.ts` tiene bytes NUL**: grep lo trata como binario. Revisar codificacion al moverlo.

## 3. Tabla completa (114 scripts)

Rutas relativas a `tests/mobile/appium/scripts/`. Orden: clase, luego ruta.

| # | Path | Refs | Ult. commit | Sesion | Efectos / gate | UDID literal | Env | Clase | Motivo |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `_shared/resolveDriverTarget.ts` | pk 0 · cod 4 · scr 31 · doc 0 | 2026-08-25 | n/a | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default (doc: UAT/TEST) | **vivo** | Importado por 3 specs/config y ~31 scripts; fuente unica del objetivo (env/paquete/UDID) |
| 2 | `diagnostics/dump-current-screen.ts` | pk 1 · cod 0 · scr 0 · doc 4 | 2026-11-11 (solo chore de migracion) | MobileSession.open | Ninguno (lectura/volcado/sonda) | L17 R92XB0B8F3J | TEST | **vivo** | package.json (mobile:passenger:home-dump) + 4 docs |
| 3 | `diagnostics/dump-driver-home.ts` | pk 1 · cod 0 · scr 0 · doc 0 | 2026-11-11 (solo chore de migracion) | MobileSession.open | Ninguno (lectura/volcado/sonda) | L38 R92XB0B8F3J | TEST | **vivo** | package.json (mobile:driver:home-dump) |
| 4 | `driver-accept-complete-trip.ts` | pk 0 · cod 0 · scr 0 · doc 1 | 2026-11-11 | PBO/Flow | Acepta, inicia, finaliza y cierra viaje ; GATE: F5_APP_CLOSE=1 + --confirm | - | TEST | **vivo** | Runner Flow 2 sobre TripLifecyclePBO con gates; citado en appium-pom-pbo-architecture |
| 5 | `driver-explore-flow-map.ts` | pk 0 · cod 0 · scr 0 · doc 1 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | Ninguno (lectura/volcado/sonda) | L19 R92XB0B8F3J | TEST | **vivo** | Citado por driver-app-appium-flow-map como generador del mapa de flujos |
| 6 | `driver-explore-menu.ts` | pk 0 · cod 0 · scr 0 · doc 1 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | Ninguno (lectura/volcado/sonda) | L18 R92XB0B8F3J | TEST | **vivo** | Citado por driver-app-appium-flow-map como generador del mapa de flujos |
| 7 | `driver-free-stale-trip.ts` | pk 0 · cod 3 · scr 1 · doc 2 | 2026-11-11 (sust. 2026-07-29) | MobileSession.open | EFECTO SIN GATE: Libera viaje stale (cancela/finaliza via recoverDriverToHome) | L26 R92XB0B8F3J | TEST | **vivo** | Runner delgado sobre recoverDriverToHome (helper compartido con DriverCargoDeclineHarness); citado en flow-maps |
| 8 | `driver-geocerca-out-of-range.ts` | pk 0 · cod 1 · scr 0 · doc 2 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | EFECTO SIN GATE: Acepta, inicia, finaliza y cierra (cleanup efectivo) | L17 R92XB0B8F3J | TEST | **vivo** | Lo exige tests/e2e/create-flat-trip-far-origin.spec.ts (correr en background); geocerca sin PBO |
| 9 | `driver-ghost-trips-audit.ts` | pk 1 · cod 0 · scr 1 · doc 0 | 2026-11-12 | Harness/Screen | Ninguno (lectura/volcado/sonda) | - | TEST | **vivo** | package.json (ghost-trips-audit); gate bloqueante de QA movil |
| 10 | `driver-ghost-trips-purge.ts` | pk 1 · cod 0 · scr 0 · doc 0 | 2026-11-12 | Harness/Screen | POST refuse por API a viajes fantasma ; GATE: dry-run por defecto, GHOST_PURGE_APPLY=1 | - | TEST | **vivo** | package.json (ghost-trips-purge); con gate dry-run/APPLY |
| 11 | `driver-go-online.ts` | pk 0 · cod 1 · scr 2 · doc 2 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | Sin gate (bajo): Fija disponibilidad (Disponible) | L17 R92XB0B8F3J | TEST | **vivo** | Bootstrap driver-ready citado en flow-maps y onboarding; lo mencionan 2 scripts |
| 12 | `driver-login-smoke.ts` | pk 1 · cod 1 · scr 3 · doc 1 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | Sin gate (bajo): Login + disponibilidad | L26 R92XB0B8F3J | TEST | **vivo** | package.json (mobile:driver:login-smoke); candidato a DriverSessionPBO.ensureLoggedIn |
| 13 | `driver-relogin-and-home.ts` | pk 0 · cod 0 · scr 2 · doc 2 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | Sin gate (bajo): Re-login de la cuenta | L17 R92XB0B8F3J | TEST | **vivo** | Recuperacion de sesion citada en flow-map (+2 scripts); sin PBO de re-login stale |
| 14 | `driverStateDiagnostic.mjs` | pk 3 · cod 0 · scr 0 · doc 0 | 2026-11-12 | n/a | adb pm clear de la app solo con --unblock; DB SELECT ; GATE: --unblock (default no modifica) | L34 R92XB0B8F3J | TEST | **vivo** | package.json (3 scripts diagnostic/logcat/unblock); adb+DB sin equivalente en PBO |
| 15 | `f5-driver-close-trip.ts` | pk 0 · cod 3 · scr 2 · doc 2 | 2026-11-11 | PBO/Flow | Acepta, inicia, finaliza y cierra viaje; GPS mock ; GATE: F5_APP_CLOSE=1 + --confirm (+ --dry-run) | - | TEST/TEST(emu) | **vivo** | README + docs/qa baseline + F5AppCloseFlow; runner canonico con gates |
| 16 | `f5-driver-resume-close.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 | PBO/Flow | Finaliza/cierra viaje ; GATE: F5_APP_CLOSE=1 + --confirm | - | n/d | **vivo** | Runner F5 sobre PBOs con gates (reanuda cierre); mismo patron que f5-driver-close-trip |
| 17 | `fr-driver-preflight.ts` | pk 0 · cod 1 · scr 0 · doc 0 | 2026-10-20 | Harness/Screen | Ninguno (lectura/volcado/sonda) | L23 emulator-5554 | TEST(emu) | **vivo** | Preflight FR de solo lectura citado en onboarding-appium; sin equivalente sin sesion |
| 18 | `fr-driver-s3-closure.ts` | pk 0 · cod 1 · scr 0 · doc 1 | 2026-11-11 | PBO/Flow | Acepta, inicia, finaliza y cierra viaje ; GATE: F5_APP_CLOSE=1 + --confirm | L32 emulator-5554 | TEST(emu) | **vivo** | Runner FR S3 sobre F5AppCloseFlow con gates; citado en docs y onboarding |
| 19 | `generateAppiumMcpConfig.mjs` | pk 3 · cod 1 · scr 0 · doc 4 | 2026-08-14 | n/a | Ninguno (lectura/volcado/sonda) | - | TEST/UAT/PROD | **vivo** | package.json (3 scripts appium:mcp:*) + docs MCP |
| 20 | `mg116-analizar-payload-ios.mjs` | pk 0 · cod 1 · scr 0 · doc 1 | 2026-08-20 | n/a | Ninguno (lectura/volcado/sonda) | - | n/d | **vivo** | README lo cita como workaround consciente del analisis de payloads iOS |
| 21 | `passenger-business-no3ds-hold-flow.ts` | pk 1 · cod 0 · scr 0 · doc 0 | 2026-07-22 | Harness/Screen | EFECTO SIN GATE: Alta de tarjeta + crea viaje con hold (Compania) | - | n/d | **vivo** | package.json (business-no3ds-hold-flow); sin PBO pax de viaje/hold |
| 22 | `passenger-cancel-active-trip.ts` | pk 1 · cod 0 · scr 0 · doc 0 | 2026-08-25 | n/a | EFECTO SIN GATE: Cancela el viaje activo del pax | - | TEST | **vivo** | package.json (cancel-trip:uat); sin PBO pax de cancelacion |
| 23 | `passenger-confirm-scheduled-trip.ts` | pk 0 · cod 1 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | EFECTO SIN GATE: Confirma viaje programado (crea viaje); solo valida medio de pago efectivo/CC | - | ENV por .env, sin default | **vivo** | Referenciado por homeSurfaces.ts como forma de armar la precondicion S6 (viaje programado) |
| 24 | `passenger-home-mode-smoke.ts` | pk 1 · cod 0 · scr 0 · doc 0 | 2026-07-22 | Harness/Screen | Ninguno (lectura/volcado/sonda) | L19 R92XB0B8F3J | TEST | **vivo** | package.json (profile-mode-smoke); sin PBO pax de home/modo |
| 25 | `passenger-login-and-dump.ts` | pk 2 · cod 1 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | Sin gate (bajo): Login + dump | L17 R92XB0B8F3J | TEST | **vivo** | package.json (login-dump x2) + fixtures de usuarios; candidato a PBO de sesion pax |
| 26 | `passenger-mg116-token-scope.ts` | pk 1 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default | **vivo** | package.json (token-scope:uat), TM-693 |
| 27 | `passenger-mg116-uat-battery.ts` | pk 1 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default (doc: UAT) | **vivo** | package.json (address-battery:uat) |
| 28 | `passenger-mg116-uat-cases.ts` | pk 1 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default | **vivo** | package.json (address-cases:uat) |
| 29 | `passenger-personal-3ds-hold-flow.ts` | pk 1 · cod 0 · scr 0 · doc 0 | 2026-07-22 | Harness/Screen | EFECTO SIN GATE: Alta de tarjeta 3DS + crea viaje con hold | - | n/d | **vivo** | package.json (personal-3ds-hold-flow); sin PBO pax de viaje/hold |
| 30 | `passenger-schedule-trip.ts` | pk 0 · cod 1 · scr 1 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | EFECTO SIN GATE: Crea viaje programado; dry-run es opt-in (MG116_DRY=1), el default confirma | - | ENV por .env, sin default | **vivo** | Referenciado por homeSurfaces.ts como forma de armar la precondicion S6 (viaje programado) |
| 31 | `passenger-surface-census.ts` | pk 1 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default (doc: UAT/TEST) | **vivo** | package.json (surface-census:uat) |
| 32 | `passenger-wallet-3ds-delete.ts` | pk 1 · cod 2 · scr 0 · doc 0 | 2026-07-22 | Harness/Screen | EFECTO SIN GATE: Alta y baja de tarjeta 3DS | - | n/d | **vivo** | package.json (wallet-3ds-delete) + promovido por spec apppax-wallet-delete; migrar a PassengerWalletPBO |
| 33 | `passenger-wallet-cleanup.ts` | pk 1 · cod 1 · scr 0 · doc 0 | 2026-07-22 | Harness/Screen | EFECTO SIN GATE: Borra todas las tarjetas del perfil | L21 R92XB0B8F3J | TEST | **vivo** | package.json (wallet-cleanup); migrar luego a PassengerWalletPBO.deleteAllVisibleCards |
| 34 | `prod-smoke-address-native.ts` | pk 1 · cod 1 · scr 1 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default (doc: PROD) | **vivo** | package.json (prod:smoke:mg116) |
| 35 | `prod-smoke-to-allure.mjs` | pk 1 · cod 1 · scr 0 · doc 0 | 2026-08-21 | n/a | Ninguno (lectura/volcado/sonda) | L105 R92XB0B8F3J | PROD | **vivo** | package.json (prod:smoke:mg116:allure) |
| 36 | `driver-mg117-probe-term.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default (doc: UAT) | **migrar** | Sonda TM-660 (cuerpo de respuesta por termino) no cubierta en DriverAddressCaseBattery |
| 37 | `driver-mg117-remaining.ts` | pk 0 · cod 0 · scr 1 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default (doc: UAT) | **migrar** | Cubre TM-653/660/661/670 que DriverAddressCaseBattery no cubre aun; mover alli |
| 38 | `driver-mg117-waypoints.ts` | pk 0 · cod 0 · scr 1 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default (doc: UAT) | **migrar** | Paradas multiples/sessionToken: sin caso equivalente en DriverAddressCaseBattery |
| 39 | `driver-validate-home-street-base.ts` | pk 0 · cod 0 · scr 0 · doc 2 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | EFECTO SIN GATE: Inicia street-trip real y limpia (cancela/finaliza) | L25 R92XB0B8F3J | TEST | **migrar** | Valida home/street-trip/En Base en device; mover a DriverHomeScreen + TripLifecyclePBO y gatear |
| 40 | `driver-validate-menu-destructive.ts` | pk 0 · cod 0 · scr 0 · doc 1 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | Sin gate (bajo): Guarda preferencias, cierra sesion, fuera de servicio | L23 R92XB0B8F3J | TEST | **migrar** | Flujos de menu (preferencias, vehiculo, logout) sin PBO; mover a DriverSessionPBO + screen de menu y gatear |
| 41 | `passenger-ebiz-addcard-validate.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | Harness/Screen | EFECTO SIN GATE: Alta de tarjeta eBiz en wallet | - | TEST | **migrar** | PassengerWalletPBO.addCard ya lo reemplaza como fuente; validador GO/NO-GO eBiz sin spec equivalente |
| 42 | `passenger-restore-wallet-card.ts` | pk 0 · cod 1 · scr 0 · doc 0 | 2026-08-25 | Harness/Screen | EFECTO SIN GATE: Alta de tarjeta en wallet | - | TEST | **migrar** | Precondicion operativa (restaurar tarjeta); PassengerWalletPBO.addCard cubre el cuerpo |
| 43 | `start-viaje-calle-flow.ts` | pk 0 · cod 2 · scr 1 · doc 3 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | EFECTO SIN GATE: Crea viaje calle, cobra con tarjeta de prueba (3DS), finaliza y cierra | L42 R92XB0B8F3J | TEST | **migrar** | DriverViajeCalleScreen ya lo formaliza; extraer lo restante a TripLifecyclePBO + PaymentPBO y gatear |
| 44 | `validate-driver-happy-path.ts` | pk 0 · cod 0 · scr 0 · doc 2 | 2026-11-11 | MobileSession.open | Acepta, finaliza y cierra viaje ; GATE: F5_APP_CLOSE=1 + --confirm (antes de abrir sesion) | L34 R92XB0B8F3J | TEST | **migrar** | Aceptar/iniciar/finalizar/cerrar con JS click: mover a TripLifecyclePBO + screens/driver (ya tiene gate) |
| 45 | `viaje-calle-unhappy-paths.ts` | pk 0 · cod 0 · scr 0 · doc 1 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | EFECTO SIN GATE: 10 casos: viaje calle + cobros con tarjetas de prueba, finaliza/cierra | L35 R92XB0B8F3J | TEST | **migrar** | Casos negativos de pago (declinadas, 3DS fail) -> PaymentPBO.chargeWithCard/handle3DS + gate |
| 46 | `_tmp-mg626-card-owner.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | n/a | DB SELECT (solo lectura) | - | n/d (OracleDb por .env) | **cuarentena** | Probe MG-626 read-only sin sucesor; evidencia puntual, 0 refs |
| 47 | `_tmp-mg626-db-precheck.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | n/a | DB SELECT (solo lectura) | - | TEST | **cuarentena** | Probe MG-626 read-only sin sucesor; evidencia puntual, 0 refs |
| 48 | `_tmp-mg626-payload-v3.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | Harness/Screen | EFECTO SIN GATE: Alta/baja de tarjeta eBiz (saveCard/deleteCard) | - | TEST | **cuarentena** | Ultima version de la serie MG-626 (v3); unica con prueba de aislamiento de wallet; sin spec: conservar fuera de la ruta activa |
| 49 | `accept-trip-and-dump.ts` | pk 0 · cod 0 · scr 0 · doc 2 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | EFECTO SIN GATE: Acepta viaje (tap Aceptar) | L15 R92XB0B8F3J | TEST | **cuarentena** | Superado por TripLifecyclePBO.acceptAssignedTrip/startTrip; efecto sin gate; lo cita setup-appium-local.md (actualizar al mover) |
| 50 | `close-trip-summary.ts` | pk 0 · cod 0 · scr 0 · doc 1 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | EFECTO SIN GATE: Cierra viaje (Cerrar Viaje, irreversible) | L9 R92XB0B8F3J | TEST | **cuarentena** | Superado por TripLifecyclePBO.finishTrip/closeTrip (con gate); 0 refs |
| 51 | `diagnostics/dump-3ds-popup.ts` | pk 0 · cod 0 · scr 1 · doc 0 | 2026-11-11 (solo chore de migracion) | MobileSession.open | Ninguno (lectura/volcado/sonda) | L13 R92XB0B8F3J | TEST | **cuarentena** | Dump de 3DS puntual; PaymentPBO.handle3DS y screens/shared/Stripe3DS lo cubren; 0 refs |
| 52 | `diagnostics/dump-after-login.ts` | pk 0 · cod 1 · scr 0 · doc 1 | 2026-11-11 (solo chore de migracion) | MobileSession.open | Sin gate (bajo): Login + dump | L18 R92XB0B8F3J | TEST | **cuarentena** | Login+dump superado por DriverSessionPBO; lo cita setup-appium-local.md y el fixture de usuarios; password literal (SECURITY) |
| 53 | `diagnostics/dump-assigned-trip-state.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (solo chore de migracion) | MobileSession.open | Ninguno (lectura/volcado/sonda) | L5 R92XB0B8F3J | TEST | **cuarentena** | Dump read-only puntual sin refs (modales, estado, payment, list-tab, webview, travel-confirm, home-viaje-calle, assigned-trip) |
| 54 | `diagnostics/dump-driver-identity.ts` | pk 0 · cod 1 · scr 0 · doc 0 | 2026-11-11 (solo chore de migracion) | MobileSession.open | Ninguno (lectura/volcado/sonda) | L3 R92XB0B8F3J | TEST | **cuarentena** | Dump read-only sin refs de codigo; selectores ya migrados a DriverTripPreflight |
| 55 | `diagnostics/dump-en-base-modal.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (solo chore de migracion) | MobileSession.open | Ninguno (lectura/volcado/sonda) | L10 R92XB0B8F3J | TEST | **cuarentena** | Dump read-only puntual sin refs (modales, estado, payment, list-tab, webview, travel-confirm, home-viaje-calle, assigned-trip) |
| 56 | `diagnostics/dump-home-viaje-calle.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (solo chore de migracion) | MobileSession.open | Ninguno (lectura/volcado/sonda) | L13 R92XB0B8F3J | TEST | **cuarentena** | Dump read-only puntual sin refs (modales, estado, payment, list-tab, webview, travel-confirm, home-viaje-calle, assigned-trip) |
| 57 | `diagnostics/dump-modal-html.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (solo chore de migracion) | MobileSession.open | Ninguno (lectura/volcado/sonda) | L13 R92XB0B8F3J | TEST | **cuarentena** | Dump read-only puntual sin refs (modales, estado, payment, list-tab, webview, travel-confirm, home-viaje-calle, assigned-trip) |
| 58 | `diagnostics/dump-resume-payment.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (solo chore de migracion) | MobileSession.open | Ninguno (lectura/volcado/sonda) | L8 R92XB0B8F3J | TEST | **cuarentena** | Dump read-only puntual sin refs (modales, estado, payment, list-tab, webview, travel-confirm, home-viaje-calle, assigned-trip) |
| 59 | `diagnostics/dump-travel-confirm.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (solo chore de migracion) | MobileSession.open | Ninguno (lectura/volcado/sonda) | L36 R92XB0B8F3J | TEST | **cuarentena** | Dump read-only puntual sin refs (modales, estado, payment, list-tab, webview, travel-confirm, home-viaje-calle, assigned-trip) |
| 60 | `diagnostics/dump-travel-list-tab.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (solo chore de migracion) | MobileSession.open | Ninguno (lectura/volcado/sonda) | L16 R92XB0B8F3J | TEST | **cuarentena** | Dump read-only puntual sin refs (modales, estado, payment, list-tab, webview, travel-confirm, home-viaje-calle, assigned-trip) |
| 61 | `diagnostics/dump-webview.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (solo chore de migracion) | MobileSession.open | Ninguno (lectura/volcado/sonda) | L16 R92XB0B8F3J | TEST | **cuarentena** | Dump read-only puntual sin refs (modales, estado, payment, list-tab, webview, travel-confirm, home-viaje-calle, assigned-trip) |
| 62 | `driver-availability-hang-repro.ts` | pk 0 · cod 0 · scr 1 · doc 1 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Sin gate (bajo): Alterna disponibilidad | L36 R92XB0B8F3J | TEST | **cuarentena** | Reproduccion de bug de disponibilidad; 0 refs de codigo, solo doc de arquitectura la lista; owner dudoso |
| 63 | `driver-cargo-payment-validate.ts` | pk 0 · cod 0 · scr 0 · doc 2 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | EFECTO SIN GATE: Acepta, finaliza y cobra con tarjeta de prueba declinada | L28 R92XB0B8F3J | TEST | **cuarentena** | Superado por PaymentPBO.chargeWithCard / DriverCargoDeclineHarness; efecto sin gate; solo docs lo citan |
| 64 | `driver-charge-from-resume.ts` | pk 0 · cod 0 · scr 1 · doc 0 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | EFECTO SIN GATE: Envia cobro con tarjeta de prueba declinada | L14 R92XB0B8F3J | TEST | **cuarentena** | Superado por PaymentPBO.chargeWithCard / DriverCargoDeclineHarness; efecto sin gate; solo docs lo citan |
| 65 | `driver-login-password-only.ts` | pk 0 · cod 1 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | Sin gate (bajo): Login (contrasena) | L9 R92XB0B8F3J | TEST | **cuarentena** | Login solo contrasena superado por DriverSessionPBO; contrasena literal (SECURITY) |
| 66 | `driver-mg117-address-matrix.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default (doc: UAT) | **cuarentena** | Exploracion de descubrimiento MG-117 (selectores/modales/matriz); 0 refs |
| 67 | `driver-mg117-discover-prediction.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default (doc: UAT) | **cuarentena** | Exploracion de descubrimiento MG-117 (selectores/modales/matriz); 0 refs |
| 68 | `driver-mg117-gates.ts` | pk 0 · cod 0 · scr 1 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default (doc: UAT) | **cuarentena** | Cubierto por DriverAddressCaseBattery (TM-654..662) / spec driver-address-surfaces; 0 refs |
| 69 | `driver-mg117-home-explore.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default (doc: UAT) | **cuarentena** | Exploracion de descubrimiento MG-117 (selectores/modales/matriz); 0 refs |
| 70 | `driver-mg117-smoke.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default (doc: UAT) | **cuarentena** | Cubierto por DriverAddressCaseBattery (TM-654..662) / spec driver-address-surfaces; 0 refs |
| 71 | `driver-mg117-spinner-check.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default (doc: UAT) | **cuarentena** | TM-665 cubierto por DriverAddressCaseBattery; 3 scripts de la misma campana; 0 refs |
| 72 | `driver-mg117-tm665-matrix.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default (doc: UAT) | **cuarentena** | TM-665 cubierto por DriverAddressCaseBattery; 3 scripts de la misma campana; 0 refs |
| 73 | `driver-mg117-tm665.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default (doc: UAT) | **cuarentena** | TM-665 cubierto por DriverAddressCaseBattery; 3 scripts de la misma campana; 0 refs |
| 74 | `driver-observe.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | L24 R92XB0B8F3J | TEST | **cuarentena** | Observador no intrusivo para captura asistida MG-117 (campana cerrada); 0 refs |
| 75 | `driver-set-geo.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | n/a | Sin gate (bajo): Mock de GPS del device (mueve ofertas) | - | TEST | **cuarentena** | Mock GPS superado por GpsSimulationPBO.positionAt (setGeoLocation sin speed descarta puntos) |
| 76 | `driver-storage-probe.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-12 | Harness/Screen | Ninguno (lectura/volcado/sonda) | - | n/d | **cuarentena** | Sonda read-only de Ionic Storage; 0 refs; reemplazable por driverStateDiagnostic |
| 77 | `dump-and-free-resume.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | EFECTO SIN GATE: Intenta cerrar viaje stale con metodo no-tarjeta | L10 R92XB0B8F3J | TEST | **cuarentena** | Borrador superado por recoverDriverToHome (helper); 0 refs |
| 78 | `end-trip-and-dump.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | EFECTO SIN GATE: Finaliza viaje (modal Si) | L12 R92XB0B8F3J | TEST | **cuarentena** | Superado por TripLifecyclePBO.finishTrip/closeTrip (con gate); 0 refs |
| 79 | `full-trip-flow-dump.ts` | pk 0 · cod 0 · scr 0 · doc 1 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | EFECTO SIN GATE: Acepta e inicia viaje | L15 R92XB0B8F3J | TEST | **cuarentena** | Superado por TripLifecyclePBO.acceptAssignedTrip/startTrip; efecto sin gate; lo cita setup-appium-local.md (actualizar al mover) |
| 80 | `mgw-hold-detail.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | n/a | DB SELECT (solo lectura) | - | n/d (OracleDb por .env) | **cuarentena** | Explorador DB (Oracle SELECT) de holds/gateway; pertenece a gateway-pg mas que a mobile; owner dudoso; 0 refs |
| 81 | `mgw-logs-explore.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | n/a | DB SELECT (solo lectura) | - | n/d (OracleDb por .env) | **cuarentena** | Explorador DB (Oracle SELECT) de holds/gateway; pertenece a gateway-pg mas que a mobile; owner dudoso; 0 refs |
| 82 | `mgw-scheduled-hold.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | n/a | DB SELECT (solo lectura) | - | n/d (OracleDb por .env) | **cuarentena** | Explorador DB (Oracle SELECT) de holds/gateway; pertenece a gateway-pg mas que a mobile; owner dudoso; 0 refs |
| 83 | `mgw-travel-coords.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | n/a | DB SELECT (solo lectura) | - | n/d (OracleDb por .env) | **cuarentena** | Explorador DB (Oracle SELECT) de holds/gateway; pertenece a gateway-pg mas que a mobile; owner dudoso; 0 refs |
| 84 | `passenger-address-confirm-dump.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | Harness/Screen | Ninguno (lectura/volcado/sonda) | - | TEST | **cuarentena** | Dumps/exploradores del alta de viaje pax v2.5.17 (ago-25) sin refs |
| 85 | `passenger-cta-inspect.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | Harness/Screen | Ninguno (lectura/volcado/sonda) | - | n/d | **cuarentena** | Dumps/exploradores del alta de viaje pax v2.5.17 (ago-25) sin refs |
| 86 | `passenger-diagnose-addcard-network.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | Harness/Screen | EFECTO SIN GATE: Submit de alta de tarjeta | - | TEST | **cuarentena** | Exploradores eBiz/wallet v2.5.17 (ago-25) sin refs; superados por PassengerWalletPBO y specs gateway-pg |
| 87 | `passenger-ebiz-business-address.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | Harness/Screen | Ninguno (lectura/volcado/sonda) | - | TEST | **cuarentena** | Exploradores eBiz/wallet v2.5.17 (ago-25) sin refs; superados por PassengerWalletPBO y specs gateway-pg |
| 88 | `passenger-ebiz-business-explore.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | Harness/Screen | EFECTO SIN GATE: Alta de tarjeta (saveCard) en modo Compania | - | TEST | **cuarentena** | Exploradores eBiz/wallet v2.5.17 (ago-25) sin refs; superados por PassengerWalletPBO y specs gateway-pg |
| 89 | `passenger-ebiz-newtrip-explore.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | Harness/Screen | Ninguno (lectura/volcado/sonda) | - | TEST | **cuarentena** | Exploradores eBiz/wallet v2.5.17 (ago-25) sin refs; superados por PassengerWalletPBO y specs gateway-pg |
| 90 | `passenger-ebiz-newtrip-validate.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | Harness/Screen | EFECTO SIN GATE: Re-vincula tarjeta y crea viaje | - | TEST | **cuarentena** | Exploradores eBiz/wallet v2.5.17 (ago-25) sin refs; superados por PassengerWalletPBO y specs gateway-pg |
| 91 | `passenger-explore-addcard-form.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | Harness/Screen | Ninguno (lectura/volcado/sonda) | - | TEST | **cuarentena** | Exploradores eBiz/wallet v2.5.17 (ago-25) sin refs; superados por PassengerWalletPBO y specs gateway-pg |
| 92 | `passenger-mg116-bias-origin.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default | **cuarentena** | Exploracion MG-116 sin TM propio; superficies cubiertas por pax-address-surfaces; 0 refs |
| 93 | `passenger-mg116-carrier-ab.ts` | pk 0 · cod 0 · scr 1 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default | **cuarentena** | Campana MG-116 cubierta por pax-address-behaviors/surfaces + AddressFieldProbe (TM-669..734); 0 refs |
| 94 | `passenger-mg116-gates.ts` | pk 0 · cod 0 · scr 1 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default | **cuarentena** | Campana MG-116 cubierta por pax-address-behaviors/surfaces + AddressFieldProbe (TM-669..734); 0 refs |
| 95 | `passenger-mg116-iata-por-superficie.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default | **cuarentena** | Exploracion MG-116 sin TM propio; superficies cubiertas por pax-address-surfaces; 0 refs |
| 96 | `passenger-mg116-probe-modal.ts` | pk 0 · cod 0 · scr 1 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default | **cuarentena** | Exploracion MG-116 sin TM propio; superficies cubiertas por pax-address-surfaces; 0 refs |
| 97 | `passenger-mg116-regression.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default | **cuarentena** | Regresion MG-116 superada por specs; contiene bytes NUL (grep la trata como binaria): revisar codificacion al mover |
| 98 | `passenger-mg116-s7-direcciones.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default | **cuarentena** | Exploracion MG-116 sin TM propio; superficies cubiertas por pax-address-surfaces; 0 refs |
| 99 | `passenger-mg116-selection-control.ts` | pk 0 · cod 1 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-14) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default | **cuarentena** | Campana MG-116 cubierta por pax-address-behaviors/surfaces + AddressFieldProbe (TM-669..734); 0 refs |
| 100 | `passenger-mg116-selection.ts` | pk 0 · cod 1 · scr 1 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default | **cuarentena** | Campana MG-116 cubierta por pax-address-behaviors/surfaces + AddressFieldProbe (TM-669..734); 0 refs |
| 101 | `passenger-mg116-stale-placeid.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default | **cuarentena** | Campana MG-116 cubierta por pax-address-behaviors/surfaces + AddressFieldProbe (TM-669..734); 0 refs |
| 102 | `passenger-newtrip-dump.ts` | pk 0 · cod 0 · scr 1 · doc 0 | 2026-08-25 | Harness/Screen | Ninguno (lectura/volcado/sonda) | - | TEST | **cuarentena** | Dumps/exploradores del alta de viaje pax v2.5.17 (ago-25) sin refs |
| 103 | `passenger-newtrip-fullflow-dump.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | Harness/Screen | EFECTO SIN GATE: Alta de tarjeta + confirma viaje (confirmTrip) | - | TEST | **cuarentena** | Dumps/exploradores del alta de viaje pax v2.5.17 (ago-25) sin refs |
| 104 | `passenger-newtrip-vehicle-dump.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | Harness/Screen | Ninguno (lectura/volcado/sonda) | - | TEST | **cuarentena** | Dumps/exploradores del alta de viaje pax v2.5.17 (ago-25) sin refs |
| 105 | `passenger-scheduled-trips-census.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default | **cuarentena** | Censo de descubrimiento S6 (programados); 0 refs |
| 106 | `passenger-tm731-background-vs-reload.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default | **cuarentena** | TM-731 cubierto por specs de superficies; 0 refs |
| 107 | `probe-prod-webview.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-08-25) | MobileSession.open | Ninguno (lectura/volcado/sonda) | - | ENV por .env, sin default (doc: PROD) | **cuarentena** | Sonda PROD de instrumentabilidad del WebView; explica el smoke nativo pero 0 refs |
| 108 | `start-trip-and-dump.ts` | pk 0 · cod 0 · scr 0 · doc 1 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | EFECTO SIN GATE: Acepta e inicia viaje | L15 R92XB0B8F3J | TEST | **cuarentena** | Superado por TripLifecyclePBO.acceptAssignedTrip/startTrip; efecto sin gate; lo cita setup-appium-local.md (actualizar al mover) |
| 109 | `tap-accept-prehome.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | Sin gate (bajo): Tap Aceptar del overlay pre-home | L14 R92XB0B8F3J | TEST | **cuarentena** | Utilidad menor sin refs; tap en overlay pre-home cubierto por DriverSessionPBO |
| 110 | `tap-passenger-btn-dump.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (sust. 2026-07-22) | MobileSession.open | Sin gate (bajo): Tap boton Pasajero (abre dialogo de viaje calle) | L20 R92XB0B8F3J | TEST | **cuarentena** | Volcado puntual tras tap del boton Pasajero; sin refs; cubierto por DriverHomeScreen |
| 111 | `_tmp-mg626-business-addcard-network.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | Harness/Screen | EFECTO SIN GATE: Alta/baja de tarjeta eBiz (saveCard/deleteCard) | - | TEST | **borrar** | Primera version de la serie MG-626, superada por v2/v3; 0 refs; efecto (alta/baja tarjeta) |
| 112 | `_tmp-mg626-payload-v2.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-08-25 | Harness/Screen | EFECTO SIN GATE: Alta/baja de tarjeta eBiz (saveCard/deleteCard) | - | TEST | **borrar** | Superada por v3 (mismo flujo + prueba de modo Compania); 0 refs |
| 113 | `diagnostics/dump-home-online.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (solo chore de migracion) | MobileSession.open | Ninguno (lectura/volcado/sonda) | L16 R92XB0B8F3J | TEST | **borrar** | Duplicado de driver-go-online + dump-driver-home; 0 refs |
| 114 | `diagnostics/dump-home-screen.ts` | pk 0 · cod 0 · scr 0 · doc 0 | 2026-11-11 (solo chore de migracion) | MobileSession.open | Ninguno (lectura/volcado/sonda) | L21 R92XB0B8F3J | TEST | **borrar** | Duplicado de dump-current-screen (vuelca la pantalla actual); 0 refs |

Filas: 114 (git ls-files: 114).

## 4. Efectos sin gate

### 4.1 Efecto sobre datos de negocio (EFECTO SIN GATE) — 29 scripts

Accion pendiente indicada en la ultima columna. Los marcados `cuarentena`/`borrar` dejan de ser ejecutables por accidente al moverlos; los `vivo`/`migrar` necesitan gate (`F5_APP_CLOSE=1` + `--confirm` para viaje/cobro; dry-run por defecto + flag `--apply` para wallet y alta de viaje).

| Path | Efecto | Env | Clase | Accion propuesta |
|---|---|---|---|---|
| `driver-free-stale-trip.ts` | Libera viaje stale (cancela/finaliza via recoverDriverToHome) | TEST | vivo | Agregar gate antes de seguir usandolo |
| `driver-geocerca-out-of-range.ts` | Acepta, inicia, finaliza y cierra (cleanup efectivo) | TEST | vivo | Agregar gate antes de seguir usandolo |
| `passenger-business-no3ds-hold-flow.ts` | Alta de tarjeta + crea viaje con hold (Compania) | n/d | vivo | Agregar gate antes de seguir usandolo |
| `passenger-cancel-active-trip.ts` | Cancela el viaje activo del pax | TEST | vivo | Agregar gate antes de seguir usandolo |
| `passenger-confirm-scheduled-trip.ts` | Confirma viaje programado (crea viaje); solo valida medio de pago efectivo/CC | ENV por .env, sin default | vivo | Agregar gate antes de seguir usandolo |
| `passenger-personal-3ds-hold-flow.ts` | Alta de tarjeta 3DS + crea viaje con hold | n/d | vivo | Agregar gate antes de seguir usandolo |
| `passenger-schedule-trip.ts` | Crea viaje programado; dry-run es opt-in (MG116_DRY=1), el default confirma | ENV por .env, sin default | vivo | Agregar gate antes de seguir usandolo |
| `passenger-wallet-3ds-delete.ts` | Alta y baja de tarjeta 3DS | n/d | vivo | Agregar gate antes de seguir usandolo |
| `passenger-wallet-cleanup.ts` | Borra todas las tarjetas del perfil | TEST | vivo | Agregar gate antes de seguir usandolo |
| `driver-validate-home-street-base.ts` | Inicia street-trip real y limpia (cancela/finaliza) | TEST | migrar | Agregar gate antes de seguir usandolo |
| `passenger-ebiz-addcard-validate.ts` | Alta de tarjeta eBiz en wallet | TEST | migrar | Agregar gate antes de seguir usandolo |
| `passenger-restore-wallet-card.ts` | Alta de tarjeta en wallet | TEST | migrar | Agregar gate antes de seguir usandolo |
| `start-viaje-calle-flow.ts` | Crea viaje calle, cobra con tarjeta de prueba (3DS), finaliza y cierra | TEST | migrar | Agregar gate antes de seguir usandolo |
| `viaje-calle-unhappy-paths.ts` | 10 casos: viaje calle + cobros con tarjetas de prueba, finaliza/cierra | TEST | migrar | Agregar gate antes de seguir usandolo |
| `_tmp-mg626-payload-v3.ts` | Alta/baja de tarjeta eBiz (saveCard/deleteCard) | TEST | cuarentena | Sale de la ruta activa (cuarentena) |
| `accept-trip-and-dump.ts` | Acepta viaje (tap Aceptar) | TEST | cuarentena | Sale de la ruta activa (cuarentena) |
| `close-trip-summary.ts` | Cierra viaje (Cerrar Viaje, irreversible) | TEST | cuarentena | Sale de la ruta activa (cuarentena) |
| `driver-cargo-payment-validate.ts` | Acepta, finaliza y cobra con tarjeta de prueba declinada | TEST | cuarentena | Sale de la ruta activa (cuarentena) |
| `driver-charge-from-resume.ts` | Envia cobro con tarjeta de prueba declinada | TEST | cuarentena | Sale de la ruta activa (cuarentena) |
| `dump-and-free-resume.ts` | Intenta cerrar viaje stale con metodo no-tarjeta | TEST | cuarentena | Sale de la ruta activa (cuarentena) |
| `end-trip-and-dump.ts` | Finaliza viaje (modal Si) | TEST | cuarentena | Sale de la ruta activa (cuarentena) |
| `full-trip-flow-dump.ts` | Acepta e inicia viaje | TEST | cuarentena | Sale de la ruta activa (cuarentena) |
| `passenger-diagnose-addcard-network.ts` | Submit de alta de tarjeta | TEST | cuarentena | Sale de la ruta activa (cuarentena) |
| `passenger-ebiz-business-explore.ts` | Alta de tarjeta (saveCard) en modo Compania | TEST | cuarentena | Sale de la ruta activa (cuarentena) |
| `passenger-ebiz-newtrip-validate.ts` | Re-vincula tarjeta y crea viaje | TEST | cuarentena | Sale de la ruta activa (cuarentena) |
| `passenger-newtrip-fullflow-dump.ts` | Alta de tarjeta + confirma viaje (confirmTrip) | TEST | cuarentena | Sale de la ruta activa (cuarentena) |
| `start-trip-and-dump.ts` | Acepta e inicia viaje | TEST | cuarentena | Sale de la ruta activa (cuarentena) |
| `_tmp-mg626-business-addcard-network.ts` | Alta/baja de tarjeta eBiz (saveCard/deleteCard) | TEST | borrar | Se elimina (propuesto) |
| `_tmp-mg626-payload-v2.ts` | Alta/baja de tarjeta eBiz (saveCard/deleteCard) | TEST | borrar | Se elimina (propuesto) |

### 4.2 Efecto menor sin gate (estado de app, sesion, GPS) — 11 scripts

| Path | Efecto | Clase |
|---|---|---|
| `diagnostics/dump-after-login.ts` | Login + dump | cuarentena |
| `driver-availability-hang-repro.ts` | Alterna disponibilidad | cuarentena |
| `driver-go-online.ts` | Fija disponibilidad (Disponible) | vivo |
| `driver-login-password-only.ts` | Login (contrasena) | cuarentena |
| `driver-login-smoke.ts` | Login + disponibilidad | vivo |
| `driver-relogin-and-home.ts` | Re-login de la cuenta | vivo |
| `driver-set-geo.ts` | Mock de GPS del device (mueve ofertas) | cuarentena |
| `driver-validate-menu-destructive.ts` | Guarda preferencias, cierra sesion, fuera de servicio | migrar |
| `passenger-login-and-dump.ts` | Login + dump | vivo |
| `tap-accept-prehome.ts` | Tap Aceptar del overlay pre-home | cuarentena |
| `tap-passenger-btn-dump.ts` | Tap boton Pasajero (abre dialogo de viaje calle) | cuarentena |

### 4.3 Con gate verificado — 7 scripts

| Path | Efecto | Gate |
|---|---|---|
| `driver-accept-complete-trip.ts` | Acepta, inicia, finaliza y cierra viaje | F5_APP_CLOSE=1 + --confirm |
| `driver-ghost-trips-purge.ts` | POST refuse por API a viajes fantasma | dry-run por defecto, GHOST_PURGE_APPLY=1 |
| `driverStateDiagnostic.mjs` | adb pm clear de la app solo con --unblock; DB SELECT | --unblock (default no modifica) |
| `f5-driver-close-trip.ts` | Acepta, inicia, finaliza y cierra viaje; GPS mock | F5_APP_CLOSE=1 + --confirm (+ --dry-run) |
| `f5-driver-resume-close.ts` | Finaliza/cierra viaje | F5_APP_CLOSE=1 + --confirm |
| `fr-driver-s3-closure.ts` | Acepta, inicia, finaliza y cierra viaje | F5_APP_CLOSE=1 + --confirm |
| `validate-driver-happy-path.ts` | Acepta, finaliza y cierra viaje | F5_APP_CLOSE=1 + --confirm (antes de abrir sesion) |

## 5. UDID hardcodeado

47 scripts tienen un UDID literal como valor por defecto en codigo (45 `R92XB0B8F3J` = telefono fisico Samsung SM-A055M; 2 `emulator-5554`). Otros 10 scripts con `R92XB0B8F3J` lo citan solo en comentarios/ejemplos de uso (55 archivos lo mencionan en total). El patron correcto ya existe: `_shared/resolveDriverTarget.ts` exige `ANDROID_UDID` por env y falla sin default.

| Path | Linea y valor | Clase |
|---|---|---|
| `accept-trip-and-dump.ts` | L15 R92XB0B8F3J | cuarentena |
| `close-trip-summary.ts` | L9 R92XB0B8F3J | cuarentena |
| `diagnostics/dump-3ds-popup.ts` | L13 R92XB0B8F3J | cuarentena |
| `diagnostics/dump-after-login.ts` | L18 R92XB0B8F3J | cuarentena |
| `diagnostics/dump-assigned-trip-state.ts` | L5 R92XB0B8F3J | cuarentena |
| `diagnostics/dump-current-screen.ts` | L17 R92XB0B8F3J | vivo |
| `diagnostics/dump-driver-home.ts` | L38 R92XB0B8F3J | vivo |
| `diagnostics/dump-driver-identity.ts` | L3 R92XB0B8F3J | cuarentena |
| `diagnostics/dump-en-base-modal.ts` | L10 R92XB0B8F3J | cuarentena |
| `diagnostics/dump-home-online.ts` | L16 R92XB0B8F3J | borrar |
| `diagnostics/dump-home-screen.ts` | L21 R92XB0B8F3J | borrar |
| `diagnostics/dump-home-viaje-calle.ts` | L13 R92XB0B8F3J | cuarentena |
| `diagnostics/dump-modal-html.ts` | L13 R92XB0B8F3J | cuarentena |
| `diagnostics/dump-resume-payment.ts` | L8 R92XB0B8F3J | cuarentena |
| `diagnostics/dump-travel-confirm.ts` | L36 R92XB0B8F3J | cuarentena |
| `diagnostics/dump-travel-list-tab.ts` | L16 R92XB0B8F3J | cuarentena |
| `diagnostics/dump-webview.ts` | L16 R92XB0B8F3J | cuarentena |
| `driver-availability-hang-repro.ts` | L36 R92XB0B8F3J | cuarentena |
| `driver-cargo-payment-validate.ts` | L28 R92XB0B8F3J | cuarentena |
| `driver-charge-from-resume.ts` | L14 R92XB0B8F3J | cuarentena |
| `driver-explore-flow-map.ts` | L19 R92XB0B8F3J | vivo |
| `driver-explore-menu.ts` | L18 R92XB0B8F3J | vivo |
| `driver-free-stale-trip.ts` | L26 R92XB0B8F3J | vivo |
| `driver-geocerca-out-of-range.ts` | L17 R92XB0B8F3J | vivo |
| `driver-go-online.ts` | L17 R92XB0B8F3J | vivo |
| `driver-login-password-only.ts` | L9 R92XB0B8F3J | cuarentena |
| `driver-login-smoke.ts` | L26 R92XB0B8F3J | vivo |
| `driver-observe.ts` | L24 R92XB0B8F3J | cuarentena |
| `driver-relogin-and-home.ts` | L17 R92XB0B8F3J | vivo |
| `driver-validate-home-street-base.ts` | L25 R92XB0B8F3J | migrar |
| `driver-validate-menu-destructive.ts` | L23 R92XB0B8F3J | migrar |
| `driverStateDiagnostic.mjs` | L34 R92XB0B8F3J | vivo |
| `dump-and-free-resume.ts` | L10 R92XB0B8F3J | cuarentena |
| `end-trip-and-dump.ts` | L12 R92XB0B8F3J | cuarentena |
| `fr-driver-preflight.ts` | L23 emulator-5554 | vivo |
| `fr-driver-s3-closure.ts` | L32 emulator-5554 | vivo |
| `full-trip-flow-dump.ts` | L15 R92XB0B8F3J | cuarentena |
| `passenger-home-mode-smoke.ts` | L19 R92XB0B8F3J | vivo |
| `passenger-login-and-dump.ts` | L17 R92XB0B8F3J | vivo |
| `passenger-wallet-cleanup.ts` | L21 R92XB0B8F3J | vivo |
| `prod-smoke-to-allure.mjs` | L105 R92XB0B8F3J | vivo |
| `start-trip-and-dump.ts` | L15 R92XB0B8F3J | cuarentena |
| `start-viaje-calle-flow.ts` | L42 R92XB0B8F3J | migrar |
| `tap-accept-prehome.ts` | L14 R92XB0B8F3J | cuarentena |
| `tap-passenger-btn-dump.ts` | L20 R92XB0B8F3J | cuarentena |
| `validate-driver-happy-path.ts` | L34 R92XB0B8F3J | migrar |
| `viaje-calle-unhappy-paths.ts` | L35 R92XB0B8F3J | migrar |

Accion: en los `vivo`/`migrar` reemplazar el default por `resolveDriverTarget()`; en `cuarentena` no hace falta tocarlos.

## 6. Hallazgos SECURITY

Solo se informan ruta y linea; no se reproducen los valores.

| Path | Linea | Hallazgo |
|---|---|---|
| `diagnostics/dump-after-login.ts` | 10 | Contrasena literal en bloque de ejemplo de uso (docblock) |
| `driver-explore-flow-map.ts` | 10 | Contrasena literal en docblock |
| `driver-login-smoke.ts` | 19 | Contrasena literal en docblock |
| `driver-relogin-and-home.ts` | 9 | Contrasena literal en docblock |
| `driver-validate-menu-destructive.ts` | 13 | Contrasena literal en docblock |
| `passenger-login-and-dump.ts` | 8 | Contrasena literal en docblock |
| `driver-login-password-only.ts` | 11 | Contrasena literal como valor por defecto en CODIGO (`?? <literal>`) |
| `_tmp-mg626-db-precheck.ts` | 72 | Email de usuario de prueba literal como default en codigo |
| `diagnostics/dump-after-login.ts` | 9 | Email de prueba (yopmail) literal en docblock |
| `driver-explore-flow-map.ts` | 10 | Email de prueba (yopmail) literal en docblock |
| `driver-login-smoke.ts` | 18 | Email de prueba (yopmail) literal en docblock |
| `driver-relogin-and-home.ts` | 9 | Email de prueba (yopmail) literal en docblock |
| `driver-validate-menu-destructive.ts` | 13 | Email de prueba (yopmail) literal en docblock |
| `passenger-login-and-dump.ts` | 7 | Email de prueba (yopmail) literal en docblock |

Observaciones:

- No se hallaron tokens (`Bearer`, JWT, `sk_`) ni claves de API literales en los scripts. `driver-ghost-trips-purge.ts` lee el token del storage del WebView en runtime y no lo persiste.
- Fuera de `scripts/` pero relacionado: `tests/fixtures/users/mobile/driver.ts:18` documenta un fallback de contrasena `DRIVER_PASSWORD` y cita `driver-login-password-only.ts`. Conviene incluirlo en la misma limpieza.
- Los numeros de tarjeta de `driver-cargo-payment-validate.ts`, `driver-charge-from-resume.ts`, `start-viaje-calle-flow.ts`, `viaje-calle-unhappy-paths.ts` y `validate-driver-happy-path.ts` son tarjetas de prueba publicas de Stripe, no datos sensibles. Se listan solo a titulo informativo.
- Los emails/contrasenas de docblock son credenciales de cuentas de prueba (yopmail); aun asi, ya aparecen en el historial y conviene rotarlas o moverlas a `.env.example` con placeholders cuando se limpie.

## 7. Propuesta para T0.4

**Movido en 7894ae8**: los 69 scripts de 7.1 y 7.2 (65 cuarentena + 4 borrar, D8: nada se borra) pasaron a `tests/mobile/appium/scripts/_quarantine/` con `git mv`; ver el README de esa carpeta. Credenciales literales saneadas en el commit anterior.

Destino: `tests/mobile/appium/scripts/_quarantine/` (conservando subcarpeta, p. ej. `_quarantine/diagnostics/`). Mover con `git mv` para no perder historia. Nada de esto se ejecuto en T0.3.

### 7.1 Mover a cuarentena (65)

Columna **Refs a actualizar** = archivos fuera de `scripts/` que mencionan el script y habria que corregir al moverlo.

| Script | Efecto | Refs a actualizar |
|---|---|---|
| `_tmp-mg626-card-owner.ts` | lectura | - |
| `_tmp-mg626-db-precheck.ts` | lectura | - |
| `_tmp-mg626-payload-v3.ts` | SIN GATE | - |
| `accept-trip-and-dump.ts` | SIN GATE | `docs/mobile-ci/setup-appium-local.md`, `docs/qa/appium-pom-pbo-architecture.md` |
| `close-trip-summary.ts` | SIN GATE | `docs/qa/appium-pom-pbo-architecture.md` |
| `diagnostics/dump-3ds-popup.ts` | lectura | - |
| `diagnostics/dump-after-login.ts` | bajo | `docs/mobile-ci/setup-appium-local.md`, `tests/fixtures/users/mobile/driver.ts` |
| `diagnostics/dump-assigned-trip-state.ts` | lectura | - |
| `diagnostics/dump-driver-identity.ts` | lectura | `driver/DriverTripPreflight.ts` |
| `diagnostics/dump-en-base-modal.ts` | lectura | - |
| `diagnostics/dump-home-viaje-calle.ts` | lectura | - |
| `diagnostics/dump-modal-html.ts` | lectura | - |
| `diagnostics/dump-resume-payment.ts` | lectura | - |
| `diagnostics/dump-travel-confirm.ts` | lectura | - |
| `diagnostics/dump-travel-list-tab.ts` | lectura | - |
| `diagnostics/dump-webview.ts` | lectura | - |
| `driver-availability-hang-repro.ts` | bajo | `docs/qa/appium-pom-pbo-architecture.md` |
| `driver-cargo-payment-validate.ts` | SIN GATE | `docs/qa/appium-pom-pbo-architecture.md`, `docs/qa/baseline/canonica-summary-completion.md` |
| `driver-charge-from-resume.ts` | SIN GATE | - |
| `driver-login-password-only.ts` | bajo | `tests/fixtures/users/mobile/driver.ts` |
| `driver-mg117-address-matrix.ts` | lectura | - |
| `driver-mg117-discover-prediction.ts` | lectura | - |
| `driver-mg117-gates.ts` | lectura | - |
| `driver-mg117-home-explore.ts` | lectura | - |
| `driver-mg117-smoke.ts` | lectura | - |
| `driver-mg117-spinner-check.ts` | lectura | - |
| `driver-mg117-tm665-matrix.ts` | lectura | - |
| `driver-mg117-tm665.ts` | lectura | - |
| `driver-observe.ts` | lectura | - |
| `driver-set-geo.ts` | bajo | - |
| `driver-storage-probe.ts` | lectura | - |
| `dump-and-free-resume.ts` | SIN GATE | - |
| `end-trip-and-dump.ts` | SIN GATE | - |
| `full-trip-flow-dump.ts` | SIN GATE | `docs/mobile-ci/setup-appium-local.md` |
| `mgw-hold-detail.ts` | lectura | - |
| `mgw-logs-explore.ts` | lectura | - |
| `mgw-scheduled-hold.ts` | lectura | - |
| `mgw-travel-coords.ts` | lectura | - |
| `passenger-address-confirm-dump.ts` | lectura | - |
| `passenger-cta-inspect.ts` | lectura | - |
| `passenger-diagnose-addcard-network.ts` | SIN GATE | - |
| `passenger-ebiz-business-address.ts` | lectura | - |
| `passenger-ebiz-business-explore.ts` | SIN GATE | - |
| `passenger-ebiz-newtrip-explore.ts` | lectura | - |
| `passenger-ebiz-newtrip-validate.ts` | SIN GATE | - |
| `passenger-explore-addcard-form.ts` | lectura | - |
| `passenger-mg116-bias-origin.ts` | lectura | - |
| `passenger-mg116-carrier-ab.ts` | lectura | - |
| `passenger-mg116-gates.ts` | lectura | - |
| `passenger-mg116-iata-por-superficie.ts` | lectura | - |
| `passenger-mg116-probe-modal.ts` | lectura | - |
| `passenger-mg116-regression.ts` | lectura | - |
| `passenger-mg116-s7-direcciones.ts` | lectura | - |
| `passenger-mg116-selection-control.ts` | lectura | `passenger/AddressFieldProbe.ts` |
| `passenger-mg116-selection.ts` | lectura | `passenger/AddressFieldProbe.ts` |
| `passenger-mg116-stale-placeid.ts` | lectura | - |
| `passenger-newtrip-dump.ts` | lectura | - |
| `passenger-newtrip-fullflow-dump.ts` | SIN GATE | - |
| `passenger-newtrip-vehicle-dump.ts` | lectura | - |
| `passenger-scheduled-trips-census.ts` | lectura | - |
| `passenger-tm731-background-vs-reload.ts` | lectura | - |
| `probe-prod-webview.ts` | lectura | - |
| `start-trip-and-dump.ts` | SIN GATE | `docs/mobile-ci/setup-appium-local.md` |
| `tap-accept-prehome.ts` | bajo | - |
| `tap-passenger-btn-dump.ts` | bajo | - |

### 7.2 Borrar (propuesto, requiere confirmacion del usuario; 4)

El plan de arquitectura (`docs/qa/appium-pom-pbo-architecture.md`, paso 9) indica que `_tmp-mg626-*` solo se borra con confirmacion. Hasta confirmar, mover a cuarentena igual que el resto.

| Script | Motivo |
|---|---|
| `_tmp-mg626-business-addcard-network.ts` | Primera version de la serie MG-626, superada por v2/v3; 0 refs; efecto (alta/baja tarjeta) |
| `_tmp-mg626-payload-v2.ts` | Superada por v3 (mismo flujo + prueba de modo Compania); 0 refs |
| `diagnostics/dump-home-online.ts` | Duplicado de driver-go-online + dump-driver-home; 0 refs |
| `diagnostics/dump-home-screen.ts` | Duplicado de dump-current-screen (vuelca la pantalla actual); 0 refs |

### 7.3 Migrar (10)

| Script | Destino |
|---|---|
| `driver-mg117-probe-term.ts` | Sonda TM-660 (cuerpo de respuesta por termino) no cubierta en DriverAddressCaseBattery |
| `driver-mg117-remaining.ts` | Cubre TM-653/660/661/670 que DriverAddressCaseBattery no cubre aun; mover alli |
| `driver-mg117-waypoints.ts` | Paradas multiples/sessionToken: sin caso equivalente en DriverAddressCaseBattery |
| `driver-validate-home-street-base.ts` | Valida home/street-trip/En Base en device; mover a DriverHomeScreen + TripLifecyclePBO y gatear |
| `driver-validate-menu-destructive.ts` | Flujos de menu (preferencias, vehiculo, logout) sin PBO; mover a DriverSessionPBO + screen de menu y gatear |
| `passenger-ebiz-addcard-validate.ts` | PassengerWalletPBO.addCard ya lo reemplaza como fuente; validador GO/NO-GO eBiz sin spec equivalente |
| `passenger-restore-wallet-card.ts` | Precondicion operativa (restaurar tarjeta); PassengerWalletPBO.addCard cubre el cuerpo |
| `start-viaje-calle-flow.ts` | DriverViajeCalleScreen ya lo formaliza; extraer lo restante a TripLifecyclePBO + PaymentPBO y gatear |
| `validate-driver-happy-path.ts` | Aceptar/iniciar/finalizar/cerrar con JS click: mover a TripLifecyclePBO + screens/driver (ya tiene gate) |
| `viaje-calle-unhappy-paths.ts` | Casos negativos de pago (declinadas, 3DS fail) -> PaymentPBO.chargeWithCard/handle3DS + gate |

### 7.4 Docs a ajustar al mover

- `tests/mobile/appium/README.md`: el texto dice "106 archivos de `scripts/`"; hoy son 114 (y cambiara tras la cuarentena). Tambien cita `mg116-analizar-payload-ios.mjs` y `f5-driver-close-trip.ts` (ambos `vivo`).
- `docs/mobile-ci/setup-appium-local.md`: cita `accept-trip-and-dump`, `start-trip-and-dump`, `full-trip-flow-dump`, `dump-after-login`, `dump-current-screen`. Los tres primeros y `dump-after-login` pasan a cuarentena.
- `docs/qa/appium-pom-pbo-architecture.md`: cifras desactualizadas (77 archivos, 72 `remote(`); ya no aplican.
- `tests/fixtures/users/mobile/driver.ts`: comentarios que citan `driver-login-password-only.ts` y `dump-after-login.ts`.
- `docs/onboarding-appium.es.html` y `docs/mobile/GUIA-APPIUM-MAGIIS.html`: citan scripts `vivo` y alguno de cuarentena; revisar enlaces.

## 8. Limitaciones

- Analisis estatico: "efectos" se determino leyendo cabeceras, gates y llamadas a PBO/screens; no se ejecuto ningun script, asi que algun efecto condicionado a runtime podria no estar reflejado.
- "Referenciado" cuenta menciones por nombre de archivo (sin extension) en todo el repo; una mencion en comentario cuenta pero se aclara en el motivo.
- La equivalencia "cubierto por spec/PBO" para `driver-mg117-*` y `passenger-mg116-*` se baso en que los TM de cada script aparezcan en `DriverAddressCaseBattery`/`AddressFieldProbe` y sus specs; no se comparo cobertura caso a caso.
- `driver-mg117-remaining` queda en `migrar` porque cita TM-653/660/661/670 que no aparecen en `DriverAddressCaseBattery`; si esos TM se cubren de otra forma, pasa a cuarentena.
