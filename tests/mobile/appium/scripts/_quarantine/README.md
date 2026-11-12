# Cuarentena de scripts Appium (T0.4)

Estos scripts quedaron fuera del camino activo tras el inventario `docs/qa/mobile-scripts-inventory.md` (T0.3). **No se borro nada** (decision D8): los de clase `cuarentena` y los propuestos para `borrar` viven aqui.

## Vigencia

- Cuarentena por **un sprint**, hasta el hito **M2 (2026-12-04)**.
- Al llegar a M2: lo que nadie restauro se propone para borrado (los `_tmp-mg626-*` y duplicados solo con confirmacion explicita del usuario).
- Siguen compilando (`npx tsc --noEmit -p .`), pero **no estan referenciados** por package.json, specs ni docs vigentes.
- Muchos tienen **efecto sin gate** sobre datos de negocio (ver seccion 4 del inventario). No ejecutarlos sin leer su cabecera.

## Como restaurar uno

1. `git mv tests/mobile/appium/scripts/_quarantine/<ruta>.ts tests/mobile/appium/scripts/<ruta>.ts` (conservar la subcarpeta `diagnostics/` si aplica).
2. Corregir los imports relativos (un nivel menos: `'../../core/X'` pasa a `'../core/X'`, `'../_shared/X'` pasa a `'./_shared/X'`).
3. Actualizar las referencias (package.json, docs, otros scripts) que apunten a `scripts/_quarantine/...`.
4. Correr `npx tsc --noEmit -p .` y `pnpm test:mobile:unit`.
5. Si el script tiene efecto sin gate, agregarle gate antes de volver a usarlo.

## Nota de seguridad

Las credenciales literales se retiraron del codigo y docblocks (commit de saneamiento T0.4), pero **siguen en el historial de git**: hay que rotar las credenciales de prueba afectadas.

## Notas

- `passenger-mg116-regression.ts` contiene bytes NUL (grep lo trata como binario); se movio sin cambios de codificacion, salvo los imports.

## Listado (69)

| Script | Clase | Motivo (inventario) |
|---|---|---|
| `_tmp-mg626-card-owner.ts` | cuarentena | Probe MG-626 read-only sin sucesor; evidencia puntual, 0 refs |
| `_tmp-mg626-db-precheck.ts` | cuarentena | Probe MG-626 read-only sin sucesor; evidencia puntual, 0 refs |
| `_tmp-mg626-payload-v3.ts` | cuarentena | Ultima version de la serie MG-626 (v3); unica con prueba de aislamiento de wallet; sin spec: conservar fuera de la ruta activa |
| `accept-trip-and-dump.ts` | cuarentena | Superado por TripLifecyclePBO.acceptAssignedTrip/startTrip; efecto sin gate; lo cita setup-appium-local.md (actualizar al mover) |
| `close-trip-summary.ts` | cuarentena | Superado por TripLifecyclePBO.finishTrip/closeTrip (con gate); 0 refs |
| `diagnostics/dump-3ds-popup.ts` | cuarentena | Dump de 3DS puntual; PaymentPBO.handle3DS y screens/shared/Stripe3DS lo cubren; 0 refs |
| `diagnostics/dump-after-login.ts` | cuarentena | Login+dump superado por DriverSessionPBO; lo cita setup-appium-local.md y el fixture de usuarios; password literal (SECURITY) |
| `diagnostics/dump-assigned-trip-state.ts` | cuarentena | Dump read-only puntual sin refs (modales, estado, payment, list-tab, webview, travel-confirm, home-viaje-calle, assigned-trip) |
| `diagnostics/dump-driver-identity.ts` | cuarentena | Dump read-only sin refs de codigo; selectores ya migrados a DriverTripPreflight |
| `diagnostics/dump-en-base-modal.ts` | cuarentena | Dump read-only puntual sin refs (modales, estado, payment, list-tab, webview, travel-confirm, home-viaje-calle, assigned-trip) |
| `diagnostics/dump-home-viaje-calle.ts` | cuarentena | Dump read-only puntual sin refs (modales, estado, payment, list-tab, webview, travel-confirm, home-viaje-calle, assigned-trip) |
| `diagnostics/dump-modal-html.ts` | cuarentena | Dump read-only puntual sin refs (modales, estado, payment, list-tab, webview, travel-confirm, home-viaje-calle, assigned-trip) |
| `diagnostics/dump-resume-payment.ts` | cuarentena | Dump read-only puntual sin refs (modales, estado, payment, list-tab, webview, travel-confirm, home-viaje-calle, assigned-trip) |
| `diagnostics/dump-travel-confirm.ts` | cuarentena | Dump read-only puntual sin refs (modales, estado, payment, list-tab, webview, travel-confirm, home-viaje-calle, assigned-trip) |
| `diagnostics/dump-travel-list-tab.ts` | cuarentena | Dump read-only puntual sin refs (modales, estado, payment, list-tab, webview, travel-confirm, home-viaje-calle, assigned-trip) |
| `diagnostics/dump-webview.ts` | cuarentena | Dump read-only puntual sin refs (modales, estado, payment, list-tab, webview, travel-confirm, home-viaje-calle, assigned-trip) |
| `driver-availability-hang-repro.ts` | cuarentena | Reproduccion de bug de disponibilidad; 0 refs de codigo, solo doc de arquitectura la lista; owner dudoso |
| `driver-cargo-payment-validate.ts` | cuarentena | Superado por PaymentPBO.chargeWithCard / DriverCargoDeclineHarness; efecto sin gate; solo docs lo citan |
| `driver-charge-from-resume.ts` | cuarentena | Superado por PaymentPBO.chargeWithCard / DriverCargoDeclineHarness; efecto sin gate; solo docs lo citan |
| `driver-login-password-only.ts` | cuarentena | Login solo contrasena superado por DriverSessionPBO; contrasena literal (SECURITY) |
| `driver-mg117-address-matrix.ts` | cuarentena | Exploracion de descubrimiento MG-117 (selectores/modales/matriz); 0 refs |
| `driver-mg117-discover-prediction.ts` | cuarentena | Exploracion de descubrimiento MG-117 (selectores/modales/matriz); 0 refs |
| `driver-mg117-gates.ts` | cuarentena | Cubierto por DriverAddressCaseBattery (TM-654..662) / spec driver-address-surfaces; 0 refs |
| `driver-mg117-home-explore.ts` | cuarentena | Exploracion de descubrimiento MG-117 (selectores/modales/matriz); 0 refs |
| `driver-mg117-smoke.ts` | cuarentena | Cubierto por DriverAddressCaseBattery (TM-654..662) / spec driver-address-surfaces; 0 refs |
| `driver-mg117-spinner-check.ts` | cuarentena | TM-665 cubierto por DriverAddressCaseBattery; 3 scripts de la misma campana; 0 refs |
| `driver-mg117-tm665-matrix.ts` | cuarentena | TM-665 cubierto por DriverAddressCaseBattery; 3 scripts de la misma campana; 0 refs |
| `driver-mg117-tm665.ts` | cuarentena | TM-665 cubierto por DriverAddressCaseBattery; 3 scripts de la misma campana; 0 refs |
| `driver-observe.ts` | cuarentena | Observador no intrusivo para captura asistida MG-117 (campana cerrada); 0 refs |
| `driver-set-geo.ts` | cuarentena | Mock GPS superado por GpsSimulationPBO.positionAt (setGeoLocation sin speed descarta puntos) |
| `driver-storage-probe.ts` | cuarentena | Sonda read-only de Ionic Storage; 0 refs; reemplazable por driverStateDiagnostic |
| `dump-and-free-resume.ts` | cuarentena | Borrador superado por recoverDriverToHome (helper); 0 refs |
| `end-trip-and-dump.ts` | cuarentena | Superado por TripLifecyclePBO.finishTrip/closeTrip (con gate); 0 refs |
| `full-trip-flow-dump.ts` | cuarentena | Superado por TripLifecyclePBO.acceptAssignedTrip/startTrip; efecto sin gate; lo cita setup-appium-local.md (actualizar al mover) |
| `mgw-hold-detail.ts` | cuarentena | Explorador DB (Oracle SELECT) de holds/gateway; pertenece a gateway-pg mas que a mobile; owner dudoso; 0 refs |
| `mgw-logs-explore.ts` | cuarentena | Explorador DB (Oracle SELECT) de holds/gateway; pertenece a gateway-pg mas que a mobile; owner dudoso; 0 refs |
| `mgw-scheduled-hold.ts` | cuarentena | Explorador DB (Oracle SELECT) de holds/gateway; pertenece a gateway-pg mas que a mobile; owner dudoso; 0 refs |
| `mgw-travel-coords.ts` | cuarentena | Explorador DB (Oracle SELECT) de holds/gateway; pertenece a gateway-pg mas que a mobile; owner dudoso; 0 refs |
| `passenger-address-confirm-dump.ts` | cuarentena | Dumps/exploradores del alta de viaje pax v2.5.17 (ago-25) sin refs |
| `passenger-cta-inspect.ts` | cuarentena | Dumps/exploradores del alta de viaje pax v2.5.17 (ago-25) sin refs |
| `passenger-diagnose-addcard-network.ts` | cuarentena | Exploradores eBiz/wallet v2.5.17 (ago-25) sin refs; superados por PassengerWalletPBO y specs gateway-pg |
| `passenger-ebiz-business-address.ts` | cuarentena | Exploradores eBiz/wallet v2.5.17 (ago-25) sin refs; superados por PassengerWalletPBO y specs gateway-pg |
| `passenger-ebiz-business-explore.ts` | cuarentena | Exploradores eBiz/wallet v2.5.17 (ago-25) sin refs; superados por PassengerWalletPBO y specs gateway-pg |
| `passenger-ebiz-newtrip-explore.ts` | cuarentena | Exploradores eBiz/wallet v2.5.17 (ago-25) sin refs; superados por PassengerWalletPBO y specs gateway-pg |
| `passenger-ebiz-newtrip-validate.ts` | cuarentena | Exploradores eBiz/wallet v2.5.17 (ago-25) sin refs; superados por PassengerWalletPBO y specs gateway-pg |
| `passenger-explore-addcard-form.ts` | cuarentena | Exploradores eBiz/wallet v2.5.17 (ago-25) sin refs; superados por PassengerWalletPBO y specs gateway-pg |
| `passenger-mg116-bias-origin.ts` | cuarentena | Exploracion MG-116 sin TM propio; superficies cubiertas por pax-address-surfaces; 0 refs |
| `passenger-mg116-carrier-ab.ts` | cuarentena | Campana MG-116 cubierta por pax-address-behaviors/surfaces + AddressFieldProbe (TM-669..734); 0 refs |
| `passenger-mg116-gates.ts` | cuarentena | Campana MG-116 cubierta por pax-address-behaviors/surfaces + AddressFieldProbe (TM-669..734); 0 refs |
| `passenger-mg116-iata-por-superficie.ts` | cuarentena | Exploracion MG-116 sin TM propio; superficies cubiertas por pax-address-surfaces; 0 refs |
| `passenger-mg116-probe-modal.ts` | cuarentena | Exploracion MG-116 sin TM propio; superficies cubiertas por pax-address-surfaces; 0 refs |
| `passenger-mg116-regression.ts` | cuarentena | Regresion MG-116 superada por specs; contiene bytes NUL (grep la trata como binaria): revisar codificacion al mover |
| `passenger-mg116-s7-direcciones.ts` | cuarentena | Exploracion MG-116 sin TM propio; superficies cubiertas por pax-address-surfaces; 0 refs |
| `passenger-mg116-selection-control.ts` | cuarentena | Campana MG-116 cubierta por pax-address-behaviors/surfaces + AddressFieldProbe (TM-669..734); 0 refs |
| `passenger-mg116-selection.ts` | cuarentena | Campana MG-116 cubierta por pax-address-behaviors/surfaces + AddressFieldProbe (TM-669..734); 0 refs |
| `passenger-mg116-stale-placeid.ts` | cuarentena | Campana MG-116 cubierta por pax-address-behaviors/surfaces + AddressFieldProbe (TM-669..734); 0 refs |
| `passenger-newtrip-dump.ts` | cuarentena | Dumps/exploradores del alta de viaje pax v2.5.17 (ago-25) sin refs |
| `passenger-newtrip-fullflow-dump.ts` | cuarentena | Dumps/exploradores del alta de viaje pax v2.5.17 (ago-25) sin refs |
| `passenger-newtrip-vehicle-dump.ts` | cuarentena | Dumps/exploradores del alta de viaje pax v2.5.17 (ago-25) sin refs |
| `passenger-scheduled-trips-census.ts` | cuarentena | Censo de descubrimiento S6 (programados); 0 refs |
| `passenger-tm731-background-vs-reload.ts` | cuarentena | TM-731 cubierto por specs de superficies; 0 refs |
| `probe-prod-webview.ts` | cuarentena | Sonda PROD de instrumentabilidad del WebView; explica el smoke nativo pero 0 refs |
| `start-trip-and-dump.ts` | cuarentena | Superado por TripLifecyclePBO.acceptAssignedTrip/startTrip; efecto sin gate; lo cita setup-appium-local.md (actualizar al mover) |
| `tap-accept-prehome.ts` | cuarentena | Utilidad menor sin refs; tap en overlay pre-home cubierto por DriverSessionPBO |
| `tap-passenger-btn-dump.ts` | cuarentena | Volcado puntual tras tap del boton Pasajero; sin refs; cubierto por DriverHomeScreen |
| `_tmp-mg626-business-addcard-network.ts` | borrar | Primera version de la serie MG-626, superada por v2/v3; 0 refs; efecto (alta/baja tarjeta) |
| `_tmp-mg626-payload-v2.ts` | borrar | Superada por v3 (mismo flujo + prueba de modo Compania); 0 refs |
| `diagnostics/dump-home-online.ts` | borrar | Duplicado de driver-go-online + dump-driver-home; 0 refs |
| `diagnostics/dump-home-screen.ts` | borrar | Duplicado de dump-current-screen (vuelca la pantalla actual); 0 refs |
