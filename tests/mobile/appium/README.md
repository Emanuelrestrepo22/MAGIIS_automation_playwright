# Mobile Appium

This folder contains the Android mobile execution layer used by MAGIIS hybrid E2E journeys.

## Quick start: Windows onboarding

Use this flow when you need to bring up Appium, mirror the phone, and inspect Driver or Passenger from PowerShell.

### Requirements

- Windows PowerShell.
- Node.js installed.
- `pnpm install` already executed in the repo.
- Android SDK installed and `adb` available through `ANDROID_HOME` / `ANDROID_SDK_ROOT`.
- Java JDK installed and `JAVA_HOME` set.
- USB debugging enabled on the phone and the device authorized.
- Appium 2 available locally.
- UiAutomator2 driver installed once:

```powershell
npx appium driver install uiautomator2
```

- `scrcpy` installed for device mirroring:

```powershell
winget install Genymobile.scrcpy
```

- Driver App and Passenger App already installed on the device.

### Terminal roles

- Global terminal: any PowerShell window, even outside the repo.
- Project terminal: PowerShell opened at the root of `magiis-playwright`.

### Sanity checks

Run these once before starting a session:

```powershell
adb devices
```

Expected output:

```text
R92XB0B8F3J     device
```

```powershell
Invoke-RestMethod http://localhost:4723/status
```

Expected result: Appium status response, not `ECONNREFUSED`.

### Terminal global 1 - start Appium Server

```powershell
npx appium --port 4723 --base-path /
```

Leave this terminal open.

### Terminal global 2 - open the device mirror

```powershell
scrcpy -s R92XB0B8F3J
```

If `scrcpy` is not recognized after installing it, open a new PowerShell window or use the full path printed by WinGet.

### Terminal global 3 - put the correct app in front

Only one app should be visible on the phone at a time. If the wrong app is open, stop it and launch the target one.

Driver:

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s R92XB0B8F3J shell am force-stop com.magiis.app.test.passenger
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s R92XB0B8F3J shell am start -W -n com.magiis.app.test.driver/.MainActivity
```

Passenger:

```powershell
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s R92XB0B8F3J shell am force-stop com.magiis.app.test.driver
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s R92XB0B8F3J shell am start -W -n com.magiis.app.test.passenger/.MainActivity
```

### Project terminal - Driver flow

From the repo root:

```powershell
cd "C:\Users\Erika\OneDrive - MAGIIS USA LLC (1)\Escritorio\magiis-playwright"
$env:ANDROID_UDID="R92XB0B8F3J"
pnpm mobile:driver:home-dump
```

If Driver opens on login or asks for credentials, use:

```powershell
$env:ANDROID_UDID="R92XB0B8F3J"
$env:DRIVER_EMAIL="tu-correo-driver"
$env:DRIVER_PASSWORD="tu-password-driver"
pnpm mobile:driver:login-smoke
```

### Project terminal - Passenger flow

From the repo root:

```powershell
cd "C:\Users\Erika\OneDrive - MAGIIS USA LLC (1)\Escritorio\magiis-playwright"
$env:ANDROID_UDID="R92XB0B8F3J"
pnpm mobile:passenger:home-dump
```

If Passenger opens on login or shows `Su sesion ha expirado`, use:

```powershell
$env:ANDROID_UDID="R92XB0B8F3J"
$env:PASSENGER_EMAIL="emanuel.restrepo@yopmail.com"
$env:PASSENGER_PASSWORD="123"
pnpm mobile:passenger:login-dump
```

Troubleshooting:

- If the login helper stays on `https://localhost/login;invalid_token=true`, the Appium session is healthy but the passenger credentials or server-side token state are not valid for that environment.
- In that case, keep working from `mobile:passenger:home-dump` only when the app is already on home, or verify the passenger account/password before retrying the login helper.
- The same rule applies to `mobile:driver:login-smoke`: if it stays on login, the problem is usually credentials or provisioning, not the Appium stack.

### Project terminal - custom screen capture

When you already have the app on the exact screen you want, run the generic dump script and give it a custom label:

```powershell
$env:ANDROID_UDID="R92XB0B8F3J"
$env:ANDROID_APP_PACKAGE="com.magiis.app.test.passenger"
$env:SCREEN_LABEL="passenger-personal-wallet-after-save"
pnpm exec ts-node --esm tests/mobile/appium/scripts/dump-current-screen.ts
```

This script attaches to the active Appium session. It does not launch the app by itself.

### Project terminal - validate passenger tests

Once the phone is ready and Appium is up, validate or run the passenger lane:

```powershell
pnpm test:test:e2e:passenger -- --list
pnpm test:test:e2e:passenger -- --grep "TC-PAX-07"
```

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
$env:ANDROID_UDID="R92XB0B8F3J"
$env:PASSENGER_EMAIL="emanuel.restrepo@yopmail.com"
$env:PASSENGER_PASSWORD="123"
pnpm mobile:passenger:login-dump
```

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
