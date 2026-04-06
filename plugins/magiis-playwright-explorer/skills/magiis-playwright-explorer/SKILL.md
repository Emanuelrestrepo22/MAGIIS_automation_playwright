---
name: magiis-playwright-explorer
description: exploratory browser automation for MAGIIS with Playwright. use when chatgpt needs to inspect portals, validate selectors, prototype a browser flow, take screenshots, reproduce a UI bug, or run quick browser checks without turning the work into formal repo specs yet.
---

# Objective
Provide rapid Playwright-based exploration for MAGIIS portals without replacing the formal automation framework.

# When to use
- inspect a page or feature quickly
- reproduce a UI bug
- validate selectors before creating page objects
- prototype a browser flow before formalizing a spec
- take evidence screenshots or quick debug traces
- compare desktop and mobile rendering

# Do not use this as
- the final home for maintainable specs
- a replacement for `tests/specs`
- a substitute for the hybrid Playwright plus Appium architecture

# Workflow
1. Resolve the target URL from MAGIIS env vars when possible:
   - `BASE_URL`
   - `CARRIER_URL`
   - `CONTRACTOR_URL`
   - `PAX_URL`
2. Write temporary exploration scripts under `evidence/explorer/tmp/` or run inline.
3. Execute them with:
   - `node plugins/magiis-playwright-explorer/skills/magiis-playwright-explorer/run.js <script>`
4. Keep the browser visible by default unless headless is explicitly requested.
5. Save screenshots and debug output under `evidence/explorer/`.
6. If the exploration is valuable, convert findings into the formal framework:
   - `tests/pages`
   - `tests/selectors`
   - `tests/specs`

# MAGIIS-specific rules
- prefer project env URLs over localhost guessing
- prefer visible browser for debugging
- do not hardcode credentials in scripts
- do not write long-lived exploratory scripts into the repo test suite
- if a selector is not stable, report it instead of pretending it is stable
- for payment or 3DS flows, use this skill for discovery, then move durable work into `gateway-pg`

# Available helpers
- `helpers.getMagiisTargets()`
- `helpers.getEvidenceDir()`
- `helpers.ensureExplorerTempDir()`
- `helpers.takeTimestampedScreenshot(page, name)`
- `helpers.createBrowser(playwright, options)`

# Typical outputs
- screenshot evidence
- quick selector findings
- exploratory script
- notes for converting exploration into formal specs
