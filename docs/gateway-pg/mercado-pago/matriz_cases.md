# MercadoPago — Matriz de casos (`TS-MP-TCxxxx`)

> **Estado:** documentados, **no automatizados** (runtime pendiente — BL-026). Convención `TS-<GATEWAY>-TCxxxx`.
> Trigger = **nombre del titular** (keyword). Número/CVV/exp fijos. Datos: [`tests/fixtures/gateways/mercado-pago/`](../../../tests/fixtures/gateways/mercado-pago/).

## Happy path / pending

| ID | Descripción | Key `MP_CARDS` | holderName | Estado MAGIIS |
|---|---|---|---|---|
| TS-MP-TC1001 | Pago aprobado (default) | `APPROVED` | APRO | SEARCHING_DRIVER |
| TS-MP-TC1002 | Pago pendiente | `PENDING` | CONT | (pendiente de acreditación) |

## Rechazos

| ID | Descripción | Key `MP_CARDS` | holderName | status_detail |
|---|---|---|---|---|
| TS-MP-TC1010 | Rechazo por error general (decline canónico) | `REJECTED_OTHER` | OTHE | cc_rejected_other_reason |
| TS-MP-TC1011 | Rechazo por fondos insuficientes | `REJECTED_INSUFFICIENT_FUNDS` | FUND | cc_rejected_insufficient_amount |
| TS-MP-TC1012 | Rechazo por CVV inválido | `REJECTED_INVALID_CVV` | SECU | cc_rejected_bad_filled_security_code |
| TS-MP-TC1013 | Rechazo, requiere validación | `REJECTED_CALL` | CALL | cc_rejected_call_for_authorize |
| TS-MP-TC1014 | Rechazo por fecha de expiración | `REJECTED_EXPIRED` | EXPI | cc_rejected_bad_filled_date |
| TS-MP-TC1015 | Rechazo por error de formulario | `REJECTED_FORM` | FORM | cc_rejected_bad_filled_other |
| TS-MP-TC1016 | Rechazo por pago duplicado | `REJECTED_DUPLICATE` | DUPL | cc_rejected_duplicated_payment |
| TS-MP-TC1017 | Rechazo, tarjeta deshabilitada | `REJECTED_CARD_DISABLED` | LOCK | cc_rejected_card_disabled |
| TS-MP-TC1018 | Rechazo por lista negra (antifraude) | `REJECTED_BLACKLIST` | BLAC | cc_rejected_blacklist |

## No soportado

| ID | Descripción | Key | holderName |
|---|---|---|---|
| TS-MP-TC1020 | Operación no soportada | `NOT_SUPPORTED` | UNSU |

## Cross-gateway (parametrizado)

| ID | Descripción | Intent |
|---|---|---|
| TS-MP-TC1040 | Hold happy path (parametrizado) | `HAPPY_NO_AUTH` |
| TS-MP-TC1041 | Decline en alta de viaje | `DECLINE_AUTHORIZE` |

Se suma `'mercado-pago'` a `ACTIVE_GATEWAYS` cuando exista runtime.

## Fuera de alcance (N/A en MercadoPago)

- **3DS** (`HAPPY_AUTH`/`FAIL_AUTH`): MAGIIS trata MP como no-3DS.
- **DECLINE_CAPTURE**: a confirmar con el modelo de integración backend.
