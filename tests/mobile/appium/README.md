# Mobile Appium

This folder contains the Android mobile execution layer used by MAGIIS hybrid E2E journeys.

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

## Local requirements
- Node.js 22 or higher for `appium-mcp`
- Android SDK with `ANDROID_HOME`
- local APK paths in environment variables
- Appium server only for the direct WebdriverIO execution layer

## Key files
- `config/appiumRuntime.ts`
- `config/appiumMcp.ts`
- `base/AppiumSessionBase.ts`
- `driver/*`
- `harness/DriverTripHappyPathHarness.ts`
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
