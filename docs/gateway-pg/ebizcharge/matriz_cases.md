# eBizCharge — Matriz de casos (`TS-EBIZ-TCxxxx`)

> **Estado (actualizado 2026-07-28):** documentados. Automatización: **el bloque CFG (link/unlink,
> 5 casos) YA está codificado** en `tests/features/gateway-pg/specs/ebizcharge/web/carrier/config/ebizcharge-link-unlink.spec.ts`
> (consumidor thin de `gateway-config.factory.ts`, mismo patrón que Stripe/Authorize) — pero **gateado
> y nunca ejecutado en vivo**: falta poblar `EBIZ_MERCHANT_USER` / `EBIZ_MERCHANT_PASSWORD` /
> `EBIZ_SECURITY_KEY`, y los selectores del modal de credenciales siguen marcados `FRAGILE/TODO(live)`
> (sin reconciliar contra el ambiente real, a diferencia del modal Authorize). El resto de las áreas
> sigue sin código (runtime pendiente — BL-027). Precisión: **0% ejecutado en vivo**, no "0% codificado".
> IDs bajo la convención `TS-<GATEWAY>-TCxxxx`.
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

## Configuración de Pasarela eBizCharge (Magiis App Store)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.
> Precondición extra eBiz: vincular la pasarela requiere `zipCode` del carrier (además de las credenciales sandbox).

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1050 | Validar visualizar pasarela eBizCharge en Magiis App Store y mostrar estado no vinculado antes de configurar credenciales | — | `TS-STRIPE-TC1001` |
| TS-EBIZ-TC1051 | Validar vincular pasarela eBizCharge desde Magiis App Store con credenciales válidas y reflejar estado vinculado en UI y DB | — | `TS-STRIPE-TC1002` |
| TS-EBIZ-TC1052 | Validar impedir vincular pasarela eBizCharge desde Magiis App Store con credenciales inválidas y mostrar error controlado sin activar el gateway | — | `TS-STRIPE-TC1003` |
| TS-EBIZ-TC1053 | Validar solicitar confirmación al desvincular pasarela eBizCharge y no ejecutar acción al cancelar el popup | — | `TS-STRIPE-TC1004` |
| TS-EBIZ-TC1054 | Validar desvincular pasarela eBizCharge y ocultar método tarjeta preautorizada en alta de viaje desde Carrier | — | `TS-STRIPE-TC1005` |
| TS-EBIZ-TC1055 | Validar exclusividad de pasarela activa e impedir vincular otro gateway mientras eBizCharge esté activo mostrando mensaje informativo | — | `TS-STRIPE-TC1006` |
| TS-EBIZ-TC1056 | Validar persistencia de estado vinculado de eBizCharge tras recargar página y navegar entre secciones de Carrier | — | `TS-STRIPE-TC1007` |
| TS-EBIZ-TC1057 | Validar que el request link y unlink de eBizCharge retorne status 200 y registre evento en logs o auditoría si aplica | — | `TS-STRIPE-TC1008` |

---

## Alta de Viaje desde App Pax – Usuario Personal

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.
> Precondición extra eBiz: el alta de tarjeta requiere `placeId` del pax.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1100 | Validar Alta de Viaje desde app pax para usuario personal con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-TC1009` |
| TS-EBIZ-TC1101 | Validar Alta de Viaje desde app pax para usuario personal con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-TC1010` |
| TS-EBIZ-TC1102 | Validar Alta de Viaje desde app pax para usuario personal con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-TC1011` |
| TS-EBIZ-TC1103 | Validar Alta de Viaje desde app pax para usuario personal con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-TC1012` |

---

## Alta de Viaje desde App Pax – Usuario Business / Colaborador

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.
> Precondición extra eBiz: el alta de tarjeta requiere `placeId` del pax.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1104 | Validar Alta de Viaje desde app pax para usuario business con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Vincular tarjeta nueva | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-TC1017` |
| TS-EBIZ-TC1105 | Validar Alta de Viaje desde app pax para usuario business con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Vincular tarjeta nueva | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-TC1018` |
| TS-EBIZ-TC1106 | Validar Alta de Viaje desde app pax para usuario business con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Usar tarjeta vinculada existente | `EBIZ_CARDS.SUCCESS` (stored) | `TS-STRIPE-TC1019` |
| TS-EBIZ-TC1107 | Validar Alta de Viaje desde app pax para usuario business con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Usar tarjeta vinculada existente | `EBIZ_CARDS.SUCCESS` (stored) | `TS-STRIPE-TC1020` |

---

## Alta de Viaje desde Carrier – Usuario Colaborador o Asociado de Contractor

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.
> Precondición extra eBiz: el alta de tarjeta requiere `placeId` del pax.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1058 | validar vincular tarjeta y Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada Hold(desde carrier) y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-TC1033` |
| TS-EBIZ-TC1059 | Validar Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Vincular tarjeta nueva | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-TC1034` |
| TS-EBIZ-TC1060 | Validar Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Vincular tarjeta nueva | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-TC1035` |
| TS-EBIZ-TC1061 | Validar Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Usar tarjeta vinculada existente | `EBIZ_CARDS.SUCCESS` (stored) | `TS-STRIPE-TC1036` |
| TS-EBIZ-TC1062 | Validar Alta de Viaje desde carrier para usuario colaborador o asociado de contractor con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Usar tarjeta vinculada existente | `EBIZ_CARDS.SUCCESS` (stored) | `TS-STRIPE-TC1041` |

---

## Alta de Viaje desde Carrier – Usuario Personal

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.
> Precondición extra eBiz: el alta de tarjeta requiere `placeId` del pax.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1063 | Validar alta de viaje desde carrier para usuario personal con tarjeta preautorizada exitosa (Visa 4000100011112224) con Hold OFF — viaje pasa a estado "Buscando conductor" sin retención de fondos previa | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-TC1050` |
| TS-EBIZ-TC1064 | Validar alta de viaje desde carrier para usuario personal con tarjeta preautorizada exitosa (Visa 4000100011112224) con Hold OFF — variante origen/destino alternativo | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-TC1052` |
| TS-EBIZ-TC1065 | Validar alta de viaje desde carrier para usuario personal con tarjeta preautorizada exitosa (Visa 4000100011112224) con Hold OFF — variante set 2 | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-TC1058` |
| TS-EBIZ-TC1066 | Validar alta de viaje desde carrier para usuario personal con tarjeta preautorizada exitosa (Visa 4000100011112224) con Hold OFF — variante set 2 alternativo | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-TC1060` |

---

## Alta de Viaje desde Carrier – Usuario Empresa Individuo

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.
> Precondición extra eBiz: el alta de tarjeta requiere `placeId` del pax.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1067 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Vincular tarjeta nueva | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-TC1065` |
| TS-EBIZ-TC1068 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Vincular tarjeta nueva | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-TC1066` |
| TS-EBIZ-TC1069 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Usar tarjeta vinculada existente | `EBIZ_CARDS.SUCCESS` (stored) | `TS-STRIPE-TC1067` |
| TS-EBIZ-TC1070 | Validar Alta de Viaje desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Usar tarjeta vinculada existente | `EBIZ_CARDS.SUCCESS` (stored) | `TS-STRIPE-TC1068` |

---

## Cargo a Bordo – Tarjeta de Crédito – Usuario Personal (desde Carrier)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1108 | Validar Alta de viaje desde carrier para usuario personal – cargo a bordo – pago exitoso | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-TC1081` |
| TS-EBIZ-TC1109 | Validar Alta de viaje desde carrier para usuario personal – cargo a bordo – pago rechazado genérico | `EBIZ_CARDS.DECLINE_DO_NOT_HONOR` | `TS-STRIPE-TC1082` |
| TS-EBIZ-TC1110 | Validar Alta de viaje desde carrier para usuario personal – cargo a bordo – CVC incorrecto | `EBIZ_CARDS.DECLINE_CVV` | `TS-STRIPE-TC1085` |

---

## Cargo a Bordo – Tarjeta de Crédito – Usuario Colaborador o Asociado de Contractor (desde Carrier)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1111 | Validar Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – pago exitoso | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-TC1096` |
| TS-EBIZ-TC1112 | Validar Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – pago rechazado genérico | `EBIZ_CARDS.DECLINE_DO_NOT_HONOR` | `TS-STRIPE-TC1097` |
| TS-EBIZ-TC1113 | Validar Alta de viaje desde carrier para usuario colaborador o asociado de contractor – cargo a bordo – CVC incorrecto | `EBIZ_CARDS.DECLINE_CVV` | `TS-STRIPE-TC1100` |

---

## Cargo a Bordo – Tarjeta de Crédito – Usuario Empresa Individuo (desde Carrier)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1114 | Validar Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – pago exitoso | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-TC1111` |
| TS-EBIZ-TC1115 | Validar Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – pago rechazado genérico | `EBIZ_CARDS.DECLINE_DO_NOT_HONOR` | `TS-STRIPE-TC1112` |
| TS-EBIZ-TC1116 | Validar Alta de viaje desde carrier para usuario empresa individuo – cargo a bordo – CVC incorrecto | `EBIZ_CARDS.DECLINE_CVV` | `TS-STRIPE-TC1115` |

---

## Portal Contractor – Alta de Tarjetas y Vinculación

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.
> Precondición extra eBiz: el alta de tarjeta requiere `placeId` del pax.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1200 | Validar vinculación de tarjeta y Alta de Viaje desde portal contractor para usuario colaborador con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC001` |
| TS-EBIZ-TC1201 | Validar vinculación de tarjeta y Alta de Viaje desde portal contractor para usuario colaborador con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC002` |
| TS-EBIZ-TC1202 | Validar selección de tarjeta y Alta de Viaje desde portal contractor para usuario colaborador con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC003` |
| TS-EBIZ-TC1203 | Validar selección de tarjeta y Alta de Viaje desde portal contractor para usuario colaborador con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC004` |
| TS-EBIZ-TC1204 | Validar Alta de Viaje desde portal contractor para usuario colaborador con Tarjeta declinada genérica (Do Not Honor 4000300211112228) Hold ON — hold authorize rechaza, error visible, viaje no creado | `EBIZ_CARDS.DECLINE_DO_NOT_HONOR` | `TS-STRIPE-P2-TC090` |

---

## Flujo Quote – Alta de Viaje

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1205 | Validar Alta de Viaje desde Quote para usuario sin datos filiatorios vinculado a pasajero existente con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC009` |
| TS-EBIZ-TC1206 | Validar Alta de Viaje desde Quote para usuario sin datos filiatorios vinculado a pasajero existente con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC010` |
| TS-EBIZ-TC1207 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario colaborador existente con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC011` |
| TS-EBIZ-TC1208 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario colaborador existente con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC012` |
| TS-EBIZ-TC1209 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario colaborador existente con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC013` |
| TS-EBIZ-TC1210 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario colaborador existente con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC014` |
| TS-EBIZ-TC1211 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario personal existente con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC019` |
| TS-EBIZ-TC1212 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario personal existente con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC020` |
| TS-EBIZ-TC1213 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario personal existente con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC021` |
| TS-EBIZ-TC1214 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario personal existente con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC022` |
| TS-EBIZ-TC1215 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario empresa individuo existente con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC027` |
| TS-EBIZ-TC1216 | Validar Alta de Viaje desde Quote para usuario con número de teléfono vinculado a usuario empresa individuo existente con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC028` |
| TS-EBIZ-TC1217 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario empresa individuo existente con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC029` |
| TS-EBIZ-TC1218 | Validar Alta de Viaje desde Quote para usuario con mail vinculado a usuario empresa individuo existente con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC030` |

---

## Viajes Recurrentes – Portal Contractor (Usuario Colaboradores)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1219 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC035` |
| TS-EBIZ-TC1220 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC036` |
| TS-EBIZ-TC1221 | Validar selección de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC037` |
| TS-EBIZ-TC1222 | Validar selección de tarjeta y Alta de Viaje Recurrente desde portal contractor para usuario colaborador con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC038` |

---

## Viajes Recurrentes – Portal Carrier (Usuario Colaboradores)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1223 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC041` |
| TS-EBIZ-TC1224 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC042` |
| TS-EBIZ-TC1225 | Validar selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC043` |
| TS-EBIZ-TC1226 | Validar selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario colaborador con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC044` |
| TS-EBIZ-TC1227 | Validar vinculación y alta de viaje Recurrente desde carrier para usuario colaborador con tarjeta preautorizada y edición de fechas – validar consistencia de datos y finalización desde App Driver (CASO CRÍTICO) | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC047` |

---

## Viajes Recurrentes – Portal Carrier (Usuario Personal)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1228 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario personal con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC048` |
| TS-EBIZ-TC1229 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario personal con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC049` |
| TS-EBIZ-TC1230 | Validar selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario personal con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC050` |
| TS-EBIZ-TC1231 | Validar selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario personal con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC051` |

---

## Viajes Recurrentes – Portal Carrier (Usuario Empresa Individuo)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1232 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC054` |
| TS-EBIZ-TC1233 | Validar vinculación de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC055` |
| TS-EBIZ-TC1234 | Validar selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC056` |
| TS-EBIZ-TC1235 | Validar selección de tarjeta y Alta de Viaje Recurrente desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC057` |

---

## Reactivación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1236 | Validar Reactivación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Vincular tarjeta nueva | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC060` |
| TS-EBIZ-TC1237 | Validar Reactivación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Vincular tarjeta nueva | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC061` |
| TS-EBIZ-TC1238 | Validar Reactivación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Usar tarjeta vinculada existente | `EBIZ_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC062` |
| TS-EBIZ-TC1239 | Validar Reactivación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Usar tarjeta vinculada existente | `EBIZ_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC063` |

---

## Clonación de Viajes Cancelados (desde Carrier – Usuario Empresa Individuo)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1240 | Validar Clonación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Vincular tarjeta nueva | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC066` |
| TS-EBIZ-TC1241 | Validar Clonación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Vincular tarjeta nueva | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC067` |
| TS-EBIZ-TC1242 | Validar Clonación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Usar tarjeta vinculada existente | `EBIZ_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC068` |
| TS-EBIZ-TC1243 | Validar Clonación de viaje cancelado desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Usar tarjeta vinculada existente | `EBIZ_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC069` |

---

## Clonación de Viajes Finalizados (desde Carrier – Usuario Empresa Individuo)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1244 | Validar Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Vincular tarjeta nueva | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC072` |
| TS-EBIZ-TC1245 | Validar Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Vincular tarjeta nueva | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC073` |
| TS-EBIZ-TC1246 | Validar Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Usar tarjeta vinculada existente | `EBIZ_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC074` |
| TS-EBIZ-TC1247 | Validar Clonación de viaje finalizado desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Usar tarjeta vinculada existente | `EBIZ_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC075` |

---

## Edición de Viajes Programados (desde Carrier – Usuario Empresa Individuo)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1248 | Validar Alta de viaje y edición desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Vincular tarjeta nueva | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC078` |
| TS-EBIZ-TC1249 | Validar Alta de viaje y edición desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Vincular tarjeta nueva | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC079` |
| TS-EBIZ-TC1250 | Validar Alta de viaje y edición desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Usar tarjeta vinculada existente | `EBIZ_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC080` |
| TS-EBIZ-TC1251 | Validar Alta de viaje y edición desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Usar tarjeta vinculada existente | `EBIZ_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC081` |

---

## Edición en Conflicto (desde Carrier – Usuario Empresa Individuo)

> Derivado determinísticamente del L1 Stripe (`docs/gateway-pg/stripe/normalized-test-cases.json`) — Fase 4 (2026-07-26), sin casos 3DS. Script: `scripts/ai/derive-gateway-matrix.mjs`.

| ID | Descripción | Card | Ref Stripe |
| --- | --- | --- | --- |
| TS-EBIZ-TC1252 | Validar Alta de viaje y edición en conflicto desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Vincular tarjeta nueva | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC084` |
| TS-EBIZ-TC1253 | Validar Alta de viaje y edición en conflicto desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Vincular tarjeta nueva | `EBIZ_CARDS.SUCCESS` | `TS-STRIPE-P2-TC085` |
| TS-EBIZ-TC1254 | Validar Alta de viaje y edición en conflicto desde carrier para usuario empresa individuo con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Usar tarjeta vinculada existente | `EBIZ_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC086` |
| TS-EBIZ-TC1255 | Validar Alta de viaje y edición en conflicto desde carrier para usuario empresa individuo con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Usar tarjeta vinculada existente | `EBIZ_CARDS.SUCCESS` (stored) | `TS-STRIPE-P2-TC087` |

---

## Fuera de alcance (N/A en eBizCharge)

- **3DS** (`HAPPY_AUTH` / `FAIL_AUTH`): eBiz no expone challenge 3DS.
- **DECLINE_CAPTURE**: el sandbox no distingue decline de capture (a confirmar con el modelo de integración backend).
