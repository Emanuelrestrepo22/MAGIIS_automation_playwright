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

**Resultado esperado (TC1016):** Debería mostrar el error de validación de la tarjeta con el mensaje de Authorize **en el paso de vinculación**; debería dejar "Seleccionar Vehículo" deshabilitado y **no crear el viaje** (no aparece en "Por asignar" ni en "Buscando conductor"). Queda **descartado** el desenlace alternativo "detalle en estado `NO_AUTORIZADO`": con Hold ON el rechazo ocurre antes del armado del viaje — ver "Punto de rechazo canónico con Hold ON" abajo.

**Observaciones:**
- Network: `transactionResponse.responseCode = "2"`, `responseReasonCode` típicamente `2` (referral/decline).
- Equivalente Stripe: `TS-STRIPE-TC1059` (insufficient funds Hold ON) y `TS-STRIPE-P2-TC090` (generic decline contractor).
- **Punto de rechazo canónico con Hold ON:** el rechazo cae en la **vinculación de la tarjeta**, no en el alta del viaje. Con el hold activo el sistema dispara un hold de verificación de bajo monto para poder vincular la tarjeta; si la pasarela lo declina no queda tarjeta vinculada, "Seleccionar Vehículo" no se habilita y el flujo nunca llega al armado del viaje. Aplica a §2.2, §2.3 y §2.4. Ref: BL-051 (un alta con tarjeta nueva genera DOS transacciones: vinculación + viaje).
  Monto del hold de vinculación: **$10.00**, observado el 2026-07-28 en transacciones retenidas en *Fraud Review*. BL-051 documentó la contraparte **anulada** (`Voided`), donde la columna de monto del dashboard aparece vacía — no es un dato contradictorio sino el mismo hold en otro estado.
- ✅ **Trigger VERIFICADO (2026-07-30):** el ZIP `46282` devuelve **Response Code 2** (decline genérico) contra la cuenta sandbox. Confirmado por el spec de contrato API `contract-decline.api.spec.ts`, verde.
  Historial: el 2026-07-28 este mismo trigger **aprobaba** en lugar de declinar (observado por UI y por API) porque la cuenta no evaluaba el ZIP. Se resolvió al completar la configuración de los filtros antifraude — ver la nota de §2.4. El expected de arriba nunca cambió; lo que cambió fue que la cuenta empezó a evaluarlo.

> **Estado de automatización (2026-07-28) — nivel CONTRATO ≠ nivel UI.** El CONTRATO del sandbox para el trigger ZIP `46282` está automatizado a nivel API en `tests/features/gateway-pg/api/authorize-sandbox/contract-decline.api.spec.ts`, con su propio Test Xray de nivel contrato: **MG-594** (`tcid:TC-PAY-SBX-05`; rango del pack: MG-590..MG-601 = `tcid` TC-PAY-SBX-01..12, creados 2026-07-28, agrupados en el Test Set **MG-602** "ATP · SBX — Contrato sandbox Authorize.Net (BL-036)" y miembros del Test Plan MG-178 y del Test Execution MG-558). Ese test solo verifica la RESPUESTA del PSP (`responseCode = "2"`). El flujo UI de Alta de Viaje que describen TC1016 / TC1017 (pop-up de error + viaje NO creado) sigue **SIN automatizar** — gap declarado; los TC de esta sección NO se acreditan con los contract tests API.

### 2.3 CVV triggers (901 mismatch, 902 should-be, 903 issuer, 904 not-processed)

| ID               | Descripción                                                                                                                                                          | CVV | Card | Hold | Outcome |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ---- | ------- |
| TS-AUTHORIZE-TC1021 | Validar Alta de Viaje desde carrier para usuario personal con tarjeta CVV mismatch (CVV 901) Hold ON — sistema rechaza el alta por validación CVV "N: Does NOT match" | `901` | `AUTHORIZE_CARDS.DECLINE_CVV` | ON | `cvvResultCode = "N"` → **Debería** rechazar la tarjeta en la vinculación (mismo desenlace que TC1031): error visible, "Seleccionar Vehículo" no se habilita y el viaje NO se crea — política de cuenta USA 2026-07-28 |
| TS-AUTHORIZE-TC1022 | Validar Alta de Viaje desde carrier para usuario personal con tarjeta CVV mismatch (CVV 901) Hold OFF — comportamiento equivalente al TC1021 sin retención previa     | `901` | `AUTHORIZE_CARDS.DECLINE_CVV` | OFF | `cvvResultCode = "N"` |
| TS-AUTHORIZE-TC1023 | Validar Alta de Viaje desde carrier para usuario personal con CVV `902` (should be on card but not indicated) Hold ON                                                | `902` | `AUTHORIZE_CARDS.SUCCESS` (override CVV) | ON | `cvvResultCode = "S"` — Response Code 1 con flag CVV. Documentar si MAGIIS lo trata como warning o decline. |
| TS-AUTHORIZE-TC1024 | Validar Alta de Viaje desde carrier para usuario personal con CVV `903` (issuer not certified) Hold ON                                                               | `903` | `AUTHORIZE_CARDS.SUCCESS` (override CVV) | ON | `cvvResultCode = "U"` |
| TS-AUTHORIZE-TC1025 | Validar Alta de Viaje desde carrier para usuario personal con CVV `904` (CVV not processed) Hold ON — viaje crea exitosamente con flag `cvvResultCode=P`             | `904` | `AUTHORIZE_CARDS.CVV_NOT_PROCESSED` | ON | `cvvResultCode = "P"` — Response Code 1 |
| TS-AUTHORIZE-TC1026 | Validar reintento exitoso desde detalle del viaje tras fallo CVV 901 — usuario reintenta con CVV 900 desde tarjeta nueva → viaje pasa a "Buscando conductor"          | `900` (reintento) | `AUTHORIZE_CARDS.SUCCESS` | ON | Reintento OK, viaje activo |

> **Decisión de política CVV (líder de QA, 2026-07-28) — reemplaza el TODO exploratorio:** CVV mismatch (`901`, `cvvResultCode = "N"`) **rechaza**. El desenlace es idéntico al de AVS no match (TC1031): rechazo en la **vinculación de la tarjeta**, sin tarjeta vinculada y sin viaje creado (ver "Punto de rechazo canónico con Hold ON" en §2.2). Racional: se extiende al CVV la regla de negocio de USA "sin match = falla" — **política de cuenta USA 2026-07-28** — para que el comportamiento esperado sea el mismo que en Stripe, donde la tarjeta equivalente (`DECLINE_INVALID_CVC`, 4000…0127) rechaza de fábrica.
>
> **SUPERSEDED:** esta decisión anula la del **2026-07-27** ("CVV mismatch → aceptar con flag, el viaje se crea"). Razón: la premisa de parametrización del proyecto exige **un mismo comportamiento esperado para todas las pasarelas** — sólo cambian los datos de entrada; un expected divergente Authorize-vs-Stripe rompe los specs `_parametrized`. Alcance: TC1021, TC1022 y todo TC que herede el desenlace CVV por referencia (TC1057, TC1083, TC1098, TC1105).
>
> ✅ **Bloqueo RESUELTO (2026-07-30):** el filtro **Enhanced Card Code Verification (CCV)** de la cuenta sandbox pasó a **Enabled** con la política `N (Does not match) → Decline` · `P` / `S` / `U` → Allow. El echo del CVV ya llega: `CVV 901 → cvvResultCode "N"` y `CVV 904 → "P"`, verificado por `contract-cvv-avs.api.spec.ts` (verde). TC1021 y TC1022 pasan de bloqueados a **ejecutables**.
>
> El mapa completo del filtro CCV, por si hace falta reproducir la cuenta:
>
> | Card code | Descripción | Filtro |
> | --- | --- | --- |
> | `N` | Does not match | **Decline** |
> | `P` | Is not processed | Allow |
> | `S` | Should be on card, but is not indicated | Allow |
> | `U` | Issuer is not certified or has not provided encryption key | Allow |
>
> Sólo `N` rechaza — coherente con la regla "sin match = falla": los otros tres códigos significan *no se pudo verificar*, no *no coincide*.

> **Estado de automatización (2026-07-28) — nivel CONTRATO ≠ nivel UI.** El CONTRATO del sandbox para los triggers CVV `901` y `904` está automatizado a nivel API en `tests/features/gateway-pg/api/authorize-sandbox/contract-cvv-avs.api.spec.ts`, con Tests Xray propios de nivel contrato: **MG-595** (CVV 901 → `cvvResultCode = "N"`, `tcid:TC-PAY-SBX-06`) y **MG-596** (CVV 904 → `cvvResultCode = "P"`, `tcid:TC-PAY-SBX-07`) (rango del pack: MG-590..MG-601 = `tcid` TC-PAY-SBX-01..12, creados 2026-07-28, agrupados en el Test Set **MG-602** y miembros del Test Plan MG-178 y del Test Execution MG-558). Esos tests solo verifican la RESPUESTA del PSP. El flujo UI de Alta de Viaje que describen TC1021 / TC1022 / TC1025 (política MAGIIS de aceptar o rechazar el flag) sigue **SIN automatizar** — gap declarado; los TC de esta sección NO se acreditan con los contract tests API.

### 2.4 AVS triggers (no match, non-US, otros)

| ID               | Descripción                                                                                                                            | ZIP | Card | Hold | Outcome |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ---- | ------- |
| TS-AUTHORIZE-TC1031 | Validar Alta de Viaje desde carrier para usuario personal con AVS no match (ZIP 46205) Hold ON                                       | `46205` | `AUTHORIZE_CARDS.AVS_NO_MATCH` | ON | `avsResultCode = "N"` (Address & ZIP no match) → **Debería** rechazar la tarjeta en la vinculación: error visible, "Seleccionar Vehículo" no se habilita y el viaje **NO se crea** — política de cuenta USA 2026-07-28 |
| TS-AUTHORIZE-TC1032 | Validar Alta de Viaje desde carrier para usuario personal con AVS ZIP 9-digit match (ZIP 46211)                                       | `46211` | `AUTHORIZE_CARDS.SUCCESS` (override ZIP) | ON | `avsResultCode = "W"` |
| TS-AUTHORIZE-TC1033 | Validar Alta de Viaje desde carrier para usuario personal con AVS address+ZIP 9-digit match (ZIP 46214)                              | `46214` | `AUTHORIZE_CARDS.SUCCESS` (override ZIP) | ON | `avsResultCode = "X"` — no aplica a Visa por nota oficial; validar con Mastercard |
| TS-AUTHORIZE-TC1034 | Validar Alta de Viaje desde carrier para usuario personal con AVS ZIP match address no match (ZIP 46217)                            | `46217` | `AUTHORIZE_CARDS.SUCCESS` (override ZIP) | ON | `avsResultCode = "Z"` |
| TS-AUTHORIZE-TC1035 | Validar Alta de Viaje desde carrier para usuario personal con AVS issuer no-USA (ZIP 46204) Hold ON                                  | `46204` | `AUTHORIZE_CARDS.AVS_NON_US` | ON | `avsResultCode = "G"` — el banco emisor no soporta AVS |
| TS-AUTHORIZE-TC1036 | Validar Alta de Viaje desde carrier para usuario personal con AVS system unavailable (ZIP 46207)                                     | `46207` | `AUTHORIZE_CARDS.SUCCESS` (override ZIP) | ON | `avsResultCode = "R"` |
| TS-AUTHORIZE-TC1037 | Validar Alta de Viaje desde carrier para usuario personal con AVS invalid data (ZIP 46203)                                           | `46203` | `AUTHORIZE_CARDS.SUCCESS` (override ZIP) | ON | `avsResultCode = "E"` |

> **Política antifraude de la cuenta sandbox — Enhanced AVS (configurada por el líder de QA; política de cuenta USA 2026-07-28):** aplica la regla de negocio de USA para validación de tarjetas, *sin match de ZIP = falla*. Mapa configurado en *Fraud Filters → Enhanced AVS*:
>
> | AVS code | Significado | Filtro | Efecto esperado en MAGIIS |
> | --- | --- | --- | --- |
> | `N` | Street No Match / ZIP No Match | **Decline** | Debería rechazar la tarjeta en la vinculación; viaje NO creado |
> | `A` | Street Matched / ZIP No Match | **Decline** | Debería rechazar la tarjeta en la vinculación; viaje NO creado |
> | `Z` / `W` / `Y` | ZIP Matched | **Allow** | Debería vincular la tarjeta y permitir crear el viaje |
> | `U` | Address information unavailable | **Decline** | Debería rechazar la tarjeta en la vinculación; viaje NO creado |
> | `S` | Issuing bank does not support AVS | **Decline** | Debería rechazar la tarjeta en la vinculación; viaje NO creado |
>
> El expected verificable **no es el código AVS** — es artefacto del proveedor y se asserta sólo como evidencia de red — sino el efecto en MAGIIS. Punto de rechazo: la **vinculación de la tarjeta**, ver §2.2.
>
> ✅ **TRIGGERS VERIFICADOS (2026-07-30) — BL-036 RESUELTO.** La cuenta ya evalúa CVV y ZIP. Confirmado con los 4 specs de contrato API del sandbox (`api/authorize-sandbox/contract-*.api.spec.ts`), **11/11 verdes**:
>
> | Trigger | Esperado | Observado 2026-07-28 | Observado 2026-07-30 |
> | --- | --- | --- | --- |
> | ZIP `46205` (TC1031) | `avsResultCode = "N"` | `"P"` — no evaluaba | **`"N"`** ✅ |
> | ZIP `46204` (TC1035) | `avsResultCode = "G"` | `"P"` | **`"G"`** ✅ |
> | ZIP `46282` (§2.2) | Response Code 2 | aprobaba | **Response Code 2** ✅ |
> | CVV `901` (§2.3) | `cvvResultCode = "N"` | `""` — CCV deshabilitado | **`"N"`** ✅ |
> | CVV `904` (§2.3) | `cvvResultCode = "P"` | `""` | **`"P"`** ✅ |
>
> **Qué lo destrabó**: habilitar el filtro *Enhanced Card Code Verification (CCV)* en la cuenta (Status → Enabled, con `N = Decline`). Hasta entonces la cuenta no evaluaba ni el CVV ni el ZIP y devolvía `avsResultCode = "P"` (*AVS not applicable*) para cualquier ZIP, así que ninguna fila de la tabla de filtros de arriba se alcanzaba — por más bien configurada que estuviera.
>
> ⚠️ **Lección de atribución**: entre el 22/07 y el 29/07 este síntoma se investigó como credenciales sin habilitar, como Test Mode, y como política AVS mal configurada. Era **el filtro CCV deshabilitado**. Los expected de la matriz nunca estuvieron mal; lo que faltaba era que la cuenta los pudiera producir.
>
> **Pendiente de acreditación por UI**: los casos de este bloque quedaron sin re-correr por UI porque el carrier 1521 pasó a eBizCharge (exclusividad de pasarela activa, `ARCHITECTURE.md` §1.bis). Requiere re-vincular Authorize. La corrida de UI del 2026-07-28 falló con "la pasarela ACEPTÓ la tarjeta que debía rechazar", que era el síntoma del trigger inerte — **no es un rojo de código**.
>
> **Residual exploratorio:** los códigos `X`, `G`, `R` y `E` (TC1033, TC1035, TC1036, TC1037) **no están cubiertos** por el mapa de filtros; siguen sin expected verificable y no deben acreditarse como pass/fail hasta que se defina su política.

> **Estado de automatización (2026-07-28) — nivel CONTRATO ≠ nivel UI.** El CONTRATO del sandbox para los triggers AVS `46205` y `46204` está automatizado a nivel API, con Tests Xray propios de nivel contrato: **MG-597** (ZIP 46205 → `avsResultCode = "N"`, en `contract-cvv-avs.api.spec.ts`, `tcid:TC-PAY-SBX-08`) y **MG-599** (ZIP 46204 → `avsResultCode = "G"`, en `contract-edge.api.spec.ts`, `tcid:TC-PAY-SBX-10`) (rango del pack: MG-590..MG-601 = `tcid` TC-PAY-SBX-01..12, creados 2026-07-28, agrupados en el Test Set **MG-602** y miembros del Test Plan MG-178 y del Test Execution MG-558). Esos tests solo verifican la RESPUESTA del PSP. El flujo UI de Alta de Viaje que describen TC1031 / TC1035 sigue **SIN automatizar** — gap declarado; los TC de esta sección NO se acreditan con los contract tests API.

### 2.5 Partial / Prepaid authorizations (edge cases)

| ID               | Descripción                                                                                                                            | ZIP | Card | Hold | Outcome |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---- | ---- | ------- |
| TS-AUTHORIZE-TC1041 | Validar Alta de Viaje desde carrier para usuario personal con Partial Authorization (ZIP 46225) Hold ON — solo $1.23 autorizado del total | `46225` | `AUTHORIZE_CARDS.PARTIAL_AUTH` | ON | Approved parcial — validar política MAGIIS: aceptar partial o forzar declinar |
| TS-AUTHORIZE-TC1042 | Validar Alta de Viaje desde carrier para usuario personal con Prepaid Auth ($1.23 balance restante, ZIP 46226) Hold ON                | `46226` | `AUTHORIZE_CARDS.PARTIAL_AUTH` (override ZIP) | ON | Approved con balance reportado |
| TS-AUTHORIZE-TC1043 | Validar Alta de Viaje desde carrier para usuario personal con Prepaid Auth ($0 balance, ZIP 46228) Hold ON                            | `46228` | `AUTHORIZE_CARDS.PREPAID_ZERO` | ON | Approved con balance cero — flag explícito |

> **Decisión de negocio pendiente:** ¿MAGIIS acepta Partial Authorization? Stripe no expone este caso de forma directa; es una capacidad exclusiva Authorize. Si MAGIIS lo rechaza por política, el TC se mueve a "expected decline".

> **Estado de automatización (2026-07-28) — nivel CONTRATO ≠ nivel UI.** El CONTRATO del sandbox para los triggers ZIP `46225` (partial) y `46228` (prepaid balance cero) está automatizado a nivel API en `tests/features/gateway-pg/api/authorize-sandbox/contract-edge.api.spec.ts`, con Tests Xray propios de nivel contrato: **MG-600** (ZIP 46225, `tcid:TC-PAY-SBX-11`) y **MG-601** (ZIP 46228, `tcid:TC-PAY-SBX-12`) (rango del pack: MG-590..MG-601 = `tcid` TC-PAY-SBX-01..12, creados 2026-07-28, agrupados en el Test Set **MG-602** y miembros del Test Plan MG-178 y del Test Execution MG-558). Esos tests solo verifican la RESPUESTA del PSP — y hoy el monto parcial / el bloque `prePaidCard` NO son asertables porque la cuenta sandbox está en TEST MODE (ver los `TODO(live)` del spec). El flujo UI de Alta de Viaje que describen TC1041 / TC1043 sigue **SIN automatizar** — gap declarado; los TC de esta sección NO se acreditan con los contract tests API.

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

> **Oráculo automatizado del alta de tarjeta (flujos "Vincular tarjeta nueva" — TC1051/TC1052 y spec WAL `TS-AUTHORIZE-WAL-01`/MG-285):** la vinculación exitosa se asserta por **ESTADO**, no por toast: tras "Validar", el form nativo se colapsa y la **Forma de Pago queda RESUELTA a `Tarjeta de crédito … *** <last4>`** (`CarrierNewTravelPage.validateNativeCard`, timeout 45s por el RTT al sandbox del PSP).
>
> **Por qué cambió** (live 2026-07-28): el oráculo anterior era el texto **"Tarjeta válida" / "Valid card"** (verificado 2026-07-27 con la cuenta sandbox en **Test Mode**, commit `aa780b3`, 3x verde en TEST). Bajo **Live Mode + política AVS estricta** de la cuenta sandbox Authorize ese toast dejó de emitirse: la validación **SÍ guardaba y preseleccionaba** la tarjeta (confirmado por API — card id nueva en `paymentMethodsByPax`) pero el assert de texto fallaba → **falso negativo por oráculo efímero**. Regla derivada: **estado persistente > toast**.
>
> **Alcance de la evidencia live:** el estado post-validación está verificado para el spec WAL (Visa 4111 + CVV 900 + **ZIP 10001**). TC1051/TC1052 usan `AUTHORIZE_CARDS.SUCCESS` (**ZIP 90210**), combinación AÚN sin captura live del oráculo.

> **Nota de numeración — IDs de spec que NO son filas TC1xxx de esta matriz.** Dos specs de Authorize usan numeración propia y por diseño no tienen fila en las tablas de arriba:
>
> | ID de spec | Spec | Key Xray | Estado |
> |---|---|---|---|
> | `TS-AUTHORIZE-WAL-01` | `specs/_parametrized/factories/wallet-add-card.factory.ts` (alta de tarjeta pre-autorizada) | MG-285 | anomalía ya reconocida — numeración WAL propia del spec |
> | `TS-AUTHORIZE-SMOKE-01` | `specs/authorize/web/carrier/smoke/authorize-linked-smoke.spec.ts` (Authorize figura vinculada en el App Store) | **ninguna (por diseño)** | numeración SMOKE propia del spec |
>
> El smoke **no lleva key Xray a propósito**: solo verifica el estado YA-vinculado, así que acreditar MG-220 (TC1002 · link con credenciales válidas) sin ejecutar el flujo de link inflaría evidencia. Queda como `unmapped` en el summary del reporter — comportamiento **real** desde 2026-07-28: antes el fallback por título del `xray-reporter` extraía del corchete la key basura `SMOKE-01` y la emitía al execution MG-558; hoy el fallback solo acepta keys del prefijo del proyecto (`MG-\d+`). Ninguno de estos dos IDs debe buscarse como TC1xxx en esta matriz.

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
