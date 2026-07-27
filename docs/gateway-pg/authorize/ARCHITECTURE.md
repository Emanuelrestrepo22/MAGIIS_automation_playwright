# Gateway PG Authorize.net Architecture

> **STATUS:** DRAFT — documentación lista, runtime POM pendiente (BL-025 🟡).
> **Effective date:** 2026-05-13
> **Source matrix:** [`matriz_cases.md`](./matriz_cases.md) + [`matriz_cases2.md`](./matriz_cases2.md)
> **Stack:** Playwright + TypeScript (web) · Appium + WebdriverIO (mobile, futuro)
> **Trazabilidad y propagación de cambios:** [`TRACEABILITY.md`](./TRACEABILITY.md) — obligatorio leer antes de editar matrices.

## Canonical map (enforced)

- Test case source of truth (planeado): `tests/features/gateway-pg/specs/authorize/**` (slot reservado).
- Canonical web POMs compartidos: `tests/pages/shared/**` y `tests/pages/carrier/**` (Authorize debería reutilizarlos si el form es el shared card form de MAGIIS).
- Canonical gateway data (SoT real): `tests/fixtures/gateways/authorize/**` — `cards.ts`, `card-policy.ts`, `card-resolver.ts`.
- Feature-level helpers/fixtures/context: `tests/features/gateway-pg/{helpers,fixtures,context}/**` (compartidos con Stripe).
- Adapter declarativo: `tests/features/gateway-pg/helpers/adapters/authorizeGatewayAdapter.ts` (`requires3ds: false`).

## Rules to avoid ambiguity

1. Si un comportamiento difiere entre Stripe y Authorize, **documentar la diferencia acá** antes de ramificar código.
2. Si el path canónico de este documento conflictúa con la realidad del repo, **gana la realidad + `CLAUDE.md` raíz**.
3. Cualquier TC nuevo Authorize debe nacer en [`matriz_cases.md`](./matriz_cases.md) con ID `TS-AUTHORIZE-TCxxxx` **antes** de aparecer en `normalized-test-cases.json` o specs.
4. Authorize.net **no expone 3DS** en el sandbox MAGIIS — no escribir specs `*3ds*` para este gateway sin evidencia documentada.
5. Toda card test Authorize debe consumirse vía `tests/fixtures/gateways/authorize/card-policy.ts` (namespace `AUTHORIZE_CARDS`), nunca hardcodear el número en el spec.

---

## 1. Propósito del gateway en MAGIIS

Authorize.net es un **gateway secundario** del ecosistema de pagos MAGIIS. Su rol propuesto es:

| Portal | Uso de Authorize.net | Estado |
| --- | --- | --- |
| **Carrier (web)** | Alta de viaje con tarjeta preautorizada · Cargo a Bordo · Wallet vinculación | Planeado — depende BL-025 |
| **Contractor (web)** | Vinculación de tarjeta del colaborador · Alta de viaje | Planeado — depende BL-025 |
| **App Pax (Android)** | Wallet add-card · creación de viaje · cobro en finalización | Planeado — depende BL-025 + Appium maduro |
| **E2E híbrido (Flow 1: Carrier+Driver / Flow 2: Pax+Driver)** | Hold desde web/pax → capture desde driver | Planeado — depende BL-025 + screens Appium |

**Comparación con Stripe:** Stripe es el gateway de referencia (cobertura completa P1). Authorize.net **mismo flow funcional** (`Hold → Capture`) pero **distintos triggers** (CVV/ZIP en vez de número) y **sin 3DS**. La capa de orquestación es la misma; sólo cambian los datos de tarjeta y algunas validaciones específicas del response code.

---

## 1.bis Switching de pasarela (modelo exclusivo MAGIIS) — CRÍTICO

> **Aprendizaje incorporado 2026-05-13** (sesión Erika): MAGIIS opera con **una sola pasarela activa por vez a nivel global**. Para habilitar Authorize, primero hay que **desvincular Stripe** y luego vincular Authorize. NO es un toggle por usuario ni por viaje — afecta a todo el sistema.

### Implicaciones operativas

| Implicación | Detalle |
| --- | --- |
| **Tests Stripe vs Authorize NO concurrentes** | No se pueden correr suites de ambos gateways contra el mismo ambiente al mismo tiempo. Serializar o usar ambientes separados (`.env.test-stripe` vs `.env.test-authorize`). |
| **Switching como precondición** | Cada vez que cambia el gateway activo, hay un flujo administrativo previo. Documentado en `BL-037` del backlog. |
| **Side effect en tarjetas vinculadas** | TODO confirmar con backend: las tarjetas guardadas en wallet bajo Stripe ¿quedan inválidas al switchear? ¿se purgan? ¿se migran como tokens externos? |
| **Side effect en transacciones pendientes** | TODO confirmar: viajes en estado `SEARCHING_DRIVER` o con `Hold` activo al momento del switching ¿qué pasa con el capture posterior? |
| **Reset entre suites** | El primer paso de la suite Authorize debe garantizar que el gateway activo es Authorize. Si no, falla rápido con error explícito antes de gastar tiempo en specs. |

### Estrategia de tests sugerida

1. **Suite `@gateway-switching`** dedicada: smoke crítico operacional. Valida los 2 sentidos (Stripe → Authorize → Stripe) + side effects (wallet, transacciones pendientes).
2. **Precondición de suite Authorize**: helper `ensureActiveGateway('authorize')` al `test.beforeAll()` de cada suite. Si el gateway activo no es Authorize, lanza con instrucción manual de qué setear.
3. **Marker `@requires-gateway-switch`** para los tests que ejercitan el flujo de cambio.
4. **CI/runner**: cuando exista ambiente para multi-gateway, evaluar split de jobs por gateway. Hoy `pnpm pp` local + `workflow_dispatch` cubre (BL-035 desactivó CI automático).

### Captura del flujo de switching — pendiente runtime

Para automatizar el switching hay que conocer su flujo real (panel admin, secuencia de clicks, side effects observables). Hoy NO conocemos:

- URL del panel de switching
- Selectores estables (botones, dropdowns, confirmaciones)
- Mensajes de éxito/error
- Tiempo de propagación del cambio en el sistema

**Plan de captura** (referenciado por `BL-037`):

```bash
# Vos, con sandbox admin login activo:
npx playwright codegen <URL_PANEL_ADMIN_SWITCHING>
# Click a click el flujo:
#   1. Login admin
#   2. Navegar a configuración de pasarela
#   3. Desvincular Stripe (capturar el modal de confirmación si lo hay)
#   4. Vincular Authorize (capturar los inputs API_LOGIN_ID + TRANSACTION_KEY)
#   5. Confirmar el cambio y validar el indicador visual del estado
# Pegar el spec generado en tests/features/gateway-pg/specs/authorize/admin/gateway-switching.spec.ts
```

Después yo te ayudo a estabilizar selectores (`getByRole` / `getByTestId`), parametrizar credenciales con `fixtures/users/admin` (a crear) y agregar las assertions críticas.

---

## 2. Modelo de integración

Authorize.net ofrece tres modelos de integración. **MAGIIS aún no confirma cuál usa** (ver [`EXTERNAL-BLOCKERS.md`](./EXTERNAL-BLOCKERS.md) §3). Las opciones, ordenadas por probabilidad:

### 2.1 Accept.js (probable)

Form iframe-based del lado cliente — análogo a Stripe Elements. El frontend MAGIIS embebe el iframe de Authorize.net, el cliente captura los datos sensibles y devuelve un `payment nonce` al backend.

- **Endpoint cliente:** `https://js.authorize.net/v1/Accept.js`
- **Función expuesta:** `Accept.dispatchData(secureData, callback)`
- **Output:** `opaqueData.dataDescriptor` + `opaqueData.dataValue` (el nonce que el backend usa para crear la transacción).
- **Ventaja:** PCI scope reducido (los datos nunca tocan el servidor MAGIIS).
- **Probabilidad MAGIIS:** **ALTA** — es el patrón equivalente a Stripe Elements, ya usado por la arquitectura web de MAGIIS.

### 2.2 Accept Hosted (posible)

Redirect a una página alojada por Authorize.net donde el usuario completa los datos. Después de pagar, Authorize redirige de vuelta al portal.

- **Ventaja:** PCI scope mínimo, formulario lo mantiene Authorize.
- **Desventaja:** UX rota (deja la SPA de MAGIIS).
- **Probabilidad MAGIIS:** **BAJA** — rompe el patrón actual del wallet.

### 2.3 API directa via backend (posible)

El backend MAGIIS recibe los datos de tarjeta en claro y los envía a Authorize.net. Requiere certificación PCI nivel 1.

- **Probabilidad MAGIIS:** **BAJA** — el backend actual no parece certificado para recibir PAN en claro.

> **TODO BL-025 §3:** confirmar el modelo con backend MAGIIS. Si es Accept.js, el POM se parece al de Stripe Elements pero apuntando al iframe de Authorize. Si es API directa, el form puede ser el shared card form de MAGIIS sin iframe — más simple para Playwright.

---

## 3. Diferencias arquitectónicas vs Stripe

Esta sección es **crítica** para entender qué se puede reutilizar y qué no.

| Aspecto | Stripe | Authorize.net |
| --- | --- | --- |
| **Trigger del outcome** | El **número de tarjeta** determina el resultado (`4242` happy, `9235` fail3DS, `9995` decline-capture) | La **combinación (CVV, ZIP)** sobre tarjetas fijas (Visa `4111…1111`, MC `5424…0015`, Amex `370…002`, Discover `6011…0012`) |
| **Diversidad de números** | 10+ números distintos, uno por outcome | 1 número por marca; todos los outcomes vienen del trigger CVV/ZIP |
| **3D Secure** | Sí — modal `requires_action`, challenge frame, retry | **No** — el sandbox no soporta 3DS nativo; el flujo legacy `cardholderAuthentication` está deprecated |
| **Operación de Hold** | `PaymentIntent` con `capture_method: 'manual'` → status `requires_capture` | `authOnlyTransaction` — devuelve `transactionId` que se usa para capturar después |
| **Operación de Capture** | `paymentIntents.capture(intent_id)` → status `succeeded` | `priorAuthCaptureTransaction(refTransId)` |
| **Decline en capture** | Soportado (`9995` insufficient funds en capture) | **No soportado** en sandbox — el decline solo ocurre en auth |
| **Tipos de response** | Status string (`succeeded`, `requires_action`, `requires_payment_method`) | Response Code numérico: `1` Approved · `2` Declined · `3` Error · `4` Held for Review |
| **Stored credentials** | `payment_method` + `customer.id` con `setup_future_usage` | `networkTransId` de la primera transacción + `subsequentAuthInformation.originalNetworkTransId` en la siguiente |
| **Antifraude** | Radar with Rules — declines tipo `cvc_check`, `risk_threshold`, `card_velocity_exceeded` | AVS + CVV checks nativos; sin Radar equivalente |
| **Cancelación pre-settlement** | `paymentIntents.cancel` | `voidTransaction` |
| **Reembolso** | `refunds.create` | `refundTransaction` |
| **Adapter `requires3ds`** | `true` | **`false`** |
| **Intent canónicos soportados** | 6/6 (HAPPY_NO_AUTH, HAPPY_AUTH, FAIL_AUTH, DECLINE_AUTHORIZE, DECLINE_CAPTURE, DECLINE_INVALID_CVC) | 3/6 (HAPPY_NO_AUTH, DECLINE_AUTHORIZE, DECLINE_INVALID_CVC) |

### Implicancias para específicación de tests

- **Specs `*3ds*` no aplican.** No se puede portar TC1013/TC1037/TC1053/TC1069 (Stripe 3DS happy) ni TC1057/TC1059/TC1051 (Stripe 3DS fail). El resolver cross-gateway lanza `Intent 'HAPPY_AUTH' no soportado por gateway 'authorize'` para forzar el skip explícito.
- **Specs de decline-en-capture no aplican.** El equivalente Stripe `DECLINE_CAPTURE` (card `9995`) no tiene homólogo Authorize — el sandbox no expone un fallo post-auth. Si MAGIIS necesita cubrir ese caso, hay que mockear backend.
- **AVS granular sí aplica** — Authorize expone más variaciones de AVS (W/X/Z/G/A/E/N/R/S/U) que Stripe Radar; oportunidad de specs adicionales.
- **Partial / Prepaid sí aplica** — Authorize sandbox expone Partial Auth y 3 variantes Prepaid; Stripe los maneja distinto (no equivalente directo). Documentado como exclusivo Authorize.

---

## 4. Mapping MAGIIS estados ↔ Authorize.net operaciones

Esta tabla es la traducción semántica entre el dominio MAGIIS (Hold, Capture, NO_AUTORIZADO, SEARCHING_DRIVER) y las operaciones Authorize.net.

| Concepto MAGIIS | Operación Authorize.net | Notas |
| --- | --- | --- |
| **Hold** (reserva de fondos sin cobrar) | `authOnlyTransaction` | Response Code 1 → autorizado pero NO settled. `transactionId` se guarda para capturar después |
| **Capture** (cobro efectivo) | `priorAuthCaptureTransaction` con `refTransId` | Settla el hold previo. Ocurre cuando el driver finaliza viaje |
| **Cargo a Bordo** (cobro directo sin hold) | `authCaptureTransaction` | Auth + capture en una sola llamada |
| **NO_AUTORIZADO** (hold falla) | Response Code 2 (decline) o 3 (error) | UI muestra red flag + botón "Reintentar" no aplica (no hay challenge) |
| **SEARCHING_DRIVER** (viaje activo buscando conductor) | Estado posterior a Response Code 1 + persistencia backend MAGIIS | Authorize no participa de este estado |
| **Reembolso** (post-settlement) | `refundTransaction` con `refTransId` + tarjeta truncada | Solo viable después de que la transacción se settle (típicamente 24h) |
| **Void** (cancelación pre-settlement) | `voidTransaction` con `refTransId` | Anula auth + capture antes del settlement; no es lo mismo que refund |
| **Vincular tarjeta nueva al wallet** | `createCustomerProfileFromTransaction` o `createCustomerPaymentProfile` | Genera `customerProfileId` + `paymentProfileId` para reuso futuro |
| **Usar tarjeta vinculada existente** | `createTransactionRequest` con `profile.customerProfileId` + `paymentProfile.paymentProfileId` | Reusa el método de pago tokenizado |
| **Wallet remove card** | `deleteCustomerPaymentProfile` | Borra solo el payment profile, no el customer profile |

> Nota arquitectónica: MAGIIS expone el concepto "Hold ON / Hold OFF" desde el portal. En Authorize.net esa decisión se traduce en elegir `authOnlyTransaction` (Hold ON) vs `authCaptureTransaction` (Hold OFF + cargo directo). El backend MAGIIS resuelve el routing.

---

## 5. Endpoints y autenticación

### Endpoints

| Tipo | URL |
| --- | --- |
| Sandbox API (XML/JSON) | `https://apitest.authorize.net/xml/v1/request.api` |
| Production API | `https://api.authorize.net/xml/v1/request.api` |
| Sandbox Merchant Interface (dashboard QA) | `https://sandbox.authorize.net/` |
| Accept.js client lib | `https://jstest.authorize.net/v1/Accept.js` (sandbox) · `https://js.authorize.net/v1/Accept.js` (prod) |

- HTTP method: **POST únicamente**.
- Content-Type: `text/xml` o `application/json`.
- Encoding: UTF-8.

### Autenticación

```xml
<merchantAuthentication>
  <name>API_LOGIN_ID</name>                    <!-- 20 chars max -->
  <transactionKey>API_TRANSACTION_KEY</transactionKey>  <!-- 16 chars max -->
</merchantAuthentication>
```

Equivalente JSON:

```json
{
  "merchantAuthentication": {
    "name": "API_LOGIN_ID",
    "transactionKey": "API_TRANSACTION_KEY"
  }
}
```

- Opcional: `refId` (≤20 chars) para tracking del request del lado integrador.
- Las credenciales **nunca** deben aparecer en commits — se cargan vía env: `AUTHORIZE_API_LOGIN_ID` + `AUTHORIZE_TRANSACTION_KEY` (ver `EXTERNAL-BLOCKERS.md` §1).

### Operaciones principales (resumen de la API reference)

| Categoría | Operaciones |
| --- | --- |
| **Payment Transactions** | `authCaptureTransaction`, `authOnlyTransaction`, `priorAuthCaptureTransaction`, `captureOnlyTransaction`, `refundTransaction`, `voidTransaction` |
| **Customer Profiles** | `createCustomerProfile`, `getCustomerProfile`, `updateCustomerProfile`, `deleteCustomerProfile`, `createCustomerPaymentProfile`, `getCustomerPaymentProfile`, `updateCustomerPaymentProfile`, `deleteCustomerPaymentProfile`, `createCustomerShippingAddress` |
| **Recurring Billing** | `ARBCreateSubscription`, `ARBGetSubscription`, `ARBUpdateSubscription`, `ARBCancelSubscription`, `ARBGetSubscriptionList` |
| **Transaction Reporting** | `getSettledBatchListRequest`, `getTransactionDetailsRequest`, `getUnsettledTransactionListRequest`, `getBatchStatisticsRequest` |
| **Fraud Management** | `getUnsettledTransactionListRequest` (filter `Pending Approval`), `updateHeldTransactionRequest` (approve/decline) |
| **Accept Suite** | Accept.js (form embedded), Accept Hosted (redirect), Accept Customer (hosted profile mgmt) |

### Endpoint de link/unlink del backend MAGIIS (odnService)

> Verificado en vivo — cierra la contradicción doc-vs-código: el POM (`AppStoreGatewaysPage.expectLinkStatusOk`, MG-226) ya asserta este comportamiento pero este documento no lo mencionaba.

La vinculación/desvinculación de la pasarela desde el Magiis App Store **no** va contra la API de Authorize.net de esta sección ni contra `/vendor/`: la mutación real del link la sirve el **backend MAGIIS vía `odnService`** (verificado live, MG-476).

Semántica de status **verificada** ([`HANDOFF-live-reconciliation-2026-07-24.md`](./HANDOFF-live-reconciliation-2026-07-24.md) §2 + addendum 2026-07-25):

| Status | Significado real |
| --- | --- |
| `500` | Pasarela **CONECTADA** (link desde estado limpio) — éxito funcional |
| `409` | Pasarela **CONECTADA** (el carrier ya estaba vinculado por otra sesión — conflicto de idempotencia) — éxito funcional |
| `400` | Pasarela **NO conectada** |

El `500/409-en-éxito` es un *smell* de API (debería ser 2xx) → **candidato a Improvement al backend** (destino DEV/MX — ver borrador [`DRAFT-improvement-backend-link-500.md`](./DRAFT-improvement-backend-link-500.md)). Los oráculos de QA toleran `[500, 409]` (nunca 400) + assert de persistencia del estado vinculado, con **TODO revert a 2xx** cuando DEV corrija el endpoint.

---

## 6. Triggers consolidados (sandbox)

> **Esta sección es la SoT operativa para QA.** Cada combinación de números, CVV y ZIP dispara un outcome específico documentado por Authorize.

### 6.1 Test card numbers — happy default

| Brand | Test number(s) |
| --- | --- |
| Visa | `4007 0000 0000 27` · `4012 8888 1888 8888` · `4111 1111 1111 1111` |
| Mastercard | `5424 0000 0000 0015` · `2223 0000 1030 9703` · `2223 0000 1030 9711` |
| American Express | `3700 0000 0000 002` |
| Discover | `6011 0000 0000 0012` |
| JCB | `3088 0000 0000 0017` |
| Diners Club / Carte Blanche | `3800 0000 000006` |
| China UnionPay | `6221 4990 5336 0818` · `6262 3200 0200 0067` · `6284 4800 0000 0008` |

- **Expiry:** cualquier fecha futura. Default fixture: `12/2030`.
- **CVV:** 3 dígitos para todas las marcas excepto Amex (4 dígitos).
- **Holder name:** default fixture `MAGIIS QA Test`.

### 6.2 CVV triggers

Sobre cualquier número de la sección 6.1, cambiar el CVV cambia el outcome de la validación CVV.

| CVV | Response code (cvvResultCode) | Significado |
| --- | --- | --- |
| `900` (Amex `9000`) | `M` | Successful Match |
| `901` | `N` | Does NOT match |
| `902` | `S` | Should be on card, but is not indicated |
| `903` | `U` | Issuer is not certified or has not provided encryption key |
| `904` | `P` | Is NOT processed |

### 6.3 ZIP triggers — general decline

| ZIP | Response code | Significado |
| --- | --- | --- |
| `46282` | `2` | Declined (general bank decline). Mapea a `DECLINE_AUTHORIZE` del resolver shared. |

### 6.4 ZIP triggers — AVS (Address Verification System)

| ZIP | AVS status code | Descripción |
| --- | --- | --- |
| `46201` | `A` | Address Match / ZIP No Match |
| `46203` | `E` | AVS data invalid or not allowed |
| `46204` | `G` | Non-U.S. issuing bank (no AVS support) |
| `46205` | `N` | Address & ZIP: No Match |
| `46207` | `R` | AVS system unavailable |
| `46208` | `S` | U.S. bank does not support AVS |
| `46209` | `U` | Cardholder address unavailable |
| `46211` | `W` | Address No Match / ZIP Matched 9 digits |
| `46214` | `X` | Address Match / ZIP Matched 9 digits |
| `46217` | `Z` | Address No Match / ZIP Match |

> **Notas oficiales:** AVS `W` y `X` no aplican a Amex; AVS `X` no aplica a Visa.

### 6.5 ZIP triggers — partial / prepaid (CARD-NOT-PRESENT)

| ZIP | Amount monto-trigger (CP) | Result | Remaining Balance | Authorized |
| --- | --- | --- | --- | --- |
| `46225` | $462.25 | Partial Authorization | N/A | $1.23 |
| `46226` | $462.26 | Prepaid Authorization | $1.23 | Full amount |
| `46227` | $462.27 | Prepaid Authorization | -$1.23 | Full amount |
| `46228` | $462.28 | Prepaid Authorization | $0 | Full amount |

> El trigger por **monto** está deprecated por Authorize ("may cease to function without notice") — no usarlo. El trigger por ZIP es el canónico.

### 6.6 Response code (transactionResponse.responseCode)

| Code | Meaning |
| --- | --- |
| `1` | Approved |
| `2` | Declined |
| `3` | Error |
| `4` | Held for Review (fraud filter) |

### 6.7 Message codes principales

| Code | Significado |
| --- | --- |
| `I00001` | Successful |
| `E00001` | Error genérico |
| `E00003` | Invalid XML |
| `E00004` | Duplicate transaction |
| `E00008` | Auth failed (credenciales inválidas) |

---

## 7. Bloqueantes técnicos

Resumen — detalle completo en [`EXTERNAL-BLOCKERS.md`](./EXTERNAL-BLOCKERS.md).

| # | Bloqueante | Estado |
| --- | --- | --- |
| 1 | Sandbox keys (`AUTHORIZE_API_LOGIN_ID` + `AUTHORIZE_TRANSACTION_KEY`) en `.env.test`/`.env.uat` | 🔴 Pendiente |
| 2 | Decisión líder: ¿MAGIIS PROD integra Authorize.net o solo TEST? | 🔴 Pendiente |
| 3 | Confirmar modelo de integración (Accept.js / Accept Hosted / API directa) | 🔴 Pendiente |
| 4 | POM Web Authorize — si difiere del shared card form de MAGIIS | 🔴 Pendiente |
| 5 | Backend MAGIIS sabe llamar a Authorize en E2E híbrido (carrier+driver / pax+driver) | 🔴 Pendiente |
| 6 | Coordinación BL-024/025/028 | 🟡 BL-024 ✅, BL-025 SoT ✅ runtime 🔴, BL-028 piloto ✅ migración 🔴 |

---

## 8. Decisiones arquitectónicas

### 8.1 `authorizeGatewayAdapter.requires3ds = false` (canónica)

Authorize.net **no modela 3DS** en el flujo MAGIIS. Razones:

- El sandbox Authorize no expone el challenge 3DS en su test suite estándar.
- El soporte legacy via `cardholderAuthentication.authenticationIndicator` (ECI/UCAF) + `cardholderAuthenticationValue` (CAVV) está **deprecated**. Procesadores soportados son legacy (Chase Paymentech, FDMS Nashville, Global Payments, TSYS).
- Modelar un mock 3DS para Authorize agregaría complejidad sin valor — el comportamiento real productivo de MAGIIS con Authorize no usa 3DS.

**Consecuencia para tests:** los intents `HAPPY_AUTH` y `FAIL_AUTH` del resolver cross-gateway lanzan `"intent X no soportado por gateway 'authorize'"`. El skip es **explícito**, no silencioso.

### 8.2 No modelar `DECLINE_CAPTURE`

Stripe permite simular un decline-en-capture con `4000 0000 0000 9995` (la transacción autoriza pero falla al capturar). Authorize.net sandbox **no expone ese comportamiento** — un decline en `priorAuthCaptureTransaction` requiere que la auth haya expirado o el merchant manualmente la voide.

**Consecuencia:** el intent `DECLINE_CAPTURE` del resolver no aplica a Authorize. Tests Stripe que validen ese caso (ej. TC1059) no migran.

### 8.3 Intents soportados del resolver cross-gateway

| Intent canónico | Soportado | Card fixture |
| --- | :-: | --- |
| `HAPPY_NO_AUTH` | ✓ | `AUTHORIZE_CARDS.SUCCESS` (Visa 4111…1111 + CVV 900 + ZIP 90210) |
| `HAPPY_AUTH` | ✗ | N/A (no 3DS) |
| `FAIL_AUTH` | ✗ | N/A (no 3DS) |
| `DECLINE_AUTHORIZE` | ✓ | `AUTHORIZE_CARDS.DECLINE_GENERIC` (Visa 4111…1111 + ZIP 46282) |
| `DECLINE_CAPTURE` | ✗ | N/A (no decline-en-capture en sandbox) |
| `DECLINE_INVALID_CVC` | ✓ | `AUTHORIZE_CARDS.DECLINE_CVV` (Visa 4111…1111 + CVV 901) |

Esta cobertura es deliberadamente **parcial** — habilita parametrización cross-gateway sólo donde el comportamiento es comparable.

### 8.4 Stored credentials con `networkTransId`

A diferencia de Stripe (`customer.id` + `payment_method.id`), Authorize tokeniza vía:

- **Customer Profile:** `customerProfileId` (entity-level).
- **Payment Profile:** `paymentProfileId` (card-level, hijo del customer profile).
- **Network Trans ID:** `networkTransId` devuelto en la primera transacción aprobada, debe persistirse para reusar como `subsequentAuthInformation.originalNetworkTransId` en cobros recurrentes.

**Consecuencia para tests E2E híbridos:** el journey debe capturar `networkTransId` después del hold y exponerlo al `JourneyContextStore` para que la fase de capture lo reuse. Documentado como TODO BL-025 runtime.

### 8.5 Mismo número de tarjeta, distintos outcomes

A diferencia de Stripe (1 número = 1 outcome), Authorize sandbox reutiliza el mismo número (`4111…1111` para Visa default) y dispara outcomes con CVV/ZIP. Esto implica:

- El fixture `AUTHORIZE_CARDS.SUCCESS` y `AUTHORIZE_CARDS.DECLINE_GENERIC` **comparten número** — se distinguen por el campo `zip`.
- En tests UI, **siempre llenar los 3 campos** (number, cvc, zip) — omitir el ZIP rompe el trigger.
- Razón por la que el `card-policy.ts` Authorize mapea a **objetos completos** (no sólo a strings de números como Stripe).

---

## 9. Cómo correr tests Authorize

> **Aspiracional — pendiente BL-025 runtime.**

### 9.1 Comando objetivo (cuando exista el primer spec)

```bash
# Smoke happy path con Authorize
pnpm test:test:gateway-pg:authorize

# Comando largo (sin alias)
ENV=test pnpm playwright test \
  -c playwright.gateway-pg.config.ts \
  tests/features/gateway-pg/specs/authorize \
  --workers=1
```

`--workers=1` es **obligatorio** por la misma razón que Stripe: el sandbox Authorize tiene rate limits y comparte estado entre workers.

### 9.2 Variables de entorno requeridas

```bash
# .env.test (gitignored)
AUTHORIZE_API_LOGIN_ID=...        # 20 chars max, viene del Merchant Interface sandbox
AUTHORIZE_TRANSACTION_KEY=...     # 16 chars max
# Opcional — para tests que validen Accept.js iframe
AUTHORIZE_CLIENT_KEY=...
```

Las claves se obtienen logueando al [Sandbox Merchant Interface](https://sandbox.authorize.net/) → Account → API Credentials & Keys → "New Transaction Key". Ver [`EXTERNAL-BLOCKERS.md`](./EXTERNAL-BLOCKERS.md) §1 para protocolo de obtención.

### 9.3 Project de Playwright (planeado)

`playwright.gateway-pg.config.ts` debería ganar un project para Authorize cuando se active runtime:

```typescript
{
  name: 'authorize-smoke',
  grep: /@authorize.*@smoke/,
  use: { browserName: 'chromium' },
  testDir: './tests/features/gateway-pg/specs/authorize',
}
```

### 9.4 Tags Playwright sugeridos

Espejando los de Stripe con prefijo `@authorize`:

| Tag | Criterio | TCs aplicables |
| --- | --- | --- |
| `@authorize @smoke` | 1 happy path por feature | TC1001, TC1041, TC1081 |
| `@authorize @critical` | Hold + capture happy path | TC1001, TC1033, TC1053 |
| `@authorize @regression` | Variantes happy + declines | TC1011-TC1020 |
| `@authorize @cvv` | Triggers CVV (901-904) | TC1021-TC1030 |
| `@authorize @avs` | Triggers AVS | TC1031-TC1040 |
| `@authorize @partial-auth` | Partial / Prepaid | TC1041-TC1050 |
| `@authorize @web-only` | Solo Playwright (sin Appium) | TC1001-TC1050 |
| `@authorize @hybrid-e2e` | Carrier+Driver / Pax+Driver | TC1051+ |

---

## 10. Compatibilidad y notas legacy

- El path legacy `tests/fixtures/authorize/` queda como **thin re-export** del canónico `tests/fixtures/gateways/authorize/` (BL-024 Fase 3).
- No existe equivalente Authorize del legacy `tests/specs/gateway-pg/stripe/**` — Authorize nace ya con la arquitectura post-TIER 1.5 (canonical path `tests/features/gateway-pg/specs/authorize/**`).
- Histórico de cambios documentales en [`CHANGELOG.md`](./CHANGELOG.md).
