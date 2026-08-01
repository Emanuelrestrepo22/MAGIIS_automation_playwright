# Driver App — Mapa de flujos VIVO (validado en device)

> **Validado en device físico** Samsung SM-A055M (`R92XB0B8F3J`, Android 15) vía Appium 3.5.2.
> App TEST `com.magiis.app.test.driver` (`.MainActivity`). Driver TEST `nuevoemailyo12312213@yopmail.com`.
> Generado: **2026-07-21** — exploración iterativa NO destructiva (WEBVIEW Ionic/Angular).
> **Detalle device-validado** del feature Driver. El mapa CANÓNICO (inventario + criticidad + backlog)
> es [`docs/mobile/driver-app-flow-map.md`](./driver-app-flow-map.md); este doc es su fuente de
> **selectores REALES** y **rutas** confirmadas en pantalla (no derivadas del código fuente).

## Cómo se generó (reproducible)

Toda la app corre en un WebView (`WEBVIEW_com.magiis.app.test.driver`); la exploración enumera
elementos interactivos vía `driver.execute` en ese contexto. Scripts draft (working tree, sin commit):

| Script | Rol |
|---|---|
| `tests/mobile/appium/scripts/driver-explore-flow-map.ts` | Tour NO destructivo: home + toggle disponibilidad + tab-bar + apertura de menú. Persiste `driver-flow-map.json`. |
| `tests/mobile/appium/scripts/driver-explore-menu.ts` | Destinos del menú lateral (click en `ion-item.menu-link-url`, no en el wrapper). Persiste `driver-menu-map.json`. |
| `tests/mobile/appium/scripts/driver-relogin-and-home.ts` | Recuperación: fuerza pre-home→login→re-login→home cuando la sesión queda stale. |

Ejecución (PowerShell): `node --loader ts-node/esm tests/mobile/appium/scripts/<script>.ts`
con `APPIUM_SERVER_URL`, `ANDROID_UDID`, `DRIVER_EMAIL`, `DRIVER_PASSWORD`, `NODE_OPTIONS=--experimental-specifier-resolution=node`.

**Convención de evidencia:** `[LIVE]` = observado directamente en device esta corrida ·
`[SCREEN/HARNESS]` = selector ya en un screen/harness, confirmado consistente · `[NO-VALIDADO]` = requiere acción destructiva/trip real/GPS mock ·
`[SOURCE]` = derivado del código fuente de la app (`repo.magiis/magiis-mobile-driver-v2@develop`), **todavía NO ejercitado en device** — el mecanismo está probado por lectura del template/controlador Angular, no por observación. Pasa a `[LIVE]` cuando se corra contra el teléfono.

---

## 1. Routing / Auth

### 1.1 Login — `/login` · `app-login` `[LIVE]`
| Elemento | Selector real | Notas |
|---|---|---|
| Email | `ion-input` (1º, no-password) | Fill: piercing shadow → `input.native-input` + `input`/`change` + `ionInput`/`ionChange` |
| Password | `ion-input[type="password"]` | Toggle ver: `ion-button.eye-button` (icon `eye-off-outline`) |
| Limpiar email | `button.input-clear-icon` | |
| Entrar | `button.btn.primary` (texto "Entrar") | |
| Olvidé contraseña | `button.restore-pass` ("¿Olvidaste tu Contraseña?") | → `/RestorePassPage` `[LIVE 2026-07-22]` (ver §1.3) |

- **Transición:** Entrar (credenciales válidas) → `/pre-home`.
- **Re-login validado `[LIVE 2026-07-22]`:** fill de `ion-input` (email + password) piercing shadow + eventos `ionInput`/`ionChange` → botón "Entrar" → `/pre-home`. OJO: puede quedar en `/pre-home` y requerir **1 tap extra** en `button.btn.primary` "Aceptar" para llegar a `/navigator/home` (usar `driver-relogin-and-home.ts`).

### 1.3 RestorePass — `/RestorePassPage` `[LIVE 2026-07-22]`

Alcanzada desde `/login` con `button.restore-pass`. Contenido: input **"Correo"** (email) + botones **"Recuperar"** y **"Aceptar"**.
Dismiss/volver: `history.back()` → `/login`. (No se envió recuperación; solo se validó apertura + retorno.)
- **Cobertura:** `driver-login-smoke.ts` (SCRIPT). El fill webview con shadow está en `driver-relogin-and-home.ts`.

### 1.2 Pre-home (overlay bienvenida) — `/pre-home` · `app-pre-home` `[LIVE]`
- Contenido: "¡Bienvenido!" + logo LOD + "Cargando Servicios…" + 3 iconos de servicio (wifi ✓ / person-lock / location) + texto de permiso de ubicación.
- **Continuar:** `button.btn.primary` (texto **"Aceptar"**) → `hideOverlay()`.
- **Ramas (validadas):**
  - Servicios OK → `/navigator/home;FROM_LOGIN=true` (`#availability` presente). `[LIVE]`
  - Sesión stale / servicios incompletos (solo wifi ✓, "Cargando Servicios…" pegado) → tap Aceptar **rebota a `/login`** → requiere re-login. `[LIVE]`
- **Corrección de método:** el tap directo a `button.btn.primary "Aceptar"` es el modo fiable; esperar un estado "ready" NO funciona (el texto de carga no cambia cuando la sesión está stale). Supera el `.carrier-overlay` click de `DriverHomeScreen.dismissPreHomeOverlayIfPresent`.
- **Cobertura:** `dismissPreHomeOverlayIfPresent()` (PARCIAL — usar el selector `button.btn.primary` de arriba).

---

## 2. Home shell — `/navigator/home` · `page-home` `[LIVE]`

Variantes de URL observadas: `;FROM_LOGIN=true`, `;FROM_TRAVEL_CLOSED=true`.
Header: nombre del driver + vehículo activo (p.ej. "pepe argentoinfoa" · "JMT001 FORD FEST Standard").
Cuerpo: 3 controles circulares (fila superior) + secciones **"Viaje Asignado"** y **"Viajes Disponibles"**.

| Elemento | Selector real | Acción / transición |
|---|---|---|
| Toggle disponibilidad (círculo verde izq., label "Disponible") | `#availability` (texto "Disponible" / "No Disponible") | Tap alterna ONLINE↔OFFLINE `[LIVE]`. OJO: la disponibilidad puede caer a "No Disponible" tras inactividad prolongada / poll idle — re-poner online con `driver-go-online.ts`. |
| Indicador En Base (círculo centro, label p.ej. "SE 0.8 mi" = rumbo+distancia a base) | `button.driver-home.home-icon-base.general-position` | **NO es un toggle In Base↔En Calle** `[LIVE 2026-07-22]`. Abre el modal **`app-bases-information-modal`** (Bases Cercanas). Ver §2.1. |
| Botón Pasajero (círculo amarillo der., label "Pasajero") | `div.driver-pass.home-icon` (contiene `img` + `span.pass-label` "Pasajero") | `startStreetTravel()` → confirm "Empezar Viaje" → TravelInProgressPage `[LIVE 2026-07-22]`. Ver §2.2. |
| Hamburguesa cuenta | `ion-menu-toggle` (icon `person-circle-outline`) o API `ion-menu.open()` | Abre drawer lateral (§3) `[LIVE]` |
| Tab Home | `#tab-button-home` (icon `home`, `tab=home`) | → `/navigator/home` |
| Tab Notificaciones | `#tab-button-notifications` (icon `notifications`) | → `/navigator/notifications` (§4.1) |
| Tab Viajes | `#tab-button-TravelListPage` (`tab=TravelListPage`) | → `/navigator/TravelListPage` (§4.2) |
| Tab Llamar | `ion-tab-button` (icon `call`, sin id) | CALL_CARRIER; **sin viaje activo no navega** (permanece en home) `[LIVE]` |

- **Cobertura:** `DriverHomeScreen.goOnline()/isDriverOnline()` (PARCIAL) · `tapViajeCalleButton()` usa `div.driver-pass.home-icon` (**CORRECTO**, ver §2.2).
- **Corrección:** la tab-bar tiene **4** tabs (Home / Notificaciones / Viajes / Llamar). **No** existe tab "Manifiesto" ni tab "Cuenta" — Cuenta es la hamburguesa.
- **✅ DISCREPANCIA RESUELTA `[LIVE 2026-07-22]`:** confirmado en device que el trigger de viaje de calle es el círculo amarillo "Pasajero" = **`div.driver-pass.home-icon`** (NO `button.driver-home.home-icon-base`, que es el indicador **En Base** → abre modal de bases). `DriverHomeScreen.tapViajeCalleButton()` ya usa el selector correcto (fix Opción 1 validado): al tapearlo emerge el `app-confirm-modal` de startStreetTravel (primario "Empezar Viaje"), **no** togglea En Base (label "SE 0.8 mi" sin cambio).

### 2.1 Modal "Bases Cercanas" (En Base) — `app-bases-information-modal` `[LIVE 2026-07-22]`

Tap `button.driver-home.home-icon-base` abre `ion-modal.confirm-modal.show-modal` con host **`app-bases-information-modal`**.
Contenido: `ion-list.bases-list` > `ion-item` (cada uno con `ion-row.row-class`), una fila por base cercana con
nombre + rumbo + distancia. Observadas: `bsas SE 5.3 mi`, `magiis-oficina SE 5.6 mi`, `Balcarce - Cerro NO 228.2 mi`,
`miramar NO 258.8 mi`, `Miami Suc II S 4,412.5 mi`.

- **NO es un toggle binario In Base↔En Calle** (la premisa `setInBase()` del mapa estático no aplica a este build).
  `DriverHomeScreen` no expone `setInBase`; el botón abre este selector/informador de bases.
- **Sin `ion-backdrop` ni botón "close"** capturado en el dump — el dismiss confiable es `history.back()` / navegar
  a otra pantalla (backdrop-tap NO cierra). **Seleccionar una fila cambiaría la base asignada → no exercitado.**
- Geocerca de BASE: requiere estar físicamente dentro del radio de una base para el sub-estado "En Base"; no
  reproducible sin mover el device / mock GPS (que la app no respeta — usa GPS real vía Transistor).

### 2.2 Viaje de calle (street-trip) — `div.driver-pass.home-icon` `[LIVE 2026-07-22]`

Flujo validado end-to-end en device:

```
home ──[tap div.driver-pass.home-icon (img/span.pass-label "Pasajero")]──▶ app-confirm-modal (start_street_message)
       botones: primario = button.btn.primary "Empezar Viaje" · cancelar = button.btn-outlined-red "Cancelar"
app-confirm-modal ──["Empezar Viaje"]──▶ /navigator/TravelInProgressPage   (DIRECTO — sin TravelToStartPage ni
       geocerca: el pickup del viaje de calle = ubicación actual del driver)
```

- **Cancelar (task 0):** tap `button.btn-outlined-red` "Cancelar" cierra el diálogo sin arrancar viaje → vuelve a home.
- **Cleanup del viaje de calle:** en `TravelResumePage` el footer `ion-footer button.btn.finish` "Cerrar Viaje"
  arranca **DISABLED**; hay que tapear primero un `.travel-payment button.payment` (método efectivo/activo) para
  HABILITARLO, luego tap "Cerrar Viaje" → `/navigator/home;FROM_TRAVEL_CLOSED=true`. **NO** usar "Ingresar tarjeta".
- **Cobertura:** `DriverHomeScreen.tapViajeCalleButton()` · `scripts/start-viaje-calle-flow.ts` · `scripts/driver-validate-home-street-base.ts`.

---

## 3. Menú lateral (drawer sobre home) `[LIVE]`

Los ítems son `ion-item.menu-link-url` **envueltos en** `ion-menu-toggle`.
**CLAVE:** hay que clickear el `ion-item` interno; clickear el `ion-menu-toggle` wrapper **solo cierra el drawer sin navegar**.

| Ítem (label ES real) | Selector | Destino |
|---|---|---|
| Preferencias | `ion-item.menu-link-url` (texto "Preferencias") | `/Settings` (§5.1) `[LIVE]` |
| Estadísticas | `ion-item.menu-link-url` (texto "Estadísticas") | `/Stats` (§5.2) `[LIVE]` |
| Cambiar Vehículo | `ion-item.menu-link-url` (texto "Cambiar Vehículo") | `/Vehicles?fromPreHome=false` (§5.3) `[LIVE]` |
| Toggle Fuera de servicio | `ion-toggle` (en el drawer, junto a logout) | Togglea out-of-service (`aria-checked` false↔true). **Validado + revertido `[LIVE 2026-07-22]`** (click JS sobre el `ion-toggle`). |
| Cerrar sesión | `button.log-out-menu` (icon `power`) | → `/login` (OFFLINE + clear). **Validado `[LIVE 2026-07-22]`** + re-login (§1.1). |

- **Corrección vs estático:** los labels reales son **Preferencias / Estadísticas / Cambiar Vehículo / Cerrar sesión**. "Viajes" NO es ítem de menú — es la **tab** `#tab-button-TravelListPage`.

---

## 4. Destinos de la tab-bar

### 4.1 Notificaciones — `/navigator/notifications` · `app-notification-page` `[LIVE]`
| Elemento | Selector |
|---|---|
| Segmento Chats | `ion-segment-button` (texto "CHATS 0") |
| Enviar chat | `ion-button.send-button` |
- Estado en la corrida: 0 chats. Segundo segmento (Notificaciones) y detalle de chat: `[NO-VALIDADO]` (sin datos).

### 4.2 Viajes — `/navigator/TravelListPage` · `app-page-travel-list` `[LIVE]`
| Elemento | Selector |
|---|---|
| Segmento Programados | `ion-segment-button` (texto "Programados", `segment-button-checked` por defecto) |
| Segmento Finalizados | `ion-segment-button` (texto "Finalizados") |
- Ítems de lista: `[NO-VALIDADO]` (lista vacía en la corrida).

---

## 5. Destinos del menú lateral

### 5.1 Preferencias — `/Settings` · `app-page-settings` `[LIVE]`
| Elemento | Selector | Notas |
|---|---|---|
| Toggles (x2) | `ion-toggle` | Semántica no exercitada (no destructivo) |
| Idioma | `ion-select` (opciones "Español" / "English") | |
| App de mapas | `ion-select` (valor "Google Maps") | |
| Guardar | `button.btn.primary` (texto "Guardar") | **Validado `[LIVE 2026-07-22]`**: tap sin alterar valores → guarda sin error, vuelve a home. |

### 5.2 Estadísticas — `/Stats` · `app-page-stats` `[LIVE]`
- Segmentos de período: `ion-segment-button` "Hoy" / "Julio" / "Junio". Contenido de métricas: no exercitado.

### 5.3 Cambiar Vehículo — `/Vehicles?fromPreHome=false` · `app-page-vehicles` `[LIVE]`
| Elemento | Selector |
|---|---|
| Título | "Selección de Vehículo" |
| Lista de vehículos | items con texto p.ej. "JMT001 - Standard FORD FEST", "AE 345 MIA - Standard ford senseo", "4ZLX79523 - Standard pepe chico" |
| Buscar/placa | `ion-input` |
| Escanear QR | `ion-button.scan-btn` (icon `qr-code-outline`) |
- El query `?fromPreHome=false` implica que la misma página se alcanza desde pre-home (selección al arranque).
- **Pantalla validada `[LIVE 2026-07-22]`** (título "Selección de Vehículo"); **NO se seleccionó vehículo** (cambiaría el activo). El vehículo activo del device es `JMT001 - Standard FORD FEST` (driver "argentoinfoa pepe", visto también en el modal Send-Manual del carrier).

---

## 6. Ciclo de viaje + cobro (documentado, NO re-ejecutado)

> No se disparó un viaje/cobro real solo para mapear (ya validado E2E — 3DS verde, `travelId 66699`, ver mem #43).
> Selectores tomados de los screens/harness `[SCREEN/HARNESS]` + walkthrough del dev con debugger. `[LIVE]` marca lo visto en device esta corrida.

| Paso / pantalla | Ruta · componente | Selectores clave |
|---|---|---|
| Solicitud / Confirmar | `/navigator/TravelConfirmPage;data={…travelId…}` · `app-page-travel-confirm` | Aceptar = `button.btn.primary` (texto "Aceptar"; hay 2 btn.primary → filtrar visible) |
| Empezar viaje | `/navigator/TravelToStartPage` · `app-page-travel-to-start` | Empezar = `button.btn.primary.trip-pax-start` "Empezar Viaje" → confirm `app-confirm-modal button.btn.primary` "Si" (No = `button.btn-outlined-red`) |
| Geocerca | (en TravelToStart) | In-range → Si (14m, origin Ciudad de la Paz 2238) · out-of-range → modal `geocerca_alert_title` → `app-confirm-modal` botón "Ingresar código" → `app-code-confirmation-modal` `ion-input.code-input` (last4 del travelId, shadow-DOM) → "Confirmar" → TravelInProgressPage. **Handler LISTO** (`startTripHandlingGeofence` / `scripts/driver-geocerca-out-of-range.ts`) pero **NO EXERCITADO en device** — ver §2a-blocker y §9. |
| Viaje en progreso | `app-page-travel-in-progress` | Finalizar = `app-page-travel-in-progress button.btn.finish` "Finalizar Viaje" → confirm "Si" |
| Resumen | `/navigator/TravelResumePage` · `app-travel-resume` | Método = `.travel-payment button.payment` (last4) · Cierre = `app-travel-resume button.btn.finish` (texto "Cerrar Viaje" / "Firmar y Cerrar viaje" / "Ingresar tarjeta") · Extras = `app-travel-resume button` (Peaje/Estac., modal monto TODO) |
| Pago con Tarjeta | `credit-card-payment-data` (dentro de `ion-modal`) `[LIVE]` | Stripe Elements CLÁSICO: 1 iframe/campo por `title` ES (`iframe[title="Cuadro de entrada seguro del número de tarjeta"]` + vencimiento + CVC), input real `input.InputElement` (NO `input.StripeField--fake`); titular/postal = ion-input nativo `input[formcontrolname="cardholderName"]` / `input[formcontrolname="zipCode"]`; **COBRAR** = `credit-card-payment-data ion-content form button` / `button.btn.primary` `[LIVE]` |
| Firma | `app-page-signer` | Canvas `app-page-signer ion-content div canvas` (W3C pointer) · Guardar `app-page-signer ion-footer ion-row button.btn.primary` |
| Challenge 3DS | iframes anidados de Stripe | COMPLETE `#test-source-authorize-3ds` · FAIL `#test-source-fail-3ds` |
| Trip-lost / alerta | `app-alert-modal` `[LIVE]` | Aceptar = `button.btn-outlined-red` (visto: "El viaje ya no está disponible.") |

- **Estado-máquina post-COBRAR (no determinista):** el orden firma / 3DS / cierre / alerta varía → resolver por polling de la pantalla presente hasta estado terminal (ver `DriverCargoDeclineHarness`).
- **Cobertura:** `DriverTripRequestScreen`, `DriverTripNavigationScreen`, `DriverTripSummaryScreen`, `DriverTripPaymentScreen`, `DriverCargoDeclineHarness`, `DriverTripHappyPathHarness`.

### 6.1 GEOCERCA PICKUP OUT-OF-RANGE (§2a-blocker) `[BLOQUEADO 2026-07-22]`

**Objetivo:** validar el modal de geocerca fuera de rango (`geocerca_alert_title` → "Ingresar código" → last4
del travelId → TravelInProgressPage) al "Empezar Viaje" con el device físicamente lejos del pickup.

**Handler LISTO (no exercitado en device):**

- Web (fase carrier): crear VIAJE PLANO con pickup lejano y asignar manual al device driver.
  `tests/e2e/create-flat-trip-far-origin.spec.ts` (draft) — `selectClient("Restrepo, Emanuel")` +
  `setOrigin("Reconquista 661, Buenos Aires")` + `clickSelectVehicle()` + Send Manual + **assign por NOMBRE**
  a la fila del device driver ("argentoinfoa pepe", `DRIVER_NAME_MATCH=argento`).
- Driver (fase Appium): `tests/mobile/appium/scripts/driver-geocerca-out-of-range.ts` (draft) — espera el viaje,
  acepta, "Empezar Viaje", detecta `app-confirm-modal` "Ingresar código", llena `ion-input.code-input` con last4,
  "Confirmar" → TravelInProgressPage. Espeja `DriverCargoDeclineHarness.startTripHandlingGeofence()`.

**BLOQUEO reproducido (3 corridas, travelId 66776 / 66782 / 66787):** el viaje se CREA y se marca "Chofer Asignado"
carrier-side al device driver, pero **nunca llega a la app del device** (ni `TravelConfirmPage`, ni card en la
sección "Viaje Asignado" del home). Diagnóstico:

- El modal Send-Manual del carrier ordena candidatos por **proximidad al pickup**. Con pickup en Reconquista 661
  el device driver aparece a **5.62 Mi** (fila `0018 argentoinfoa pepe … JMT001 - FORD - FEST … 5.62 Mi … Asignar`),
  mientras que `nth(1)` (patrón del POM `clickSendManualAndAssign`) cae en el conductor más cercano
  (ej. `0030 Senna Ayrton … 0.01 Mi`).
- Asignar por nombre al device driver lejano **no dispara push** al device (el backend parece no entregar un viaje
  a un conductor fuera de rango, incluso en asignación manual).

**Consecuencia:** con el device fijo en Belgrano no se puede tener a la vez (a) pickup fuera del radio ~500m para
gatillar el código y (b) el viaje entregado al device driver. Opciones para desbloquear (fuera del scope actual):

1. Pickup **moderadamente** lejano (>500 m pero dentro del radio de push del backend, si existe) — requiere calibrar
   la distancia de push; Reconquista 661 (5 km) es demasiado.
2. Mover físicamente el device a >500 m del pickup **después** de aceptar un viaje near-pickup (no automatizable en CI).
3. Backend/QA: forzar la entrega del viaje al device driver ignorando proximidad (feature flag / API).

**Estado:** device driver quedó limpio (home, Disponible, sin viaje). Strays carrier-side a limpiar (no afectan al
device): travelId 66762/66771 (→ Senna), 66776/66782/66787 (→ argento sin entrega).

---

### 6.2 Cómo SALIR de las pantallas de viaje (cancelar / finalizar) `[SOURCE 2026-07-30]`

> §6 documenta cómo AVANZAR por el ciclo de viaje. Esta sección documenta lo contrario: cómo **abandonar** una
> pantalla de viaje y volver a `/navigator/home`. Es lo que necesita la recuperación de un conductor varado, y
> faltaba: por eso una sesión anterior concluyó —incorrectamente— que el icono de cerrar "no popea la página".
> Mecanismo derivado de `travel-confirm.html`/`.ts`, `travel-to-start.html`/`.ts` y `travel-in-progress.html`
> (`repo.magiis/magiis-mobile-driver-v2@develop`). **Todavía NO ejercitado en device.**

| Pantalla | Disparador de salida | Qué pasa al tocarlo | Cómo se completa |
|---|---|---|---|
| TravelConfirmPage · `app-page-travel-confirm` | **SPAN** `.actions .cancel .action-icon` — el handler Angular vive en el span, **NO** en el `ion-icon[name="close"]` interno `[SOURCE]` | `cancelTravel()` sólo **PRESENTA** el modal `app-travel-cancel`. **La URL no cambia** hasta elegir un motivo `[SOURCE]` | Primer `button.btn-black` (CANNOT_COVER) → `onDidDismiss` → `cancel()` → `travelService.refuseTravel()` → `router.navigate(['navigator/home', { mustReset: true }])` `[SOURCE]` |
| TravelToStartPage · `app-page-travel-to-start` | Mismo span `.actions .cancel .action-icon` → `openCancelTravelModal()` `[SOURCE]` | Ídem: abre el modal, no navega `[SOURCE]` | Primer `button.btn-black` (CANNOT_COVER). Acá `incomingTrip: false` **sí** muestra "No encontré al pasajero", pero ese motivo pasa por `statusService.canPickUp()` (geocerca) y fuera de rango hace `dismiss(null)` = NO-OP → **preferir siempre CANNOT_COVER** `[SOURCE]` |
| TravelInProgressPage · `app-page-travel-in-progress` | **NO tiene acción de cancelar** — los únicos bloques `.cancel .action-container` de la app están en travel-confirm y travel-to-start `[SOURCE]` | — | Única salida = FINALIZAR: `.btn-finish-container button` → `finishTravelDialog()` → `app-confirm-modal` "Si" → cae en TravelResumePage (§6) `[SOURCE]` |

**Trampas confirmadas por lectura de fuente — cada una produce un falso diagnóstico:**

- **El `ion-icon` no es el control.** Clickear `ion-icon[name="close"]` (por JS o por tap) no dispara nada: el `(click)` está en el span padre. Un intento MEDIDO en device el 2026-07-29 hizo exactamente eso y la URL siguió en `TravelConfirmPage` — se leyó como "el icono no funciona" cuando en realidad el modal quedaba abierto sin contestar.
- **El "Cerrar" del modal es un NO-OP.** El footer `button.btn-outlined-primary` llama `dismiss(null)`: cierra el modal sin cancelar el viaje y deja al conductor donde estaba. **Nunca clickearlo** al recuperar.
- **En travel-confirm sólo hay UN motivo.** `componentProps: { incomingTrip: true }` oculta "No encontré al pasajero" vía `*ngIf="!isIncomingTrip"`, así que el primer `button.btn-black` es el único camino.
- **El botón de finalizar cambia de clase pero no de handler.** Alterna `btn finish` ↔ `btn-outlined-red` según `timerOn` → targetear por **contenedor** (`.btn-finish-container button`), nunca por clase.

**Por qué esto libera incluso un viaje ya cancelado del lado del servidor:** `refuseTravel()` navega a
`navigator/home` tanto en el `.then` como en el `.catch`. Es justo el caso vivo del 2026-07-29 — el viaje 67758
estaba cancelado server-side y la app seguía en `TravelConfirmPage`; el rechazo falla en el backend y el
conductor se libera igual.

**Implementación:** `tests/mobile/appium/helpers/driverStaleTripRecovery.ts` (`recoverDriverToHome()`, commit
`a6b4dec`) — única implementación, consumida por `DriverCargoDeclineHarness.freeStaleTrip()` y por
`scripts/driver-free-stale-trip.ts`. Es una **state machine**, no una secuencia: las rutas encadenan
(in-progress → resume → firma → home) y encima pueden apilarse overlays, así que cada vuelta lee lo presente.
El éxito **siempre** se verifica por polling de la URL hasta `/navigator/home`, nunca por ausencia de un elemento.

**Para promover estas filas a `[LIVE]`:** varar al conductor a propósito en cada pantalla (aceptar y no
arrancar → TravelToStart; arrancar y no finalizar → TravelInProgress; dejar la oferta sin contestar →
TravelConfirm) y correr `driver-free-stale-trip.ts` esperando la traza
`tap X … abre modal de cancelacion` → `motivo "no puedo cubrir"` → `liberado -> /navigator/home`.

---

## 7. Transiciones validadas (device, esta corrida)

```
/login ──[Entrar btn.primary]──▶ /pre-home
/pre-home ──[Aceptar btn.primary · servicios OK]──▶ /navigator/home;FROM_LOGIN=true
/pre-home ──[Aceptar · sesión stale]──▶ /login            (rebote → re-login)
home ──[#availability]──▶ home (Disponible ⇄ No Disponible)
home ──[ion-menu-toggle person-circle-outline]──▶ side-menu (drawer)
home ──[#tab-button-notifications]──▶ /navigator/notifications
home ──[#tab-button-TravelListPage]──▶ /navigator/TravelListPage
home ──[tab call]──▶ home  (CALL_CARRIER; no navega sin viaje activo)
side-menu ──[ion-item.menu-link-url "Preferencias"]──▶ /Settings
side-menu ──[ion-item.menu-link-url "Estadísticas"]──▶ /Stats
side-menu ──[ion-item.menu-link-url "Cambiar Vehículo"]──▶ /Vehicles?fromPreHome=false
/Settings|/Stats|/Vehicles ──[ion-back-button / history.back]──▶ /navigator/home
stale payment modal + app-alert-modal ──[force-stop + relaunch]──▶ /pre-home  (restauración/getAppStatus)
```

**Recuento:** 14 pantallas validadas en device (login, pre-home, home, side-menu, notifications, travel-list, settings, stats, vehicles + 5 del ciclo de viaje observadas parcialmente: payment "Pago con Tarjeta" y alert trip-lost vistas LIVE) · ~11 transiciones validadas + 9 del ciclo de viaje documentadas.

---

## 8. Selectores NUEVOS / CORREGIDOS vs mapa estático

1. **Menú lateral se abre por `ion-menu-toggle`** (icon `person-circle-outline`), NO por un "menu button" genérico. El estático decía "Account → menú" sin selector.
2. **Labels de menú reales (ES):** Preferencias / Estadísticas / Cambiar Vehículo / Cerrar sesión. El estático adivinó "cuenta / Settings / Viajes / Stats".
3. **Ítems de menú = `ion-item.menu-link-url` dentro de `ion-menu-toggle`** — clickear el wrapper solo cierra el drawer; hay que clickear el `ion-item`.
4. **Rutas capitalizadas fuera de `/navigator/`:** `/Settings`, `/Stats`, `/Vehicles?fromPreHome=false` (no `/navigator/settings`, etc.).
5. **"Viajes" = tab `#tab-button-TravelListPage`**, no ítem de menú.
6. **Tab-bar = 4 tabs** (Home / Notificaciones / Viajes / Llamar). No hay "Manifiesto"; Cuenta no es tab.
7. **Home component tag = `page-home`** (no `app-page-home`).
8. **Pre-home continue = `button.btn.primary` "Aceptar"** (tap directo), supera el `.carrier-overlay` click.
9. **Selectores de login confirmados:** `button.restore-pass`, `ion-button.eye-button` (`eye-off-outline`), `button.input-clear-icon`.
10. **Tab "Llamar" = 4º `ion-tab-button` icon `call`** (sin id estable → usar posición/icono).
11. **`[LIVE 2026-07-22]` Botón "Pasajero" (viaje calle) = `div.driver-pass.home-icon`** (NO `button.driver-home.home-icon-base`). Confirm primario = "Empezar Viaje".
12. **`[LIVE 2026-07-22]` "En Base" (`button.driver-home.home-icon-base`) abre `app-bases-information-modal` (Bases Cercanas)** — NO es toggle In Base↔En Calle.
13. **`[LIVE 2026-07-22]` RestorePass abre `/RestorePassPage`** (input "Correo" + "Recuperar"/"Aceptar"); volver con `history.back()`.
14. **`[LIVE 2026-07-22]` Runner de scripts draft nuevos requiere `TS_NODE_TRANSPILE_ONLY=1`** — sin él, ts-node type-check lanza `[Object: null prototype] {}` en el ESM entry (crash antes de cualquier log).
15. **`[LIVE 2026-07-22]` Asignación manual con pickup LEJANO:** el modal Send-Manual del carrier ordena candidatos por proximidad al pickup → `nth(1)` NO cae en el device driver (cae en el más cercano). Hay que asignar por NOMBRE ("argentoinfoa pepe" / `argento`).

---

## 9. Qué quedó sin mapear (y por qué)

| Área | Motivo |
|---|---|
| Ciclo viaje/cobro re-ejecutado en device | Requiere dispatch real + cargo Stripe real. Ya verde E2E (travelId 66699, mem #43); documentado por selectores del harness. |
| Geocerca out-of-range ("Ingresar código") | **BLOQUEADO en device** `[2026-07-22]`. El handler está listo (§6 + `scripts/driver-geocerca-out-of-range.ts` + `startTripHandlingGeofence`), pero NO se pudo entregar un viaje out-of-range al device driver: se creó viaje plano con pickup lejano ("Reconquista 661", 5.62 Mi del device en Belgrano) y se asignó manual al device driver ("argentoinfoa pepe") 3 veces (travelId 66776/66782/66787) — el viaje **nunca llegó al device** (ni TravelConfirmPage ni card en "Viaje Asignado"). Causa: el modal Send-Manual ordena candidatos por proximidad al pickup y el backend NO empuja un viaje al driver fuera de rango; `nth(1)` cae en el conductor más cercano (ej. "Senna, Ayrton" a 0.01 Mi), no en el device. Ver §2a-blocker. |
| Toggle "En Base" (sub-estado) | **RESUELTO `[2026-07-22]`:** `button.driver-home.home-icon-base` NO es toggle — abre `app-bases-information-modal` (Bases Cercanas). Ver §2.1. El sub-estado geocerca-de-base real requiere estar físicamente dentro del radio de una base (no reproducible sin mover el device). |
| 2º segmento Notificaciones + detalle chat | 0 chats en la corrida (sin datos). |
| Ítems de TravelListPage (Programados/Finalizados) | Listas vacías en la corrida. |
| Semántica de toggles/selects de Settings, métricas de Stats | Enumerados, no exercitados (evitar cambiar preferencias / Guardar). |
| Toggle Fuera de servicio + Cerrar sesión | Destructivos — NO exercitados por instrucción. |
| Página RestorePass | Entry point (`button.restore-pass`) capturado; página no abierta. |
| Selección real de vehículo | Solo vista; seleccionar cambiaría el vehículo activo. |
| Gate de versión / bootstrap MG-001/002/003 | No emergió (build/versión al día). |

---

## 10. Riesgos / bloqueos móviles

1. **Pre-home service-load stale:** tras horas o post force-stop, pre-home puede quedar "Cargando Servicios" y rebotar a `/login`. Mitigación: `driver-relogin-and-home.ts` (fuerza re-login). Todo harness que asuma `noReset`+sesión abierta debe manejar este rebote.
2. **Leftover post-cobro:** un viaje perdido deja pegada la pantalla "Pago con Tarjeta" + `app-alert-modal` "El viaje ya no está disponible" sobre home; la navegación por router NO la limpia. `[LIVE]` Mitigación: tap `button.btn-outlined-red` "Aceptar", o force-stop + relaunch (dispara restauración `getAppStatus`).
3. **`ion-menu-toggle` ambiguo:** el mismo tag envuelve la hamburguesa y cada ítem de menú. Con el drawer cerrado, el único visible es la hamburguesa; con el drawer abierto, targetear `ion-item.menu-link-url`.
4. **Dependencia de dispatch/RTDB/GPS real** para el ciclo de viaje (no determinista en CI; requiere backend TEST + device en el pickup).
5. **Login webview con shadow DOM:** los `ion-input` requieren piercing del shadow + eventos `ionInput`/`ionChange` (el `addValue` sobre el host no basta).

---

## Archivos de referencia
- Screens: `tests/mobile/appium/driver/{DriverHomeScreen,DriverTripRequestScreen,DriverTripNavigationScreen,DriverTripSummaryScreen,DriverTripPaymentScreen,DriverFlowSelectors}.ts`
- Harness: `tests/mobile/appium/harness/{DriverCargoDeclineHarness,DriverTripHappyPathHarness}.ts`
- Recuperación de conductor varado: `tests/mobile/appium/helpers/driverStaleTripRecovery.ts` (mecanismo de salida de las pantallas de viaje — §6.2)
- Scripts draft de esta corrida: `tests/mobile/appium/scripts/{driver-explore-flow-map,driver-explore-menu,driver-relogin-and-home}.ts`
- Mapa estático (source): `docs/mobile/driver-app-flow-map.md`
