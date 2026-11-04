# Brief para desarrollo · MercadoPago rechaza por `cc_rejected_high_risk`

> **Fecha**: 2026-08-03 · **Entorno**: UAT · **Carrier**: 1040 · **Cuenta MercadoPago**: PRODUCTIVA (`live_mode:true`)
> **Autor**: QA · **Origen**: smoke UAT con tarjetas reales del release de pasarelas de pago (ATP MG-178)
> Toda cifra de este documento está leída en vivo de Oracle UAT o de los logs de AWS CloudWatch
> (`UAT-Logs / UAT-Payments`, clase `com.m.m.s.e.impl.EpaymentServiceImpl`).

---

## 1. Resumen ejecutivo

Un viaje programado con tarjeta real en el carrier 1040 quedó **No Autorizado** porque MercadoPago rechazó
la pre-autorización con `status_detail = cc_rejected_high_risk`. La llamada de MAGIIS sale bien formada y
manda identidad del pagador (email, nombre, payer id), así que **no es un fallo de integración evidente**.

Investigando la base apareció algo más importante que el rechazo puntual: **MAGIIS dejó de persistir el
documento del titular de la tarjeta**. En los registros históricos el documento está en el 100% de los
casos; en los más recientes falta en el 82%. Y la **misma tarjeta física** fue APROBADA hace once días
llevando el documento, y RECHAZADA hoy sin él.

Hay entonces dos cosas: una **regresión de captura de datos** que está probada, y una **relación causal
con el rechazo** que es plausible pero todavía no está probada. El experimento para separarlas cuesta un
viaje.

---

## 2. La evidencia que discrimina

Misma tarjeta física — Visa terminada en **3522**, BIN **493715**, mismo titular — en el mismo carrier:

| | APROBADO | RECHAZADO |
|---|---|---|
| Viaje | 722629 | 722714 |
| Fecha | 2026-07-23 19:54:52 UTC | 2026-08-03 18:41:22 UTC |
| `CARD_DETAIL` | **6501** | **6525** |
| `CARDHOLDER_ID_TYPE` | **`DNI`** | **`null`** |
| `CARDHOLDER_ID_NUMBER` | **`23124141`** | **`null`** |
| `CARDHOLDER_NAME` | `maximiliano minetti` | `maximialinao minetti` |
| Resultado en MP | `APPROVED` | `rejected` · `cc_rejected_high_risk` |

### La regresión, en números

Proporción de filas de `CARD_DETAIL` **sin** documento del titular, por rango de id:

```
id < 3000        2093 filas        0 sin documento     (  0 %)
id 3000-5999     1017 filas      139 sin documento     ( 14 %)
id >= 6000         55 filas       45 sin documento     ( 82 %)
```

El dato se perdía ocasionalmente y ahora se pierde casi siempre. **Es una regresión reciente y en
aceleración**, no un caso aislado.

### Pista sobre el origen: dos caminos de alta distintos

Mirando las últimas 8 filas de `CARD_DETAIL` de esa misma tarjeta, la presencia del documento correlaciona
con la forma en que se escribió el nombre:

| `CARD_DETAIL` | Documento | Nombre |
|---|---|---|
| 6525 (hoy) | — | `maximialinao minetti` |
| 6501 | `DNI 23124141` | `maximiliano minetti` |
| 6481 | — | `MAXIMILIANO MINETTI` |
| 6461 | `DNI 23124141` | `maximiliano minetti` |
| 6441 | `DNI 23124141` | `maximiliano minetti` |
| 6385 · 6384 · 6383 | — | `MAXIMILIANO MINETTI` |

Cuando el nombre viene en minúsculas, el documento está. Cuando viene en MAYÚSCULAS, falta. Eso sugiere
**dos formularios o dos flujos de alta distintos**: uno captura el documento y el otro no.

---

## 3. Lo que está probado y lo que es suposición

### Probado

- MercadoPago rechazó con `cc_rejected_high_risk`. Payment id `171881559716`, `captured:false`,
  `live_mode:true`, ARS 700, `external_reference:722714`. No se movió dinero (`net_received_amount:0`).
- **MAGIIS SÍ manda la identidad del pagador.** Log literal: `EMAIL: maximiliano.minetti@magiis.com`,
  `PAYER_ID: 2653034074-WEzn8IqoScpfnt`, `PAYER_TYPE: customer`, `WALLET_FIRST_NAME: Maximiliano`,
  `WALLET_LAST_NAME: Minetti`, `APPLICATION_FEE: 35.00`, `INSTALLMENTS: 1`.
- El documento del titular **falta** en el `CARD_DETAIL` de hoy y **estaba** en el del pago aprobado.
- La regresión de captura del documento es real y está cuantificada (tabla de arriba).
- **Los holds de MercadoPago FUNCIONAN en esta cuenta.** `CARD_HOLDS` tiene 3 holds de MP en estado
  `CAPTURE`: id 20 (ARS 1327,20 · 2024-11-07), id 80 (ARS 990 · 2025-11-13) e id 91 (ARS 500 ·
  2026-03-20). La pre-autorización no está sistemáticamente rechazada.
- El rechazo **no se persiste en ninguna tabla de Oracle**. `MERCADOPAGO_TRANSACTIONS` tiene 3 filas y
  todas son `APPROVED`. Sólo queda rastro en CloudWatch.

### Suposición, no probado

- Que la falta del documento **causó** el rechazo. Es plausible y la correlación es fuerte, pero entre el
  pago aprobado y el rechazado cambiaron **dos** variables: el documento y el flujo/monto (el aprobado fue
  un **cobro directo de ARS 100**; el rechazado, un **hold de ARS 700**). No se puede atribuir causalidad
  con una sola observación.
- Que el `sessionId` que aparece en el log (`getCardHold - Ejecuto el hold con sessionId`) sea o no el
  device fingerprint de MercadoPago. El `tracking_id` de la respuesta dice **`security:none`**, lo que
  sugiere que no se envía módulo de seguridad — pero no se pudo confirmar en el código.

### Refutado

- **"El payload no manda identidad del pagador"** — hipótesis inicial, **descartada**. Los `null` que se
  veían estaban en la RESPUESTA de MercadoPago, que no eco de vuelta el objeto `payer` enviado.
- **"MercadoPago no soporta hold / los holds nunca funcionaron"** — **descartado** por los 3 holds
  capturados. Esto además pone en duda la premisa del test **MG-160 / TC-PAY-E-03**, que afirma que el
  alta debe caer al flujo `verificationFoundsCard` porque MercadoPago no soporta hold. En esta cuenta sí
  lo soporta y el flujo que corre es `verificationCardWithHold`. **MG-160 necesita revisión.**

---

## 4. El experimento que hay que correr primero

**Repetir exactamente el mismo escenario — misma tarjeta, mismo carrier, viaje programado, hold de
ARS 700 — pero con el documento del titular completo.**

| Resultado | Conclusión | Acción |
|---|---|---|
| Aprueba | El documento es causal. La regresión de captura es un **defecto bloqueante** para MercadoPago | Fix de captura + envío de `payer.identification` |
| Rechaza igual | El documento no alcanza. La causa está en otra parte: monto, flujo de hold, tarjeta extranjera o device fingerprint | Seguir por device_id (`security:none`) y por el BIN |

Es un solo viaje y parte el árbol de hipótesis al medio. Cualquier otro experimento cuesta más y
discrimina menos.

**Segundo experimento, si el primero no alcanza**: repetir con un **cobro directo de monto bajo** en lugar
de un hold, para aislar la variable flujo/monto que quedó mezclada en la comparación.

---

## 5. Preguntas concretas para desarrollo

1. ¿Cuántos formularios de alta de tarjeta existen para MercadoPago, y **cuáles piden el documento del
   titular**? La correlación con el casing del nombre sugiere dos caminos distintos.
2. ¿Se quitó, se volvió opcional o se dejó de mapear el campo de documento en algún cambio reciente? El
   quiebre está alrededor del `CARD_DETAIL` id 6000.
3. ¿`payer.identification` se envía a MercadoPago cuando el dato existe? ¿O se persiste en
   `CARD_DETAIL` pero nunca se manda en el payload?
4. El `sessionId` que loguea `getCardHold`: ¿es el **device fingerprint de MercadoPago**
   (`MP_DEVICE_SESSION_ID`) o es un identificador interno? El `tracking_id` de MP dice `security:none`.
5. ¿El frontend del portal Carrier carga el script de seguridad de MercadoPago para generar ese
   fingerprint?
6. ¿Por qué un pago **rechazado** no genera fila en `MERCADOPAGO_TRANSACTIONS`? Hoy sólo se persisten los
   aprobados, y eso deja a soporte sin forma de explicar un "No Autorizado" desde la base.

---

## 6. Riesgo de regresión del fix

Si se vuelve a exigir el documento del titular en el alta de tarjeta:

- **Puede bloquear altas que hoy funcionan** en pasarelas que no lo necesitan. Authorize y Stripe no lo
  requieren: la tarjeta de Authorize se dio de alta hoy sin documento y funcionó, y Stripe ni siquiera
  recibe el PAN. El campo debería ser condicional por pasarela, no global.
- **Hay que retestear** el alta de tarjeta desde los dos portales (Carrier y App PAX) en las tres
  pasarelas, más el alta de viaje con tarjeta preautorizada en cada una.
- Si además se agrega `payer.identification` al payload de MercadoPago, retestear el cobro directo y el
  hold, porque ambos comparten la construcción del `payer`.

---

## 7. Trazabilidad

- Viaje rechazado: **722714** · payment MP `171881559716` · `CARD_DETAIL` 6525 · `CARD` 4648
- Viaje aprobado de referencia: **722629** · `CARD_DETAIL` 6501
- Holds de MP capturados históricamente: `CARD_HOLDS` 20, 80, 91
- ATP del release: [MG-178](https://magiis.atlassian.net/browse/MG-178)
- Test cuya premisa queda en duda: [MG-160](https://magiis.atlassian.net/browse/MG-160) (TC-PAY-E-03)
- Logs: AWS CloudWatch `UAT-Logs / UAT-Payments`, región us-east-2, cuenta 4897-2587-9881
