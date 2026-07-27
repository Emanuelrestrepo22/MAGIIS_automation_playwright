# Test Suite – Authorize.net · Parte 1: Configuración, Alta de Viaje y Cargo a Bordo

> **Proyecto:** Automatización de pruebas – Integración Authorize.net (Playwright / Appium)
> **Alcance:** Configuración del gateway · Altas de viaje desde Carrier/Contractor/App Pax · Cargo a Bordo
> **Stack:** Playwright + TypeScript (web) · Appium + WebdriverIO (mobile)
> **SoT de tarjetas:** [`tests/fixtures/gateways/authorize/`](../../../tests/fixtures/gateways/authorize/)
> **Estado:** DRAFT — TCs especificados, specs aún no implementados (depende BL-025 runtime).

> **Nota canónica:** IDs `TS-AUTHORIZE-TC1001..` arrancan en 1001 para no colisionar con `TS-STRIPE-TC1001..`. Todo TC nuevo Authorize debe nacer aquí antes de aparecer en specs, JSON normalizado o reportes.

---

## 1. Configuración de Pasarela Authorize.net (Magiis App Store)

Espeja `TS-STRIPE-TC1001..TC1008` pero adaptado a la UI Authorize.

| ID               | Descripción                                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1001 | Validar visualizar pasarela Authorize.net en Magiis App Store y mostrar estado no vinculado antes de configurar credenciales                          |
| TS-AUTHORIZE-TC1002 | Validar vincular pasarela Authorize.net desde Magiis App Store con `API_LOGIN_ID` + `API_TRANSACTION_KEY` válidas y reflejar estado vinculado en UI y DB |
| TS-AUTHORIZE-TC1003 | Validar impedir vincular pasarela Authorize.net con credenciales inválidas (response code `E00008`) y mostrar error controlado sin activar el gateway     |
| TS-AUTHORIZE-TC1004 | Validar solicitar confirmación al desvincular pasarela Authorize.net y no ejecutar acción al cancelar el popup                                            |
| TS-AUTHORIZE-TC1005 | Validar desvincular pasarela Authorize.net y ocultar método tarjeta preautorizada en alta de viaje desde Carrier                                          |
| TS-AUTHORIZE-TC1006 | Validar exclusividad de pasarela activa e impedir vincular otro gateway (Stripe / MercadoPago / eBizCharge) mientras Authorize esté activo               |
| TS-AUTHORIZE-TC1007 | Validar persistencia de estado vinculado de Authorize.net tras recargar página y navegar entre secciones de Carrier                                       |
| TS-AUTHORIZE-TC1008 | Validar que el request link/unlink de Authorize.net retorne status 200 y registre evento en logs o auditoría si aplica                                    |

> **Precondición común sección 1:** acceso al Magiis App Store con rol de admin; credenciales Authorize.net sandbox cargadas en `.env.test`. Variables: `AUTHORIZE_API_LOGIN_ID`, `AUTHORIZE_TRANSACTION_KEY`.

> **TS-AUTHORIZE-TC1005 — cobertura parcial del AC:** el caso automatizado cubre "desvincular" (con pre-assert de estado vinculado); la parte **"ocultar método tarjeta preautorizada en alta de viaje"** está **pendiente de automatizar — TODO F4+** (el título del test generado solo promete lo que asserta: `desvincular <GW>`).

> **⚠ TS-AUTHORIZE-TC1008 — comportamiento real verificado (quirk backend):** el request de link **NO retorna 200** — quirk verificado (HANDOFF §2, addendum 2026-07-25): el link retorna **500** (conexión desde estado limpio) o **409** (ya vinculada); **400** = no conectada. El oráculo automatizado asserta `500|409` + persistencia del estado vinculado. El AC original de 2xx queda como **TODO revert** cuando DEV corrija el endpoint (`odnService`, ver `ARCHITECTURE.md` §5 + `DRAFT-improvement-backend-link-500.md`). La parte "unlink status" y "logs/auditoría" del AC **NO está automatizada** (gap documentado).

---

## 2. Alta de Viaje desde Carrier – Usuario Personal

### 2.1 Happy paths — sin antifraude (CVV match)

> Authorize sandbox no expone 3DS — todos los TCs de esta sección usan `AUTHORIZE_CARDS.SUCCESS` (`Visa 4111…1111` + CVV `900` + ZIP `90210`) y derivan en Response Code `1` (approved). El concepto Hold ON/OFF de MAGIIS se traduce en `authOnlyTransaction` vs `authCaptureTransaction` en el backend.

| ID               | Descripción                                                                                                                                                          | Card | Hold | Outcome |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ------- |
| TS-AUTHORIZE-TC1011 | Validar Alta de Viaje desde carrier para usuario personal con tarjeta preautorizada exitosa (Visa 4111…1111 + CVV 900) **Hold desde Alta de Viaje y Cobro desde App Driver** | `AUTHORIZE_CARDS.SUCCESS` | ON | Response Code 1 → viaje pasa a `SEARCHING_DRIVER` y aparece en columna "Por asignar" |
| TS-AUTHORIZE-TC1012 | Validar Alta de Viaje desde carrier para usuario personal con tarjeta preautorizada exitosa (Visa 4111…1111 + CVV 900) **sin Hold desde Alta de Viaje, Cobro desde App Driver** | `AUTHORIZE_CARDS.SUCCESS` | OFF | Response Code 1 → viaje activo sin retención previa |
| TS-AUTHORIZE-TC1013 | Validar Alta de Viaje desde carrier para usuario personal con Mastercard exitosa (5424…0015 + CVV 900) Hold ON                                                       | `AUTHORIZE_CARDS.SUCCESS_MASTERCARD` | ON | Response Code 1 |
| TS-AUTHORIZE-TC1014 | Validar Alta de Viaje desde carrier para usuario personal con Amex exitosa (370…002 + CVV 9000 — 4 dígitos) Hold ON                                                  | `AUTHORIZE_CARDS.SUCCESS_AMEX` | ON | Response Code 1 — validar que el form UI acepte 4 dígitos en CVV |
| TS-AUTHORIZE-TC1015 | Validar Alta de Viaje desde carrier para usuario personal con Discover exitosa (6011…0012 + CVV 900) Hold ON                                                         | `AUTHORIZE_CARDS.SUCCESS_DISCOVER` | ON | Response Code 1 |
| TS-AUTHORIZE-TC1009 | Validar alta de viaje desde carrier para usuario personal con tarjeta preautorizada exitosa (Visa 4111…1111 + CVV 900) con Hold OFF — variante origen/destino alternativo | `AUTHORIZE_CARDS.SUCCESS` | OFF | Response Code 1 |
| TS-AUTHORIZE-TC1010 | Validar alta de viaje desde carrier para usuario personal con tarjeta preautorizada exitosa (Visa 4111…1111 + CVV 900) con Hold OFF — variante set 2 | `AUTHORIZE_CARDS.SUCCESS` | OFF | Response Code 1 |
| TS-AUTHORIZE-TC1018 | Validar alta de viaje desde carrier para usuario personal con tarjeta preautorizada exitosa (Visa 4111…1111 + CVV 900) con Hold OFF — variante set 2 alternativo | `AUTHORIZE_CARDS.SUCCESS` | OFF | Response Code 1 |

**Precondiciones comunes sección 2.1:**
- Pasarela Authorize vinculada (TC1002 pasado).
- Cliente personal MAGIIS existente en TEST.
- Origen/destino válidos.

**Pasos comunes (ejemplo TC1011):**
1. Loguearse en portal Carrier como dispatcher.
2. Navegar a Dashboard → "Alta de Viaje".
3. Completar formulario: cliente personal, pasajero, origen, destino, tipo de servicio "Regular".
4. Activar toggle "Hold ON".
5. Seleccionar método "Tarjeta Preautorizada" → seleccionar "Vincular tarjeta nueva".
6. En el form Authorize (Accept.js iframe o shared form, ver `ARCHITECTURE.md` §2):
   - Número: `4111 1111 1111 1111`
   - Expiry: `12/30`
   - CVV: `900`
   - ZIP: `90210`
   - Holder: `MAGIIS QA Test`
7. Click "Confirmar tarjeta" → POST API → Response Code 1.
8. Click "Crear viaje".

**Resultado esperado (TC1011):** Debería redirigir a `Gestión de Viajes` con el viaje en columna "Por asignar"; estado interno `SEARCHING_DRIVER`; en DB tabla `payments` registro con `gateway=authorize`, `response_code=1`, `transaction_id` no nulo.

**Observaciones técnicas:**
- Traceability network: `POST /xml/v1/request.api` con `authOnlyTransaction` → `transactionResponse.responseCode = "1"`.
- En MAGIIS backend, capturar el `networkTransId` para stored credentials (uso posterior).

### 2.2 Decline genérico (ZIP trigger 46282)

| ID               | Descripción                                                                                                                            | Card | Hold | Outcome |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ------- |
| TS-AUTHORIZE-TC1016 | Validar Alta de Viaje desde carrier para usuario personal con tarjeta declinada (ZIP 46282) Hold ON — sistema muestra error de declinación y el viaje no se crea | `AUTHORIZE_CARDS.DECLINE_GENERIC` | ON | Response Code 2 → red flag "No autorizado", viaje NO aparece en "Buscando conductor" |
| TS-AUTHORIZE-TC1017 | Validar Alta de Viaje desde carrier para usuario personal con tarjeta declinada (ZIP 46282) Hold OFF — auth+capture falla, error visible, viaje no creado          | `AUTHORIZE_CARDS.DECLINE_GENERIC` | OFF | Response Code 2 → error UI, sin viaje |

**Resultado esperado (TC1016):** Debería mostrar pop-up de error "No se pudo autorizar la tarjeta" con mensaje de Authorize; el viaje permanece sin crear (la URL no cambia o muestra detalle en estado `NO_AUTORIZADO`).

**Observaciones:**
- Network: `transactionResponse.responseCode = "2"`, `responseReasonCode` típicamente `2` (referral/decline).
- Equivalente Stripe: `TS-STRIPE-TC1059` (insufficient funds Hold ON) y `TS-STRIPE-P2-TC090` (generic decline contractor).

### 2.3 CVV triggers (901 mismatch, 902 should-be, 903 issuer, 904 not-processed)

| ID               | Descripción                                                                                                                                                          | CVV | Card | Hold | Outcome |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ---- | ------- |
| TS-AUTHORIZE-TC1021 | Validar Alta de Viaje desde carrier para usuario personal con tarjeta CVV mismatch (CVV 901) Hold ON — sistema rechaza el alta por validación CVV "N: Does NOT match" | `901` | `AUTHORIZE_CARDS.DECLINE_CVV` | ON | `cvvResultCode = "N"` → backend MAGIIS decide rechazar o aceptar según política. Validar comportamiento. |
| TS-AUTHORIZE-TC1022 | Validar Alta de Viaje desde carrier para usuario personal con tarjeta CVV mismatch (CVV 901) Hold OFF — comportamiento equivalente al TC1021 sin retención previa     | `901` | `AUTHORIZE_CARDS.DECLINE_CVV` | OFF | `cvvResultCode = "N"` |
| TS-AUTHORIZE-TC1023 | Validar Alta de Viaje desde carrier para usuario personal con CVV `902` (should be on card but not indicated) Hold ON                                                | `902` | `AUTHORIZE_CARDS.SUCCESS` (override CVV) | ON | `cvvResultCode = "S"` — Response Code 1 con flag CVV. Documentar si MAGIIS lo trata como warning o decline. |
| TS-AUTHORIZE-TC1024 | Validar Alta de Viaje desde carrier para usuario personal con CVV `903` (issuer not certified) Hold ON                                                               | `903` | `AUTHORIZE_CARDS.SUCCESS` (override CVV) | ON | `cvvResultCode = "U"` |
| TS-AUTHORIZE-TC1025 | Validar Alta de Viaje desde carrier para usuario personal con CVV `904` (CVV not processed) Hold ON — viaje crea exitosamente con flag `cvvResultCode=P`             | `904` | `AUTHORIZE_CARDS.CVV_NOT_PROCESSED` | ON | `cvvResultCode = "P"` — Response Code 1 |
| TS-AUTHORIZE-TC1026 | Validar reintento exitoso desde detalle del viaje tras fallo CVV 901 — usuario reintenta con CVV 900 desde tarjeta nueva → viaje pasa a "Buscando conductor"          | `900` (reintento) | `AUTHORIZE_CARDS.SUCCESS` | ON | Reintento OK, viaje activo |

> **TODO BL-025 runtime:** validar con backend MAGIIS si CVV mismatch (`901`) genera rechazo duro o solo flag. La doc Authorize indica que el CVV check no aborta la transacción por sí mismo — el merchant decide.

### 2.4 AVS triggers (no match, non-US, otros)

| ID               | Descripción                                                                                                                            | ZIP | Card | Hold | Outcome |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ---- | ------- |
| TS-AUTHORIZE-TC1031 | Validar Alta de Viaje desde carrier para usuario personal con AVS no match (ZIP 46205) Hold ON                                       | `46205` | `AUTHORIZE_CARDS.AVS_NO_MATCH` | ON | `avsResultCode = "N"` (Address & ZIP no match) |
| TS-AUTHORIZE-TC1032 | Validar Alta de Viaje desde carrier para usuario personal con AVS ZIP 9-digit match (ZIP 46211)                                       | `46211` | `AUTHORIZE_CARDS.SUCCESS` (override ZIP) | ON | `avsResultCode = "W"` |
| TS-AUTHORIZE-TC1033 | Validar Alta de Viaje desde carrier para usuario personal con AVS address+ZIP 9-digit match (ZIP 46214)                              | `46214` | `AUTHORIZE_CARDS.SUCCESS` (override ZIP) | ON | `avsResultCode = "X"` — no aplica a Visa por nota oficial; validar con Mastercard |
| TS-AUTHORIZE-TC1034 | Validar Alta de Viaje desde carrier para usuario personal con AVS ZIP match address no match (ZIP 46217)                            | `46217` | `AUTHORIZE_CARDS.SUCCESS` (override ZIP) | ON | `avsResultCode = "Z"` |
| TS-AUTHORIZE-TC1035 | Validar Alta de Viaje desde carrier para usuario personal con AVS issuer no-USA (ZIP 46204) Hold ON                                  | `46204` | `AUTHORIZE_CARDS.AVS_NON_US` | ON | `avsResultCode = "G"` — el banco emisor no soporta AVS |
| TS-AUTHORIZE-TC1036 | Validar Alta de Viaje desde carrier para usuario personal con AVS system unavailable (ZIP 46207)                                     | `46207` | `AUTHORIZE_CARDS.SUCCESS` (override ZIP) | ON | `avsResultCode = "R"` |
| TS-AUTHORIZE-TC1037 | Validar Alta de Viaje desde carrier para usuario personal con AVS invalid data (ZIP 46203)                                           | `46203` | `AUTHORIZE_CARDS.SUCCESS` (override ZIP) | ON | `avsResultCode = "E"` |

> **TODO matriz:** documentar el comportamiento MAGIIS esperado para cada AVS code. La política puede ser: aceptar `Y/X/W`, rechazar `N`, warning para `G/R/S/U`. Pendiente confirmación con líder.

### 2.5 Partial / Prepaid authorizations (edge cases)

| ID               | Descripción                                                                                                                            | ZIP | Card | Hold | Outcome |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ---- | ------- |
| TS-AUTHORIZE-TC1041 | Validar Alta de Viaje desde carrier para usuario personal con Partial Authorization (ZIP 46225) Hold ON — solo $1.23 autorizado del total | `46225` | `AUTHORIZE_CARDS.PARTIAL_AUTH` | ON | Approved parcial — validar política MAGIIS: aceptar partial o forzar declinar |
| TS-AUTHORIZE-TC1042 | Validar Alta de Viaje desde carrier para usuario personal con Prepaid Auth ($1.23 balance restante, ZIP 46226) Hold ON                | `46226` | `AUTHORIZE_CARDS.PARTIAL_AUTH` (override ZIP) | ON | Approved con balance reportado |
| TS-AUTHORIZE-TC1043 | Validar Alta de Viaje desde carrier para usuario personal con Prepaid Auth ($0 balance, ZIP 46228) Hold ON                            | `46228` | `AUTHORIZE_CARDS.PREPAID_ZERO` | ON | Approved con balance cero — flag explícito |

> **Decisión de negocio pendiente:** ¿MAGIIS acepta Partial Authorization? Stripe no expone este caso de forma directa; es una capacidad exclusiva Authorize. Si MAGIIS lo rechaza por política, el TC se mueve a "expected decline".

---

## 3. Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor

### 3.1 Happy paths sin antifraude

| ID               | Descripción                                                                                                                                                              | Card | Card flow | Hold |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ---- |
| TS-AUTHORIZE-TC1051 | Validar vincular tarjeta y Alta de Viaje desde carrier para usuario colaborador con tarjeta preautorizada exitosa **Vincular tarjeta nueva (seed)** Hold ON               | `AUTHORIZE_CARDS.SUCCESS` | new (seed) | ON |
| TS-AUTHORIZE-TC1052 | Validar Alta de Viaje desde carrier para usuario colaborador con tarjeta preautorizada exitosa **Vincular tarjeta nueva** Hold ON                                       | `AUTHORIZE_CARDS.SUCCESS` | new | ON |
| TS-AUTHORIZE-TC1053 | Validar Alta de Viaje desde carrier para usuario colaborador con tarjeta preautorizada exitosa **Usar tarjeta vinculada existente** Hold ON                            | `AUTHORIZE_CARDS.SUCCESS` (stored) | existing | ON |
| TS-AUTHORIZE-TC1054 | Validar Alta de Viaje desde carrier para usuario colaborador con tarjeta preautorizada exitosa **Vincular tarjeta nueva** Hold OFF                                     | `AUTHORIZE_CARDS.SUCCESS` | new | OFF |
| TS-AUTHORIZE-TC1055 | Validar Alta de Viaje desde carrier para usuario colaborador con tarjeta preautorizada exitosa **Usar tarjeta vinculada existente** Hold OFF                          | `AUTHORIZE_CARDS.SUCCESS` (stored) | existing | OFF |

> **Oráculo automatizado del alta de tarjeta (flujos "Vincular tarjeta nueva" — TC1051/TC1052 y spec WAL `TS-AUTHORIZE-WAL-01`/MG-285):** la vinculación exitosa se asserta por el texto **"Tarjeta válida" / "Valid card"** visible tras "Validar" (`CarrierNewTravelPage.validateNativeCard`). **Alcance de la evidencia live** (commit `aa780b3`, 3x verde en TEST): aplica SOLO al spec WAL (Visa 4111 + CVV 900 + **ZIP 10001**) — TC1051/TC1052 usan `AUTHORIZE_CARDS.SUCCESS` (**ZIP 90210**), combinación AÚN sin captura live del oráculo. Nota: el spec de alta de tarjeta usa el ID `TS-AUTHORIZE-WAL-01`, que no existe como fila TC1xxx en esta matriz (numeración WAL propia del spec).

### 3.2 Declines y CVV

| ID               | Descripción                                                                                                                                                              | Card |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| TS-AUTHORIZE-TC1056 | Validar Alta de Viaje desde carrier para usuario colaborador con tarjeta declinada (ZIP 46282) — error visible, viaje no creado                                          | `AUTHORIZE_CARDS.DECLINE_GENERIC` |
| TS-AUTHORIZE-TC1057 | Validar Alta de Viaje desde carrier para usuario colaborador con CVV mismatch (CVV 901) — rechazo según política                                                          | `AUTHORIZE_CARDS.DECLINE_CVV` |

---

## 4. Alta de Viaje desde Carrier – Usuario Empresa Individuo

### 4.1 Happy paths

| ID               | Descripción                                                                                                                            | Card | Card flow | Hold |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ---- |
| TS-AUTHORIZE-TC1061 | Validar Alta de Viaje desde carrier para usuario empresa individuo con tarjeta preautorizada exitosa **Vincular tarjeta nueva** Hold ON | `AUTHORIZE_CARDS.SUCCESS` | new | ON |
| TS-AUTHORIZE-TC1062 | Validar Alta de Viaje desde carrier para usuario empresa individuo con tarjeta preautorizada exitosa **Usar tarjeta vinculada existente** Hold ON | `AUTHORIZE_CARDS.SUCCESS` (stored) | existing | ON |
| TS-AUTHORIZE-TC1063 | Validar Alta de Viaje desde carrier para usuario empresa individuo con tarjeta preautorizada exitosa **Vincular tarjeta nueva** Hold OFF | `AUTHORIZE_CARDS.SUCCESS` | new | OFF |
| TS-AUTHORIZE-TC1064 | Validar Alta de Viaje desde carrier para usuario empresa individuo con tarjeta preautorizada exitosa **Usar tarjeta vinculada existente** Hold OFF | `AUTHORIZE_CARDS.SUCCESS` (stored) | existing | OFF |

### 4.2 Declines

| ID               | Descripción                                                                                                                            | Card |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| TS-AUTHORIZE-TC1065 | Validar Alta de Viaje desde carrier para usuario empresa individuo con tarjeta declinada (ZIP 46282) — error visible, viaje no creado | `AUTHORIZE_CARDS.DECLINE_GENERIC` |

---

## 5. Alta de Viaje desde App Pax – Usuario Personal (Android)

> Depende de screens Appium del Passenger App + capacidad backend de routear pagos por Authorize.net en mobile.

| ID               | Descripción                                                                                                                            | Card |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| TS-AUTHORIZE-TC1071 | Validar Alta de Viaje desde app pax para usuario personal con tarjeta preautorizada exitosa **Vincular tarjeta nueva** Hold ON (cobro desde App Driver al finalizar) | `AUTHORIZE_CARDS.SUCCESS` |
| TS-AUTHORIZE-TC1072 | Validar Alta de Viaje desde app pax para usuario personal con tarjeta preautorizada exitosa **Usar tarjeta vinculada existente** Hold ON | `AUTHORIZE_CARDS.SUCCESS` (stored) |
| TS-AUTHORIZE-TC1073 | Validar Alta de Viaje desde app pax para usuario personal con tarjeta declinada (ZIP 46282) — error visible en app, viaje no creado | `AUTHORIZE_CARDS.DECLINE_GENERIC` |
| TS-AUTHORIZE-TC1100 | Validar Alta de Viaje desde app pax para usuario personal con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` |
| TS-AUTHORIZE-TC1101 | Validar Alta de Viaje desde app pax para usuario personal con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` |
| TS-AUTHORIZE-TC1102 | Validar Alta de Viaje desde app pax para usuario personal con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `AUTHORIZE_CARDS.SUCCESS` |

---

## 6. Alta de Viaje desde App Pax – Usuario Business / Colaborador

| ID               | Descripción                                                                                                                            | Card |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| TS-AUTHORIZE-TC1075 | Validar Alta de Viaje desde app pax para usuario business con tarjeta preautorizada exitosa **Vincular tarjeta nueva** Hold ON | `AUTHORIZE_CARDS.SUCCESS` |
| TS-AUTHORIZE-TC1076 | Validar Alta de Viaje desde app pax para usuario business con tarjeta preautorizada exitosa **Usar tarjeta vinculada existente** Hold ON | `AUTHORIZE_CARDS.SUCCESS` (stored) |
| TS-AUTHORIZE-TC1103 | Validar Alta de Viaje desde app pax para usuario business con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Vincular tarjeta nueva | `AUTHORIZE_CARDS.SUCCESS` |
| TS-AUTHORIZE-TC1104 | Validar Alta de Viaje desde app pax para usuario business con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Usar tarjeta vinculada existente | `AUTHORIZE_CARDS.SUCCESS` (stored) |

---

## 7. Cargo a Bordo – Tarjeta de Crédito – Usuario Personal (desde Carrier)

> Cargo a Bordo = cobro directo sin hold (`authCaptureTransaction`). El cobro ocurre cuando el driver finaliza viaje desde la App Driver. En Authorize, el endpoint backend cambia (no es `authOnly`) pero el comportamiento UI desde Carrier es idéntico al de Stripe.

### 7.1 Escenarios de pago exitoso y rechazo

| ID               | Descripción                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1081 | Validar Alta de viaje desde carrier para usuario personal – cargo a bordo – **pago exitoso** (Visa 4111…1111 + CVV 900) |
| TS-AUTHORIZE-TC1082 | Validar Alta de viaje desde carrier para usuario personal – cargo a bordo – **pago rechazado genérico** (ZIP 46282) |
| TS-AUTHORIZE-TC1083 | Validar Alta de viaje desde carrier para usuario personal – cargo a bordo – **CVV mismatch** (CVV 901) |

> **Nota:** Stripe expone variantes "tarjeta perdida", "tarjeta robada", "fondos insuficientes" — Authorize.net sandbox **no las expone**. No hay equivalente directo. Si se necesita cubrir esos casos en producción, requiere mocks de backend o usar tarjetas reales con bancos cooperantes (no viable para automatización).

### 7.2 Antifraude (AVS)

| ID               | Descripción                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1087 | Validar Alta de viaje desde carrier para usuario personal – cargo a bordo – AVS no match (ZIP 46205) → política antifraude MAGIIS |
| TS-AUTHORIZE-TC1088 | Validar Alta de viaje desde carrier para usuario personal – cargo a bordo – AVS issuer no-USA (ZIP 46204) |

> Stripe tiene tarjetas Radar específicas (cvcFail, maxRisk, alwaysBlocked, postalFail, addressUnavailable). Authorize **no tiene Radar equivalente**; el control de antifraude se reduce a AVS + CVV checks. Mucho menor granularidad.

---

## 8. Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier)

| ID               | Descripción                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1096 | Validar Alta de viaje desde carrier para usuario colaborador – cargo a bordo – **pago exitoso** |
| TS-AUTHORIZE-TC1097 | Validar Alta de viaje desde carrier para usuario colaborador – cargo a bordo – **pago rechazado genérico** (ZIP 46282) |
| TS-AUTHORIZE-TC1098 | Validar Alta de viaje desde carrier para usuario colaborador – cargo a bordo – **CVV mismatch** (CVV 901) |
| TS-AUTHORIZE-TC1099 | Validar Alta de viaje desde carrier para usuario colaborador – cargo a bordo – AVS no match (ZIP 46205) |

---

## 9. Cargo a Bordo – Tarjeta de Crédito – Usuario Empresa Individuo (desde Carrier)

| ID               | Descripción                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| TS-AUTHORIZE-TC1111 | Validar Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **pago exitoso** |
| TS-AUTHORIZE-TC1112 | Validar Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – **pago rechazado genérico** (ZIP 46282) |
| TS-AUTHORIZE-TC1105 | Validar Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – CVC incorrecto |

---

## 10. Stored credentials reuse (placeholder)

Casos relacionados con persistencia de `networkTransId` están detallados en [`matriz_cases2.md`](./matriz_cases2.md) §3.

---

## 11. Trazabilidad cruzada

Ver [`TRACEABILITY.md`](./TRACEABILITY.md) para:
- Mapping bidireccional TC Stripe ↔ TC Authorize.
- TCs Stripe que **NO migran** a Authorize (3DS, decline-capture).
- TCs Authorize **exclusivos** (AVS granular, partial, prepaid).
- Intents canónicos soportados por gateway.

---

*Documento generado siguiendo el patrón `docs/gateway-pg/stripe/matriz_cases.md`.*
*Fecha: 2026-05-13 | Automatización: Playwright (DRAFT, depende BL-025 runtime)*
