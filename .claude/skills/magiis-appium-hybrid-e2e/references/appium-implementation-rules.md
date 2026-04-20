# Appium Implementation Rules

## Repo files to reuse first
- `tests/mobile/appium/base/AppiumSessionBase.ts`
- `tests/mobile/appium/config/appiumRuntime.ts`
- `tests/mobile/appium/config/appiumMcp.ts`
- `tests/mobile/appium/config/mobileRuntime.ts`
- `tests/mobile/appium/driver/DriverHomeScreen.ts`
- `tests/mobile/appium/driver/DriverTripNavigationScreen.ts`
- `tests/mobile/appium/driver/DriverTripRequestScreen.ts`
- `tests/mobile/appium/passenger/PassengerNewTripScreen.ts`
- `tests/mobile/appium/passenger/PassengerTripFlowScreen.ts`
- `tests/mobile/appium/passenger/PassengerWalletScreen.ts`

## Technical rules
- use Appium MCP for discovery before promoting locators into stable screen classes
- prefer accessibility ID over XPath
- use resource-id only when stable and confirmed
- mark all unconfirmed selectors as TODO
- keep Appium runtime driven by env vars
- assume WebdriverIO is not guaranteed to be installed yet
- keep drafts compilable even if the Appium driver is still a stub

## Android-specific risks
- native view vs WebView ambiguity for Stripe SDK forms
- notification-driven trip requests in driver app
- real device vs emulator locator drift
- stateful mobile sessions across multiple phases
- Node.js 22+ requirement for local `appium-mcp` tooling

## Validation rules
- mobile success is not enough for payment success
- register follow-up requirements for API, DB, event-log, or gateway-dashboard checks
- keep Stripe flows serialized
