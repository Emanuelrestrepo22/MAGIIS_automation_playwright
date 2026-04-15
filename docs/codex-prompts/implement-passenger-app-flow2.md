# Codex Prompt - Flow 2: Passenger App - Wallet + New Trip Draft

> STATUS: ACTIVE
> Current active focus in this lane: passenger mobile discovery and implementation.
> This prompt is the working contract for app pax until the flow has validated selectors and a stable execution path.

## Context

Repository: `magiis-playwright` (Playwright + TypeScript + Appium/WebdriverIO v9).
This prompt covers the **Passenger App** side of the mobile journey.
The historical pivot is **Flow 2: Passenger App -> Driver App**.

At the moment:

- `tests/mobile/appium/passenger/*` now has validated wallet / new-trip screens plus a heuristic trip-status screen and a home/profile switch helper.
- `tests/mobile/appium/harness/PassengerTripHappyPathHarness.ts` centralizes passenger wallet, trip creation, status waits, and profile-mode bootstrapping.
- `pnpm mobile:passenger:profile-mode-smoke` is the canonical precondition check for the home header label before any wallet or trip flow.
- `pnpm mobile:passenger:personal-3ds-hold-flow` is the canonical personal runner with wallet cleanup, wallet dumps, and 3DS handling; `pnpm mobile:passenger:business-no3ds-hold-flow` is the canonical business runner without 3DS. For the short critical wallet case, use `pnpm mobile:passenger:wallet-3ds-delete` to seed a single 3DS card, capture add/delete payloads, and delete it for `DBTS-STRIPE-TC003` / `TS-STRIPE-TC1122`.
- The wallet principal action is not a hidden star heuristic: select `button.card-item-opts` on the target card row and then tap `Principal` from the popover. Use `Eliminar` only for the delete-card case.
- The remaining gap is a dedicated passenger post-trip dump for status completion and payment confirmation.
- The repo has reusable Stripe iframe evidence in driver unhappy-path scripts.

## Goal

1. Create the **mobile test cases markdown** for passenger flow 2.
2. Capture passenger-specific Appium evidence before inventing selectors.
3. Implement the **Passenger App Screen Objects** with only validated locators.
4. Activate the draft E2E spec once the passenger screens are stable enough to run.
5. Extend the same lane to collaborator/business mode using the home profile toggle when the evidence is available.

---

## Source of truth for this lane

- `tests/mobile/appium/passenger/*`
- `tests/mobile/appium/scripts/dump-current-screen.ts`
- `tests/mobile/appium/scripts/viaje-calle-unhappy-paths.ts`
- `tests/features/gateway-pg/data/passenger-personal-no3ds-scenarios.ts`
- `tests/features/gateway-pg/data/passenger-flow2-scenarios.ts`
- `tests/features/gateway-pg/data/passenger-business-scenarios.ts`
- `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-no3ds.e2e.spec.ts`
- `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-3ds.e2e.spec.ts`
- `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-no3ds.e2e.spec.ts`
- `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-3ds.e2e.spec.ts`
- `tests/e2e/flow2-passenger-driver.e2e.spec.ts`
- `docs/mobile-ci/propuesta-android-ci.md`

---

## Evidence-first rule

Before coding passenger selectors:

1. Run a passenger-focused dump against `com.magiis.app.test.passenger`.
2. Capture the home, wallet, add-card, new-trip, and trip-status states.
3. Reuse only selectors that appear in the dump or in existing validated helpers.
4. Do not invent menu items, button texts, or frame names that are not visible in evidence.
5. For business mode, verify the home toggle (`Modo Personal` / `Compañía`) before exercising wallet or trip actions.
6. Keep the wallet selector anchored to the visible `Principal` / `Eliminar` popover from `button.card-item-opts`; do not infer an action from an icon alone.

If the repo does not yet have a dedicated passenger dump wrapper, use:

```powershell
$env:ANDROID_APP_PACKAGE="com.magiis.app.test.passenger"
$env:SCREEN_LABEL="passenger-home"
npx ts-node --esm tests/mobile/appium/scripts/dump-current-screen.ts
```

---

## Task 1 - Passenger test cases markdown

Create: `docs/test-cases/mobile/TC-PASSENGER-FLOW.md`

Minimum scope:

- wallet / add card
- select card
- create trip
- trip status after driver completion

Recommended draft IDs:

| ID        | Title                                    | Type        |
| --------- | ---------------------------------------- | ----------- |
| TC-PAX-01 | Add card to passenger wallet             | Positive P1 |
| TC-PAX-02 | Select an existing card for a trip       | Positive P1 |
| TC-PAX-03 | Create trip from passenger app           | Positive P1 |
| TC-PAX-04 | See trip in progress / assigned driver   | Positive P1 |
| TC-PAX-05 | See trip completed and payment processed | Positive P1 |
| TC-PAX-06 | Reject card save / validation failure    | Negative P2 |
| TC-PAX-07 | Add card to passenger wallet             | Positive P1 |
| TC-PAX-08 | Select an existing card for a trip       | Positive P1 |
| TC-PAX-09 | Create trip from passenger app           | Positive P1 |
| TC-PAX-10 | See trip in progress / assigned driver   | Positive P1 |

Each case must keep traceability fields:

- source case ID
- portal
- app
- environment
- flow
- priority
- target spec path
- required screen objects
- technical risks / gaps

---

## Task 2 - Passenger screen objects

Implement only after evidence is captured:

`tests/mobile/appium/passenger/PassengerWalletScreen.ts`

- open wallet view
- tap add-card action
- fill Stripe card form
- save card
- verify card appears in wallet
- select an existing card

`tests/mobile/appium/passenger/PassengerNewTripScreen.ts`

- open new trip form
- set origin
- set destination
- select payment card
- confirm trip

`tests/mobile/appium/passenger/PassengerTripStatusScreen.ts`

- wait for driver assignment
- wait for trip completion
- read trip status text
- verify payment processed

### Implementation notes

- Reuse `AppiumSessionBase`.
- Prefer validated `button`, `input`, `iframe`, `app-*` selectors from dumps.
- If Stripe card entry is inside an iframe, reuse the helper pattern already proven in `tests/mobile/appium/scripts/viaje-calle-unhappy-paths.ts`.
- Keep web and mobile logic separate.

---

## Task 3 - Draft E2E spec

Files:

- `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-no3ds.e2e.spec.ts`
- `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-3ds.e2e.spec.ts`

Rules:

1. Keep any step that still depends on missing passenger evidence in `test.fixme()` mode.
2. Map each `test()` to a single passenger TC.
3. Do not hardcode unverified locators.
4. Use `test.fixme()` for driver-dependent or negative cases until the matching evidence exists.

---

## Task 4 - Business / collaborator lane

Files:

- `tests/features/gateway-pg/data/passenger-business-scenarios.ts`
- `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-no3ds.e2e.spec.ts`
- `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-3ds.e2e.spec.ts`

Rules:

1. Reuse `PassengerHomeScreen.ensureProfileMode('business')` before wallet or trip actions.
2. Keep traceability to `TS-STRIPE-TC1017..TC1032` in the source case IDs.
3. Keep driver-dependent steps in `fixme` until passenger post-trip evidence is captured.
4. Mirror the same harness and screen objects used by the personal lane.
5. Use `pnpm mobile:passenger:business-no3ds-hold-flow` as the manual runner when you need home -> wallet -> trip dumps in collaborator mode.

---

## Validation

Before marking this lane ready:

```bash
npx tsc --noEmit
pnpm test:test:e2e:passenger -- --list
pnpm test:test:e2e:passenger
```

If the passenger app can already be captured with a local device, add the generated dump paths to the lane notes.
