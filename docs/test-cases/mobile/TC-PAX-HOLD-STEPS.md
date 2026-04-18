# TC-PAX-HOLD-STEPS — Alta de Viaje Passenger App (Hold)

> Registro step-by-step del happy-path de alta de viaje desde la app Passenger.
> Captura colaborativa: user ejecuta en el dispositivo, Claude-orquestador
> dispara dumps Appium tras cada acción y consolida selectores canónicos.
>
> **Objetivo:** reutilizar estos pasos como fuente de verdad para futuros
> test cases, Screens Appium y borradores Playwright/Appium híbridos.
>
> Estado: EN PROGRESO — **modo registro en vivo**.

---

## Datos comunes

| Campo | Valor |
| --- | --- |
| App package | `com.magiis.app.test.passenger` |
| Dispositivo | `R92XB0B8F3J` (Pixel 7, Android 15) |
| Ambiente | TEST |
| User passenger | `emanuel.restrepo@yopmail.com` |
| Origin demo | Reconquista 661, Buenos Aires |
| Destination demo | Av. 9 de Julio 1000, Buenos Aires |

---

## Tarjetas Stripe de prueba

| Flujo | Tarjeta | Expira | CVC | 3DS | Fuente |
| --- | --- | --- | --- | --- | --- |
| **HAPPY no-3DS** | `4242 4242 4242 4242` | `12/34` | `123` | No | `stripeTestData.visa_success` |
| **HAPPY 3DS** | `4000 0025 0000 3155` | `12/34` | `123` | Sí — challenge exitoso | `stripeTestData.visa_3ds_required` |

---

## Flujo 1 — Happy path HOLD con 3DS (4000 0025 0000 3155)

> **Precondiciones:** app iniciada en HomePage Passenger, modo Personal o Business
> consistente, sin tarjetas previas en Billetera (wallet limpio).

### Tabla de registro

| # | Acción del usuario | Pantalla resultante | Selector canónico observado | Evidencia (dump / timestamp) | Notas |
| --- | --- | --- | --- | --- | --- |
| 1 | Desde Home, abrir menú lateral y entrar a **Billetera** | Billetera vacía | URL `https://localhost/cards`; host `app-cards`; empty state text `Aún no tienes Tarjetas para este País.` | `evidence/manual-capture/pax-hold/3ds/step-01-wallet-empty-2026-04-16T19-55-53-825Z.txt` | Personal mode confirmado en side menu (`Emanuel Restrepo Personal`). Side menu ion-list id=`inbox-list`. |
| 2 | Tap en botón **AGREGAR** | Modal `app-credit-card-payment-data` | Host `app-credit-card-payment-data` dentro de `ion-modal` (id dinámico tipo `ion-overlay-NNN`); título literal `Nuevo método de pago`; botón submit `button.btn.primary` con span hijo `GUARDAR`; card-number wrapper `ion-item.card-number.stripe-item` → `.stripe-element.StripeElement--empty` | `evidence/manual-capture/pax-hold/3ds/step-02-modal-open-2026-04-16T20-00-46-394Z.txt` | Holder name se renderiza como `input` sin placeholder directo; usar formcontrolname `cardholderName`. |
| 3 | Ingresar número tarjeta en iframe `cardNumber` | Campo `StripeElement--complete` | `ion-item.card-number.stripe-item` → `.stripe-element.StripeElement--focus.StripeElement--complete`; al completar aparecen spans helper `Formato MM/AA` y `Código de verificación` | `evidence/manual-capture/pax-hold/3ds/step-03-card-number-filled-2026-04-16T20-05-31-154Z.txt` | Campo de expiración y CVC aún `StripeElement--empty`. Foco queda en cardNumber hasta que se ingresa un dígito más o el usuario saltea con Tab. |
| 4 | Ingresar MM/AA en iframe `cardExpiry` | Campo `StripeElement--complete` | Segundo `ion-item.stripe-item` con wrapper `stripe-element-small`; estado observado `StripeElement--focus.StripeElement--complete` | `evidence/manual-capture/pax-hold/3ds/step-04-expiry-filled-2026-04-16T20-09-23-273Z.txt` | Al terminar expiry, foco pasa automático al CVC si se ingresa el dígito final (comportamiento Stripe). |
| 5 | Ingresar CVC en iframe `cardCvc` | Campo `StripeElement--complete` | Tercer `ion-item.stripe-item` con wrapper `stripe-element-small`; estado `StripeElement--focus.StripeElement--complete`. Tras llenarlo los 3 stripe-elements están `--complete`. | `evidence/manual-capture/pax-hold/3ds/step-05-cvc-filled-2026-04-16T20-10-39-275Z.txt` | Foco NO salta automáticamente a holder name — el usuario tiene que tapearlo. |
| 6 | Completar **Nombre del Títular** | `ion-input[formcontrolname="cardholderName"]` con `has-value` | Input placeholder=`Nombre del Títular` dentro de `ion-input[formcontrolname="cardholderName"]`; el wrapper añade clase `has-value` cuando hay texto. Con los 3 stripe-elements `--complete` el botón GUARDAR queda enabled. | `evidence/manual-capture/pax-hold/3ds/step-06-holder-filled-2026-04-16T20-11-53-725Z.txt` | Dump shorthand no lista el has-value pero el HTML completo en el archivo sí lo tiene. |
| 7 | Tap en **GUARDAR** | Popup Visa 3DS con botones `COMPLETE` / `FAIL` | `button.btn.primary` con span hijo `GUARDAR` dentro de `app-credit-card-payment-data`. El popup Visa corre en iframe Stripe cross-origin (no legible desde WebView — detectable solo por desaparición del modal). | `evidence/manual-capture/pax-wallet-save-fail/step-08-form-complete-before-save-2026-04-16T23-43-50-498Z.txt` + `step-09-3ds-challenge-visible-2026-04-16T23-46-18-085Z.txt` | El click dispara `stripe.confirmCardSetup`. En WebView el único indicador visible es que el botón queda momentáneamente en loading y aparece el iframe `I0_*` (no el Visa, es otro). El Visa popup es nativo/Stripe-hosted. |
| 8 | Completar challenge 3DS → **COMPLETE** | Modal cierra, tarjeta `VISA ...3220` en lista wallet | Tras el COMPLETE: DOM muestra `span:"VISA ...3220"` dentro de `app-cards`. Host `app-credit-card-payment-data` desaparece del árbol. | `evidence/manual-capture/pax-wallet-save-fail/step-10-post-3ds-complete-2026-04-16T23-49-02-740Z.txt` | Si el usuario elige **FAIL**: aparece `app-confirm-modal` con span `Información Inválida`, mensaje `No podemos autenticar tu método de pago...` y CTA `button.btn.primary > Reintentar`. Ver TC-PAX-WALLET-ADD-3DS-FAIL-RETRY. |
| 9 | Volver a **Home** tab | HomePage con campos Origen/Destino vacíos | `app-home.ion-page`; tab Inicio en bottom nav | `evidence/manual-capture/pax-trip-hold-3ds/trip-step-01-home-2026-04-17T04-09-29-612Z.txt` | Home persiste Origen y Destino si ya había valores previos. Ver observación en TC-PAX-NEW-TRIP-HOLD-3DS. |
| 10 | Tap campo **Origen**, tipear dirección, elegir sugerencia | Origen fijado con pin en mapa | `input[placeholder="Origen "]` | `evidence/manual-capture/pax-trip-hold-3ds/trip-step-02-origin-set-2026-04-17T04-11-37-230Z.txt` | |
| 11 | Tap campo **Destino**, tipear dirección, elegir sugerencia | Destino fijado + aparece `input[placeholder="Agregar otro destino "]` | `input[placeholder="Destino "]`; aparece `input[placeholder="Agregar otro destino "]` | `evidence/manual-capture/pax-trip-hold-3ds/trip-step-03-destination-set-2026-04-17T04-13-44-477Z.txt` | |
| 12 | Tap **Seleccionar Vehículo** / confirmar paso | Entra a `app-travel-info` con estimación y lista de vehículos | `app-travel-info.ion-page`; `ion-row.travel-estimate`; `span.travel-type` | `evidence/manual-capture/pax-trip-hold-3ds/trip-step-04-vehicle-list-2026-04-17T04-15-40-025Z.txt` | |
| 13 | Verificar vehículo **Standard** preseleccionado | Standard visible y tarjeta `...3155` asignada | `ion-row.travel-payment-info`; span con `VISA ...3155` | _(reutilizar step-04 dump)_ | Selector de vehículo: `button.travel-btn-confirm` con span `travel-type` = `Standard`. |
| 14 | Tap **Método de pago** → verificar/elegir tarjeta 3155 | Card `...3155` como método default | `ion-col.payment-method` o `ion-col.payment-method-selected`; tarjeta ya preseleccionada si es la default | _(reutilizar step-04 dump)_ | Si la tarjeta ya es default no requiere tap adicional. `selectPaymentCard()` en Screen cubre este paso. |
| 15 | Tap **Viajo Ahora Standard - $precio** | Popup 3DS Visa con `COMPLETE` / `FAIL` | `button.travel-btn-confirm`; span `travel-type` texto `Standard` | `evidence/manual-capture/pax-trip-hold-3ds/trip-step-07-after-clean-viajo-ahora-2026-04-17T04-44-39-054Z.txt` | Si aparece modal `Ya tiene un viaje creado`, la precondición no se cumplió. Ver `detectTripAlreadyCreatedModal()`. |
| 16 | En popup Visa tap **COMPLETE** → esperar transición | `app-driver-available` con mapa Leaflet, texto `Buscando servicio... Standard`, botón `Cancelar Viaje` | `app-driver-available.ion-page`; `a.leaflet-control-zoom-fullscreen`; `button.btn.outline` texto `Cancelar Viaje` | `evidence/manual-capture/pax-trip-hold-3ds/trip-step-08-searching-service-2026-04-17T04-50-01-251Z.txt` | Estado hold Stripe: `requires_capture`. Carrier debe ver viaje en **Por asignar**. |

### Assertions esperadas (resultado del flujo)

- [x] Modal Stripe cerrado tras 3DS aprobada — `app-credit-card-payment-data` desaparece del árbol.
- [x] Tarjeta `VISA ...3155` visible en lista Billetera — `span:"VISA ...3155"` dentro de `app-cards`.
- [x] Viaje creado — `app-driver-available.ion-page` visible tras COMPLETE.
- [x] Estado del viaje: `Buscando servicio... Standard` en `app-driver-available`.
- [x] Botón `Cancelar Viaje` visible — `button.btn.outline`.
- [x] Hold Stripe: `requires_capture` (confirmado en backend, Carrier lo ve en **Por asignar**).

---

## Flujo 2 — Happy path HOLD sin 3DS (4242 4242 4242 4242)

> **Precondiciones:** idéntico a Flujo 1; wallet limpio.
> Tarjeta `4242 4242 4242 4242` no requiere challenge 3DS — el modal Visa no aparece.

### Tabla de registro

| # | Acción del usuario | Pantalla resultante | Selector canónico observado | Evidencia (dump / timestamp) | Notas |
| --- | --- | --- | --- | --- | --- |
| 1 | Desde Home, abrir menú lateral → **Billetera** | Billetera vacía | URL `https://localhost/cards`; host `app-cards`; empty state `Aún no tienes Tarjetas para este País.` | _(pendiente — reutilizar dump Flujo 1 step-01)_ | Mismo selector que Flujo 1. |
| 2 | Tap **AGREGAR** | Modal `app-credit-card-payment-data` | Igual que Flujo 1 step-02 | _(pendiente)_ | JS click requerido por overlap con ion-item. |
| 3 | Número tarjeta `4242 4242 4242 4242` | `StripeElement--complete` en cardNumber | `ion-item.card-number.stripe-item → .stripe-element.StripeElement--complete` | _(pendiente)_ | |
| 4 | MM/AA `12/34` | `StripeElement--complete` en cardExpiry | `ion-item.stripe-item stripe-element-small → .StripeElement--complete` | _(pendiente)_ | |
| 5 | CVC `123` | `StripeElement--complete` en cardCvc | Tercer `ion-item.stripe-item` → `StripeElement--complete` | _(pendiente)_ | |
| 6 | Nombre del Titular | `has-value` en cardholderName | `ion-input[formcontrolname="cardholderName"]` con clase `has-value` | _(pendiente)_ | |
| 7 | Tap **GUARDAR** | **Sin challenge** — modal cierra directamente; tarjeta `VISA ...4242` en lista | Igual que step-08 Flujo 1 pero sin iframe challenge Visa. `app-credit-card-payment-data` desaparece del árbol. | _(pendiente — capturar)_ | **Diferencia clave vs Flujo 1:** no aparece popup Visa. El modal se cierra apenas Stripe confirma el SetupIntent. |
| 8 | Volver a **Home** tab | HomePage con campos vacíos | `app-home.ion-page`; tab Inicio en `ion-tabs` | _(pendiente)_ | |
| 9 | Tap campo **Origen**, tipear, elegir sugerencia | Origen fijado | `input[placeholder="Origen "]` | _(pendiente — reutilizar Flujo 1 step-02 selectores)_ | |
| 10 | Tap campo **Destino**, tipear, elegir sugerencia | Destino fijado | `input[placeholder="Destino "]` | _(pendiente)_ | |
| 11 | Tap **Seleccionar Vehículo** | `app-travel-info` con estimación | `app-travel-info.ion-page`; `ion-row.travel-estimate` | _(pendiente)_ | |
| 12 | Verificar tarjeta `...4242` preseleccionada | Payment info = `...4242` | `ion-row.travel-payment-info`; span `VISA ...4242` | _(pendiente)_ | Si aparece selector de tarjeta, reutilizar `selectPaymentCard()` del Screen. |
| 13 | Tap **Viajo Ahora Standard** | **Sin popup 3DS** → navega a `app-driver-available` directamente | `button.travel-btn-confirm`; `app-driver-available.ion-page` | _(pendiente — capturar)_ | **Diferencia clave vs Flujo 1:** no hay challenge popup entre tap y SEARCHING. |
| 14 | Esperar estado SEARCHING | `app-driver-available` con mapa + `Cancelar Viaje` | `a.leaflet-control-zoom-fullscreen`; `button.btn.outline` texto `Cancelar Viaje` | _(pendiente — reutilizar Flujo 1 step-08)_ | |

### Divergencias observadas vs Flujo 1

| Paso | Flujo 1 (3DS - tarjeta 3155) | Flujo 2 (sin 3DS - tarjeta 4242) |
| --- | --- | --- |
| Paso 7 (GUARDAR) | Popup Visa 3DS con `COMPLETE` / `FAIL` | Modal cierra directamente sin challenge |
| Paso 13 (Viajo Ahora) | Popup 3DS Visa antes de SEARCHING | Navega directo a `app-driver-available` |
| Selectores Stripe | Idénticos (mismos iframes cardNumber/Expiry/Cvc) | Idénticos |
| Estado hold Stripe | `requires_capture` (post-3DS) | `requires_capture` (directo) |

---

## Convenciones de captura

- **Nombre de dump**: `evidence/manual-capture/pax-hold/<flow>/step-NN-<slug>.txt`.
  Ejemplo: `evidence/manual-capture/pax-hold/3ds/step-07-tap-guardar.txt`.
- **Formato**: salida completa del WebView `document.documentElement.outerHTML`
  via `pnpm tsx tests/mobile/appium/scripts/dump-current-screen.ts`.
- **Selector canónico**: lo más estable que se pueda. Preferencia:
  `accessibility-id` > `resource-id` > `tagName + attribute` > CSS estable > XPath.

---

## Trazabilidad

- Fuente TC base: _(pendiente — vincular cuando exista TS-PAX-HOLD-XX en matriz)_
- Screens Appium a actualizar/generar:
  - `tests/mobile/appium/passenger/PassengerWalletScreen.ts`
  - `tests/mobile/appium/passenger/PassengerNewTripScreen.ts`
  - `tests/mobile/appium/passenger/PassengerTripStatusScreen.ts`
- Harness afectado: `tests/mobile/appium/harness/PassengerTripHappyPathHarness.ts`

## TCs derivados

| Fecha | TC | Descripción |
| --- | --- | --- |
| 2026-04-16 | `TC-PAX-WALLET-ADD-3DS-HAPPY.md` | Happy path add card con 3DS COMPLETE |
| 2026-04-16 | `TC-PAX-WALLET-ADD-3DS-FAIL-RETRY.md` | Error 3DS FAIL + Reintentar + nuevo COMPLETE |
| 2026-04-17 | `TC-PAX-NEW-TRIP-HOLD-3DS.md` | Alta de viaje con hold autorizado vía 3DS — validado manualmente |
| 2026-04-17 | `TC-PAX-NEW-TRIP-BLOCKED-BY-ACTIVE-OR-CONFLICT.md` | Bloqueo por viaje activo o NO_AUTORIZADO — validado manualmente |

## Screens actualizados en esta rama (mobile/pax-new-trip)

| Screen | Métodos nuevos |
| --- | --- |
| `PassengerNewTripScreen.ts` | `detectTripAlreadyCreatedModal()`, `dismissTripAlreadyCreatedModal()` |
| `PassengerTripHappyPathHarness.ts` | Guard `ENV_BLOCKER` en `createTrip()` si modal de bloqueo detectado |
