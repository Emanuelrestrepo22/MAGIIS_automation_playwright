# Gateway Prioritization Rules

Reference for selecting and prioritizing automation candidates when the source document
contains gateway, payment, or Stripe-related test cases.

Load this file when the detected module is `gateway`, `stripe`, `wallet`, `hold`, or `payment`.

---

## Criticality weights

| Criterion | Weight |
|---|---|
| Payment flows / transactions | High |
| External integrations (Stripe, MercadoPago) | High |
| Happy path of end-to-end flows | High |
| Cases with highest business impact | High |
| Cases with highest technical risk | Medium |
| Post-fix regression | Medium |
| Negative and edge cases | Low |

**Selection rule:** only include cases marked as critical OR that satisfy 2+ High-weight criteria.

---

## Stripe module priority order

Automate in this order within the gateway module:

1. gateway (payment intent creation)
2. wallet (card linking, default card)
3. hold on (fund reservation)
4. hold off (fund release)
5. 3DS (authentication modal — success and failure paths)
6. charge / capture (post-service billing)

---

## Spec file structure for gateway cases

```typescript
import { test, expect } from '@playwright/test';
import { ModuloPage } from '../pages/ModuloPage';

// QA: TC-XXX — Descripción del caso
// Business goal: why this case exists from a business perspective
// Preconditions: required state before test runs
test.describe('Gateway - Flujo @smoke @stripe', () => {

  test.beforeEach(async ({ page }) => {
    // minimum reproducible setup
  });

  test('TC-XXX-validar-gateway', async ({ page }) => {
    // Arrange

    // Act

    // Assert — functional (state, value, visibility with purpose)
    // Network validation: await page.waitForResponse('**/api/endpoint')
    // DB TODO: validate field X in table Y
    // Stripe TODO: verify payment intent status in Stripe Dashboard
  });
});
```

---

## Required TODO blocks for gateway cases

Always include these comment blocks when applicable:

- `// Network validation:` — use `page.waitForResponse()` for critical API calls
- `// DB TODO:` — when DB access is external; describe table and field to verify
- `// Stripe TODO:` — describe what to verify in Stripe Dashboard or via API
- `// 3DS TODO:` — describe the expected modal flow (approve / reject path)

---

## Tags for gateway cases

Apply all tags that match the case:

| Scenario | Required tags |
|---|---|
| Successful payment (no 3DS) | `@smoke @stripe` |
| 3DS required — success | `@stripe @3ds` |
| 3DS required — failure | `@stripe @3ds @regression` |
| Hold on | `@stripe @hold-on` |
| Hold off | `@stripe @hold-off` |
| Insufficient funds / declined | `@stripe @regression` |
| Post-fix regression | `@regression` |

---

## Stripe test cards (never use real cards)

Defined in `tests/features/gateway-pg/data/stripeTestData.ts`.
Legacy re-export: `tests/data/gateway-pg/stripe-cards.ts`.

| Scenario | Number | Result | Key in `STRIPE_TEST_CARDS` |
|---|---|---|---|
| Successful payment (no 3DS) | `4242 4242 4242 4242` | Approved | `successDirect` |
| 3DS required — success | `4000 0025 0000 3155` | 3DS modal → approve | `success3DS` / `alwaysAuthenticate` |
| 3DS required — failure | `4000 0000 0000 9235` | 3DS modal → reject (completeFail) | `fail3DS` |
| Insufficient funds | `4000 0000 0000 9995` | Declined | `insufficientFunds` |
| 3DS required + declined after auth | `4000 0084 0000 1629` | Radar forces 3DS → auth OK → `card_declined` post-auth | `declinedAfter3DS` |

---

## 3DS popup distinction — CRITICAL

There are two different popups in the 3DS flow. They must never be confused:

| Popup | Type | When it appears | How to handle |
|---|---|---|---|
| **Popup A** — Stripe/Visa challenge frame | External iframe (`iframe[src*="three-ds-2-challenge"]`) | Whenever Stripe requires authentication (cards 3155, 9235, 1629) | `ThreeDSModal.waitForVisible()` → `completeSuccess()` or `completeFail()` → `waitForHidden()` |
| **Popup B** — MAGIIS error popup | Internal element (`.error-text`) | Only in specific scenarios like TC1039 (contractor client + `threeDSRequired` card) | `ThreeDSErrorPopup.waitForVisible()` → `accept()` |

**Rule for card 9235 (fail3DS / TC1057):**
- Popup A (Stripe challenge) DOES appear → call `completeFail()`
- Popup B (MAGIIS error) does NOT appear after the rejection
- After rejection: trip is created in `NO_AUTORIZADO` state → visible in "En conflicto" tab

**Rule for card 3155 (success3DS):**
- Popup A appears → call `completeSuccess()`
- No Popup B
- Trip proceeds to `SEARCHING_DRIVER` → visible in "Por asignar"

---

## Portal Contractor — post-submit redirect

After clicking "Enviar viaje" in the Contractor portal, the system redirects to:

```text
https://apps-test.magiis.com/#/home/contractor/dashboard
```

Validate with: `await expect(page).toHaveURL(/contractor\/dashboard/, { timeout: 20_000 })`

This is different from the Carrier portal, which redirects to `/travels/{id}` or `?limitExceeded=false`.

---

## Deduplication rule

Before generating a spec, verify the case ID has not already been processed.
If a duplicate ID is found, skip generation and log it in the auto-review-report.
