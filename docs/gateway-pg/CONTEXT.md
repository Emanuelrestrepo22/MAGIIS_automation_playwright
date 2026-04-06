# gateway-pg Context

## Purpose
This document adapts the original Stripe gateway context into the current MAGIIS automation framework.

It is the canonical reference for:
- Stripe gateway payment flows
- 3DS behavior
- test case mapping
- UI expectations required by automation

## Scope
This context is currently Stripe-first and covers:
- Portal Carrier
- Pax web flows where applicable
- payment hold, capture, 3DS, and recovery paths

The broader framework still supports additional gateways:
- Mercado Pago
- Stripe
- eBizCharge
- Authorize

## Relevant business flows
- Flow A: direct hold without 3DS
- Flow A2: 3DS success
- Flow B: 3DS failure plus retry
- Flow C: scheduled hold
- Flow D: card change after failed 3DS

## Key payment concepts
- Hold: pre-authorization only
- Capture: real charge at trip completion
- `requires_action`: Stripe indicates 3DS is required
- `NO_AUTORIZADO`: hold failed or 3DS rejected
- `SEARCHING_DRIVER`: hold confirmed

## Shared UI components
- `ModalThreeDSComponent`
- trip creation form
- trip detail payment section
- conflict or recovery actions after failed 3DS

## Required UI test IDs
### 3DS modal
- `3ds-modal-overlay`
- `3ds-iframe`
- `3ds-modal-close`

### 3DS error popup
- `3ds-error-popup`
- `3ds-error-popup-message`

### Travel detail
- `travel-status-badge`
- `payment-status`
- `3ds-pending-flag`

### Travel board
- `column-por-asignar`

## Test data
Use Stripe cards only from `tests/fixtures/gateway.fixtures.ts`.
Never hardcode full card numbers inside specs.

## Automation rules
- read this context before extending Stripe gateway coverage
- keep TC IDs stable
- reuse `ThreeDSModal` behavior instead of duplicating iframe logic
- use explicit timeouts for payment and 3DS steps
- keep Stripe suites serialized with `workers: 1`
