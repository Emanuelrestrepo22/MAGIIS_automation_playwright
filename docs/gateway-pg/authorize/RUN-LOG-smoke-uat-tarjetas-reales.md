# RUN-LOG · Smoke UAT con tarjetas reales — Authorize.net

> **Ronda 1 · 2026-08-03 · entorno UAT (`apps-uat.magiis.com`) · carrier 1481 "UNITY US"**
> Cuenta Authorize **productiva** · tarjeta real master ••••6307 (BIN 557729, vence 11/2027, ZIP 33160)
> Ejecución manual del QA lead + verificación por API/DB del agente.
> ATR Xray: **[MG-645](https://magiis.atlassian.net/browse/MG-645)** — environment `uat`, parent MG-509, `Relates` al ATP MG-178.
>
> Relojes: Oracle guarda **UTC** · el ejecutor está en **UTC-3** · el Merchant Interface de Authorize
> muestra **EDT (UTC-4)**. Todas las horas de este documento están en **local UTC-3** salvo indicación.
> ⚠ El driver `oracledb` reinterpreta los `TIMESTAMP` naive como hora local e infla los ISO en +3 h:
> leer siempre con `TO_CHAR`.

---

## 1. Veredicto

| Comportamiento | Veredicto | Acreditado por |
|---|---|---|
| **(A)** El dinero vuelve al pax al cancelar un viaje programado con pre-autorización activa | **PASS** en los dos portales | MG-356 · MG-627 |
| **(B)** El alta de viaje desde app culmina satisfactoriamente y el cobro cierra el viaje | **PASS** | MG-347 · MG-524 · MG-352 |

**GO scoped**: los dos comportamientos que gateaban el pase a producción están acreditados con
correlación de identidad en tres capas (MAGIIS DB · logs del gateway · Merchant Interface del PSP).
Quedan fuera de esta ronda los refunds sobre transacción liquidada y los caminos de decline forzado.

---

## 2. Estado de los Tests en el ATR MG-645

| Test | tcid | Estado | Qué acredita |
|---|---|---|---|
| [MG-220](https://magiis.atlassian.net/browse/MG-220) | TC-PAY-CFG-10 | PASSED | Vinculación con credenciales válidas de la cuenta productiva |
| [MG-285](https://magiis.atlassian.net/browse/MG-285) | TC-PAY-WAL-02 | PASSED | Alta de tarjeta real desde el portal **Carrier** |
| [MG-286](https://magiis.atlassian.net/browse/MG-286) | TC-PAY-WAL-03 | PASSED | Alta de tarjeta real desde **App PAX** |
| [MG-349](https://magiis.atlassian.net/browse/MG-349) | TC-PAY-COB-04 | PASSED | Hold = precio estimado × 1,01 (margen 1%) |
| [MG-347](https://magiis.atlassian.net/browse/MG-347) | TC-PAY-COB-02 | PASSED | Viaje desde App PAX completado hasta finalización por App Driver |
| [MG-524](https://magiis.atlassian.net/browse/MG-524) | TC-PAY-COB-25 | PASSED | Cobro por `priorAuthCapture` sobre el hold |
| [MG-352](https://magiis.atlassian.net/browse/MG-352) | TC-PAY-COB-07 | PASSED | Monto final > hold → cobra la diferencia sin fallar el cierre |
| [MG-356](https://magiis.atlassian.net/browse/MG-356) | TC-PAY-COB-11 | PASSED | Cancelar con hold antes de la captura → autorización liberada |
| [MG-627](https://magiis.atlassian.net/browse/MG-627) | TC-PAY-E-04 | PASSED | Hold liberado y dinero devuelto al cancelar viaje programado |
| [MG-350](https://magiis.atlassian.net/browse/MG-350) | TC-PAY-COB-05 | **EXECUTING** | Falta la captura del Merchant Interface de `81728953569` |

---

## 3. Datos del banco de pruebas

| Ítem | Valor |
|---|---|
| Carrier | **1481 "UNITY US"** · `uatdemo.usa@magiis.com` (`MAGIISUSER` 39140) · país US |
| Link Authorize final | `MGW_LINKED` **151**, `ACTIVE=1`, creado 11:57:03 |
| Pax usados | 148127 `emanuel.restrepo@magiis.com` (passenger 143198) · 146550 `emadavresgar@hotmail.com` (141858) · 145209 `uat.erika@yopmail.com` (140698) |
| Driver | 6033 `uatsenna@yopmail.com` |
| Tarjeta | master ••••6307 · `CARD` 4646 (token Authorize `1385758295`) y 4647 (token `1385787111`) |
| Config de pago | 580 = `TYPE_CONFIG='CARRIER'` · 581 = `TYPE_CONFIG='APP_PAX'` |

**Técnica de trazabilidad descubierta**: `TRAVEL.CARRIER_PAYMENT_METHOD_CONFIG_ID` identifica el portal
que originó el viaje, sin depender de la declaración del tester. En este carrier, **580 = Carrier** y
**581 = App PAX**.

---

## 4. Cronología por viaje

### 722710 — programado desde Carrier · el falso negativo del Test Mode

| Hora | Capa | Evento |
|---|---|---|
| 12:00:06 | Oracle | `TRAVEL` 722710 · `ISPROGRAMMED=1` · `CREDIT_CARD` · CFG 580 |
| 12:00:13 | Oracle | `CARD_HOLDS` 92 · $37,58 · **`INTENT_ID='0'`** · `STATUS='HOLD'` |
| 12:31:52 | Oracle | Cancelado · `STATE=7` · `CANCELEDBY='CARRIER'` |
| ~12:32 | Oracle | `CARD_HOLDS` 92 → `RELEASE` · `TRAVEL.HOLD_INTENT` → null |
| — | MGW logs | `request /payment/release {intentId:"0"}` → `error E00027` → `response {result:error, transactionStatusDetail:CC_REJECTED_OTHER_REASON, status:AUTHORIZE_ERROR}` |

**Causa raíz del `'0'`**: la cuenta Authorize estaba en **Test Mode**, y en Test Mode Authorize aprueba la
operación pero devuelve `transId = 0` sin crear transacción real. No fue un error de mapeo de campos de
MAGIIS. Al desactivar Test Mode el flujo funciona de punta a punta.

### 722711 — programado desde Carrier · primera acreditación verde de (A)

| Hora | Capa | Evento |
|---|---|---|
| 12:37:35 | Oracle | `TRAVEL` 722711 · programado · CFG 580 |
| 12:37:38 | **PSP** | Autorización **$5,05** · tipo *Authorization Only* · Transaction ID **81728689443** · AVS `Street Address: No Match, Zip: Matched first 5 digits (Z)` |
| 12:37:39 | Oracle | `CARD_HOLDS` 93 · `INTENT_ID='81728689443'` · $5,05 |
| 12:40:56 | Oracle | Cancelado · `STATE=7` · `CANCELEDBY='CARRIER'` |
| post | Oracle + PSP | `RELEASE` local · **Voided** en el PSP · `Settlement: No Data Available` |

Correlación de identidad: `CARD_HOLDS.INTENT_ID` == Transaction ID del Merchant Interface.

### 722712 — programado desde **App PAX** · (A) por el segundo portal

| Hora | Capa | Evento |
|---|---|---|
| 14:16:34 | Oracle | `TRAVEL` 722712 · programado · **CFG 581 = App PAX** |
| 14:16:38 | Oracle | `CARD_HOLDS` 94 · **$1.945,44** · `INTENT_ID='81728912648'` (referencia real desde el primer instante) |
| 14:24:35 | Oracle | Cancelado · `STATE=7` |
| post | Oracle | `RELEASE` · `HOLD_INTENT` → null · barrido de cierre limpio |

El monto alto es dato de prueba, no defecto: viaje simulado de **343,29 km / 5 h 37 min**, 274,6 km de
taxiing a $1,55/km (`SIMULATIONPRICEI` 755943 · `PRICEPOINTTOPOINT` 1926,18 → hold 1926,18 × 1,01).

### 722713 — inmediato desde **App PAX** · comportamiento (B) completo

| Hora | Capa | Evento |
|---|---|---|
| 14:35:35 | Oracle | `TRAVEL` 722713 · **`ISPROGRAMMED=0`** · CFG 581 |
| 14:35:39 | Oracle | `CARD_HOLDS` 95 · $1,50 · `INTENT_ID='81728953569'` |
| 14:42:59 | MGW | `MGW_TRANSACTIONS` 1149 · TRIP **$1,50** · `CONFIRM` · `PaymentDTO(intentId=81728953569, gatewayTransactionId=81728953569)` → **`priorAuthCapture` correcto** |
| 14:43:01 | MGW | `MGW_TRANSACTIONS` 1150 · TRIP **$0,50** · `APPROVED` · `intentId=null, gatewayTransactionId=81728970044` → transacción **nueva independiente** |
| 14:43:03 | Oracle | Viaje cerrado · `STATE=6` · `FINISH_DATE` · `CARD_HOLDS` 95 → **`CAPTURE`** |

**Conciliación de montos** — las dos transacciones **no son doble cargo**:

```
precio simulado      1.49   -> hold colocado           1.50   (x1.01)
precio FINAL real    2.00   (FINALPRICEI 739307: FINALPRICE=2, FINAL_COST_PRICE=2, TRIP_AMOUNT_MAGIIS=0.91)
cobro 1 (captura)    1.50   sobre el hold, intentId = 81728953569
cobro 2 (venta)      0.50   intentId = null, txn 81728970044
                     ----
total cobrado        2.00   == precio final
```

El margen del hold quedó verificado con **tres mediciones**: 37,21→37,58 · 1926,18→1945,44 · 1,49→1,50.
Siempre **× 1,01**.

---

## 5. Hallazgos

### H1 — DESCARTADO COMO DEFECTO · fue una misconfiguración del entorno de prueba

**Clasificación final: no reportable como Bug ni Defect** (decisión del QA lead, 2026-08-03).

La cuenta Authorize estaba en **Test Mode** cuando debía estar en **Live**. En Test Mode, Authorize
aprueba la operación pero devuelve `transId = 0` sin crear transacción real. De ahí salieron, en cadena,
el `CARD_HOLDS.INTENT_ID='0'` del viaje 722710 y el posterior `E00027` al intentar liberar contra ese
intent inexistente. **La causa raíz está en la preparación del banco de pruebas, no en el producto**, y
se corrigió durante la misma sesión.

Evidencia que respalda la clasificación: una vez corregido el modo, **3 de 3 operaciones se comportaron
correctamente** — los viajes 722711 y 722712 liberaron su hold de forma limpia con intents reales, y el
722713 capturó por `priorAuthCapture`. No existe ni un caso de mal manejo bajo configuración correcta.

**Observación de robustez que queda abierta (no bloqueante, no reportada)**: los logs muestran que ante
`response {result:error, status:AUTHORIZE_ERROR}` MAGIIS igualmente escribió `STATUS='RELEASE'` y limpió
`TRAVEL.HOLD_INTENT`. Con `intentId='0'` eso es inocuo — no había nada retenido que liberar. Lo que no se
puede determinar desde afuera es si el código razonó sobre el `'0'` o si ignora el resultado del PSP en
todos los casos. La distinción sólo importaría con un hold real y un void que falle por caída del PSP,
timeout o red.

**Test discriminador, si alguien quiere cerrar la pregunta**: cancelar un viaje cuyo hold tenga un intent
**real** previamente anulado a mano desde el Merchant Interface. El release fallará en el PSP con un
intent válido. Si MAGIIS aun así marca `RELEASE`, el manejo de error es genérico y ahí sí habría defecto;
si propaga el error, la lógica es correcta y la pregunta queda cerrada a favor del producto.

### H2 — El excedente sobre el hold se cobra sin fondos garantizados

**Severidad propuesta: media.** En el viaje 722713 la estimación subestimó el precio final un **34%**
($1,49 estimado contra $2,00 real) y la diferencia se cobró **fuera del hold**, con `intentId=null`. Todo
el propósito de la pre-autorización es garantizar el dinero; si esa segunda transacción fuera rechazada
por límite o fondos insuficientes, el viaje quedaría cerrado con el cobro incompleto. Evaluar si el
margen del 1% alcanza o si el hold debe contemplar el mínimo tarifario.

### H3 — Credenciales de pasarela en texto plano

**Severidad propuesta: alta (seguridad).** La tabla `MERCADOPAGO_APP` almacena `ACCESS_TOKEN`,
`SECRET_KEY` y `PUBLIC_KEY` **sin cifrar** para las cuatro pasarelas (app 1 MercadoPago, 2 Stripe,
21 Authorize, 41 eBiz), legibles por el usuario de aplicación de la base. Uno de los tokens tiene forma
de credencial productiva de MercadoPago. Detectado de rebote al consultar qué proveedor era cada `APP_ID`.

### H4 — Wallets sobreviven a la desvinculación de la pasarela

**Severidad propuesta: media.** El último link de Stripe en el carrier 1481 se dio de baja el
**2026-01-13** y siete meses después el carrier conserva **4 wallets con `APP=2`** y **2 tarjetas con
token `pm_...`**. Contradice TC-PAY-CFG-13 / MG-166 (la desvinculación invoca `cleaningWallets` y elimina
wallets y tarjetas) y es el terreno de **MG-24**. Detalle completo en
[`SNAPSHOT-pre-rotacion-carrier-1481.md`](../../../evidence/uat/authorize/SNAPSHOT-pre-rotacion-carrier-1481.md).

### O1 — Observaciones menores

- **AVS permisivo**: la autorización aprobada devolvió `Street Address: No Match, Zip: Matched first 5
  digits (Z)`. El filtro aceptó una dirección que no coincide — revisar Fraud Settings antes de producción.
- **Wallet huérfana**: `USER_WALLET` 78732 (user 146550) creada 13:32 con cero tarjetas.
- **Primer hold Authorize de la historia de UAT**: antes de esta ronda, `CARD_HOLDS` no tenía ni una fila
  con `PROVIDER_CODE='AUTHORIZE'`.

---

## 6. Fuera de alcance de esta ronda

| Caso | Motivo |
|---|---|
| MG-528 / MG-531 — refunds sobre transacción settled | Requieren que pase el batch de liquidación. Ventana: el día siguiente, **con Authorize aún vinculado** |
| Cancelación iniciada por el propio pasajero desde App PAX | Las tres cancelaciones se ejecutaron desde el portal Carrier (usuario 39140) |
| MG-351 — monto final **menor** al hold | No se dio el escenario |
| MG-519/520/521/523/530, MG-355 — declines y CVV/ZIP inválidos | No se pueden forzar de manera controlada con tarjeta real; quedan cubiertos en `test` con sandbox |
| MG-162 — idempotencia de reintento de cobro | No ejercitado |

---

## 7. Verificación reproducible

Consultas read-only usadas (`oracledb` thin, credenciales de `magiis-playwright/.env.uat`):

```sql
-- hold de un viaje
SELECT ID, TRAVEL_ID, PROVIDER_CODE, INTENT_ID, AMOUNT_HOLD, STATUS,
       TO_CHAR(CREATION_DATE,'YYYY-MM-DD HH24:MI:SS') CREADO_UTC
  FROM CARD_HOLDS WHERE TRAVEL_ID = :travelId;

-- viaje: estado, portal de origen y cancelación
SELECT ID, STATE, ISPROGRAMMED, PAYMENTMETHOD, HOLD_INTENT, CANCELEDBY,
       REASONFORCANCELLATION, CARRIER_PAYMENT_METHOD_CONFIG_ID
  FROM TRAVEL WHERE ID = :travelId;

-- cobro y respuesta cruda del PSP (CLOB: usar SUBSTR o fetchAsString)
SELECT ID, TRANSACTION_TYPE, AMOUNT, STATUS, SUBSTR(REQUEST_RESPONSE,1,900)
  FROM MGW_TRANSACTIONS WHERE TRANSACTION_REF = :travelId;

-- barrido de cierre
SELECT ID, TRAVEL_ID, PROVIDER_CODE, AMOUNT_HOLD, STATUS
  FROM CARD_HOLDS WHERE STATUS = 'HOLD';
```

**Nota sobre la capa PSP**: las credenciales `AUTHORIZE_*` de `.env` son de **sandbox** — autentican
contra `apitest.authorize.net` y producción responde `E00007`. La cuenta productiva sólo se pudo acreditar
por el Merchant Interface. Las credenciales del comercio viven por carrier en `MGW_LINKED.API_KEY`.

**Los logs del microservicio gateway están en PostgreSQL** (schema `MGW_UAT`, tabla `logs`): columnas
`carrier, id, type (request|response|error|authorize), endpoint (/payment/hold, /payment/release, /card,
/payment), data`. Dan la respuesta cruda del PSP sin depender del dashboard — cablearlos vía DBHub
(soporta postgres) es la mejora pendiente para las próximas pasarelas.
