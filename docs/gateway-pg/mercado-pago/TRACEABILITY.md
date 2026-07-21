# MercadoPago — Trazabilidad de intents (Stripe ↔ MercadoPago)

> Mapeo de los intents canónicos (`tests/fixtures/gateways/_shared/types.ts`) entre Stripe (referencia) y MercadoPago.

## Intents que mapean

| Intent canónico | Stripe | MercadoPago (`MP_CARDS`) | holderName |
|---|---|---|---|
| `HAPPY_NO_AUTH` | `SUCCESS_NO_3DS` (4242…) | `APPROVED` | APRO |
| `DECLINE_AUTHORIZE` | `DECLINE_AUTHORIZE` (…0002) | `REJECTED_OTHER` | OTHE |
| `DECLINE_INVALID_CVC` | `DECLINE_INVALID_CVC` (…0127) | `REJECTED_INVALID_CVV` | SECU |

## Intents que NO mapean (N/A en MercadoPago)

| Intent | Motivo |
|---|---|
| `HAPPY_AUTH` | MAGIIS trata MP como no-3DS (`requires3ds=false`) |
| `FAIL_AUTH` | ídem |
| `DECLINE_CAPTURE` | a confirmar con backend |

## Cobertura MP exclusiva (no cross-gateway)

Estados de rechazo con `status_detail` propios de MP, documentados como referencia:
`CALL`, `FUND`, `EXPI`, `FORM`, `CARD`, `INST`, `DUPL`, `LOCK`, `CTNA`, `ATTE`, `BLAC`, `CONT` (pending), `UNSU` (not-supported).

## Referencias

- Datos: [`tests/fixtures/gateways/mercado-pago/`](../../../tests/fixtures/gateways/mercado-pago/)
- Resolver: [`tests/fixtures/gateways/_shared/resolver.ts`](../../../tests/fixtures/gateways/_shared/resolver.ts) (`MERCADO_PAGO_INTENT_MAP`)
- Matriz maestra multi-gateway: [`../MATRIZ-MAESTRA-multigateway.md`](../MATRIZ-MAESTRA-multigateway.md)
