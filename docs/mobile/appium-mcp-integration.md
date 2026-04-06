# Appium MCP Integration

## Why we are adding it
MAGIIS hybrid E2E flows depend on Android app steps that are harder to stabilize than web flows.
`appium-mcp` gives us a discovery and inspection layer before we commit locators and screen logic into the repo.

This is especially useful for:
- Driver and Passenger app screens with unstable or unknown locators
- Stripe or gateway flows that may switch between native views and WebViews
- fast inspection during draft creation from Excel test cases
- collaborative handoff between the Playwright agent and the Appium agent

## How it fits the framework
- `Playwright` remains the formal web automation layer.
- `WebdriverIO plus Appium` remains the formal mobile execution layer.
- `appium-mcp` becomes the mobile discovery, locator-validation, and context-inspection layer.

That means:
- do not replace stable screen classes with MCP-only ad hoc instructions
- do use MCP to validate selectors before implementing or updating screen classes

## Recommended workflow
1. Read the QA or Excel case and isolate the mobile phases.
2. Use Appium MCP to inspect the target mobile screen.
3. Validate whether the screen is native or `WEBVIEW`.
4. Generate or refine locator candidates.
5. Move only validated locators into `tests/mobile/appium/driver/*` or `tests/mobile/appium/passenger/*`.
6. Keep final hybrid execution in the repo runtime with journey context and handoff contracts.

## Most useful Appium MCP capabilities for MAGIIS
- `create_session`
- `appium_screenshot`
- `appium_get_page_source`
- `generate_locators`
- `appium_get_contexts`
- `appium_get_settings`
- `appium_update_settings`

## Node version note
The upstream `appium-mcp` README currently requires Node.js 22 or higher.
Our Playwright framework can stay as-is, but Appium MCP should be treated as a local tooling dependency unless we explicitly upgrade the full toolchain.

Source:
- https://github.com/appium/appium-mcp

## Repo support added
- `tests/mobile/appium/config/appiumRuntime.ts`
- `tests/mobile/appium/config/appiumMcp.ts`
- `tests/mobile/appium/scripts/generateAppiumMcpConfig.mjs`
- `tests/mobile/appium/README.md`
- improved Appium agent and skill instructions under `.claude`
