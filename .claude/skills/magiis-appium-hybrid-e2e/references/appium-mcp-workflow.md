# Appium MCP Workflow

Use Appium MCP before proposing or editing stable mobile screen locators.

## Discovery flow
1. Create a mobile session for the target actor.
2. Capture a screenshot of the current screen.
3. Read page source for structure evidence.
4. Generate locator candidates from the visible screen.
5. Check contexts to detect `NATIVE_APP` versus `WEBVIEW`.
6. Move only validated locators into the repo screen classes.

## Best use cases in MAGIIS
- validating Driver and Passenger screen locators
- checking Stripe or gateway screens for WebView usage
- investigating flaky mobile selectors
- gathering evidence before converting an Excel case into Appium drafts

## Tool priority
- `create_session`
- `appium_screenshot`
- `appium_get_page_source`
- `generate_locators`
- `appium_get_contexts`
- `appium_get_settings`
- `appium_update_settings`

## Practical rule
Appium MCP is for discovery and inspection.
WebdriverIO plus Appium is for durable implementation and repeatable execution in the framework.
