# TC-PAX-WALLET-ADD-3DS-HAPPY — Agregar tarjeta 3DS en Billetera (happy path)

| Campo | Valor |
| --- | --- |
| **ID** | TC-PAX-WALLET-ADD-3DS-HAPPY |
| **Feature** | PASSENGER / Wallet / Add card |
| **Módulo** | `billetera` |
| **Portal** | App Pax (Android) |
| **Ambiente** | TEST |
| **Tipo** | Positivo |
| **Prioridad** | P1 |
| **Flujo crítico** | Sí — bloqueante para crear viajes |
| **Estado** | Validado manualmente 2026-04-16 |

---

## User story
**Como** passenger autenticado
**Quiero** vincular una tarjeta con 3DS requerido a mi Billetera
**Para** poder pagar viajes desde la app sin fricción posterior.

## Caso de uso
UC-PAX-BILLETERA-ADD-CARD

## Precondiciones
1. App `com.magiis.app.test.passenger` v2.5.7 instalada en emulador/dispositivo Android.
2. Passenger logueado (`emanuel.restrepo@yopmail.com`).
3. Billetera vacía (`Aún no tienes Tarjetas para este País.`).
4. País de la cuenta: US (United States).
5. Acceso a tarjeta de prueba Stripe con 3DS requerido.

## Datos de prueba
| Campo | Valor |
| --- | --- |
| Tarjeta | `4000 0000 0000 3220` (3DS requerido) |
| MM/AA | `12/34` |
| CVC | `123` |
| Titular | `Emanuel Restrepo` |
| 3DS action | **COMPLETE** (autenticación exitosa) |

## Pasos

| # | Acción | Pantalla resultante | Selector canónico |
| --- | --- | --- | --- |
| 1 | Desde Home, abrir side menu y tap en **Billetera** | Lista Billetera vacía | `app-cards` / URL `https://localhost/cards` / `span:"Aún no tienes Tarjetas para este País."` |
| 2 | Tap botón **AGREGAR** | Modal `Nuevo método de pago` | `button.btn.primary` con texto `AGREGAR` / modal `ion-modal[id^="ion-overlay-"]` con `app-credit-card-payment-data` |
| 3 | Tap input número y escribir `4000 0000 0000 3220` | Emergen campos MM/AA, CVC, Titular | `ion-item.card-number.stripe-item` → `.StripeElement--focus.StripeElement--complete` |
| 4 | Ingresar `12/34` en MM/AA | Segundo Stripe element complete | 2° `ion-item.stripe-item` wrapper `stripe-element-small` |
| 5 | Ingresar `123` en CVC | Tercer Stripe element complete | 3° `ion-item.stripe-item` wrapper `stripe-element-small` |
| 6 | Ingresar titular `Emanuel Restrepo` | Botón GUARDAR habilitado | `input[placeholder="Nombre del Títular"]` / `ion-input[formcontrolname="cardholderName"]` |
| 7 | Tap **GUARDAR** | Aparece popup 3DS Visa | `button.btn.primary` con span `GUARDAR` |
| 8 | En popup Visa, tap **COMPLETE** | Popup cierra + modal cierra | Iframe Stripe (no accesible desde WebView) |
| 9 | Esperar render de Billetera | Tarjeta `VISA ...3220` visible en lista | `span:"VISA ...3220"` dentro de `app-cards` |

## Resultado esperado
- **Debería** cerrar modal "Nuevo método de pago" automáticamente al completar 3DS.
- **Debería** cerrar popup 3DS Visa.
- **Debería** listar la tarjeta `VISA ...3220` en la Billetera.
- **Debería** habilitar el swipe con íconos favorito + basurero sobre la tarjeta.
- **Debería** persistir la tarjeta tras refresh de la vista.

## Resultado obtenido (ejecución 2026-04-16)
Todos los assertions OK. Tarjeta guardada al primer intento.

## Evidencia
Ubicación: `evidence/manual-capture/pax-wallet-save-fail/`

| Step | Archivo |
| --- | --- |
| 01 | `step-01-home-2026-04-16T23-26-31-728Z.txt` |
| 02 | `step-02-profile-menu-2026-04-16T23-29-20-791Z.txt` |
| 03 | `step-03-wallet-list-2026-04-16T23-33-18-329Z.txt` |
| 04 | `step-04-add-card-empty-2026-04-16T23-36-21-429Z.txt` |
| 05 | `step-05-card-number-entered-2026-04-16T23-39-17-750Z.txt` |
| 06 | `step-06-expiry-entered-2026-04-16T23-40-49-676Z.txt` |
| 07 | `step-07-cvc-entered-2026-04-16T23-41-32-015Z.txt` |
| 08 | `step-08-form-complete-before-save-2026-04-16T23-43-50-498Z.txt` |
| 09 | `step-09-3ds-challenge-visible-2026-04-16T23-46-18-085Z.txt` |
| 10 | `step-10-post-3ds-complete-2026-04-16T23-49-02-740Z.txt` |

## Observaciones
- El popup 3DS de Visa corre en un iframe cross-origin de Stripe y **no es accesible** vía WebView de Appium. La automatización del COMPLETE/FAIL requiere switch a NATIVE_APP o uso directo de API Stripe.
- Para automatizar este flujo, `stripe.confirmCardSetup` puede quedar bloqueado por hCaptcha — usar tarjetas sin hCaptcha o backend mock.

## Trazabilidad
- TC fuente matriz: _(pendiente — vincular TS-PAX-WALLET-XX)_
- Screens Appium: `tests/mobile/appium/passenger/PassengerWalletScreen.ts`
- Doc relacionado: `docs/test-cases/mobile/TC-PAX-HOLD-STEPS.md` (flujo 1)
- Bug histórico: N/A (happy path estable)
