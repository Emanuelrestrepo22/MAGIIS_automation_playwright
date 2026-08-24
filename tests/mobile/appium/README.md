# Mobile Appium

This folder contains the Android mobile execution layer used by MAGIIS hybrid E2E journeys.

> **Appium MCP connection (discovery layer)**: for wiring the `appium-mcp-driver` /
> `appium-mcp-passenger` servers in the `agentic-qa-boilerplate` repo — env vars,
> the `${VAR}` vs `.env` gotcha, and how to verify the connection to this same
> device — see `docs/testing/mobile-appium-mcp.md` in that repo. This README stays
> the canonical source for stable WebdriverIO execution (runners, harnesses,
> confirmed selectors); that doc only covers the MCP discovery layer.

## Onboarding: de cero a una suite corriendo

Esta sección está pensada para leerse **en orden y una sola vez**. Si es tu primer contacto con
la capa mobile, seguila de arriba a abajo; después usá las secciones de referencia del final.

### 1. Qué es esta capa, y qué no

Las apps de MAGIIS (Driver y Passenger) son **híbridas**: un contenedor nativo Android que adentro
corre una web app Ionic/Angular. Eso tiene una consecuencia práctica que ordena todo lo demás:

- lo que **se toca** (botones nativos, permisos, el teclado) vive en el lado nativo;
- lo que **se mide** (requests HTTP, el DOM, los valores de un formulario) vive dentro del WebView.

Appium es lo único que alcanza los dos lados en la misma sesión. Por eso existe esta capa.

**Lo que NO cubre**: los portales web (carrier, contractor, owner) van por Playwright puro, sin
Appium. Si tu ticket es de un portal web, no necesitás nada de acá.

### 2. Modelo mental

Antes de instalar, conviene tener claro quién habla con quién. Cada flecha es un salto donde algo
puede fallar, y saber cuál es te ahorra la mitad del diagnóstico:

```text
   TU PC                                            TELEFONO ANDROID
   +--------------------------------+               +---------------------------+
   |                                |               |                           |
   |  test (Playwright/WebdriverIO) |               |   App hibrida MAGIIS      |
   |             |                  |               |   +-------------------+   |
   |             | HTTP :4723       |               |   | NATIVE_APP        |   |
   |             v                  |               |   |  botones, teclado,|   |
   |  +-----------------------+     |               |   |  permisos, taps   |   |
   |  |   Appium Server       |     |               |   +-------------------+   |
   |  |  + driver uiautomator2|-----+---- adb ----->|   +-------------------+   |
   |  |  + chromedriver       |     |               |   | WEBVIEW_com.magiis|   |
   |  +-----------------------+     |               |   |  DOM, requests,   |   |
   |             ^                  |               |   |  Ionic/Angular    |   |
   |             |                  |               |   +-------------------+   |
   |    ANDROID_HOME -> adb.exe     |               |                           |
   +--------------------------------+               +---------------------------+
```

Tres cosas que se leen del diagrama y conviene retener:

1. **Appium necesita `adb`**, y lo encuentra por `ANDROID_HOME`. Sin esa variable no ve el teléfono.
2. **`chromedriver` maneja el WebView**, y su versión tiene que coincidir con la del Chrome/WebView
   del teléfono. Appium lo resuelve solo la primera vez.
3. **La app tiene dos contextos.** Un test que mide requests trabaja en `WEBVIEW_*`; uno que
   tapea un botón nativo, en `NATIVE_APP`. Cambiar de contexto es explícito.

### 3. Requisitos

Versiones con las que esta capa está funcionando hoy. Los mínimos son eso: mínimos.

| Qué | Versión | Para qué |
|---|---|---|
| Node.js | 20+ (probado en 24.16.0) | correr el repo |
| pnpm | 11.x | gestor de dependencias del repo |
| Android SDK + `platform-tools` | cualquiera reciente | aporta `adb` |
| Java JDK | 17+, con `JAVA_HOME` | lo exige el driver de Android |
| Appium | **3.x** (hoy 3.5.2) | el servidor de automatización |
| Driver `uiautomator2` | 7.x (hoy 7.1.0) | el que habla Android |
| `scrcpy` | cualquiera | espejar la pantalla, opcional pero muy recomendado |
| Teléfono Android | con depuración USB activada y autorizada | el dispositivo de pruebas |

### 4. Instalación, paso a paso

Cada paso trae su verificación. **No avances si la verificación no da lo esperado**: los errores
acá se arrastran y después aparecen disfrazados de "el test falla".

**4.1 — Dependencias del repo**

```powershell
pnpm install
```

**4.2 — Android SDK y `ANDROID_HOME`**

Instalá el SDK (viene con Android Studio, o standalone con las command-line tools) y exportá las
variables. En PowerShell, para que persistan:

```powershell
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
[Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", "$env:LOCALAPPDATA\Android\Sdk", "User")
```

Cerrá y reabrí la terminal, y verificá:

```powershell
adb --version
```

Si `adb` no se reconoce, agregá `%ANDROID_HOME%\platform-tools` al `PATH`.

**4.3 — Appium y su driver**

```powershell
npm install -g appium
appium driver install uiautomator2
```

Verificá:

```powershell
appium --version          # 3.x
appium driver list --installed   # uiautomator2
```

**4.4 — El teléfono**

Activá *Opciones de desarrollador* y *Depuración por USB*, conectalo, y aceptá el diálogo de
autorización que aparece en la pantalla del teléfono.

```powershell
adb devices
```

Tiene que listar tu dispositivo con estado `device`:

```text
List of devices attached
R92XB0B8F3J     device
```

Si dice `unauthorized`, el diálogo del teléfono está sin aceptar. Si no aparece nada, probá otro
cable o puerto — los cables de sólo-carga no sirven.

**4.5 — Las apps**

Las apps de prueba tienen que estar **instaladas y con sesión iniciada**. Los tests no crean
cuentas: asumen una sesión válida y `noReset: true` la conserva entre corridas.

```powershell
adb shell pm list packages | Select-String magiis
```

El sufijo del paquete es el ambiente: `com.magiis.app.uat.driver` es UAT, `...test.driver` es TEST,
`com.magiis.app.driver` es producción.

**4.6 — `scrcpy` (opcional, muy recomendado)**

```powershell
winget install Genymobile.scrcpy
```

Ver la pantalla mientras corre el test es la diferencia entre "falló" y "falló porque quedó un
modal abierto".

### 5. Verificá que el stack funciona

Tres chequeos, **en este orden**. Cada uno prueba algo que el anterior no:

```text
  [1] adb devices          ->  "el cable y el telefono estan bien"
       |
       v
  [2] GET :4723/status     ->  "el proceso de Appium esta vivo"
       |
       v
  [3] POST :4723/session   ->  "el stack COMPLETO puede manejar el telefono"
```

El paso 3 es el único que prueba de punta a punta. Los dos primeros pueden dar verde con un stack
que no logra abrir una sesión, así que no te quedes en el 2.

**Paso 1**

```powershell
adb devices
```

**Paso 2** — dejá Appium corriendo en su propia terminal:

```powershell
appium --port 4723 --base-path /
```

Y en otra:

```powershell
Invoke-RestMethod http://localhost:4723/status
```

**Paso 3** — abrí una sesión real y cerrala. Reemplazá el `udid` por el tuyo:

```powershell
$body = @{
  capabilities = @{
    alwaysMatch = @{
      platformName            = "Android"
      "appium:automationName" = "UiAutomator2"
      "appium:udid"           = "R92XB0B8F3J"
      "appium:appPackage"     = "com.magiis.app.uat.driver"
      "appium:appActivity"    = ".MainActivity"
      "appium:noReset"        = $true
    }
    firstMatch = @(@{})
  }
} | ConvertTo-Json -Depth 6

$r = Invoke-RestMethod -Method Post -Uri http://localhost:4723/session `
       -ContentType "application/json" -Body $body
$r.value.sessionId
Invoke-RestMethod -Method Delete -Uri "http://localhost:4723/session/$($r.value.sessionId)"
```

Si devuelve un `sessionId`, el stack está listo. La primera vez puede tardar más de lo normal:
Appium descarga el `chromedriver` que corresponde al WebView del teléfono.

### 6. Anatomía de una corrida

Qué pasa entre que apretás enter y que sale un veredicto:

```text
  pnpm test:uat:mg117:all
      |
      | 1. resuelve ENV -> archivo .env, paquete de la app, udid
      |    imprime:  [target] OBJETIVO -> env=uat  package=...uat.driver  udid=...
      v
  +-------------------------------------------------------------+
  | 2. abre sesion Appium            (~10 s)                    |
  | 3. busca el contexto WEBVIEW_*   (~2 s)                     |
  | 4. instala la captura de red DENTRO de la pagina            |
  | 5. navega hasta la pantalla bajo prueba                     |
  +-------------------------------------------------------------+
      |
      | 6. por cada caso: interactua -> espera -> lee la captura
      v
  +-------------------------------------------------------------+
  | 7. veredicto por caso:                                      |
  |      PASS         medido y cumple                           |
  |      FAIL         medido y NO cumple  -> defecto            |
  |      SIN_DATOS    no hubo nada que medir                    |
  |      NO_EJERCIDO  la premisa no se pudo garantizar          |
  +-------------------------------------------------------------+
      |
      v
  8. artefactos:  evidence/<env>/  ->  junit.xml, report/, xray-results*.json
```

El punto 7 es el corazón de la disciplina de esta capa: **un caso que no se pudo medir nunca sale
verde**. `SIN_DATOS` y `NO_EJERCIDO` son resultados legítimos, no fallas del test — dicen "acá no
hay evidencia", que es distinto de "acá hay un defecto".

### 7. Cómo correr las suites

Precondiciones para todas: teléfono conectado, Appium arriba, la app del actor correspondiente
instalada y con sesión, y **sólo esa app abierta** — si dejaste la app del otro actor corriendo
de una suite anterior, cerrala primero:

```powershell
adb shell am force-stop com.magiis.app.uat.passenger
adb shell am start -W -n com.magiis.app.uat.driver/.MainActivity
```

Android sólo permite depurar remotamente un WebView a la vez; con las dos apps abiertas, la
suite nueva no logra crear sesión y todos sus casos quedan sin medir.

| Comando | Qué mide | Duración |
|---|---|---|
| `pnpm test:uat:mg117:all` | Autocomplete de direcciones, **App Driver** (MG-117): endpoint propio, contrato del request, debounce, piso de caracteres, sessionToken, degradación ante 5xx | ~3-8 min |
| `pnpm test:uat:mg116:all` | Autocomplete de direcciones, **App Passenger** (MG-116): las mismas conductas sobre las distintas pantallas donde el pasajero escribe una dirección | ~10-15 min |
| `pnpm test:uat:mg116:api` | El **contrato del endpoint**, sin teléfono | segundos |
| `pnpm mobile:driver:home-dump` | Volcado de la pantalla del driver — para investigar, no es un test | segundos |
| `pnpm mobile:passenger:home-dump` | Idem, app del pasajero | segundos |

Empezá por `mg117`: es la más corta y ejercita el stack completo.

**Guardá el artefacto de la corrida.** El reporter de Xray escribe siempre en la misma ruta, así
que cada corrida pisa la anterior. Si el resultado te importa, dale un nombre propio:

```powershell
$env:XRAY_OUTPUT_FILE = "evidence/uat/xray-results-mg117-$(Get-Date -f yyyyMMdd-HHmmss).json"
pnpm test:uat:mg117:all
```

**Sólo un caso**, mientras iterás:

```powershell
pnpm test:uat:mg117:all -- --grep "TM-650"
```

**Listar sin correr**, para validar que la suite se colecta bien:

```powershell
pnpm test:uat:mg117:all -- --list
```

### 8. Dónde vive cada cosa

```text
tests/mobile/appium/
|
+-- config/          Resuelve ENV -> archivo .env, paquete, udid, url de Appium.
|                    Es el unico lugar que decide "contra que ambiente corro".
|
+-- base/            AppiumSessionBase: lo comun a toda pantalla — abrir sesion,
|                    cambiar de contexto, buscar elementos, llenar inputs web.
|
+-- helpers/         Utilidades transversales. La mas importante:
|                    webViewNetworkCapture — engancha fetch/XHR DENTRO de la
|                    pagina para poder afirmar "esta request salio / no salio".
|
+-- driver/          Pantallas y baterias de casos de la App Driver.
+-- passenger/       Idem para la App Passenger.
|      +-- surfaces/     Cada pantalla donde se escribe una direccion.
|      +-- specs/        Los tests que el runner ejecuta.
|
+-- harness/         Flujos completos reutilizables (happy path de un viaje
|                    punta a punta) que varios tests comparten.
|
+-- scripts/         Herramientas de investigacion y volcados. NO son tests:
|                    corren a mano y no producen reporte. Sirven para descubrir
|                    selectores y entender una pantalla antes de automatizarla.
|
+-- .generated/      Config de Appium MCP generada. No se edita a mano.
```

La distinción que más importa al principio: **`specs/` son tests** (los corre el runner, dan
veredicto y reporte); **`scripts/` son instrumentos** (los corrés vos para investigar). Si buscás
cobertura, mirá `specs/`.

### 9. Cómo sumar cobertura a un ticket

El camino corto, reusando lo que ya existe:

1. **Investigá primero.** Usá un script de volcado (`mobile:driver:home-dump`) o Appium MCP para
   ver el DOM real y confirmar selectores. No adivines locators.
2. **Fijate si la pantalla ya está modelada** en `driver/` o `passenger/`. Si está, reusala.
3. **Agregá el caso a la batería** del actor que corresponda, no un archivo nuevo por caso. Las
   baterías ya tienen la sesión, la navegación y la captura de red resueltas.
4. **Trazá el caso con su key de Xray** vía `annotation: [{ type: 'tms', description: 'TM-xxx' }]`.
   Sin eso el resultado no llega al reporte.
5. **Devolvé el estado honesto.** Si la premisa del caso no se pudo garantizar, devolvé
   `NO_EJERCIDO` con el motivo escrito. Un verde que no midió nada es peor que un caso pendiente.
6. **No reuses el término de un caso vecino de la misma batería.** El endpoint no reconsulta un
   término que ya sirvió hace poco — es la conducta que `TM-655` verifica a propósito. Si tu caso
   nuevo necesita ver tráfico de red, usá un término que ningún otro caso de la batería haya
   escrito antes: si lo comparte, tu medición puede salir `SIN_DATOS` sin que el producto tenga
   ningún defecto.

### 10. Glosario

| Término | Qué es |
|---|---|
| **WebView** | El navegador embebido donde corre la web app dentro del contenedor nativo |
| **Contexto** | `NATIVE_APP` (la UI Android) o `WEBVIEW_*` (el DOM). Se cambia explícitamente |
| **`udid`** | El identificador del dispositivo físico, el que devuelve `adb devices` |
| **`noReset`** | Le dice a Appium que no borre datos de la app: así sobrevive la sesión del usuario |
| **PASS / FAIL** | Se midió, y cumple / no cumple. Un `FAIL` es un defecto reportable |
| **`SIN_DATOS`** | No hubo nada que medir (p.ej. cero requests). No es un defecto |
| **`NO_EJERCIDO`** | La premisa del caso no se pudo garantizar, así que el resultado no sería atribuible |

## Purpose

- Run durable mobile execution with WebdriverIO plus Appium.
- Support hybrid web-to-mobile journeys where Playwright prepares the trip and Appium completes it.
- Keep locator discovery separate from stable screen implementation.

## Execution model

- `Playwright` owns web setup, trip creation, and initial assertions.
- `Appium` owns Driver and Passenger app execution.
- `API`, `DB`, or gateway dashboards own final payment confirmation when mobile UI alone is not enough.

## Appium MCP role

`appium-mcp` is the recommended discovery layer for:

- validating locators before hardcoding them in screen classes
- checking whether a payment form is `NATIVE_APP` or `WEBVIEW`
- capturing screenshots and page source during investigation
- generating locator candidates before formalizing screen objects

Use Appium MCP for discovery and inspection.
Use the repo WebdriverIO runtime for stable implementation and repeatable execution.

## Generate Appium MCP config

Run from repo root after setting your local environment:

```bash
node tests/mobile/appium/scripts/generateAppiumMcpConfig.mjs driver
node tests/mobile/appium/scripts/generateAppiumMcpConfig.mjs passenger
```

Generated files are written to:

- `tests/mobile/appium/.generated/appium-mcp.driver.capabilities.json`
- `tests/mobile/appium/.generated/appium-mcp.driver.server.json`
- `tests/mobile/appium/.generated/appium-mcp.passenger.capabilities.json`
- `tests/mobile/appium/.generated/appium-mcp.passenger.server.json`

## Passenger evidence capture shortcuts

Use these when you need a custom label or want the raw script instead of the `mobile:*` aliases:

```powershell
$env:ANDROID_APP_PACKAGE="com.magiis.app.test.passenger"
$env:SCREEN_LABEL="passenger-home"
pnpm exec ts-node --esm tests/mobile/appium/scripts/dump-current-screen.ts
```

If you need the default login or a different app state, keep the same pattern and only change `SCREEN_LABEL` plus the package/activity env vars.

If you only need to validate the home lane before running wallet or trip flows, use the profile-mode smoke:

```powershell
$env:ANDROID_UDID="R92XB0B8F3J"
$env:TARGET_PROFILE_MODE="personal"
pnpm mobile:passenger:profile-mode-smoke
```

Use `TARGET_PROFILE_MODE="business"` when you want to validate the collaborator lane. The script reads the label under the home toggle and fails if the lane does not match.

If you need the full personal 3DS + hold journey from the home shell, use:

```powershell
$env:ANDROID_UDID="R92XB0B8F3J"
pnpm mobile:passenger:personal-3ds-hold-flow
```

This runner:

- validates `Modo Personal` from the home header,
- adds or reuses the `visa_3ds_success` card,
- captures dumps for home, wallet, trip confirmation, and the 3DS popup,
- completes the 3DS challenge when it appears.

If you need the short wallet-only critical path for DBTS-STRIPE-TC003 / TS-STRIPE-TC1122, use:

```powershell
$env:ANDROID_UDID="R92XB0B8F3J"
pnpm mobile:passenger:wallet-3ds-delete
```

This runner:

- validates `Modo Personal` from the home header,
- cleans the wallet first,
- adds the `always_authenticate` Stripe test card (`4000002760003184`) so the flow stays on the critical 3DS branch,
- captures request / response payloads for the add-card and delete-card phases under `evidence/network-capture/`,
- deletes the same linked card from wallet after save.

Use this runner when you want the shortest reproducible path for:

- linking a 3DS card from Passenger wallet,
- collecting payloads and responses,
- deleting the same linked card as the critical cleanup step.

Precondition:

- `hold` must already be active in carrier before running this flow.
- If you also want to wait for driver assignment or payment completion, set `PASSENGER_WAIT_FOR_DRIVER_ASSIGNED=true`, `PASSENGER_WAIT_FOR_TRIP_COMPLETED=true`, or `PASSENGER_VERIFY_PAYMENT_PROCESSED=true`.

If you need the business / collaborator no-3DS hold journey from the same home shell, use:

```powershell
$env:ANDROID_UDID="R92XB0B8F3J"
pnpm mobile:passenger:business-no3ds-hold-flow
```

This runner:

- validates `Compañía: <contractor name>` from the home header,
- adds or reuses the `visa_success` card,
- captures dumps for home, wallet, and trip creation,
- keeps the current default card selected as the trip payment method.

Recommended manual order when you are collaborating step by step:

1. Global terminal: `npx appium --port 4723 --base-path /`
2. Global terminal: `scrcpy -s R92XB0B8F3J`
3. Global terminal: force-stop the wrong app and launch Passenger with `adb`
4. Project terminal: `pnpm mobile:passenger:home-dump`
5. Project terminal: run `mobile:passenger:profile-mode-smoke`
6. Project terminal: run `mobile:passenger:personal-3ds-hold-flow` or `mobile:passenger:business-no3ds-hold-flow`

When the passenger app opens on login or shows `Su sesión ha expirado`, use the passenger login helper:

```powershell
$env:ANDROID_UDID="<tu-udid>"
$env:PASSENGER_EMAIL="<usuario-de-pruebas>"
$env:PASSENGER_PASSWORD="<password>"
pnpm mobile:passenger:login-dump
```

> Las credenciales salen del `.env.<ENV>` del ambiente, o se exportan en la terminal como acá.
> No se escriben en este archivo ni en el código: el fixture `PASSENGER_APP_USER` es la fuente
> de verdad y falla nombrando la variable exacta que falta.

Confirmed passenger selectors from the current dump:

- Home: `Modo Personal`, `Compañía`, `Mi cuenta`, `Billetera`, `Origen `, `Destino `, `Seleccionar Vehiculo`, `Ahora`
- Home profile switch: `ion-toggle`
- Home profile switch container: `#main-content > app-navigator > ion-content > ion-tabs > div > ion-router-outlet > app-home > div.header-menu > div > ion-toggle`
- Home profile label: `#main-content > app-navigator > ion-content > ion-tabs > div > ion-router-outlet > app-home > div.header-menu > div > span`
- Wallet: `AGREGAR`, `GUARDAR`
- Stripe card iframe fields: `input[name="cardnumber"]`, `input[name="cc-exp-month"]`, `input[name="cc-exp-year"]`, `input[name="cc-csc"]`
- Saved cards: `VISA ****1234` style labels in the wallet list
- Wallet principal action: current live DOM exposes `ion-item-sliding` rows with direct `star` / `trash` buttons inside `ion-item-options`; open the row if needed and tap the `star` icon to mark a card as principal
- Wallet delete action: if the target card is the current principal, first promote another visible card as favorite and then tap the `trash` icon to remove the target card
- Wallet cleanup runner: removes all visible saved cards from the current profile lane

```powershell
$env:ANDROID_UDID="R92XB0B8F3J"
$env:TARGET_PROFILE_MODE="personal"
pnpm mobile:passenger:wallet-cleanup
```

- Use `TARGET_PROFILE_MODE="business"` for the collaborator wallet lane.

Passenger mode precondition:

- If the label under the switch reads `Modo Personal`, the lane is personal.
- If it reads `Compañía: <contractor name>`, the lane is business / collaborator.
- Validate that label before any wallet, delete-card, or trip-creation flow.
- The canonical smoke for this check is `pnpm mobile:passenger:profile-mode-smoke`.
- The canonical end-to-end personal 3DS + hold runner is `pnpm mobile:passenger:personal-3ds-hold-flow`; it starts by cleaning the wallet so the linked-card path is deterministic.
- The canonical end-to-end business no-3DS + hold runner is `pnpm mobile:passenger:business-no3ds-hold-flow`.
- The canonical wallet-only critical cleanup runner is `pnpm mobile:passenger:wallet-3ds-delete`; it seeds the wallet with a single 3DS card, records network payloads, and then deletes that card.
- The critical wallet-delete case is `DBTS-STRIPE-TC003` / `TC-PAX-11`: it expects a previously linked 3DS card in personal mode, and if that card is principal you should promote another visible card with `Principal` before tapping `Eliminar`.
- If the wallet starts empty, the wallet-3DS runner seeds the 3DS card first and then deletes it; the coverage target remains the delete of a linked 3DS card.

## Local requirements

- Node.js 20 or higher for the repo scripts
- Node.js 22 or higher only when generating Appium MCP config
- Android SDK with `ANDROID_HOME`
- APK paths only when the app is not installed; otherwise the runtime launches by `appPackage` + `appActivity`
- Appium server for the direct WebdriverIO execution layer

## Key files

- `config/appiumRuntime.ts`
- `config/appiumMcp.ts`
- `base/AppiumSessionBase.ts`
- `driver/*`
- `harness/DriverTripHappyPathHarness.ts`
- `harness/PassengerTripHappyPathHarness.ts`
- `passenger/PassengerHomeScreen.ts`
- `passenger/*`
- `gateway-pg/*`

## Reusable happy path harness (Carrier -> Driver)

- Canonical scenario map: `tests/features/gateway-pg/data/driver-happy-path-scenarios.ts`
- Hybrid web+mobile helper: `tests/features/gateway-pg/helpers/hybridCarrierDriverHappyPathHarness.ts`
- Data-driven template spec: `tests/features/gateway-pg/specs/stripe/e2e-mobile/carrier-driver-happy-path-template.spec.ts`

To run mapped scenarios when device and Appium are ready:

```bash
RUN_MOBILE_HAPPY_PATH=true npx playwright test tests/features/gateway-pg/specs/stripe/e2e-mobile/carrier-driver-happy-path-template.spec.ts --project chromium
```

## Passenger flow 2 lane

- Passenger personal no3ds spec: `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-no3ds.e2e.spec.ts`
- Passenger scenario map: `tests/features/gateway-pg/data/passenger-flow2-scenarios.ts`
- Personal no3ds scenario map: `tests/features/gateway-pg/data/passenger-personal-no3ds-scenarios.ts`
- Business scenario map: `tests/features/gateway-pg/data/passenger-business-scenarios.ts`
- Passenger harness: `tests/mobile/appium/harness/PassengerTripHappyPathHarness.ts`
- Active personal no3ds spec: `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-no3ds.e2e.spec.ts`
- Active passenger spec: `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-3ds.e2e.spec.ts`
- Active business specs: `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-no3ds.e2e.spec.ts` and `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-3ds.e2e.spec.ts`
- Passenger mobile runners: `pnpm mobile:passenger:personal-3ds-hold-flow` and `pnpm mobile:passenger:business-no3ds-hold-flow`
- Traceability doc: `docs/test-cases/mobile/TC-PASSENGER-FLOW.md`
