# Authorize.net Fixtures — Pointer legacy

> **La documentación canónica vive en [`../gateways/authorize/README.md`](../gateways/authorize/README.md)** (BL-024 Fase 3, 2026-05-13).

Este directorio (`tests/fixtures/authorize/`) se mantiene como **thin re-export** para no romper imports existentes:

- `cards.ts` → re-exporta desde `../gateways/authorize/cards`
- `card-policy.ts` → re-exporta desde `../gateways/authorize/card-policy`
- `card-resolver.ts` → re-exporta desde `../gateways/authorize/card-resolver`

Nuevos archivos deben importar desde `tests/fixtures/gateways/authorize/` directamente.

Ver también:

- [Umbrella multi-gateway](../gateways/README.md)
- [Resolver cross-gateway](../gateways/_shared/resolver.ts)
