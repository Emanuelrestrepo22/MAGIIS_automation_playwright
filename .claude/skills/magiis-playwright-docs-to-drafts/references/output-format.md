# Output Format

Use this shape when presenting the result of the Playwright docs-to-drafts pipeline.

## 1. Critical flow summary

Produce a markdown table ordered by priority:

```markdown
| ID | Module | Flow | Priority | Tags | Reason |
|---|---|---|---|---|---|
| TC-STR-001 | stripe | successful payment | P1 | @smoke @stripe | main revenue flow |
```

## 2. Prioritized automation backlog

Use flat sections such as:

```markdown
### P1
- [ ] TC-STR-001: successful payment
- [ ] TC-STR-002: 3ds challenge

### P2
- [ ] TC-AUTH-001: carrier login

### Blocked
- TC-STR-030: webhook validation requires external access
```

## 3. File tree proposal

Show only the files that matter:

```text
tests/specs/stripe/TC-STR-001-successful-payment.spec.ts
tests/pages/CheckoutPage.ts
tests/data/stripe-cards.data.ts
```

## 4. Draft code

Each draft should include:
- source test case ID
- business goal
- preconditions
- arrange / act / assert flow
- explicit TODO blocks for external validation

## 5. Risks and gaps

Always call out:
- missing selectors
- unknown APIs
- DB or dashboard dependencies
- 3DS or external-provider limitations
