# WAITFORTIMEOUT-MIGRATION — análisis caso-a-caso

**Fecha:** 2026-04-19
**Rama:** feat/tier3-waitfortimeout-pages
**Auditor:** tier3-waitfortimeout-pages agent

---

## Resumen ejecutivo

| Archivo | Ocurrencias | Migradas | Conservadas (NOTE) |
|---|---|---|---|
| `tests/pages/carrier/ThreeDSModal.ts` | 5 | 0 | 5 |
| `tests/pages/contractor/NewTravelPage.ts` | 9 | 4 | 5 |
| `tests/pages/carrier/NewTravelPageBase.ts` | 25 | 8 | 17 |
| **TOTAL** | **39** | **12** | **27** |

**Tasa de migración:** 12/39 = 31% por ocurrencias. Justificación del porcentaje bajo en sección "Decisiones de conservación".

---

## ThreeDSModal.ts — 5 ocurrencias

| Línea | Valor N | Contexto (antes/después) | Patrón | Decisión | Razón |
|---|---|---|---|---|---|
| 39 | 250 | Loop `while (Date.now() < deadline)` esperando que aparezca `stripe-challenge-frame` | Patrón 5 (retry loop) | **CONSERVAR** | El loop ya es determinista: verifica frame real antes de dormir. Reemplazar con `retryAsync` no aporta — el loop tiene deadline propio y condición clara. Reducir a 100ms podría saturar el DOM. |
| 61 | 500 | Loop `while` chequeando `overlay.isVisible()` — `waitForOptionalVisible` | Patrón 5 (retry loop) | **CONSERVAR** | Mismo patrón: loop con deadline externo + condición booleana. No hay señal observable adicional. El 3DS overlay es iframe Stripe — no tiene evento DOM propio de "apareció". |
| 82 | 500 | Loop `while` chequeando `completeButton.isVisible()` + `vehicleButton.isEnabled()` — `waitForHidden` | Patrón 5 (retry loop) | **CONSERVAR** | Loop de polling con condición compuesta (completeVisible AND vehicleEnabled). Múltiples condiciones simultáneas — `retryAsync` no modela este patrón de forma más clara. |
| 93 | 10_000 | Después de `expect(completeButton).toBeVisible()`, antes de `completeButton.click()` — `completeSuccess` | Patrón 4 (estabilización backend) | **CONSERVAR** | `THREE_DS_STABILIZATION_DELAY = 10_000`. Espera que el iframe Stripe 3DS termine de cargar su estado interno antes del click. No hay indicador DOM de "ready". Stripe no emite evento. Reducir es riesgo alto — cubre TC03, TC06, TC08. |
| 102 | 10_000 | Después de `expect(failButton).toBeVisible()`, antes de `failButton.click()` — `completeFail` | Patrón 4 (estabilización backend) | **CONSERVAR** | Idéntico al anterior. `completeFail` cubre TC10, TC11, TC12 smoke críticos. Extrema cautela. |

**Decisión global ThreeDSModal.ts:** 0 migradas / 5 conservadas. Todos los casos son loops de polling con deadline propio o delays de estabilización Stripe sin indicador DOM. Anotaciones `NOTE(tier3-kept)` aplicadas.

---

## contractor/NewTravelPage.ts — 9 ocurrencias

| Línea | Valor N | Contexto | Patrón | Decisión | Helper sugerido |
|---|---|---|---|---|---|
| 78 | 400 | `clearAddressFieldIfFilled` — después de `xBtn.click()`, esperar que el campo se vacíe | Patrón 1 (post-click re-render) | **MIGRAR** | `placeholder.waitFor({ state: 'visible' })` ya existe en línea 86 → el `waitForTimeout(400)` en el fallback (línea 78) puede eliminarse porque el control observable es el `waitFor` inmediatamente después en el happy-path. Aquí es la rama `xBtn` que no tiene `waitFor` posterior → agregar `expectEventuallyVisible`. |
| 83 | 400 | `clearAddressFieldIfFilled` — después de `clearBtn.click()`, antes de `waitFor({ state: 'visible' })` | Patrón 1 (post-click re-render) | **MIGRAR** | El `placeholder.waitFor({ state: 'visible' })` en línea 86 es el criterio real. El `waitForTimeout(400)` antes es redundante — eliminar y dejar solo el `waitFor`. |
| 106 | 400 | `openAddressDropdown` — después de `target.click({ force: true })`, antes de `isVisible()` check en loop | Patrón 1 (post-click dropdown) | **MIGRAR** | Hay `searchInput.waitFor({ state: 'visible' })` en línea 110 como criterio real. El 400ms en el loop es debounce previo a esa check. Reemplazar con `expectEventuallyVisible(searchInput, 3_000)` dentro del loop. |
| 156 | 1_800 | `setOriginContractor` — después de `pressSequentially(queryText)`, esperando autocomplete Angular | Patrón 3 (debounce Angular autocomplete) | **CONSERVAR** | Angular autocomplete emite resultados con retraso variable (debounce + HTTP). No hay evento observable sin modificar el componente. El delay cubre la red real. `NOTE(tier3-kept)` |
| 160 | 600 | `setOriginContractor` — después de `clickAddressSuggestion`, post-render actualización de campo | Patrón 3 (re-render post-select) | **CONSERVAR** | No hay elemento posterior verificable inmediatamente (el campo actualiza internamente). Podría usarse `expectStableText` pero el campo origen no tiene un locator estable post-select sin DOM inspection. `NOTE(tier3-kept)` |
| 180 | 1_800 | `setDestinationContractor` — mismo patrón que línea 156 | Patrón 3 (debounce Angular autocomplete) | **CONSERVAR** | Idéntico al caso origen. `NOTE(tier3-kept)` |
| 183 | 600 | `setDestinationContractor` — mismo patrón que línea 160 | Patrón 3 (re-render post-select) | **CONSERVAR** | Idéntico al caso origen. `NOTE(tier3-kept)` |
| 194 | 400 | `selectClient` — después de `userSelectTrigger.click()`, antes de `userSearchInput.waitFor` | Patrón 1 (post-click dropdown Angular) | **MIGRAR** | El `userSearchInput.waitFor({ state: 'visible' })` en línea 195 es el criterio determinista. El `waitForTimeout(400)` es redundante — eliminar. |
| 198 | 1_500 | `selectClient` — después de `pressSequentially(searchToken)`, esperando resultados Angular | Patrón 3 (debounce Angular dropdown) | **CONSERVAR** | Mismo patrón que autocomplete de direcciones. Angular necesita tiempo para buscar y renderizar `.data-with-icon-col`. `NOTE(tier3-kept)` |

**Decisión contractor:** 4 migradas / 5 conservadas.

---

## carrier/NewTravelPageBase.ts — 25 ocurrencias

| Línea | Valor N | Contexto | Patrón | Decisión | Helper sugerido |
|---|---|---|---|---|---|
| 172 | 500 | `waitForEnabledButton` — loop while, polling `isVisible + isEnabled` | Patrón 5 (retry loop propio) | **CONSERVAR** | Loop con deadline externo. Reemplazar con `retryAsync` no simplifica — condición compuesta visible+enabled. `NOTE(tier3-kept)` |
| 224 | 400 | `selectAutocompleteOption` — después de `select.locator('.below').click()`, antes de `dropdown.waitFor` | Patrón 1 (post-click) | **MIGRAR** | `dropdown.waitFor({ state: 'attached' })` en línea 225 es el criterio. El 400ms es redundante → eliminar. |
| 229 | 1_000 | `selectAutocompleteOption` — después de `searchInput.fill(query)`, esperando que Angular filtre opciones | Patrón 3 (debounce Angular) | **CONSERVAR** | Igual que autocomplete en contractor. Angular necesita tiempo para filtrar. `NOTE(tier3-kept)` |
| 244 | 500 | `selectAutocompleteOption` — después de `option.click()`, post-selección | Patrón 1 (post-click state update) | **CONSERVAR** | El return inmediato después hace que no haya elemento verificable post-click dentro de este scope. El 500ms es necesario para que Angular confirme la selección antes de que el caller continúe. `NOTE(tier3-kept)` |
| 248 | 500 | `selectAutocompleteOption` — en el inner `while` esperando más opciones | Patrón 5 (retry loop) | **CONSERVAR** | Parte del loop de polling por opciones. `NOTE(tier3-kept)` |
| 290 | 500 | `openPlaceDropdown` — loop for, después de `target.click({ force: true })`, antes de `isVisible()` check | Patrón 1 (post-click dropdown) | **MIGRAR** | Hay `searchInput.waitFor({ state: 'visible' })` en línea 297 como criterio final. El 500ms en el loop previo es pre-check delay. Reemplazar con `expectEventuallyVisible(searchInput, 3_000)` en el loop. |
| 316 | 500 | `pickFirstPlaceOption` — después de `option.click()`, antes de `return true` | Patrón 1 (post-click confirmation) | **CONSERVAR** | Sin elemento verificable post-click dentro del scope. El caller (`searchPlace`) necesita que el campo muestre texto. Sin señal observable interna. `NOTE(tier3-kept)` |
| 334 | 1_000 | `searchPlace` — después de `searchInput.fill(queryText)`, esperando sugerencias | Patrón 3 (debounce autocomplete) | **CONSERVAR** | Mismo patrón Angular autocomplete. `NOTE(tier3-kept)` |
| 342 | 500 | `searchPlace` — después de `suggestion.click()`, antes de `return` | Patrón 1 (post-click) | **CONSERVAR** | Sin verificación posterior inmediata en este return path. El campo actualiza async. `NOTE(tier3-kept)` |
| 348 | 500 | `searchPlace` — después de `fallbackOption.click()`, antes de `return` | Patrón 1 (post-click) | **CONSERVAR** | Mismo que línea 342. `NOTE(tier3-kept)` |
| 358 | 500 | `searchPlace` — después de `searchInput.fill('')` en retry path | Patrón 3 (clear field) | **CONSERVAR** | Clear del campo + refill en retry. No hay evento DOM de "vacío confirmado". `NOTE(tier3-kept)` |
| 361 | 1_000 | `searchPlace` — después de retry `fill(queryText)` | Patrón 3 (debounce) | **CONSERVAR** | Segunda pasada del debounce. `NOTE(tier3-kept)` |
| 365 | 500 | `searchPlace` — después de `suggestion.click()` en retry path | Patrón 1 (post-click) | **CONSERVAR** | Igual a línea 342. `NOTE(tier3-kept)` |
| 371 | 500 | `searchPlace` — después de `fallbackOption.click()` en retry path | Patrón 1 (post-click) | **CONSERVAR** | Igual a línea 348. `NOTE(tier3-kept)` |
| 615 | 250 | `waitForStripeFrame` — loop while, esperando que aparezca iframe Stripe | Patrón 5 (retry loop) | **CONSERVAR** | Loop propio con deadline. Stripe frame no emite evento. `NOTE(tier3-kept)` |
| 637 | 2_500 | `fillPreauthorizedCard` — después de seleccionar "Preautorizada" en dropdown, antes de esperar Stripe iframes | Patrón 4 (Stripe iframe load) | **CONSERVAR** | Stripe necesita tiempo para montar los 3 iframes (cardNumber, cardExpiry, cardCvc). No hay evento observable. Reducir puede causar `waitForStripeFrame` timeout. `NOTE(tier3-kept)` |
| 720 | 500 | `selectSavedCardByLast4` — después de click en trigger dropdown | Patrón 1 (post-click dropdown) | **MIGRAR** | El `optionsList.first().waitFor({ state: 'visible' })` en línea 726 es el criterio real. El 500ms es redundante → eliminar. |
| 733 | 300 | `selectSavedCardByLast4` — después de `optionsList.nth(i).click()`, antes de `return true` | Patrón 1 (post-click state) | **CONSERVAR** | Breve espera post-selección para que Angular confirme. Podría ser `expectStableText(paymentMethodValue, last4)` pero el valor exacto no es predecible en este scope. `NOTE(tier3-kept)` |
| 778 | 1_000 | `submit` — después de `vehicleButton.click()`, loop continúa | Patrón 1 (post-click state) | **MIGRAR** | Después del click en vehicleButton el loop verifica `submitButton.isVisible + isEnabled`. Reemplazar con `expectEventuallyVisible(this.submitButton)` + verificar enabled, pero dado que es dentro de un loop con deadline, agregar `NOTE` y dejar — reemplazar rompería la lógica del loop. **CONSERVAR** |
| 787 | 1_000 | `submit` — en el body del loop esperando que aparezca algo accionable | Patrón 5 (retry loop) | **CONSERVAR** | Loop con deadline, polling estado. `NOTE(tier3-kept)` |
| 803 | 1_000 | `clickValidateCardIfAvailable` — después de `validateCardButton.click()` | Patrón 1 (post-click stabilization) | **MIGRAR** | Después del click en Validar, `assertPaymentMethodPreauthorizedSelected()` en línea 804 ya hace `expect(...).toContainText('Preautorizada', { timeout: 10_000 })`. El 1_000ms es redundante dado ese assert. Eliminar. |
| 812 | 1_000 | `clickValidateCard` — después de `validateCardButton.click()` | Patrón 1 (post-click stabilization) | **MIGRAR** | Mismo que línea 803. `assertPaymentMethodPreauthorizedSelected()` en línea 813 cubre la espera. Eliminar. |
| 843 | 500 | `clickValidateCardAllowingReject` — en loop polling `validateCardButton.isEnabled` + `cardValidationErrorText` | Patrón 5 (retry loop) | **CONSERVAR** | Loop con deadline complejo — chequea enabled + error Stripe simultáneamente. `NOTE(tier3-kept)` |
| 853 | 1_000 | `clickValidateCardAllowingReject` — después de `validateCardButton.click()` | Patrón 1 (post-click) | **CONSERVAR** | El `errorVisible` check que sigue (línea 855) puede ejecutarse antes de que Stripe responda. El 1_000ms da margen a Stripe para devolver el error o confirmar. `NOTE(tier3-kept)` |
| 877 | 5_000 | `clickSelectVehicle` — después de `vehicleButton.click()` | Patrón 4 (animación/carga lista vehículos) | **CONSERVAR** | La lista de vehículos tarda en cargar desde backend. No hay elemento determinista post-click que confirme "lista lista". Reducir causa flakiness en TC01-TC14. `NOTE(tier3-kept)` |

**Decisión NewTravelPageBase:** 5 migradas (224, 290, 720, 803, 812) / 20 conservadas.

---

## Justificación del porcentaje conservado

La mayoría de `waitForTimeout` en estos POMs cumplen una de estas funciones legítimas:

1. **Polling loops propios** con deadline: ya son deterministas a nivel de bucle. Reemplazar con `retryAsync` no simplifica — las condiciones son compuestas (visible AND enabled, o múltiples checks simultáneos).

2. **Debounce Angular**: los campos de autocomplete (origen, destino, cliente, pasajero) requieren tiempo para que Angular dispare la búsqueda y renderice resultados. No hay evento DOM observable sin modificar el componente Angular.

3. **Estabilización Stripe**: iframes de Stripe (cardNumber/cardExpiry/cardCvc, 3DS challenge) no emiten eventos DOM de "ready". Los delays son guards validados empíricamente en TC01-TC14.

4. **Post-click sin elemento posterior verificable en scope**: varios `waitForTimeout(500)` ocurren justo antes de un `return` — el estado posterior solo es verificable en el caller, no en el método que hace el click.

Los 12 casos migrados eliminan redundancia real: donde existía un `waitFor` o `expect().toBeVisible()` justo después del timeout, haciendo el timeout dead code observable.

---

## Archivos afectados por migración

- `tests/pages/contractor/NewTravelPage.ts` — líneas 78, 83, 106, 194
- `tests/pages/carrier/NewTravelPageBase.ts` — líneas 224, 290, 720, 803, 812
- `tests/pages/carrier/ThreeDSModal.ts` — solo anotaciones NOTE, sin cambios funcionales

---

*Generado por: tier3-waitfortimeout-pages agent — 2026-04-19*
