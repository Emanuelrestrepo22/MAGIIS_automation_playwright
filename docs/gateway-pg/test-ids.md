# gateway-pg Traceability Map

## TS-GATEWAY Stripe flows

| TC ID | Suite xlsx | Flow | Type | Spec file | Status |
| --- | --- | --- | --- | --- | --- |
| TC01 | TS-GATEWAY-01 | A - direct hold OK | Positive | `tests/specs/gateway-pg/stripe/hold-capture.spec.ts` | Draft integrated |
| TC02 | TS-GATEWAY-02 | A - direct hold declined | Negative | `tests/specs/gateway-pg/stripe/hold-capture.spec.ts` | Draft integrated |
| TC03 | TS-GATEWAY-03 | A2 - 3DS success | Positive | `tests/specs/gateway-pg/stripe/3ds-success.spec.ts` | Pending |
| TC04 | TS-GATEWAY-04 | B - challenge 3DS rechazado -> NO_AUTORIZADO -> En conflicto (sin pop-up MAGIIS post-fallo) | Negative | `tests/specs/gateway-pg/stripe/3ds-failure.spec.ts` | Integrated |
| TC05 | TS-GATEWAY-05 | B - red flag and retry button | Negative | `tests/specs/gateway-pg/stripe/3ds-failure.spec.ts` | Integrated |
| TC06 | TS-GATEWAY-06 | B - successful retry | Negative | `tests/specs/gateway-pg/stripe/3ds-failure.spec.ts` | Integrated |
| TC07 | TS-GATEWAY-07 | D - change to existing card | Edge | `tests/specs/gateway-pg/stripe/3ds-retry-card-change.spec.ts` | Pending with `test.fail()` |
| TC08 | TS-GATEWAY-08 | D - link new card | Edge | `tests/specs/gateway-pg/stripe/3ds-retry-card-change.spec.ts` | Pending with `test.fail()` |
| TC09 | TS-GATEWAY-09 | C - scheduled hold | Positive | `tests/specs/gateway-pg/stripe/scheduled-hold.spec.ts` | Pending |
| TC10 | TS-GATEWAY-10 | C - scheduled hold -> 3DS -> notif | Negative | `tests/specs/gateway-pg/stripe/scheduled-hold.spec.ts` | Pending |
| TC11 | TS-GATEWAY-11 | C - timeout -> cancellation | Edge | `tests/specs/gateway-pg/stripe/scheduled-hold.spec.ts` | Pending |
