# TC-PAX-WALLET-ADD-3DS-FAIL-RETRY — Agregar tarjeta con 3DS rechazado y reintento exitoso

| Campo | Valor |
| --- | --- |
| **ID** | TC-PAX-WALLET-ADD-3DS-FAIL-RETRY |
| **Feature** | PASSENGER / Wallet / Add card / 3DS error handling |
| **Módulo** | `billetera` |
| **Portal** | App Pax (Android) |
| **Ambiente** | TEST |
| **Tipo** | Negativo + recuperación |
| **Prioridad** | P1 |
| **Flujo crítico** | Sí — UX de error 3DS |
| **Estado** | Validado manualmente 2026-04-16 |

---

## User story
**Como** passenger
**Quiero** ver un mensaje claro si falla la autenticación 3DS
**Y** poder reintentar sin perder los datos ya ingresados
**Para** no tener que re-teclear toda la tarjeta tras un rechazo.

## Caso de uso
UC-PAX-BILLETERA-ADD-CARD-3DS-FAILED

## Precondiciones
1. App `com.magiis.app.test.passenger` v2.5.7.
2. Passenger logueado.
3. Billetera vacía.
4. País: US.

## Datos de prueba
| Campo | Valor |
| --- | --- |
| Tarjeta | `4000 0000 0000 3220` (3DS requerido) |
| MM/AA | `12/34` |
| CVC | `123` |
| Titular | `Emanuel Restrepo` |
| 3DS action (1er intento) | **FAIL** (rechazar autenticación) |
| 3DS action (2do intento) | **COMPLETE** |

## Pasos

| # | Acción | Resultado esperado | Selector canónico |
| --- | --- | --- | --- |
| 1 | Abrir Billetera y tap **AGREGAR** | Modal "Nuevo método de pago" | `app-credit-card-payment-data` en `ion-modal` |
| 2 | Llenar número, MM/AA, CVC, titular | Los 3 Stripe elements `--complete`, GUARDAR habilitado | _(ver TC-HAPPY)_ |
| 3 | Tap **GUARDAR** | Popup 3DS Visa aparece | `iframe` Stripe |
| 4 | En popup, tap **FAIL** | Popup cierra + aparece modal de error | — |
| 5 | Observar modal de error | Modal con título "Información Inválida", body descriptivo y botón "Reintentar" | `ion-modal[id="ion-overlay-38"]` / `app-confirm-modal` |
| 6 | Tap **Reintentar** | Modal error cierra, form "Nuevo método de pago" intacto con datos conservados | `button.btn.primary` texto `Reintentar` |
| 7 | Tap **GUARDAR** nuevamente | Popup 3DS aparece otra vez | `button.btn.primary` texto `GUARDAR` |
| 8 | En popup, tap **COMPLETE** | Popup cierra + modal form cierra + tarjeta en Billetera | — |
| 9 | Verificar lista Billetera | `VISA ...3220` visible | `span:"VISA ...3220"` |

## Resultado esperado
- **Debería** mostrar modal de error con título **"Información Inválida"**.
- **Debería** mostrar mensaje **"No podemos autenticar tu método de pago. Elige otro método de pago y vuelve a intentarlo."**
- **Debería** ofrecer un único CTA **"Reintentar"**.
- **Debería** mantener el formulario con datos cargados al cerrar el modal de error.
- **Debería** permitir disparar un nuevo intento 3DS con los mismos datos.
- **Debería** vincular la tarjeta al completar el 3DS exitosamente en el segundo intento.
- **Debería NO** crear un registro parcial en Billetera durante el fail (Billetera permanece vacía hasta el COMPLETE).

## Resultado obtenido (ejecución 2026-04-16)
Todos los assertions OK. Flujo de recuperación funciona como se espera.

## Evidencia
Ubicación: `evidence/manual-capture/pax-wallet-save-fail/`

| Step | Archivo |
| --- | --- |
| 15 | `step-15-wallet-empty-for-fail-scenario-2026-04-17T00-10-19-978Z.txt` |
| 16 | `step-16-3ds-fail-error-2026-04-17T00-15-19-768Z.txt` |
| 17 | `step-17-after-retry-tap-2026-04-17T00-22-10-143Z.txt` |
| 18 | `step-18-retry-complete-success-2026-04-17T00-28-06-715Z.txt` |

## Selectores canónicos del modal de error (nuevo hallazgo)

| Elemento | Selector |
| --- | --- |
| Modal wrapper | `ion-modal[id="ion-overlay-38"]` (id dinámico — preferir `app-confirm-modal`) |
| Host component | `app-confirm-modal.ion-page` |
| Título | `span:"Información Inválida"` |
| Mensaje | `span:"No podemos autenticar tu método de pago. Elige otro método de pago y vuelve a intentarlo."` |
| Botón CTA | `button.btn.primary` con span hijo `Reintentar` |

## Observaciones
- El popup Visa (FAIL/COMPLETE) es iframe Stripe cross-origin, no accesible desde WebView Appium. Para automatizar hace falta:
  - Switch a context `NATIVE_APP` y mapear por `resource-id` de Android.
  - O usar Stripe API mock que devuelva `requires_action: failed`.
- Al tap **Reintentar**, los campos Stripe **conservan los valores** ingresados — la app no los limpia.

## Trazabilidad
- TC fuente matriz: _(pendiente)_
- Screen Appium a actualizar: `PassengerWalletScreen.ts` → agregar método `handleAuth3dsFailAndRetry()` (ver propuesta en este PR).
- Relacionados: TC-PAX-WALLET-ADD-3DS-HAPPY
