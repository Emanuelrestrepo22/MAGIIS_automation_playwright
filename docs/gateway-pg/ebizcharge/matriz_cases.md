# eBizCharge — Matriz de casos (`TS-EBIZ-TCxxxx`)

> **Estado:** documentados, **no automatizados** (runtime pendiente — BL-027). IDs bajo la convención `TS-<GATEWAY>-TCxxxx`.
> Ambiente: **TEST**. Trigger = número de tarjeta. Datos: [`tests/fixtures/gateways/ebizcharge/`](../../../tests/fixtures/gateways/ebizcharge/).

## Happy path / approved

| ID | Descripción | Card / key | Resultado esperado | Estado MAGIIS |
|---|---|---|---|---|
| TS-EBIZ-TC1001 | Pago exitoso default (Visa approved) | `EBIZ_CARDS.SUCCESS` (4000100011112224) | approved (AVS YYY, CVV2 M) | SEARCHING_DRIVER |
| TS-EBIZ-TC1002 | Approved con AVS no-match | `4000100511112229` (AVS NNN) | approved, AVS N | SEARCHING_DRIVER |
| TS-EBIZ-TC1003 | Approved con retraso de procesamiento (timeout handling) | `EBIZ_CARDS.DELAY_60S` (4000000011112267) | approved a los 60s | SEARCHING_DRIVER (post-delay) |

## Declines

| ID | Descripción | Card / key | Code | Estado MAGIIS |
|---|---|---|---|---|
| TS-EBIZ-TC1010 | Decline genérico | `EBIZ_CARDS.DECLINE_GENERIC` (4000300011112220) | (blank) | NO_AUTORIZADO |
| TS-EBIZ-TC1011 | Do not Honor (decline canónico) | `EBIZ_CARDS.DECLINE_DO_NOT_HONOR` (4000300211112228) | 05 | NO_AUTORIZADO |
| TS-EBIZ-TC1012 | Fondos insuficientes | `EBIZ_CARDS.DECLINE_INSUFFICIENT` (4000300611112224) | 51 | NO_AUTORIZADO |
| TS-EBIZ-TC1013 | Invalid Transaction | `DECLINE_INVALID_TRANSACTION` (4000300311112227) | 12 | NO_AUTORIZADO |
| TS-EBIZ-TC1014 | Restricted Card | `DECLINE_RESTRICTED` (4000300911112221) | 62 | NO_AUTORIZADO |
| TS-EBIZ-TC1015 | Invalid Issuer (exp 0922) | `declineInvalidIssuer` (4000300411112226) | 15 | NO_AUTORIZADO |
| TS-EBIZ-TC1016 | Declined for CVV failure | `EBIZ_CARDS.DECLINE_CVV` (4000301311112225) | 97 | NO_AUTORIZADO |

## CVV2

| ID | Descripción | Card / key | CVV2 | Nota |
|---|---|---|---|---|
| TS-EBIZ-TC1020 | CVV2 No Match | `EBIZ_CARDS.CVV2_NO_MATCH` (4000200111112221) | N | comportamiento según regla de negocio del alta de tarjeta |
| TS-EBIZ-TC1021 | CVV2 Not Processed | `EBIZ_CARDS.CVV2_NOT_PROCESSED` (4000200211112220) | P | — |
| TS-EBIZ-TC1022 | Amex CVV2 No Match → Decline | `EBIZ_CARDS.CVV2_AMEX_DECLINE` (371122223332241) | no-match-decline | Amex CVV 4 dígitos |

## Antifraude (Fraud Profiler)

| ID | Descripción | Card / key | Resultado |
|---|---|---|---|
| TS-EBIZ-TC1030 | Transacción marcada para revisión | `EBIZ_CARDS.FRAUD_REVIEW` (4000301411112224) | review |
| TS-EBIZ-TC1031 | Transacción rechazada por antifraude | `EBIZ_CARDS.FRAUD_REJECT` (4000301511112223) | reject |

## Cross-gateway (parametrizado)

| ID | Descripción | Intent | Nota |
|---|---|---|---|
| TS-EBIZ-TC1040 | Hold happy path (parametrizado) | `HAPPY_NO_AUTH` | Se suma `'ebizcharge'` a `ACTIVE_GATEWAYS` cuando exista runtime |
| TS-EBIZ-TC1041 | Decline en alta de viaje | `DECLINE_AUTHORIZE` | mismo spec, dato resuelto por `resolveCard` |

## Fuera de alcance (N/A en eBizCharge)

- **3DS** (`HAPPY_AUTH` / `FAIL_AUTH`): eBiz no expone challenge 3DS.
- **DECLINE_CAPTURE**: el sandbox no distingue decline de capture (a confirmar con el modelo de integración backend).
