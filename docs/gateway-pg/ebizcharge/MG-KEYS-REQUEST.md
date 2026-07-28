# eBizCharge — Xray Tests a crear en Jira

> **Regla dura:** las keys `MG-###` las crea QA en Jira. El código **jamás** las fabrica
> (`tests/features/gateway-pg/data/xray-keys.ts:26-28`). Mientras una key sea `null`, el
> caso corre igual pero sale `unmapped` del reporter y no se importa a ningún Test
> Execution. Esta lista existe para cerrar ese hueco sin inventar nada.

**Contexto:** Test Plan **MG-178** · Test Execution eBizCharge **MG-559**.

**Estado actual:** 30 tests eBizCharge se coleccionan (22 de matriz de outcomes + 8 de
configuración de pasarela). Los 30 llevan su TC ID local `TS-EBIZ-TCxxxx`; **ninguno** tiene
key MG todavía, así que ninguno llega a MG-559.

---

## 1. Configuración de pasarela (área CFG) — 8 Tests

Espejo exacto de los que ya existen para Stripe (MG-211..218) y Authorize (MG-219..226).

| TC local | Título para el Test de Xray |
|---|---|
| `TS-EBIZ-TC1050` | Validar visualizar pasarela eBizCharge en Magiis App Store y mostrar estado no vinculado antes de configurar credenciales |
| `TS-EBIZ-TC1051` | Validar vincular pasarela eBizCharge desde Magiis App Store con credenciales válidas y reflejar estado vinculado en UI y DB |
| `TS-EBIZ-TC1052` | Validar impedir vincular pasarela eBizCharge con credenciales inválidas y mostrar error controlado sin activar el gateway |
| `TS-EBIZ-TC1053` | Validar solicitar confirmación al desvincular pasarela eBizCharge y no ejecutar acción al cancelar el popup |
| `TS-EBIZ-TC1054` | Validar desvincular pasarela eBizCharge y ocultar método tarjeta preautorizada en alta de viaje desde Carrier |
| `TS-EBIZ-TC1055` | Validar exclusividad de pasarela activa e impedir vincular otro gateway mientras eBizCharge esté activo mostrando mensaje informativo |
| `TS-EBIZ-TC1056` | Validar persistencia de estado vinculado de eBizCharge tras recargar página y navegar entre secciones de Carrier |
| `TS-EBIZ-TC1057` | Validar que el request link y unlink de eBizCharge retorne status 200 y registre evento en logs o auditoría si aplica |

Al crearlas, poblar `XRAY_KEYS_BY_GATEWAY.ebizcharge.cfg` en
`tests/features/gateway-pg/data/xray-keys.ts` (los `cfgTcIds` ya están poblados).

## 2. Matriz de outcomes de tarjeta (área C) — 17 Tests ejecutables

Un Test por outcome de negocio que el sandbox de eBizCharge expone y que tiene oráculo de
sistema definido. **No** se pide un Test por número de tarjeta: los 70 números que solo
varían en el código de anotación (AVS / CVV2 / CAVV / Card Level) son datos de referencia,
no casos de prueba — de otro modo el ATP crecería ~90 Tests que validan todos lo mismo.

| TC local | Intent | Tarjeta | Resultado esperado del sistema |
|---|---|---|---|
| `TS-EBIZ-TC1001` | `HAPPY_NO_AUTH` | 4000100011112224 | tarjeta válida · viaje Buscando chofer |
| — | `HAPPY_MASTERCARD` | 5555444433332226 | tarjeta válida |
| — | `HAPPY_AMEX` | 371122223332225 | tarjeta válida (CVV de 4 dígitos) |
| — | `HAPPY_DISCOVER` | 6011222233332224 | tarjeta válida |
| `TS-EBIZ-TC1003` | `HAPPY_SLOW_PROCESSING` | 4000000011112267 | tarjeta válida tras 60s de demora del procesador |
| `TS-EBIZ-TC1011` | `DECLINE_AUTHORIZE` | 4000300211112228 (05) | rechazada · viaje No autorizado |
| `TS-EBIZ-TC1012` | `DECLINE_INSUFFICIENT_FUNDS` | 4000300611112224 (51) | rechazada |
| `TS-EBIZ-TC1013` | `DECLINE_INVALID_TRANSACTION` | 4000300311112227 (12) | rechazada |
| `TS-EBIZ-TC1014` | `DECLINE_RESTRICTED_CARD` | 4000300911112221 (62) | rechazada |
| `TS-EBIZ-TC1015` | `DECLINE_INVALID_ISSUER` | 4000300411112226 (15) | rechazada — **exp 0922**, único caso |
| `TS-EBIZ-TC1016` | `DECLINE_INVALID_CVC` | 4000301311112225 (97) | rechazada |
| — | `DECLINE_DO_NOT_HONOR` | 4000300211112228 (05) | rechazada, nombrado por su causa |
| — | `DECLINE_CARD_FLAGGED` | 4000300001112222 (04) | rechazada (el emisor pide retener la tarjeta) |
| `TS-EBIZ-TC1031` | `FRAUD_REJECT` | 4000301511112223 | rechazada por antifraude |
| `TS-EBIZ-TC1020` | `APPROVED_CVV_MISMATCH` | 4000200111112221 | **aprobada** con CVV2 sin coincidir |
| `TS-EBIZ-TC1002` | `APPROVED_AVS_MISMATCH` | 4000100511112229 | **aprobada** con AVS sin coincidir |
| — | `REFERRAL` | 4000300111112229 | NO autorizada — el emisor deriva a autorización por voz |

Los `—` son intents cuyo TC local todavía no está asignado en la matriz L0; al crear el
Test conviene asignarlo también en `docs/gateway-pg/ebizcharge/matriz_cases.md` y en
`tests/features/gateway-pg/data/card-matrix-tc-ids.ts`.

## 3. Casos que se generan pero NO se piden como Test

Se coleccionan como `skip` con motivo, a propósito: un caso ausente sería un hueco
invisible, un skip con razón es una decisión auditable.

| Intent | Motivo del skip |
|---|---|
| `HAPPY_AUTH` · `FAIL_AUTH` | Ni se generan: 3DS es exclusivo de Stripe (caso excluido, no degradado) |
| `HAPPY_PARTIAL_AUTH` · `DECLINE_PREPAID_ZERO_BALANCE` | eBizCharge no expone esos outcomes |
| `DECLINE_CAPTURE` | eBizCharge decide el outcome en la autorización, no en la captura |
| `DECLINE_EXPIRED_CARD` | La expiración se valida del lado del cliente: la request no llega a la pasarela |
| `FRAUD_REVIEW` | La pasarela SÍ lo expone (`TS-EBIZ-TC1030`), pero nadie definió qué debe mostrar MAGIIS ante "marcada para revisión" — hay que decidirlo con producto antes de habilitar el caso |

---

## Cómo cerrar el circuito una vez creadas las keys

1. Poblar `XRAY_KEYS_BY_GATEWAY.ebizcharge.cfg` y el mapa de intents en `xray-keys.ts`.
2. `node scripts/ai/build-id-map.mjs` para regenerar `docs/gateway-pg/id-map.json`.
3. Correr `npm run test:test:gateway:ebizcharge:xray` (necesita `EBIZ_MERCHANT_*` y
   `GATEWAY_ALLOW_DESTRUCTIVE_SWITCH=true`) → importa a **MG-559**.
