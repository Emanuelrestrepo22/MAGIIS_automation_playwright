# Hybrid Collaboration Contract

## Goal
Keep Appium work aligned with Playwright work in the same journey.

## Ownership split
### Playwright owns
- web login and portal navigation
- trip creation in web portals
- wallet or card linking in web portals
- initial gateway setup
- first journey context persistence

### Appium owns
- driver app execution
- passenger app execution
- mobile state transitions
- trip acceptance or completion in Android
- mobile-side evidence and locators

## Shared contract
Use `tests/shared/contracts/gateway-pg.ts` as the journey source of truth.

## Handoff expectations
Before Appium starts, the Playwright side should have persisted:
- `journeyId`
- `testCaseId`
- `tripId`
- actor-relevant IDs
- gateway
- phase and status

## What Appium must return
- updated phase
- updated status
- mobile evidence or execution notes
- payment trigger confirmation
- remaining validation gaps for API, DB, or gateway dashboard

## Do not do
- do not recreate the same trip from mobile if web already created it
- do not duplicate web locators or page objects in mobile artifacts
- do not close the E2E flow without updating the journey context
