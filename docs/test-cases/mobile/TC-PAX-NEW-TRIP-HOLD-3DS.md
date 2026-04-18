# TC-PAX-NEW-TRIP-HOLD-3DS — Alta de viaje con HOLD autorizado vía 3DS

| Campo | Valor |
| --- | --- |
| **ID** | TC-PAX-NEW-TRIP-HOLD-3DS |
| **Feature** | PASSENGER / New Trip / Hold / 3DS |
| **Módulo** | `new-trip` |
| **Portal** | App Pax (Android) |
| **Ambiente** | TEST |
| **Tipo** | Positivo |
| **Prioridad** | P1 |
| **Flujo crítico** | Sí — core del producto |
| **Estado** | Validado manualmente 2026-04-17 |

---

## User story
**Como** passenger con tarjeta 3DS vinculada
**Quiero** crear un viaje y autorizar el hold via 3DS
**Para** que el sistema reserve fondos y empiece a buscar conductor.

## Caso de uso
UC-PAX-TRIP-CREATE-WITH-HOLD-3DS

## Precondiciones

| # | Condición | Cómo verificar |
| --- | --- | --- |
| 1 | Carrier con feature **HOLD activo** | Dashboard carrier / config backend |
| 2 | Passenger **sin viajes en `SEARCHING_DRIVER`** | Carrier → Gestión de viajes → Por asignar / En curso: vacío para ese user |
| 3 | Passenger **sin viajes en `NO_AUTORIZADO`** (pestaña "En conflicto") | Carrier → Gestión → **En conflicto**: vacío para ese user |
| 4 | Tarjeta 3DS vinculada en Billetera pax | App Pax → Mi cuenta → Billetera muestra `VISA ...3220` |
| 5 | Tarjeta seteada como **método de pago default** | Al crear viaje se ve `...3220` seleccionada automáticamente |
| 6 | App Pax logueada con `emanuel.restrepo@yopmail.com` en modo Personal | Side menu muestra `Emanuel Restrepo` + `Modo Personal` |

## Datos de prueba
| Campo | Valor |
| --- | --- |
| Tarjeta | `VISA ...3220` (previamente vinculada con 3DS, ver `TC-PAX-WALLET-ADD-3DS-HAPPY`) |
| Origen | Dirección válida en cobertura (ej: Reconquista 661, BA) |
| Destino | Dirección válida distinta al origen |
| Tipo viaje | `Ida` (one-way) |
| Vehículo | `Standard` |
| 3DS action | **COMPLETE** |

## Pasos

| # | Acción | Pantalla resultante | Selector canónico |
| --- | --- | --- | --- |
| 1 | Estar en Home (`app-home`) con origen y destino vacíos | Home visible, campos placeholder `Origen ` / `Destino ` | `app-home.ion-page` |
| 2 | Tap input Origen, tipear dirección, elegir sugerencia | Origen fijado con pin en mapa | `input[placeholder="Origen "]` |
| 3 | Tap input Destino, tipear dirección, elegir sugerencia | Destino fijado + aparece input "Agregar otro destino" | `input[placeholder="Destino "]`; aparece `input[placeholder="Agregar otro destino "]` |
| 4 | Tap **Seleccionar Vehículo** / botón de confirmar paso | Entra a `app-travel-info` con estimación y vehículos | `app-travel-info.ion-page`; `ion-row.travel-estimate`; `span.travel-type` |
| 5 | Verificar vehículo **Standard** preseleccionado y tarjeta `...3220` asignada | Payment info muestra `...3220` | `ion-row.travel-payment-info`; span con `VISA ...NNNN` |
| 6 | Tap **Viajo Ahora Standard - $precio** | Dispara confirmación + popup 3DS Visa | `button.travel-btn-confirm`; span `travel-type` con texto `Standard` |
| 7 | En popup Visa tap **COMPLETE** | Popup cierra + app pasa a `app-driver-available` | Iframe Stripe (no accesible WebView) |
| 8 | Esperar transición | Pantalla SEARCHING con mapa Leaflet, texto `Buscando servicio... Standard`, botón `Cancelar Viaje` | `app-driver-available.ion-page`; `a.leaflet-control-zoom-fullscreen`; `button.btn.outline` con texto `Cancelar Viaje` |
| 9 | Tras ~30-60s sin driver, aparece modal informativo | Modal `app-confirm-modal` con `span:"Seguimos Buscando Vehículos"` + botón `Aceptar` | `app-confirm-modal.ion-page`; `button.btn.primary` texto `Aceptar` |

## Resultado esperado
- **Debería** navegar a `app-travel-info` al completar Origen + Destino.
- **Debería** preseleccionar vehículo `Standard` como default.
- **Debería** asignar automáticamente la tarjeta default `VISA ...3220` como método de pago.
- **Debería** disparar popup 3DS Visa al tap `Viajo Ahora`.
- **Debería** autorizar hold Stripe (`requires_capture`) al tap `COMPLETE` en 3DS.
- **Debería** navegar a `app-driver-available` con mapa visible y botón `Cancelar Viaje`.
- **Debería** mostrar modal informativo `Seguimos Buscando Vehículos` tras X segundos sin driver.
- **Debería NO** mostrar error ni volver a `app-home` si 3DS fue exitoso.
- **Debería** crear el viaje en backend (Carrier lo debe ver en **Por asignar**).

## Resultado obtenido (ejecución 2026-04-17)
Todos los assertions OK. Flujo completo validado.

## Evidencia
Ubicación: `evidence/manual-capture/pax-trip-hold-3ds/`

| Step | Archivo |
| --- | --- |
| 01 home | `trip-step-01-home-2026-04-17T04-09-29-612Z.txt` |
| 02 origen | `trip-step-02-origin-set-2026-04-17T04-11-37-230Z.txt` |
| 03 destino | `trip-step-03-destination-set-2026-04-17T04-13-44-477Z.txt` |
| 04 vehículo | `trip-step-04-vehicle-list-2026-04-17T04-15-40-025Z.txt` |
| 07 viajo ahora | `trip-step-07-after-clean-viajo-ahora-2026-04-17T04-44-39-054Z.txt` |
| 08 SEARCHING | `trip-step-08-searching-service-2026-04-17T04-50-01-251Z.txt` |
| 09 cancel modal | `trip-step-09-cancel-confirm-modal-2026-04-17T04-56-19-060Z.txt` |
| 10 post-cancel home | `trip-step-10-back-to-home-after-cancel-2026-04-17T04-58-34-654Z.txt` |

## Observaciones
- El popup 3DS Visa corre en iframe Stripe cross-origin → no automatizable desde WebView Appium sin switch a NATIVE_APP o mock de Stripe.
- Home persiste Origen y Destino aunque se cancele el viaje.
- El modal `Seguimos Buscando Vehículos` es informativo, no cancela el viaje; se dismissa con Aceptar.
- Al cancelar desde `app-driver-available`, la app vuelve a `app-home` inmediatamente (no pregunta motivo).

## Trazabilidad
- Depende de: `TC-PAX-WALLET-ADD-3DS-HAPPY.md` (tarjeta vinculada).
- Relacionado: `TC-PAX-NEW-TRIP-BLOCKED-BY-ACTIVE-OR-CONFLICT.md`.
- Screens Appium a actualizar:
  - `tests/mobile/appium/passenger/PassengerNewTripScreen.ts`
  - `tests/mobile/appium/passenger/PassengerTripStatusScreen.ts`
- Estado Stripe esperado: `payment_intent.status = requires_capture` tras COMPLETE 3DS.
- Estado viaje backend esperado: `SEARCHING_DRIVER`.
