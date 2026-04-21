# Prioritization Rules

## Objective
Identify critical flows and rank the automation backlog by business impact and technical risk.

## Priority model
### P1
- login / auth
- gateway / wallet / hold / 3ds / charge

### P2
- navbar / smoke portal
- historical bug regression

## Stripe-specific priority
- gateway
- wallet
- hold on
- hold off
- 3ds
- charge

## Criticality criteria
- Direct impact on revenue, payments, or transaction approval.
- High technical risk or known incident history.
- Cross-portal or cross-environment coverage value.
- Dependency on authentication, session handling, or primary navigation.
- Relevance to smoke validation or pre-release confidence.

## Practical rules
- Do not prioritize duplicates over genuine coverage gaps.
- Increase priority when the case maps to recurring historical defects.
- Record external blockers and validation dependencies explicitly.
