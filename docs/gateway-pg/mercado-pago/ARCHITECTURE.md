# MercadoPago — Arquitectura QA

> Fuente: <https://www.mercadopago.com.ar/developers/es/docs/your-integrations/test/cards> (analizada 2026-07-20).

## 1. Mecanismo de trigger

**El NOMBRE del titular (`holderName`) determina el outcome.** No depende del número, CVV ni monto.

- Se usa un **keyword de estado** como nombre: `APRO`, `OTHE`, `CONT`, `SECU`, `FUND`, etc.
- Número, CVV y expiración son **fijos**: CVV `123` (Amex `1234`), exp `11/30`, tarjeta del catálogo.
- **Documento:** `APRO` y `OTHE` usan DNI `12345678`; el resto de rechazos no requieren documento (doc oficial).
- **3DS/SCA:** no aplica en el flujo MAGIIS (`mercadoPagoGatewayAdapter.requires3ds = false`).

> ⚠️ A diferencia de las demás pasarelas, en MP `holderName` **es el trigger** — el spec debe llenar el nombre con el keyword exacto.

## 2. Mapping conceptual MAGIIS ↔ MercadoPago

| Concepto MAGIIS | MercadoPago |
|---|---|
| `SEARCHING_DRIVER` (pago OK) | `APRO` → status `approved` (accredited) |
| `NO_AUTORIZADO` (rechazo) | `OTHE`/`FUND`/`SECU`/… → status `rejected` (+ status_detail) |
| Pago pendiente | `CONT` → status `pending` |
| Fallo de CVV | `SECU` → `cc_rejected_bad_filled_security_code` |
| Antifraude / lista negra | `BLAC` → `cc_rejected_blacklist` |
| Hold / Capture | *(a confirmar con backend — depende del modelo de integración)* |

## 3. Keywords de estado (tabla completa)

| Keyword | Status | status_detail |
|---|---|---|
| `APRO` | approved | accredited |
| `CONT` | pending | pending_contingency |
| `OTHE` | rejected | cc_rejected_other_reason |
| `CALL` | rejected | cc_rejected_call_for_authorize |
| `FUND` | rejected | cc_rejected_insufficient_amount |
| `SECU` | rejected | cc_rejected_bad_filled_security_code |
| `EXPI` | rejected | cc_rejected_bad_filled_date |
| `FORM` | rejected | cc_rejected_bad_filled_other |
| `CARD` | rejected | cc_rejected_bad_filled_card_number |
| `INST` | rejected | cc_rejected_invalid_installments |
| `DUPL` | rejected | cc_rejected_duplicated_payment |
| `LOCK` | rejected | cc_rejected_card_disabled |
| `CTNA` | rejected | cc_rejected_card_type_not_allowed |
| `ATTE` | rejected | cc_rejected_max_attempts |
| `BLAC` | rejected | cc_rejected_blacklist |
| `UNSU` | not-supported | not_supported |

> **Keyword especial `TEST`** (doc oficial): "usado para aplicar regla de montos" — el outcome lo determina el **monto** de la transacción, no el `holderName`. Por eso **no** vive en el registro determinista `MP_TEST_CARDS` (que mapea un outcome fijo por keyword). Si se necesita para probar reglas de monto, usar `holderName = TEST` y variar el importe. Fuera de alcance del smoke keyword-driven.

Datos en [`tests/fixtures/gateways/mercado-pago/cards.ts`](../../../tests/fixtures/gateways/mercado-pago/cards.ts) (`MP_TEST_CARDS` + catálogo `MP_CARD_CATALOG`).

## 4. Modelo de integración (runtime — TBD)

**Pendiente de confirmar con backend MAGIIS** antes de crear el POM:
- ¿Checkout API, Bricks (Card Payment Brick), o Wallet/Checkout Pro?
- ¿Form propio de MP o form MAGIIS que envía el nombre al SDK?
- ¿Endpoints Hold/Capture?

Ver [EXTERNAL-BLOCKERS.md](./EXTERNAL-BLOCKERS.md).

## 5. Consistencia con el adapter

`mercadoPagoGatewayAdapter` declara `requires3ds = false`. `assertAdapterFixtureConsistency()` valida que no haya drift. El resolver cross-gateway soporta 3 intents (`HAPPY_NO_AUTH`, `DECLINE_AUTHORIZE`, `DECLINE_INVALID_CVC`).
