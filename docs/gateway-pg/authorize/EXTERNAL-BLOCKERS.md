# Bloqueos externos — Suite Authorize.net Gateway PG

Estos bloqueos requieren acción humana, decisión del líder o configuración de ambiente. **No son bugs de automatización** — son prerequisitos para que BL-025 (runtime) y BL-028 (specs parametrizados Authorize) puedan ejecutarse.

> **Estado global (2026-05-13):** SoT de fixtures lista (BL-024 ✅, fixtures bajo `tests/fixtures/gateways/authorize/`). Runtime POM y specs pendientes — bloqueado por 5 items resolverse en orden.

> **✅ Resultado del probe F3 (2026-07-23) — GO condicionado (regla de exclusividad), NO un bloqueo de backend.** Probe read-only `tests/features/gateway-pg/specs/authorize/probe/appstore-gateways-probe.spec.ts` contra apps-test, carrier **1521 (Remises EEUU, US)**, v1.72.8. La card **Authorize.Net existe** y muestra **"No Disponible"** — pero NO porque el backend la deshabilite: es la **regla de exclusividad "una sola pasarela activa por carrier"** (ver ATP MG-224 / BL-037). Como **Stripe está actualmente vinculado** (card Stripe = "Desvincular"), Authorize/eBiz/MP salen "No Disponible". **Al desvincular Stripe, Authorize pasa a "Vincular"** y su modal de credenciales queda disponible. Evidencia: `evidence/test/probe/{appstore-all,authorize-card}.png`. **Consecuencia:** F4 (Authorize UI) es viable vía el **switching** (`GatewaySwitchSteps.ensureActiveGateway`): desvincular Stripe → vincular Authorize → suite → restaurar Stripe. **Prerrequisitos reales (no backend):** (1) credenciales sandbox Authorize `AUTHORIZE_*` para el modal (§1); (2) ventana exclusiva para el switching destructivo sobre 1521 (desvincular Stripe dispara cleaningWallets → borra la tarjeta 4242 del pax → teardown obligatorio: re-vincular Stripe + re-seed tarjeta + smoke Stripe como gate).

---

## 0. 🔴 BLOQUEANTE ACTIVO — desalineación de cuentas Authorize (medición de pago inválida)

**Estado:** 🔴 Pendiente · **Owner:** dueño de la cuenta Authorize (QA lead) · **Detectado:** 2026-07-29 (ronda 4 del `RUN-LOG.md`, cierre de campaña)
**Bloqueante para:** TODO test que mida dinero con Authorize — hold, alta de tarjeta, matriz de outcomes, cobro a bordo, E2E híbrido (MG-540).

### Hallazgo

**Hay DOS cuentas Authorize en juego y no son la misma.**

| Circuito | Cuenta | Evidencia |
|---|---|---|
| Tests (creds `AUTHORIZE_API_LOGIN_ID` / `AUTHORIZE_TRANSACTION_KEY` de `.env.test`) | **Test Mode** | Respuesta **enlatada idéntica para los 5 triggers**, 15/15 reproducible: `responseCode '1'` · `authCode '000000'` · `transId '0'` · `testRequest '1'` · `avsResultCode 'P'` · `cvvResultCode ''`. Los triggers de ZIP/CVV **nunca se evalúan**. |
| Backend MAGIIS | **otra cuenta / otro modo** | Produjo `state: NO_AUTH` con ZIP 46225 — imposible en Test Mode. Coincide con transacciones de `transId` real (`80057692216`…) y con el filtro AVS disparando en el Merchant Interface. |

### Por qué es un bloqueante y no una curiosidad

1. **Los verdes son vacíos.** Con la cuenta enlatada el hold "aprueba" sin autorizar nada: el test pasa sin haber medido. Es un **falso positivo**, no un skip — el modo de fallo más caro.
2. **La matriz de outcomes miente por construcción.** Los 5 intents devuelven la misma respuesta ⇒ un único comportamiento se reporta como cinco.
3. **Nuestra propia suite contamina el entorno.** `GatewaySwitchSteps.linkAuthorize` vincula la pasarela con **estas mismas** credenciales, así que **un run de la suite CFG deja al carrier apuntando a la cuenta enlatada**. Es la causa raíz de la no-determinación observada entre rondas (ZIP 46225: 1× `NO_AUTH` vs 2× `SEARCHING_DRIVER`) y de los viajes "No Authorized" del tablero.
4. **Invalida la pata API de la trifuerza** como oráculo del flujo E2E de Authorize hasta que se alineen.

### Mitigación ya implementada en el repo (no reemplaza la acción requerida)

`tests/features/gateway-pg/helpers/authorize-account-guard.ts` — gate de **validez de medición**. Detecta la firma enlatada (`transId '0'` + `authCode '000000'`) con un `authOnly` de control (memoizado por worker) y **falla ruidosamente** con mensaje accionable antes de crear el viaje. Cableado en las tres costuras que miden dinero: `CarrierHoldSteps.runHoldScenario`, `defineWalletAddCardSuite`, `defineCardOutcomeMatrixSuite`. **NO** se aplica a la suite CFG (link/unlink/exclusividad/status no miden dinero y son válidos contra cualquier cuenta).

Read-out del entorno en 5 s: `ENV=test npx playwright test -c playwright.gateway-pg.config.ts --grep "@probe veredicto del guard" --workers=1` → `specs/authorize/probe/account-mode-probe.spec.ts` imprime el veredicto y el mensaje exacto del corte.

### Acción requerida

Poner en `.env.test` las credenciales (**API Login ID + Transaction Key**) de la **misma** cuenta Authorize que administra el equipo — la que tiene los filtros AVS configurados y devuelve `transId` reales — y **re-vincular la pasarela**. Con una sola cuenta en todo el circuito:

- los 8 contract tests rojos de `api/authorize-sandbox/` pasan a ser medibles (hoy fallan por la cuenta, **no** por drift de producto);
- los triggers ZIP/CVV dejan de ser inertes y la matriz de outcomes mide 5 comportamientos distintos;
- la pata API vuelve a ser oráculo válido (incluido `getTransactionDetails` para verificar la captura de MG-540);
- la contaminación del link se vuelve inocua (vincular con `.env` = vincular con la cuenta correcta).

Nunca al repo: solo `.env.test` (gitignored).

### Validación post-resolución

1. El probe de arriba imprime **🟢 REAL**.
2. `sandbox-avs-cvv-account-probe.spec.ts` muestra `avsResultCode`/`cvvResultCode` **distintos entre triggers** (hoy: `P` / `''` en los 5).
3. Los specs de pago dejan de cortar por el guard.

---

## 1. Sandbox keys Authorize.net

**Estado:** 🔴 Pendiente
**Owner:** Lead QA + Backend tech lead
**Bloqueante para:** TODO test que llame a la API Authorize sandbox (`https://apitest.authorize.net/xml/v1/request.api`).

### Síntoma esperado si no se resuelve

Cualquier intento de crear viaje desde Carrier con Authorize fallará en el step de "Confirmar tarjeta" con uno de:
- Response Code 3 + message code `E00008` (`User authentication failed due to invalid authentication values`).
- Timeout o network error si las credenciales son strings inválidos (sin formato esperado).

### Acción requerida

1. **Solicitar acceso al Merchant Interface sandbox:** https://sandbox.authorize.net/
2. Crear (o reutilizar) una cuenta sandbox del merchant MAGIIS.
3. Generar:
   - **API_LOGIN_ID** — máximo 20 caracteres, identificador público del merchant.
   - **API_TRANSACTION_KEY** — máximo 16 caracteres, secreto. Cada vez que se regenera, invalida la anterior.
4. (Opcional) generar **Client Key** para Accept.js si se confirma que el modelo de integración usa Accept.js (ver bloqueante §3).
5. Cargar en variables de entorno locales y CI:

   ```bash
   # .env.test (gitignored, jamás commitear)
   AUTHORIZE_API_LOGIN_ID=<20-char-login-id>
   AUTHORIZE_TRANSACTION_KEY=<16-char-transaction-key>
   AUTHORIZE_CLIENT_KEY=<accept-js-client-key-si-aplica>
   ```

6. (Opcional pero recomendado) replicar en `.env.uat` para tests post-merge.
7. Documentar la rotación de keys (recomendación: cada 90 días).

### Validación post-resolución

- Ejecutar un `curl` smoke contra el endpoint:

  ```bash
  curl -s -X POST https://apitest.authorize.net/xml/v1/request.api \
    -H "Content-Type: application/json" \
    -d '{
      "authenticateTestRequest": {
        "merchantAuthentication": {
          "name": "'$AUTHORIZE_API_LOGIN_ID'",
          "transactionKey": "'$AUTHORIZE_TRANSACTION_KEY'"
        }
      }
    }'
  ```

  Debería retornar `messages.resultCode = "Ok"` y `message.code = "I00001"`.

---

## 2. Decisión líder — ¿MAGIIS PROD usa Authorize.net?

**Estado:** 🔴 Pendiente
**Owner:** Líder técnico MAGIIS
**Bloqueante para:** la priorización completa de BL-025 / BL-028.

### Contexto

- Stripe es el gateway de referencia (cobertura completa P1) y se asume en producción MAGIIS USA.
- Authorize.net puede estar:
  - **(a) en uso productivo** — MAGIIS routea pagos de algunos merchants/contractors via Authorize → BL-025 P1.
  - **(b) en uso TEST únicamente** (PoC de multi-gateway, sin clientes productivos) → BL-025 P2.
  - **(c) sin uso productivo previsto** → BL-025 deprioritizar a P3 / cancelar.

### Acción requerida

Sesión técnica con líder para confirmar:

1. ¿Hay merchants activos con Authorize.net configurado como gateway primario o fallback?
2. ¿En qué portales/flows? (Carrier, Contractor, App Pax, Cargo a Bordo).
3. ¿Volumen estimado de transacciones Authorize vs Stripe? (impacta criticidad).
4. Si la respuesta es **(a)** → ¿requiere también cobertura E2E híbrido (Carrier+Driver)?
5. Si la respuesta es **(b)** o **(c)** → ¿se mantiene la matriz como documentación de referencia o se archiva?

### Impacto sobre el resto del scope

- Si **(a)** o **(b)**: continúa toda la cadena BL-025 → BL-028 → ejecución CI con `--workers=1`.
- Si **(c)**: archivar este directorio en `docs/archive/` y desmontar el slot `tests/features/gateway-pg/specs/authorize/` con anotación de razón.

---

## 3. Modelo de integración Authorize en MAGIIS

**Estado:** 🔴 Pendiente
**Owner:** Backend tech lead + Frontend MAGIIS
**Bloqueante para:** diseño del POM web Authorize (`tests/pages/...`).

### Contexto

Authorize.net ofrece 3 modelos de integración (ver [`ARCHITECTURE.md`](./ARCHITECTURE.md) §2):

| Modelo | Descripción | Impacto en automation |
| --- | --- | --- |
| **Accept.js** | iframe-based, client-side capture, nonce backend | Requiere helper de iframe similar a Stripe Elements |
| **Accept Hosted** | redirect a página alojada por Authorize | Test debe manejar redirect cross-domain |
| **API directa via backend** | el portal recibe los datos en claro, backend envía a Authorize | Form puede ser el shared card form actual MAGIIS sin iframe |

### Acción requerida

Sesión con backend MAGIIS para confirmar:

1. ¿Cuál de los 3 modelos usa MAGIIS para Authorize en el portal Carrier?
2. ¿El frontend embebe el iframe Accept.js o usa el shared form de MAGIIS?
3. Si Accept.js: ¿hay un Client Key en el frontend o el flow es íntegramente backend?
4. ¿El endpoint backend MAGIIS que media con Authorize ya existe en TEST? URL + payload schema.

### Impacto

- Si **Accept.js**: implementar `tests/pages/carrier/AuthorizeAcceptJsIframePage.ts` con locators del iframe.
- Si **Accept Hosted**: implementar manejo de redirect en `tests/features/gateway-pg/helpers/`.
- Si **API directa**: reutilizar `tests/pages/carrier/GatewayPgCardLinkingPage.ts` actual con branch específico.

---

## 4. POM web Authorize — selectores aún no documentados

**Estado:** 🔴 Pendiente
**Owner:** QA Automation + Frontend MAGIIS
**Depende de:** §3 (modelo de integración).

### Contexto

Los specs Authorize necesitarán un POM que:
- Cargue la pantalla Authorize del portal MAGIIS.
- Localice los inputs (number, expiry, CVV, ZIP, holder).
- Soporte CVV de 3 dígitos (Visa/MC/Discover) y 4 dígitos (Amex).
- Detecte mensajes de error inline.
- Detecte el response code Authorize tras submit (network interception o UI marker).

### Acción requerida

1. Confirmar §3 (modelo de integración).
2. Hacer DOM dump del form Authorize en portal Carrier TEST (manual o automatizado).
3. Identificar selectores estables (`getByLabel`, `getByRole`, `[data-testid]`).
4. Crear el POM en `tests/pages/carrier/` siguiendo el patrón existente (`GatewayPgCardLinkingPage.ts`).
5. Validar el POM con un test smoke happy path (TC1011).

### Anti-patrones a evitar

- No usar CSS selectors profundos (`div > div > input[type=text]:nth-child(3)`).
- No usar texto inestable (si el merchant cambia el label, rompe el test).
- No bypassear el iframe via `frame[name=...]` sin documentar el nombre canónico — preferir `page.frameLocator(...)` con selector estable.

---

## 5. Backend MAGIIS — soporte E2E híbrido Authorize

**Estado:** 🔴 Pendiente
**Owner:** Backend tech lead
**Bloqueante para:** Flow 1 (Carrier Web + Driver App) y Flow 2 (Passenger App + Driver App) con Authorize.

### Contexto

Los E2E híbridos requieren que:
1. El portal carrier (o app pax) cree el viaje con hold Authorize.
2. El backend persista el `transactionId` Authorize en el contexto del viaje.
3. La Driver App reciba la solicitud de viaje.
4. Al finalizar viaje desde la Driver App, el backend dispare `priorAuthCaptureTransaction` contra Authorize con el `refTransId` correcto.
5. Authorize responda Approved.
6. El viaje pase a estado `payment-validated` en MAGIIS.

### Acción requerida

Confirmar con backend que:

1. La tabla `payments` (o equivalente) tiene columna `gateway` que soporta `'authorize'` además de `'stripe'`.
2. El worker / job que dispara capture al finalizar viaje lee el `gateway` y rutea a Authorize si aplica.
3. Existe un endpoint admin para forzar capture manual de un Authorize hold (para tests de unhappy paths).
4. La Driver App detecta correctamente el método de pago Authorize (sin reglas hardcodeadas Stripe-only).

### Bloqueante derivado

Si el backend no soporta routing por gateway en capture, los E2E híbridos Authorize (`TC1301..TC1303`, `TC1311..TC1312`) **no son automatizables hasta que se implemente**. Crear ticket en `docs/ops/BACKLOG.md` como BL nuevo.

---

## 6. Coordinación BL-024 / BL-025 / BL-028

**Estado:** 🟡 Parcial

| Backlog | Estado actual | Notas |
| --- | --- | --- |
| **BL-024** — Umbrella multi-gateway + resolver | ✅ Hecho (2026-05-13) | Fixtures bajo `tests/fixtures/gateways/authorize/` + resolver cross-gateway listo |
| **BL-025** — Test data Authorize SoT | 🟡 SoT datos ✅ + runtime POM/spec 🔴 | Bloqueado por §1, §2, §3, §4 de este doc |
| **BL-028** — Specs parametrizados cross-gateway | 🟡 Piloto ✅ + migración bulk 🔴 + Authorize 🔴 | Piloto solo corre Stripe; necesita BL-025 para validar Authorize |

### Próximas acciones (orden)

1. Resolver §1 (sandbox keys) — desbloquea cualquier test.
2. Resolver §2 (decisión líder PROD) — define prioridad.
3. Resolver §3 (modelo integración) — desbloquea POM.
4. Resolver §4 (POM web) — entregable: `tests/pages/carrier/Authorize*.ts`.
5. Crear primer spec piloto Authorize en `tests/features/gateway-pg/specs/authorize/web/carrier/hold/apppax-hold-no3ds.spec.ts` reusando el patrón parametrizado de BL-028.
6. Validar el piloto contra el sandbox real (1 happy + 1 decline).
7. Agregar `'authorize'` a `ACTIVE_GATEWAYS` en `tests/features/gateway-pg/specs/_parametrized/hold-happy-no3ds.parametrized.spec.ts`.
8. Migrar el resto de specs Stripe equivalentes (ver mapping en [`TRACEABILITY.md`](./TRACEABILITY.md) §3.1).

---

## 7. Variables de entorno consolidadas

Resumen de todas las variables `.env` que Authorize requiere:

| Variable | Propósito | Bloqueante § |
| --- | --- | --- |
| `AUTHORIZE_API_LOGIN_ID` | Auth header API requests | §1 |
| `AUTHORIZE_TRANSACTION_KEY` | Auth header API requests | §1 |
| `AUTHORIZE_CLIENT_KEY` | Accept.js iframe (si aplica) | §1 + §3 |
| `AUTHORIZE_SANDBOX_API_URL` | Override del endpoint si se usa proxy/mock | (opcional) |

**Regla de seguridad:** ninguna de estas variables debe aparecer en commits, logs públicos, ni reports CI. Si una credencial se filtra accidentalmente:
1. Loguearse al Merchant Interface sandbox.
2. Account → API Credentials & Keys → "New Transaction Key" → confirmar reemplazo (invalida la anterior).
3. Actualizar `.env.test` y secrets de CI.

---

## 8. Estado actual (2026-05-13)

| Item | Bloqueo | Acción | Responsable |
| --- | --- | --- | --- |
| §1 Sandbox keys | Credenciales sandbox no cargadas | Solicitar acceso Merchant Interface + cargar `.env` | Lead QA |
| §2 Decisión PROD | No confirmado si MAGIIS PROD usa Authorize | Sesión con líder técnico | Líder técnico |
| §3 Modelo integración | Accept.js vs Hosted vs API no confirmado | Sesión con backend MAGIIS | Backend tech lead |
| §4 POM web | Selectores no documentados | DOM dump + crear POM | QA Automation |
| §5 Backend E2E híbrido | Capture worker no validado con Authorize | Confirmar routing por `gateway` | Backend tech lead |
| §6 Coordinación backlog | BL-025 / BL-028 esperando §1-§5 | Ejecutar en orden tras desbloqueos | Orquestador |

> **Mientras estos bloqueantes estén abiertos**, la documentación de este directorio sirve como SoT de la matriz QA Authorize pero **no hay tests automatizados ejecutándose** contra el gateway. Los fixtures son consumibles pero no hay specs que los usen.
