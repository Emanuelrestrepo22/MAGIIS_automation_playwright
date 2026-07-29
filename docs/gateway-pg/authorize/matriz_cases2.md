e es AVS# Test Suite – Authorize.net · Parte 2: Wallet, Reembolsos, Voids, Stored Credentials y Recurring

> **Proyecto:** Automatización de pruebas – Integración Authorize.net (Playwright / Appium)
> **Alcance:** Wallet (vinculación / eliminación) · Refund · Void · Stored credentials reuse · Recurring billing · Edge cases Accept.js iframe
> **Stack:** Playwright + TypeScript (web) · Appium + WebdriverIO (mobile)
> **Estado:** DRAFT — TCs especificados, specs aún no implementados (depende BL-025 runtime).

> **Nota:** IDs continúan con el prefijo `TS-AUTHORIZE-TC` arrancando desde TC1201 para diferenciarlos de la matriz Parte 1 (TC1001-TC1130 aprox).

---

## 1. Portal Contractor – Alta de Tarjetas y Vinculación

Espeja la sección 1 de `docs/gateway-pg/stripe/matriz_cases2.md`. El portal Contractor en MAGIIS permite al admin de la empresa vincular tarjetas para sus colaboradores y darlas de alta como medios de pago para futuros viajes.

### 1.1 Colaborador de Contractor – Tarjeta Preautorizada sin antifraude

| ID                  | Descripción                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1201 | Validar vinculación de tarjeta y Alta de Viaje desde portal contractor para usuario colaborador con tarjeta preautorizada exitosa Hold ON   |
| TS-AUTHORIZE-TC1202 | Validar vinculación de tarjeta y Alta de Viaje desde portal contractor para usuario colaborador con tarjeta preautorizada exitosa Hold OFF  |
| TS-AUTHORIZE-TC1203 | Validar selección de tarjeta vinculada y Alta de Viaje desde portal contractor para colaborador Hold ON                                     |
| TS-AUTHORIZE-TC1204 | Validar selección de tarjeta vinculada y Alta de Viaje desde portal contractor para colaborador Hold OFF                                    |

### 1.2 Colaborador de Contractor – Tarjetas con fallo de pago

| ID                  | Descripción                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1205 | Validar Alta de Viaje desde portal contractor para usuario colaborador con **tarjeta declinada genérica (ZIP 46282)** Hold ON — hold authorize rechaza, error visible, viaje no creado |
| TS-AUTHORIZE-TC1206 | Validar Alta de Viaje desde portal contractor para usuario colaborador con **CVV mismatch (CVV 901)** Hold ON — política MAGIIS define si rechaza o solo flaggea |

> **Equivalente Stripe:** `TS-STRIPE-P2-TC001..TC006` (sin 3DS), `TS-STRIPE-P2-TC090` (decline generic).

---

## 2. Wallet – Eliminación y validación de tarjeta vinculada

### 2.1 Eliminación desde App Pax (Personal)

| ID                  | Descripción                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1221 | Validar eliminar satisfactoriamente desde wallet tarjeta previamente vinculada desde app pax para usuario personal — `deleteCustomerPaymentProfile` retorna OK; UI ya no muestra la tarjeta |
| TS-AUTHORIZE-TC1222 | Validar eliminar tarjeta desde wallet con cancelación en pop-up de confirmación — la tarjeta permanece vinculada                              |

> **Equivalente Stripe:** `TS-STRIPE-TC1122` (wallet remove con tarjeta 3DS). Authorize no tiene equivalente "tarjeta 3DS vinculada" — se elimina cualquier tarjeta vinculada genéricamente.

### 2.2 Validación de tarjeta nueva (Accept.js iframe / shared form)

| ID                  | Descripción                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1223 | Validar vinculación de tarjeta nueva desde wallet con datos válidos (Visa 4111…1111 + CVV 900 + ZIP 90210) — Authorize devuelve `customerProfileId` + `paymentProfileId`; tarjeta aparece en wallet |
| TS-AUTHORIZE-TC1224 | Validar vinculación de tarjeta nueva desde wallet con CVV mismatch (CVV 901) — error visible, tarjeta NO se agrega al wallet                  |
| TS-AUTHORIZE-TC1225 | Validar vinculación de tarjeta nueva desde wallet con AVS no match (ZIP 46205) — política antifraude MAGIIS define si acepta o rechaza        |
| TS-AUTHORIZE-TC1226 | Validar vinculación de tarjeta nueva desde wallet con expiry pasado — error de validación cliente (front-end) antes de llamar a Authorize    |
| TS-AUTHORIZE-TC1227 | Validar vinculación de tarjeta nueva desde wallet con número inválido (Luhn check fail) — error de validación cliente                         |

> **TODO BL-025 runtime:** confirmar si MAGIIS hace pre-validación cliente con Luhn algorithm o delega 100% a Authorize. La doc oficial recomienda pre-validar para reducir latencia.

---

## 3. Stored Credentials – Reuso de `networkTransId`

Authorize.net soporta "credit on file" tokenizando tarjetas en Customer Profiles + reutilizando `networkTransId` para cobros recurrentes.

### 3.1 Primer cobro + persistencia de `networkTransId`

| ID                  | Descripción                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1241 | Validar que el primer cobro exitoso con tarjeta nueva devuelve `networkTransId` en la respuesta y MAGIIS backend lo persiste en DB asociado al `paymentProfileId` |
| TS-AUTHORIZE-TC1242 | Validar que MAGIIS backend almacena: `customerProfileId`, `paymentProfileId`, `networkTransId`, `last4`, `expiry`, `brand` en DB             |

### 3.2 Segundo cobro reusando stored credentials

| ID                  | Descripción                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1243 | Validar Alta de Viaje desde carrier reutilizando tarjeta vinculada (stored) — request a Authorize incluye `processingOptions.isSubsequentAuth=true` + `subsequentAuthInformation.originalNetworkTransId` |
| TS-AUTHORIZE-TC1244 | Validar Alta de Viaje desde carrier con stored credentials Hold ON — `authOnlyTransaction` con `customerProfileId`/`paymentProfileId`; aprobado |
| TS-AUTHORIZE-TC1245 | Validar Alta de Viaje desde carrier con stored credentials Hold OFF — `authCaptureTransaction` con stored creds; aprobado                  |

### 3.3 Edge cases stored credentials

| ID                  | Descripción                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1246 | Validar comportamiento al intentar reusar `networkTransId` de una tarjeta eliminada del wallet — Authorize debería rechazar; backend MAGIIS debería detectar y fallar antes de enviar |
| TS-AUTHORIZE-TC1247 | Validar comportamiento al usar `customerProfileId` huérfano (sin `paymentProfileId` asociado válido) — error de validación pre-request       |

> **Decisión de implementación pendiente:** confirmar con backend MAGIIS si el flujo "Usar tarjeta vinculada existente" del UI actualmente persiste y reusa `networkTransId` o si genera una nueva auth cada vez. Implicancia para PCI y consistencia con Stripe.

---

## 4. Refunds (post-settlement)

Refund solo viable después de que la transacción se settle (típicamente 24h después de la capture). Para tests automatizados, el sandbox **no espera el ciclo de settlement real** — Authorize permite emitir refund inmediato sobre transacciones marked as settled en el dashboard.

| ID                  | Descripción                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1261 | Validar reembolso completo desde portal carrier de viaje finalizado y settled — `refundTransaction` con `refTransId` + tarjeta truncada + amount completo; Response Code 1 |
| TS-AUTHORIZE-TC1262 | Validar reembolso parcial desde portal carrier de viaje finalizado — `refundTransaction` con `amount` parcial; saldo restante en customer profile |
| TS-AUTHORIZE-TC1263 | Validar reembolso de transacción NO settled (en estado authorized o captured pero sin settle) — Authorize rechaza con error `E00027` o similar; UI debe mostrar mensaje claro |
| TS-AUTHORIZE-TC1264 | Validar reembolso con `refTransId` inválido o de otra cuenta — Authorize rechaza; UI muestra error                                          |
| TS-AUTHORIZE-TC1265 | Validar multiple refunds parciales sobre la misma transacción hasta agotar el monto autorizado — el último debe success, el siguiente fallar |

> **Equivalente Stripe:** Stripe permite refund inmediato post-capture (no requiere settle). Authorize requiere settle previo — comportamiento divergente que impacta UX si el dispatcher quiere reembolsar el mismo día.

---

## 5. Voids (pre-settlement)

Void cancela una transacción autorizada o capturada **antes** del settlement. Es diferente de Refund (que ya pasó por el banco).

| ID                  | Descripción                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1271 | Validar void de transacción authorized (hold) desde portal carrier — `voidTransaction` con `refTransId`; viaje pasa a `CANCELLED`, fondos liberados |
| TS-AUTHORIZE-TC1272 | Validar void de transacción captured pero no settled desde portal carrier — `voidTransaction` exitoso (Authorize permite voidear pre-settle) |
| TS-AUTHORIZE-TC1273 | Validar void de transacción ya settled — Authorize rechaza con `E00027` (debe usarse refund); UI debe enrutar a flujo refund automáticamente |
| TS-AUTHORIZE-TC1274 | Validar void con `refTransId` inválido — Authorize rechaza; UI muestra error                                                              |

> **Equivalente Stripe:** `paymentIntents.cancel()` para PaymentIntent no captured. Stripe no expone "void post-capture" antes de settle porque el flujo de capture en Stripe ya implica intent de settle inmediato.

---

## 6. Recurring Billing (subscriptions) — Scope opcional

Authorize.net soporta subscriptions vía Automated Recurring Billing (ARB). MAGIIS no tiene viajes recurrentes habilitados por defecto, pero la API expone:

- `ARBCreateSubscription`
- `ARBGetSubscription`
- `ARBUpdateSubscription`
- `ARBCancelSubscription`
- `ARBGetSubscriptionList`

| ID                  | Descripción                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1281 | Validar creación de viaje recurrente desde portal carrier — `ARBCreateSubscription` con `paymentSchedule.interval` (monthly/weekly); aprobado |
| TS-AUTHORIZE-TC1282 | Validar consulta de subscription activa — `ARBGetSubscription` retorna estado `active` + próximo cobro                                       |
| TS-AUTHORIZE-TC1283 | Validar cancelación de viaje recurrente — `ARBCancelSubscription`; UI marca como `terminated`                                                |
| TS-AUTHORIZE-TC1284 | Validar fallo en cobro recurrente (CVV mismatch en pago renovación) — subscription queda en estado `suspended`; usuario debe actualizar tarjeta |

> **Equivalente Stripe:** Subscriptions Stripe (`subscriptions.create`). Si MAGIIS no tiene viajes recurrentes en producción, este bloque queda como **scope futuro**.

---

## 7. Accept.js iframe — Edge cases de UI

> Asume integración via Accept.js (modelo más probable según `ARCHITECTURE.md` §2.1).

| ID                  | Descripción                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1291 | Validar carga del iframe Accept.js desde `https://jstest.authorize.net/v1/Accept.js` — `window.Accept` queda disponible en el contexto del iframe; selector del iframe debe ser estable |
| TS-AUTHORIZE-TC1292 | Validar fallo de carga del iframe Accept.js (network offline o bloqueo CSP) — UI muestra fallback de error claro                            |
| TS-AUTHORIZE-TC1293 | Validar respuesta `Accept.dispatchData` con `opaqueData.dataValue` (nonce) — backend MAGIIS lo recibe y procesa la transacción              |
| TS-AUTHORIZE-TC1294 | Validar respuesta de `Accept.dispatchData` con error de validación cliente (E_WC_05 invalid CC number) — UI muestra error inline en el form |

**TODO POM:** los selectores del iframe Accept.js no están documentados todavía. Pendiente sesión de Accept.js Inspector / DOM dump con QA + dev para mapear:
- iframe locator
- input number (`[name=number]` o equivalente)
- input expiry, cvc, zip
- submit button
- error message containers

> **Equivalente Stripe Elements:** `getStripeIframe(page, '<frame_name>')` + locators internos. Si el patrón Authorize Accept.js es similar (iframe + DOM interno controlable), reutilizar el helper `tests/pages/carrier/GatewayPgCardLinkingPage.ts` con un branch específico Authorize.

---

## 8. E2E híbridos Authorize – Carrier Web + Driver App (Flow 1 equivalente)

> Depende de runtime Authorize POM + backend MAGIIS routeando Authorize a la Driver App + screens Driver Appium maduros.

| ID                  | Descripción                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1301 | Flow 1 Authorize: Carrier crea viaje con Hold ON tarjeta Authorize exitosa → Driver acepta viaje → Driver simula ruta → Driver finaliza viaje → backend dispara `priorAuthCaptureTransaction` → `payment-validated` |
| TS-AUTHORIZE-TC1302 | Flow 1 Authorize: Carrier crea viaje con Hold ON tarjeta declinada (ZIP 46282) → viaje queda en `NO_AUTORIZADO`, Driver App NO recibe solicitud |
| TS-AUTHORIZE-TC1303 | Flow 1 Authorize: Carrier crea viaje con Hold OFF (cargo a bordo) → Driver acepta + finaliza → `authCaptureTransaction` directo al cierre   |

---

## 9. E2E híbridos Authorize – Passenger App + Driver App (Flow 2 equivalente)

> Depende de runtime Authorize POM mobile + screens Passenger Appium maduros.

| ID                  | Descripción                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1311 | Flow 2 Authorize: Passenger vincula tarjeta Authorize desde wallet mobile → crea viaje desde Passenger App → Driver acepta + finaliza → `priorAuthCaptureTransaction` exitoso |
| TS-AUTHORIZE-TC1312 | Flow 2 Authorize: Passenger intenta crear viaje con tarjeta declinada (ZIP 46282) — error visible en app, viaje no se crea                  |

---

## 10. Fraud Management — Held for Review (Response Code 4)

Authorize.net puede marcar transacciones como `Held for Review` cuando dispara reglas antifraude del merchant. Estado `4` en `transactionResponse.responseCode`.

| ID                  | Descripción                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1321 | Validar Alta de Viaje desde carrier que dispara fraud rule (configurada en Merchant Interface sandbox) → Response Code 4 → viaje queda en estado pendiente review en MAGIIS |
| TS-AUTHORIZE-TC1322 | Validar approve manual desde admin MAGIIS de transacción Held — `updateHeldTransactionRequest` con `action=approve`; viaje pasa a `SEARCHING_DRIVER` |
| TS-AUTHORIZE-TC1323 | Validar decline manual desde admin MAGIIS de transacción Held — `updateHeldTransactionRequest` con `action=decline`; viaje pasa a `NO_AUTORIZADO` |

> **TODO líder:** confirmar si MAGIIS configura fraud rules en el Merchant Interface y cómo expone el "review" en su UI admin. Sin esto, los TC 1321-1323 quedan **out of scope**.

---

## 11. Flujo Quote – Alta de Viaje

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-AUTHORIZE-TC1200 | Validar Alta de Viaje desde Quote para usuario sin datos filiatorios vinculado a pasajero existente con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC009` |
| TS-AUTHORIZE-TC1207 | Validar Alta de Viaje desde Quote para usuario sin datos filiatorios vinculado a pasajero existente con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC010` |
| TS-AUTHORIZE-TC1208 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario colaborador existente con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC011` |
| TS-AUTHORIZE-TC1209 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario colaborador existente con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC012` |
| TS-AUTHORIZE-TC1210 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario colaborador existente con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC013` |
| TS-AUTHORIZE-TC1211 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario colaborador existente con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC014` |
| TS-AUTHORIZE-TC1212 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario personal existente con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC019` |
| TS-AUTHORIZE-TC1213 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario personal existente con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC020` |
| TS-AUTHORIZE-TC1214 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario personal existente con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC021` |
| TS-AUTHORIZE-TC1215 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario personal existente con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC022` |
| TS-AUTHORIZE-TC1216 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario empresa individuo existente con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC027` |
| TS-AUTHORIZE-TC1217 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario empresa individuo existente con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC028` |
| TS-AUTHORIZE-TC1218 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario empresa individuo existente con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC029` |
| TS-AUTHORIZE-TC1219 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario empresa individuo existente con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC030` |

---

## 12. Viajes Recurrentes – Portal Contractor (Usuario Colaboradores)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-AUTHORIZE-TC1220 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC035` |
| TS-AUTHORIZE-TC1228 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC036` |
| TS-AUTHORIZE-TC1229 | Validar selección de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC037` |
| TS-AUTHORIZE-TC1230 | Validar selección de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC038` |

---

## 13. Viajes Recurrentes – Portal Carrier (Usuario Colaboradores)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-AUTHORIZE-TC1231 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC041` |
| TS-AUTHORIZE-TC1232 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC042` |
| TS-AUTHORIZE-TC1233 | Validar selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC043` |
| TS-AUTHORIZE-TC1234 | Validar selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC044` |
| TS-AUTHORIZE-TC1235 | Validar vinculación y alta de viaje Recurrente desde carrier para usuario colaborador con tarjeta preautorizada y edición de fechas – validar consistencia de datos y finalización desde App Driver (CASO CRÍTICO) | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC047` |

---

## 14. Viajes Recurrentes – Portal Carrier (Usuario Personal)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-AUTHORIZE-TC1236 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario personal con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC048` |
| TS-AUTHORIZE-TC1237 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario personal con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC049` |
| TS-AUTHORIZE-TC1238 | Validar selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario personal con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC050` |
| TS-AUTHORIZE-TC1239 | Validar selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario personal con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC051` |

---

## 15. Viajes Recurrentes – Portal Carrier (Usuario Empresa Individuo)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-AUTHORIZE-TC1240 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC054` |
| TS-AUTHORIZE-TC1248 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC055` |
| TS-AUTHORIZE-TC1249 | Validar selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC056` |
| TS-AUTHORIZE-TC1250 | Validar selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC057` |

---

## 16. Reactivación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-AUTHORIZE-TC1251 | Validar Reactivación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Vincular tarjeta nueva | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC060` |
| TS-AUTHORIZE-TC1252 | Validar Reactivación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Vincular tarjeta nueva | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC061` |
| TS-AUTHORIZE-TC1253 | Validar Reactivación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Usar tarjeta vinculada existente | `AUTHORIZE_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC062` |
| TS-AUTHORIZE-TC1254 | Validar Reactivación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Usar tarjeta vinculada existente | `AUTHORIZE_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC063` |

---

## 17. Clonación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-AUTHORIZE-TC1255 | Validar Clonación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Vincular tarjeta nueva | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC066` |
| TS-AUTHORIZE-TC1256 | Validar Clonación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Vincular tarjeta nueva | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC067` |
| TS-AUTHORIZE-TC1257 | Validar Clonación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Usar tarjeta vinculada existente | `AUTHORIZE_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC068` |
| TS-AUTHORIZE-TC1258 | Validar Clonación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Usar tarjeta vinculada existente | `AUTHORIZE_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC069` |

---

## 18. Clonación de Viajes Finalizados (desde Carrier – Usuario Empresa Individuo)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-AUTHORIZE-TC1259 | Validar Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Vincular tarjeta nueva | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC072` |
| TS-AUTHORIZE-TC1260 | Validar Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Vincular tarjeta nueva | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC073` |
| TS-AUTHORIZE-TC1266 | Validar Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Usar tarjeta vinculada existente | `AUTHORIZE_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC074` |
| TS-AUTHORIZE-TC1267 | Validar Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Usar tarjeta vinculada existente | `AUTHORIZE_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC075` |

---

## 19. Edición de Viajes Programados (desde Carrier – Usuario Empresa Individuo)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-AUTHORIZE-TC1268 | Validar Alta de viaje y edición desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Vincular tarjeta nueva | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC078` |
| TS-AUTHORIZE-TC1269 | Validar Alta de viaje y edición desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Vincular tarjeta nueva | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC079` |
| TS-AUTHORIZE-TC1270 | Validar Alta de viaje y edición desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Usar tarjeta vinculada existente | `AUTHORIZE_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC080` |
| TS-AUTHORIZE-TC1275 | Validar Alta de viaje y edición desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Usar tarjeta vinculada existente | `AUTHORIZE_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC081` |

---

## 20. Edición en Conflicto (desde Carrier – Usuario Empresa Individuo)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-AUTHORIZE-TC1276 | Validar Alta de viaje y edición en conflicto desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Vincular tarjeta nueva | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC084` |
| TS-AUTHORIZE-TC1277 | Validar Alta de viaje y edición en conflicto desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Vincular tarjeta nueva | `AUTHORIZE_CARDS.SUCCESS` | `TS-STRIPE-P2-TC085` |
| TS-AUTHORIZE-TC1278 | Validar Alta de viaje y edición en conflicto desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Usar tarjeta vinculada existente | `AUTHORIZE_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC086` |
| TS-AUTHORIZE-TC1279 | Validar Alta de viaje y edición en conflicto desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Usar tarjeta vinculada existente | `AUTHORIZE_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC087` |

---

## 21. Trazabilidad cruzada

Ver [`TRACEABILITY.md`](./TRACEABILITY.md) para:
- Mapping bidireccional TC Stripe ↔ TC Authorize.
- TCs Stripe que **NO migran** a Authorize (3DS, decline-capture, Radar antifraud).
- TCs Authorize **exclusivos** (AVS granular, partial, prepaid, ARB, Held for Review).

---

*Documento generado siguiendo el patrón `docs/gateway-pg/stripe/matriz_cases2.md`.*
*Fecha: 2026-05-13 | Automatización: Playwright + Appium (DRAFT, depende BL-025 runtime)*
