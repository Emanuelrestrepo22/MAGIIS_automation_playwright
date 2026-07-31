# eBizCharge — Trazabilidad de intents (Stripe ↔ eBizCharge)

> Mapeo de los intents canónicos (`tests/fixtures/gateways/_shared/types.ts`) entre Stripe (referencia) y eBizCharge. Igual criterio que [`../authorize/TRACEABILITY.md`](../authorize/TRACEABILITY.md).

## Intents que mapean

| Intent canónico | Stripe | eBizCharge (`EBIZ_CARDS`) | eBiz número |
|---|---|---|---|
| `HAPPY_NO_AUTH` | `SUCCESS_NO_3DS` (4242…) | `SUCCESS` | 4000100011112224 |
| `DECLINE_AUTHORIZE` | `DECLINE_AUTHORIZE` (…0002) | `DECLINE_DO_NOT_HONOR` (05) | 4000300211112228 |
| `DECLINE_INVALID_CVC` | `DECLINE_INVALID_CVC` (…0127) | `DECLINE_CVV` (97) | 4000301311112225 |

## Intents que NO mapean (N/A en eBizCharge)

| Intent | Motivo |
|---|---|
| `HAPPY_AUTH` | eBiz no expone challenge 3DS (`requires3ds=false`) |
| `FAIL_AUTH` | ídem — sin 3DS |
| `DECLINE_CAPTURE` | el sandbox no distingue decline de capture; a confirmar con backend |

El resolver cross-gateway lanza error claro si se pide un intent no soportado para `ebizcharge`.

> **ID-MAP central:** [`ID-MAP.md`](./ID-MAP.md) (generado desde [`../id-map.json`](../id-map.json) por `scripts/ai/build-id-map.mjs`) — trazabilidad TS-ID ↔ MG-key ↔ spec, incluye los derivados Fase 4.

## Asignación de rangos TS-EBIZ (derivación Fase 4 — espejo de authorize §6)

Los TCs derivados del L1 Stripe (2026-07-26, `scripts/ai/derive-gateway-matrix.mjs` + `scripts/ai/gateway-deltas/ebizcharge.json`) arrancan en **TC1050** para no colisionar con los outcome-level preexistentes y espejan la semántica de rangos de [`../authorize/TRACEABILITY.md`](../authorize/TRACEABILITY.md) §6:

| Rango | Semántica | Asignado en Fase 4 |
| --- | --- | --- |
| `TC1001..TC1049` | Reservado — casos outcome-level preexistentes (approved / declines / CVV2 / fraud / cross-gateway) | `TC1001..TC1041` (17 TCs, intactos) |
| `TC1050..TC1099` | Configuración de pasarela + alta carrier (personal / colaborador / empresa) | `TC1050..TC1070` (21) |
| `TC1100..TC1130` | Alta App Pax + cargo a bordo | `TC1100..TC1116` (17) |
| `TC1200..TC1299` | Parte 2 — contractor, Quote, recurrentes, reactivación / clonación / edición | `TC1200..TC1255` (56) |
| `TC1300..TC1399` | E2E híbridos (reservado, sin asignar) | — |

Reglas: NUNCA renumerar IDs existentes; IDs nuevos = menor libre dentro del rango del grupo, en orden del L1 Stripe. Casos 3DS excluidos por diseño (eBiz no expone challenge).

## Cobertura eBiz exclusiva (no cross-gateway)

Categorías de respuesta que eBiz tiene y que se documentan como referencia, sin intent canónico:
- AVS (17 códigos, serie `4000100…`).
- CVV2 completo por marca (`EBIZ_CVV2_REFERENCE`).
- CAVV / indicador 3DS (`EBIZ_CAVV_REFERENCE`).
- Card Level (`EBIZ_CARD_LEVEL_REFERENCE`).
- Fraud Profiler (review/reject).
- Processing delay (5–60s).

## Referencias

- Datos: [`tests/fixtures/gateways/ebizcharge/`](../../../tests/fixtures/gateways/ebizcharge/)
- Resolver: [`tests/fixtures/gateways/_shared/resolver.ts`](../../../tests/fixtures/gateways/_shared/resolver.ts) (`EBIZCHARGE_INTENT_MAP`)
- Matriz maestra multi-gateway: [`../MATRIZ-MAESTRA-multigateway.md`](../MATRIZ-MAESTRA-multigateway.md)
