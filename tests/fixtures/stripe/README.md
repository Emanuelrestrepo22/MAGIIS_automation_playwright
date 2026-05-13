# Stripe Fixtures — Pointer legacy

> **La documentación canónica vive en [`../gateways/stripe/README.md`](../gateways/stripe/README.md)** (BL-024 Fase 3, 2026-05-13).

Este directorio (`tests/fixtures/stripe/`) se mantiene como **thin re-export** para no romper imports existentes:

- `cards.ts` → re-exporta desde `../gateways/stripe/cards`
- `card-policy.ts` → re-exporta desde `../gateways/stripe/card-policy`
- `card-resolver.ts` → re-exporta desde `../gateways/stripe/card-resolver`

Nuevos archivos deben importar desde `tests/fixtures/gateways/stripe/` directamente.

Ver también:

- [Umbrella multi-gateway](../gateways/README.md)
- [Resolver cross-gateway](../gateways/_shared/resolver.ts)
