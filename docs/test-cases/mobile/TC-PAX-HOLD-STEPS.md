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
| 9 | Volver a Home | HomePage con Origen/Destino | _(pendiente — capturar en próxima sesión)_ | _(pendiente)_ | |
| 10 | Tap campo **Origen**, tipear, elegir sugerencia | Origen confirmado con pin | _(pendiente)_ | _(pendiente)_ | |
| 11 | Tap campo **Destino**, tipear, elegir sugerencia | Destino confirmado con pin | _(pendiente)_ | _(pendiente)_ | |
| 12 | Tap **Seleccionar Vehículo** | Lista vehículos disponibles | _(pendiente)_ | _(pendiente)_ | |
| 13 | Elegir vehículo | Selección aplicada | _(pendiente)_ | _(pendiente)_ | |
| 14 | Tap **Método de pago** → elegir tarjeta 3155 | Card principal = 3155 | _(pendiente)_ | _(pendiente)_ | |
| 15 | Tap **Ahora** (confirmar viaje) | Loading → SEARCHING_DRIVER | _(pendiente)_ | _(pendiente)_ | Si aparece modal de límite, anotar texto literal |
| 16 | Estado final del viaje | SEARCHING_DRIVER visible, hold confirmado | _(pendiente)_ | _(pendiente)_ | |

### Assertions esperadas (resultado del flujo)

- [ ] Modal Stripe cerrado tras 3DS aprobada.
- [ ] Tarjeta `****3155` visible en lista Billetera.
- [ ] Viaje creado con ID `NNN-X`.
- [ ] Estado del viaje: `SEARCHING_DRIVER` o equivalente UI.
- [ ] Hold Stripe confirmado en `requires_capture`.

---

## Flujo 2 — Happy path HOLD sin 3DS (4242 4242 4242 4242)

> **Precondiciones:** idéntico a Flujo 1; wallet limpio.

### Tabla de registro

| # | Acción del usuario | Pantalla resultante | Selector canónico observado | Evidencia (dump / timestamp) | Notas |
| --- | --- | --- | --- | --- | --- |
| 1 | Abrir **Billetera** | Billetera vacía | _(pendiente)_ | _(pendiente)_ | |
| 2 | Tap **AGREGAR** | Modal stripe | _(pendiente)_ | _(pendiente)_ | |
| 3-6 | Completar tarjeta + holder | Form valido | _(pendiente)_ | _(pendiente)_ | |
| 7 | Tap **GUARDAR** | Modal cierra, tarjeta en lista (sin challenge) | _(pendiente)_ | _(pendiente)_ | |
| 8 | Volver a Home | HomePage | _(pendiente)_ | _(pendiente)_ | |
| 9 | Origen + Destino | Pines fijados | _(pendiente)_ | _(pendiente)_ | |
| 10 | Seleccionar Vehículo | Lista vehículos | _(pendiente)_ | _(pendiente)_ | |
| 11 | Método de pago → 4242 | Card principal = 4242 | _(pendiente)_ | _(pendiente)_ | |
| 12 | Tap **Ahora** | SEARCHING_DRIVER | _(pendiente)_ | _(pendiente)_ | |

### Divergencias observadas vs Flujo 1

- _(pendiente — completar tras ambos dumps)_

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

## TCs derivados (2026-04-16)

- `docs/test-cases/mobile/TC-PAX-WALLET-ADD-3DS-HAPPY.md` — happy path add card con 3DS COMPLETE.
- `docs/test-cases/mobile/TC-PAX-WALLET-ADD-3DS-FAIL-RETRY.md` — flujo de error 3DS FAIL + Reintentar + nuevo COMPLETE.
