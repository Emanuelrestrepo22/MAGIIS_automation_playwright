# GO / NO-GO · Smoke UAT con tarjetas reales — Release Pasarelas de Pago (MG-178)

> Estado al **2026-08-04**. Entorno UAT, cuentas de PSP **productivas**, tarjetas **reales**.
> ATR Authorize: [MG-645](https://magiis.atlassian.net/browse/MG-645) · ATR Stripe: [MG-656](https://magiis.atlassian.net/browse/MG-656)
> Documento de decisión. La firma del GO es del coordinador del pasaje, no de QA.
>
> ⚠ **VEREDICTO SUPERADO** — el equipo tomó **GO a producción** el **2026-08-05**. Este documento conserva
> el análisis del 04-08 como registro histórico; el estado final de cada condicionante y los riesgos
> aceptados están en la **sección 8 · Addendum de cierre**, al final.

---

## 1. Veredicto

# NO-GO CONDICIONAL

No es un NO-GO por calidad de lo probado: **lo que se probó salió bien y está acreditado con evidencia en
tres capas**. Es un NO-GO por **cobertura incompleta en puntos que el propio plan de pasaje declara
obligatorios**, más una regresión activa detectada hoy en UAT.

El veredicto se convierte en GO cuando se cierren los cuatro condicionantes de la sección 3.

---

## 2. Qué está acreditado

### Authorize.net — carrier 1481 · 9 de 10 casos en PASSED

| Test | tcid | Qué acredita |
|---|---|---|
| MG-220 | TC-PAY-CFG-10 | Vinculación con credenciales válidas, estado consistente en UI y DB |
| MG-285 | TC-PAY-WAL-02 | Alta de tarjeta real desde portal Carrier |
| MG-286 | TC-PAY-WAL-03 | Alta de tarjeta real desde App PAX |
| MG-349 | TC-PAY-COB-04 | Hold = precio estimado × 1,01 (margen 1%, cuatro mediciones) |
| MG-347 | TC-PAY-COB-02 | Viaje desde App PAX culminado por App Driver |
| MG-524 | TC-PAY-COB-25 | Cobro por `priorAuthCapture` sobre el hold |
| MG-352 | TC-PAY-COB-07 | Monto final mayor al hold: cobra la diferencia |
| MG-356 | TC-PAY-COB-11 | Cancelar con hold libera la autorización |
| MG-627 | TC-PAY-E-04 | **Reintegro al cancelar viaje programado** — dos portales |
| MG-350 | TC-PAY-COB-05 | EXECUTING — falta la captura del Merchant Interface |

### Stripe — carrier 1481 · 7 de 14 casos en PASSED

| Test | tcid | Qué acredita |
|---|---|---|
| MG-212 | TC-PAY-CFG-02 | Vinculación en modo LIVE + exclusividad + `cleaningWallets` limpia al desvincular |
| MG-247 | TC-PAY-TRIP-21 | Colaborador: hold, despacho y captura |
| MG-253 | TC-PAY-TRIP-27 | Hold ON sin modal 3DS, viaje activo |
| MG-239 | TC-PAY-TRIP-13 | App PAX modo Business: aislamiento por perfil + hold + captura |
| MG-278 | TC-PAY-TRIP-52 | Portal Contractor: baja y alta de tarjeta, viaje sin hold, venta directa |
| MG-351 | TC-PAY-COB-06 | **Monto final menor al hold**: captura parcial y devolución automática del remanente — dos mediciones |
| MG-352 | TC-PAY-COB-07 | Monto final mayor al hold: cobra la diferencia |

### Comportamientos transversales validados

- **Margen del hold = 1%**, medido en cuatro viajes: 37,21→37,58 · 5,00→5,05 · 1.926,18→1.945,44 · 1,49→1,50.
- **`priorAuthCapture`** correcto: el `gatewayTransactionId` del cobro es idéntico al intent del hold.
- **Captura parcial** cuando el final queda por debajo del hold, con devolución automática del remanente
  (confirmado en el Dashboard de Stripe: *"captured, and released the remaining to the customer"*).
- **Venta directa** cuando no hay hold: el PSP crea un intent nuevo al cobrar. Discriminador técnico:
  `gatewayClientSecret` poblado y `intentId` distinto del hold.
- **Aislamiento por perfil**: Personal y Business usan usuarios y wallets distintos, con un PaymentMethod
  propio por perfil en el PSP.
- **Trazabilidad del portal de origen**: `TRAVEL.CARRIER_PAYMENT_METHOD_CONFIG_ID` + `CHANNEL`
  (480/`WC` contractor · 580/`W` carrier · 581/`MA` app pax).

### Verificación de la propia evidencia

Las 15 afirmaciones que sostienen los veredictos de Authorize se sometieron a **dos revisores
independientes con instrucción de refutarlas**, consultando la base por separado: **0 refutadas**,
confirmadas al decimal y al segundo. Cada run de los dos ATR tiene adjunta la evidencia de base con las
consultas incluidas, reproducibles.

---

## 3. Condicionantes del GO

### C1 — MercadoPago no tiene una sola prueba verde  🔴 BLOQUEANTE SI ESTÁ EN EL RELEASE

MercadoPago **rechaza la pre-autorización** en la cuenta productiva con `cc_rejected_high_risk`. Cero
casos acreditados, sin ATR creado. No es defecto de MAGIIS —la llamada sale bien formada y el proveedor
responde rechazo en 2 segundos— pero **la pasarela no está validada**.

**Cierre**: o se destraba el rechazo (otra tarjeta, revisar el payload, soporte de MP) y se acredita al
menos el happy path, o **se declara MercadoPago fuera del alcance de este release** por decisión del
coordinador, con el riesgo asumido por escrito.

### C2 — Regresión activa en el listado de viajes del portal Contractor  🔴 BLOQUEANTE

El endpoint `genericReport/028/paginated` devuelve **500** desde el portal Contractor tras aplicar el fix
SQL de zona horaria. El listado muestra `Total: 0`. Detectado hoy en UAT.

Causas candidatas, por probabilidad: el alias `TZ` no existe en el `FROM` de ese reporte
(`ORA-00904`) · el formato de fecha llega ISO y el bind espera `DD/MM/YYYY` (`ORA-01861`) ·
`TZ.NAME` no es una región IANA válida (`ORA-01882`) · pérdida de índice por envolver la columna en
funciones, con riesgo de timeout en volumen productivo.

**Cierre**: obtener el código `ORA-` del log del backend, corregir, y re-verificar el listado desde
Contractor. Recomendación de implementación: convertir los límites del día a UTC en la aplicación y
comparar la columna cruda, para no perder el índice ni depender de `TZ.NAME`.

### C3 — El reintegro al cancelar no está validado en Stripe  🟠 BLOQUEANTE POR PLAN

Es el comportamiento que motivó el smoke y está acreditado en Authorize, **no en Stripe**. Además el plan
de pasaje lo exige: su caso 5 de la sección 6 es "pago con monto mínimo real **y su anulación/refund**",
y los casos 1 a 5 en rojo disparan evaluación de rollback inmediata.

**Cierre**: un viaje programado del mismo día con hold, cancelarlo, y verificar el `pi_` en `canceled` en
Stripe más el `CARD_HOLDS` en `RELEASE`. Diez minutos. Sumar el refund de una transacción capturada —hay
tres disponibles— para cubrir el caso 5 completo.

### C4 — Hay una pre-autorización real sin liberar  🟠 BLOQUEANTE OPERATIVO

`CARD_HOLDS` 96: **USD 1,50 retenidos desde el 2026-08-03 18:32 local**, del viaje 722715. Ese viaje
cerró en `STATE=8` —programado vencido, sin `CANCELEDBY` y sin `CHARGED`— y **su hold nunca se liberó**.
Expira el 2026-08-05 18:32.

**Cierre**: liberar el intent `pi_3U0TT4IVMuJxYnLP2EGqvJ8n` desde el Dashboard y decidir si el camino
"programado que expira sin liberar" se reporta como defecto. Es el hallazgo de mayor impacto del smoke:
en producción, todo viaje programado que no consiga conductor dejaría fondos retenidos del pasajero.

---

## 4. Hallazgos abiertos (no bloqueantes por sí solos)

| Hallazgo | Severidad propuesta | Estado |
|---|---|---|
| Viaje programado que expira sin liberar el hold | Alta | Ver C4 |
| Rechazos de pago no persisten en base (sólo en CloudWatch) | Media | Abierto — sin trazabilidad del motivo para soporte |
| Credenciales de pasarela en texto plano en `MERCADOPAGO_APP` | Alta (seguridad) | Abierto — requiere confirmación de backend |
| Excedente sobre el hold rechazado por debajo del mínimo del PSP (USD 0,50) | Media | Clasificado **correcto** por el QA lead; queda como dato para desarrollo |
| Hold ausente en el viaje 722734 sin causa determinada | Media | Abierto — falta confirmar portal de origen |
| Discrepancia MG-160: MP usa `verificationCardWithHold` cuando el ATP dice `verificationFoundsCard` | A resolver | Abierto — o el test está desactualizado o el ruteo es incorrecto |
| Wallets Stripe huérfanas del unlink de enero | Baja | Deuda heredada, terreno de MG-24 |

### Descartado tras investigación

El primer hold de la campaña quedó con `INTENT_ID='0'`. **No era defecto de producto**: la cuenta
Authorize estaba en Test Mode, y en ese modo Authorize aprueba pero devuelve `transId = 0`.
Misconfiguración del entorno de prueba, corregida en sesión. Tras el arreglo, 3 de 3 operaciones
correctas.

---

## 5. Cobertura contra el plan de pasaje a producción (sección 6)

| # | Caso del plan | Cobertura de este smoke |
|---|---|---|
| 1 | Login carrier, admin y pasajero | implícito, **sin registrar** |
| 2 | Cotización pública y carrier | **sin cubrir** |
| 3 | Alta de viaje y transición de estados | ✅ el más cubierto |
| 4 | Alta de tarjeta y pago, incluye 3DS si sube el epic Stripe | ✅ · **3DS sólo frictionless** |
| 5 | Pago con monto mínimo real y su anulación/refund | pago ✅ · **anulación/refund sin ejecutar en Stripe** |
| 6 | Liquidaciones | **sin cubrir** — y hoy el listado de Contractor está roto (C2) |
| 7 | Cuenta corriente | **sin cubrir** |
| 8 | Integraciones GNet / Melita | **sin cubrir** |
| 9 | Notificaciones | **sin cubrir** |
| 10 | Reportes | **sin cubrir** |

### Dos requisitos del plan que hoy no están satisfechos

1. **T-24h exige el smoke sobre los tags exactos que van a producción.** No está confirmado que UAT esté
   corriendo esos tags. Sin esa confirmación, esta evidencia no satisface el requisito formal del plan.
2. **El caso 4 exige 3DS si el epic Stripe entra.** Sólo se obtuvo autenticación **frictionless**: el 3DS
   se aplicó y tuvo éxito, pero nunca se presentó challenge. Los casos que exigen modal visible
   (MG-257, MG-258, MG-259, MG-261) no son ejecutables con la tarjeta real disponible.

### Insumo del smoke para el plan

El caso 5 del plan dice "monto mínimo real" sin fijar importe. **Con Stripe, cualquier cobro por debajo
de USD 0,50 se rechaza.** Si el smoke de producción se diseña con importes de centavos va a fallar por el
mínimo del PSP y no por un defecto. Conviene que el caso 5 especifique un importe explícito por encima de
ese umbral.

---

## 6. Limitación estructural que conviene tener presente

**Los hallazgos de este smoke son de un tipo que el checklist de producción no puede detectar.** El hold
huérfano tardó quince horas en manifestarse. El excedente no cobrado fueron 26 centavos que ninguna
pantalla muestra. Un recorrido de diez casos en la ventana de despliegue verifica que el deploy no rompió
lo evidente; no encuentra fugas silenciosas de dinero.

Por eso el GO se sostiene en esta campaña, y la sección 6 del plan es la verificación de que el pasaje
no rompió lo ya validado.

---

## 7. Camino más corto al GO

| Orden | Acción | Cierra | Esfuerzo |
|---|---|---|---|
| 1 | Liberar el hold 96 desde el Dashboard | C4 (parte operativa) | 2 min |
| 2 | Viaje programado del día + cancelación en Stripe | C3 (MG-627) | 15 min |
| 3 | Refund de una transacción capturada | C3 (caso 5 del plan) | 5 min |
| 4 | Código `ORA-` del log + corrección del reporte 028 | C2 | depende de desarrollo |
| 5 | Decisión de alcance sobre MercadoPago | C1 | decisión del coordinador |
| 6 | Captura del Merchant Interface de `81728953569` | MG-350 → PASSED | 2 min |
| 7 | Confirmar el tag de UAT contra el que va a producción | requisito T-24h del plan | consulta |

Los puntos 1, 2, 3 y 6 son ejecutables hoy y cierran los dos condicionantes que dependen de QA. Los
puntos 4 y 5 requieren decisión o trabajo de otros roles.

---

*Documento de QA. La decisión de GO/NO-GO es del coordinador del pasaje. Detalle de cada caso en los
comentarios de MG-645 y MG-656, con evidencia de base adjunta a cada run.*

---

## 8. Addendum de cierre · 2026-08-05 — GO tomado por el equipo

> Estado al **2026-08-05 12:30 local**. El equipo decidió **pasar a producción**. La evaluación de QA del
> 04-08 era NO-GO condicional y se conserva íntegra arriba. **Cambia la decisión, no cambian los hechos**:
> lo que sigue es el estado verificado de cada condicionante y la lista de riesgos que el pasaje asume.

### 8.1 Estado final de los cuatro condicionantes

| # | Condicionante | Estado final | Cómo cerró |
|---|---|---|---|
| **C1** | MercadoPago sin una sola prueba verde | 🟡 **cerrado por decisión de alcance** | El coordinador declara MercadoPago fuera del alcance de validación de este release. Se suma la mitigación de desarrollo: el estudio determina que **no se toca código de MercadoPago**, de modo que su comportamiento no cambia por las integraciones de las otras pasarelas. QA confirma el núcleo del argumento: el rechazo fue `cc_rejected_high_risk` —scoring del proveedor— sobre una llamada bien formada. **Matiz que queda asentado**: la premisa no cubre la superficie compartida que sí cambió y que MercadoPago no volvió a ejercitar — `cleaningWallets` borra wallets **de MercadoPago**, `MERCADOPAGO_TRANSACTIONS` es genérica cross-gateway, y `CARD_HOLDS` + la lógica hold/capture son comunes a las cuatro pasarelas |
| **C2** | 500 en `genericReport/028/paginated` del portal Contractor | ✅ **CERRADO Y VERIFICADO hoy** | Medido en UAT el 05-08: `POST 028/paginated` → **200 OK** y `POST 028T/totals` → **200 OK**. El listado "Corrientes y sin liquidar" renderiza completo, con grilla y totales, **sin** el `TypeError: Cannot read properties of undefined (reading 'CSS')`, y **sin requerir query correctiva en base** — punto explícito del Definition of Done de MG-43. Ver 8.3 para el alcance |
| **C3** | Reintegro al cancelar en Stripe | ✅ cerrado el 04-08 17:50 | Viaje 722735: hold liberado en **6 segundos**, `pi_3U0pEp…` en `Canceled` con Refunded −1,56 y Net 0,00 |
| **C4** | Pre-autorización real sin liberar | 🔴 **ABIERTO y agravado** | Ver 8.2 |

### 8.2 C4 escaló: de fondos retenidos a fondos sin vía de producto

Medición del 05-08 11:10 local. El hallazgo pasó de "el hold no se libera" a algo peor:

- `CARD_HOLDS` **96** sigue en `STATUS='HOLD'` por **USD 1,50** (`pi_3U0TT4IVMuJxYnLP2EGqvJ8n`, pax 141856).
  **Expira hoy 18:32 local.**
- **El viaje 722715 ya no está en la tabla `TRAVEL`.** Un job de historificación lo archivó en
  `TRAVEL_HISTORY` hoy a las **09:00 local** (`HISTORIC_EMISSION_DATE`), con `STATE=8` y `CHARGED=null`.
  Las vistas operativas del portal leen `TRAVEL`: **ya no queda ninguna acción de producto para liberar
  ese dinero.** Sólo el Dashboard del PSP.
- **No es un caso aislado.** Tres precedentes con el mismo patrón en la misma base: holds **23** y **26**
  (Stripe, USD 4,99 cada uno, nov-2024) y **75** (MercadoPago, 140, may-2025). Los tres siguen en
  `STATUS='HOLD'` con `EXPIRED_DATE` vencido hace meses o años, y los tres pertenecen a viajes ausentes
  de `TRAVEL`.
- **Hallazgo estructural derivado**: `CARD_HOLDS.STATUS` **nunca se reconcilia** con la expiración real
  del PSP. El estado del hold en MAGIIS miente indefinidamente y no sirve como fuente de verdad para
  soporte ni para conciliación financiera.
- **Segundo hold vivo abierto hoy**: `CARD_HOLDS` **101**, USD **0,77** (`pi_3U162OIVMuJxYnLP0mlM6Pyd`),
  del viaje **722752** — alta programada desde el portal Contractor para las 23:47 de hoy. Si no consigue
  conductor, recorre el mismo camino del 722715. Expira el **07-08 11:43 local**.

Consulta de auditoría reutilizable:

```sql
SELECT h.ID, h.TRAVEL_ID, h.PROVIDER_CODE, h.AMOUNT_HOLD, h.STATUS
  FROM CARD_HOLDS h
 WHERE NOT EXISTS (SELECT 1 FROM TRAVEL t WHERE t.ID = h.TRAVEL_ID);
```

### 8.3 Cómo se acreditó C2, y con qué alcance

El ticket MG-43 no tenía ningún Test asociado: no existía entidad sobre la que registrar la verificación.
Quedó creada la cobertura y enlazada al ticket:

| Entidad | Key | Detalle |
|---|---|---|
| Test manual, 9 pasos | **MG-668** | `LISTO PARA RELEASE`, parent MG-135 (QA Test Repository). Cubre render (AC 1-3), paginación (AC4), ordenamiento por Estado sobre nulos (AC5), el gap latente de los ~7 componentes que duplican el mapa de estados (AC7) y el DoD de funcionar sin saneo manual |
| Precondición | **MG-669** | Existe al menos un viaje en NO AUTH (`STATE=10`) o NO PAY (`STATE=11`), sin liquidar, del contractor logueado |
| Test Execution | **MG-670** | Entorno `uat`, run en **PASSED** con pasos 1-6 marcados y 5 evidencias adjuntas |

**Alcance declarado, para que la trazabilidad no diga más de lo ejecutado.** El conjunto de datos de la
corrida **no contenía viajes en NO AUTH ni NO PAY** — la única fila devuelta estaba en `SCHEDULED` (viaje
722752). Como la causa raíz de MG-43 es `getCssReferenceByState()` leyendo `TRAVEL_STATES_MAP[state].CSS`
con un estado ausente del mapa, este PASSED acredita que el reporte responde y que el listado no se rompe
en el camino verificado, **no** el comportamiento observado con esos estados. Los pasos 7 (paginación),
8 (ordenamiento) y 9 (gap latente) quedaron sin ejecutar. El PASSED es decisión del líder de QA sobre esa
evidencia, y así está registrado en el run.

**Camino para cerrar el círculo sin crear datos ni retener fondos**: en UAT existe el viaje **718975** en
`STATE=10` (No Autorizado, 12-01-2026, sin liquidar) del canal contractor, pero pertenece al área "Main"
(`CONTRACTORAREA` 1137) del `CONTRACTORACCOUNT_ID` **1604**, mientras el usuario disponible opera el área
"Finance" del **1241** — le resulta invisible. Con un login del 1604 y el filtro Periodo en "Último año",
la precondición queda satisfecha y MG-668 se reejecuta como regresión.

### 8.4 Riesgos que el pasaje asume

Publicados en el ATP MG-178 (comentario 34716) y complementados en el 34721:

1. **MercadoPago entra a producción sin validación funcional en UAT** — con la mitigación y el matiz de 8.1.
2. **Viaje programado que expira sin liberar su hold**, y una vez archivado **sin vía de producto** para
   liberarlo — ver 8.2, con tres precedentes y dos instancias vivas.
3. **`CARD_HOLDS.STATUS` nunca se reconcilia** con el PSP: el estado del hold no es fuente de verdad.
4. **Excedente sobre el hold puede quedar sin cobrar** cuando cae bajo el mínimo de USD 0,50 del PSP.
5. **Credenciales de pasarela en texto plano** en `MERCADOPAGO_APP`.
6. **Rechazos de pago no persisten en base** — sólo reconstruibles desde CloudWatch, sin trazabilidad
   para soporte.
7. **3DS validado sólo en flujo frictionless** — el challenge visible nunca se ejercitó.
8. **Suite de recuperación 3DS neutralizada** por el bug de framework en `RecoverySteps.ts:75`.
9. **Deuda de verificación**: MG-3, MG-13, MG-11, MG-22 sin evidencia suficiente; MG-604, MG-625, MG-626
   no verificables en UAT. **MG-43** acreditado con el alcance de 8.3.

### 8.5 Hallazgo nuevo, fuera del alcance del pasaje

**El bundle de UAT corre en modo desarrollo.** La consola del portal informa `Angular is running in the
development mode. Call enableProdMode()`, y el stack `checkBindingNoChanges → checkNoChangesNodeInline`
sólo existe en devMode. Conviene verificar que el bundle de producción sí tenga `enableProdMode()`: en
devMode se pierde rendimiento y peso, y los errores de binding se manifiestan distinto que en producción.

### 8.6 Registro en Jira de este cierre

| Artefacto | Referencia |
|---|---|
| Informe de GO | ATP MG-178, comentario **34716** |
| Complemento (mitigación MP + escalada del hold) | ATP MG-178, comentario **34721** |
| Cierre de iteración por ATR | MG-645 (**34720**) · MG-656 (**34717**, con la asimetría de los 6 TO DO explicada) · MG-649 (**34719**) |
| Cobertura de MG-43 | comentarios **34724** y **34726** en el ticket |
| Xray Tests en `LISTO PARA RELEASE` | **61** |

### 8.7 Lo que queda pendiente al cierre

| # | Pendiente | Dueño | Reloj |
|---|---|---|---|
| 1 | Liberar `pi_3U0TT4IVMuJxYnLP2EGqvJ8n` (hold 96, USD 1,50) desde el Dashboard | QA / operaciones | **hoy 18:32** |
| 2 | Decidir sobre el viaje 722752 y su hold 101 (USD 0,77): cancelar, o dejar expirar y documentar la segunda instancia del defecto | QA | 07-08 11:43 |
| 3 | MG-25 — registrar el modal de desvinculación (1 minuto) y transicionar | QA | — |
| 4 | Reejecutar MG-668 pasos 4-9 con login del contractor 1604 | QA | próxima ventana |
| 5 | Reportar como defecto el camino "programado que expira sin liberar" + la no-reconciliación de `CARD_HOLDS.STATUS` | QA | próxima iteración |

---

*Addendum de QA al cierre del 2026-08-05. El GO es decisión del equipo; este documento registra los
hechos verificados y los riesgos asumidos.*
