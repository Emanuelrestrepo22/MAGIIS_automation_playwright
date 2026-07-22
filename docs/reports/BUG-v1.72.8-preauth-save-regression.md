# BUG (regresión v1.72.8) — "Aplicar Pre-Autorización" no habilita "Guardar" ni persiste desde la UI

> Hallazgo del exploratory QA del 2026-07-20/21 durante el review de automatización de pagos (Stripe).
> **Bloque listo para pegar en Jira.** Confirmar con dev el flujo de guardado esperado en v1.72.8.

**Tipo:** Bug — Regresión de UI
**Módulo:** Carrier → Configuración → Preferencias Operativas → General → "Cobros con Tarjeta"
**Ambiente:** TEST — `https://apps-test.magiis.com` · versión **v1.72.8 / v1.72.8 B** · cuenta Remises EEUU (US1000, carrierId 1521)
**Severidad:** Alta (una preferencia de pagos no es editable desde la UI) · **Prioridad:** a criterio del equipo

## Pasos para reproducir (manual, front)
1. Login en el portal **Carrier** con un usuario dispatcher (ej. cuenta TEST *Remises EEUU*). URL: `https://apps-test.magiis.com`.
2. En el menú lateral, entrar a **Configuración → Preferencias Operativas** (EN: *Configuration → Operational Preferences*). URL: `#/home/carrier/settings/parameters`. Verás el título **"Configuración Parámetros"** (EN: *Preferences Config*).
3. Asegurarse de estar en el tab **"General"** (primer tab).
4. Bajar hasta el acordeón **"Cobros con Tarjeta"** (EN: *Credit Card Charges*) y **expandirlo** (click en el header).
5. Cambiar el toggle **"Aplicar Pre-Autorización"** (el único switch del acordeón). Probar en ambos sentidos: ON→OFF y OFF→ON. El switch **cambia visualmente** (se ve el toggle actualizado).
6. Mirar el botón **"Guardar"** (EN: *Save*), al pie de la pantalla, abajo a la derecha.

> Nota: el defecto se reproduce **con cualquier cambio** en ese toggle, en cualquier sentido, y en cualquier navegador (verificado en Chromium). No depende del idioma de la cuenta.

## Resultado esperado
Al cambiar el toggle, el botón **"Guardar"** se habilita; al guardar, se persiste `enableCreditCardHold` (y `ccHoldPreviousHs`/`ccHoldCoverage` cuando aplica).

## Resultado obtenido
- El botón **"Guardar" permanece deshabilitado** tras cambiar el toggle.
- **No se dispara ningún request de guardado** (0 POST/PUT observados en 12s); el cambio **no persiste** desde la UI.
- El acordeón **no tiene** botón de guardado propio.
- Verificado con múltiples formas de interacción (todas cambian el checkbox pero **ninguna habilita "Guardar"**):
  - click real de usuario sobre el switch,
  - `input.click()` nativo (JS),
  - `dispatchEvent('input')` + `dispatchEvent('change')`,
  - click sobre el `<span>` slider.
  - **click (force) sobre `label.switch span.switch-label`** (el elemento canónico del switch, box 40×24 visible): togglea el checkbox correctamente (true→false) pero **"Guardar" sigue deshabilitado** y no dispara guardado. → el defecto es la condición de habilitación/binding de "Guardar", independiente del elemento que se clickee.

## Dato que aísla el problema al frontend
El estado **sí se puede fijar por API** y **persiste**: `GET` + `POST` a `/magiis-v0.2/carriers/{carrierId}/parameters` (objeto completo con `enableCreditCardHold` modificado) devuelve 2xx y el `GET` posterior refleja el cambio. → El backend acepta y persiste; el defecto está en el **binding del formulario / condición de habilitación de "Guardar"** en la UI v1.72.8.

## Impacto
Un carrier **no puede activar/desactivar la pre-autorización de cobros con tarjeta** desde la UI. Config crítica de pagos (hold) no editable.

## Evidencia
- Screenshots: pantalla reestructurada (tabs + acordeones) con "Guardar" en gris; acordeón "Cobros con Tarjeta" con el toggle "Aplicar Pre-Autorización".
- Captura de red: solo `GET .../parameters` y `.../parameters/paymentMethodsConfig`; ningún request de guardado tras el toggle.

## Nota QA-automation
La suite de hold (`tests/features/gateway-pg/specs/stripe/web/carrier/hold/`) fue ajustada para **fijar el estado de hold por API** (`tests/features/gateway-pg/helpers/parameters-api.ts` · `setHoldViaApi`) como workaround, porque el guardado por UI no es reproducible en v1.72.8. Al resolverse este bug, revisar si conviene volver a cubrir el guardado por UI (o mantener el setup por API + un TC dedicado que valide el guardado desde la UI).

## Pregunta para dev
¿Cómo se persiste "Aplicar Pre-Autorización" en v1.72.8? ¿El botón "Guardar" debería habilitarse con este toggle, o el guardado migró a otro control/auto-save? (Confirmar antes de cerrar como bug vs. cambio de diseño.)
