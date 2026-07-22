# eBizCharge — Arquitectura QA

> Fuente: <https://developer.ebizcharge.net/connect/docs/test-credit-card-numbers> (analizada 2026-07-20).

## 1. Mecanismo de trigger

**El número de tarjeta determina el outcome** (determinístico), igual que Stripe y a diferencia de Authorize.net (CVV/ZIP). El outcome **no** depende de monto, CVV ni ZIP.

- **Expiración:** fija `0930` (MMYY = 09/30) salvo `4000300411112226` (Invalid Issuer) que usa `0922`.
- **CVV:** declines usan `999`; el resto acepta cualquier valor ("any").
- **3DS/SCA:** **no aplica** en el flujo MAGIIS (`ebizchargeGatewayAdapter.requires3ds = false`). La categoría CAVV es un indicador de respuesta, no un challenge.

## 2. Mapping conceptual MAGIIS ↔ eBizCharge

| Concepto MAGIIS | eBizCharge |
|---|---|
| `SEARCHING_DRIVER` (pago OK) | Transacción approved (serie `4000100…`) |
| `NO_AUTORIZADO` (rechazo) | Decline (serie `4000300…`) con código (05, 51, 97…) |
| Fallo de CVV | Decline `97` (Declined for CVV failure) o CVV2 `N` (No Match) |
| Antifraude | Fraud Profiler `review` / `reject` |
| Hold / Capture | *(a confirmar con backend — depende del modelo de integración)* |

## 3. Categorías de respuesta del sandbox

| Categoría | Serie | Qué expone |
|---|---|---|
| Approved / AVS | `4000100…` | Approved con distintos códigos AVS (YYY, NNN, GGG…) |
| Declined | `4000300…` | Decline con `code` + `message` (04/05/12/15/25/51/55/57/62/65/75/78/97) |
| CVV2 | `4000200…`, `5555444…`, `371122…`, `6011222…` | Resultado CVV2 M/N/P/S/U/X por marca |
| CAVV / 3DS indicator | `4000600…` | Indicador CAVV 1..D (referencia; MAGIIS no-3DS) |
| Card Level | `4000700…` | Nivel de tarjeta A..S3 |
| Fraud Profiler | `4000301411112224` / `…511112223` | review / reject |
| Processing delay | `4000000011112…` | Approved con retraso 5–60s (útil para timeouts) |

Todos los números/códigos exactos están en [`tests/fixtures/gateways/ebizcharge/cards.ts`](../../../tests/fixtures/gateways/ebizcharge/cards.ts) (objetos `EBIZ_TEST_CARDS` + arrays `EBIZ_*_REFERENCE`).

## 4. Modelo de integración (runtime — TBD)

**Pendiente de confirmar con backend MAGIIS** antes de crear el POM:
- ¿REST API directa, hosted iframe, o JS SDK?
- ¿El form de tarjeta es propio de eBiz (como Stripe Elements) o comparte el form MAGIIS?
- ¿Hay endpoint equivalente a `authOnly`/`priorAuthCapture` (Hold/Capture)?

Hasta confirmarlo, no se puede escribir el Page Object. Ver [EXTERNAL-BLOCKERS.md](./EXTERNAL-BLOCKERS.md).

## 5. Consistencia con el adapter

`tests/features/gateway-pg/helpers/adapters/ebizchargeGatewayAdapter.ts` declara `requires3ds = false`. `assertAdapterFixtureConsistency()` valida que no haya drift. El resolver cross-gateway soporta 3 intents (`HAPPY_NO_AUTH`, `DECLINE_AUTHORIZE`, `DECLINE_INVALID_CVC`).
