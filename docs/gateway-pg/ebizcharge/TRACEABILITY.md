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
