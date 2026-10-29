# Análisis de release, veredicto GO/NO-GO y retrospectiva de 3 semanas

> **Release Pasarelas de Pago** — ATP [MG-178](https://magiis.atlassian.net/browse/MG-178)
> Fecha del análisis: **2026-08-04** · Ventana cubierta: **2026-07-14 → 2026-08-04**
> Autor del análisis QA: Emanuel Restrepo
>
> Cuatro secciones: **§1** veredicto GO/NO-GO actualizado · **§2** análisis ticket por ticket con
> recomendación de cierre · **§3** reporte estilo Allure listo para pegar en el ATP · **§4** retrospectiva
> de las tres semanas y del workflow · **§5** próxima iteración propuesta.

---

## §1 · Veredicto GO/NO-GO

# NO-GO CONDICIONAL

Los **dos comportamientos que gatean el pase** están acreditados en **las dos pasarelas** que se pudieron
probar, con correlación de identidad en tres capas y evidencia adjunta y reproducible. El NO-GO no es por
calidad de lo probado.

| Comportamiento | Authorize | Stripe |
|---|---|---|
| **(A)** El dinero vuelve al pax al cancelar un viaje programado con pre-autorización activa | ✅ MG-627 · MG-356 | ✅ MG-627 · MG-356 |
| **(B)** El alta de viaje desde app culmina y el cobro cierra el viaje | ✅ MG-347 · MG-524 | ✅ MG-247 · MG-239 |

**Estado de los ATR**

| ATR | Pasarela | PASSED | Pendiente |
|---|---|---|---|
| [MG-645](https://magiis.atlassian.net/browse/MG-645) | Authorize | **9** | 1 EXECUTING (MG-350, falta captura del PSP) |
| [MG-656](https://magiis.atlassian.net/browse/MG-656) | Stripe | **9** | 6 TO DO, ninguno bloqueante |
| [MG-649](https://magiis.atlassian.net/browse/MG-649) | MercadoPago | **0** | 3 TO DO + 1 EXECUTING |

### Condicionantes vivos

| # | Condicionante | Dueño | Estado |
|---|---|---|---|
| **C1** | MercadoPago sin una sola prueba verde — rechaza la pre-autorización con `cc_rejected_high_risk` en cuenta productiva | Coordinador (decisión de alcance) | 🔴 abierto |
| **C2** | El fix de MG-43 rompe el listado de viajes del portal Contractor — 500 en `genericReport/028/paginated` | Desarrollo | 🔴 abierto |
| **C3** | Reintegro al cancelar en Stripe | QA | ✅ **cerrado hoy 17:50** |
| **C4** | Pre-autorización sin liberar: `CARD_HOLDS` 96, USD 1,50 desde el 03-08 18:32 | QA | 🟠 falta liberar el intent en el Dashboard |

**C2 es hoy el bloqueante más grave**, y por un motivo que va más allá del error: el ticket que lo
introdujo está marcado como resuelto. Ver §2.

---

## §2 · Análisis ticket por ticket con recomendación de cierre

> **Nota de gobernanza**: este análisis es una **recomendación**. La regla vigente en MG limita el alcance
> del agente a entidades Xray; las transiciones de historias, errores y tareas las ejecuta una persona.

Alcance de la release según los enlaces del ATP MG-178: **MG-3, MG-11, MG-13, MG-20, MG-22, MG-24,
MG-25, MG-26, MG-27, MG-43**. Nueve están en **UAT** a nombre de Emanuel Restrepo; MG-43 figura
**Finalizada**.

### 🔴 MG-43 — NO cerrar. Reabrir.

*[Stripe][BE] CONTRACTOR | Lista de viajes corrientes y sin liquidar (Reporte 028) se rompe al existir
viajes en estado NO AUTH / NO PAY* · **Finalizada 2026-08-04 17:20:15** · Sebastian Barcala

**El fix rompe el reporte.** Tras aplicar la corrección SQL, el endpoint
`genericReport/028/paginated` devuelve **500** desde el portal Contractor y el listado muestra `Total: 0`.
El ticket quedó marcado resuelto **el mismo día, minutos antes** de que la verificación encontrara el
error.

Dato de trazabilidad valioso: **el smoke generó exactamente las condiciones que MG-43 describe.** Los
viajes 722729 (`STATE=10`, No Autorizado) y 722732 (`STATE=11`, cobro parcial) son los estados NO AUTH /
NO PAY del enunciado. La campaña reprodujo el escenario del ticket sin proponérselo.

Causas candidatas del 500, por probabilidad: el alias `TZ` no existe en el `FROM` de ese reporte
(`ORA-00904`) · el formato de fecha llega ISO y el bind espera `DD/MM/YYYY` (`ORA-01861`) · `TZ.NAME` no
es una región IANA válida (`ORA-01882`) · pérdida de índice por envolver la columna en funciones, con
riesgo de timeout en volumen productivo.

**Acción**: obtener el código `ORA-` del log del backend, corregir y re-verificar. Recomendación de
implementación: convertir los límites del día a UTC en la aplicación y comparar la columna cruda, para no
perder el índice ni depender de `TZ.NAME`.

### 🟠 MG-3 y MG-13 — no cerrar sin aclarar el alcance de "quitar marketplace"

*[Stripe][BE] Cambios para quitar marketplace de Stripe* · *[Stripe][BE] Sacar MarketPlace - Gateway*

Los pagos de Stripe **siguen llevando comisión de plataforma**. En el request al gateway viaja
`commission: 0.5` y en la metadata del PaymentIntent figura `application_fee_amount: 50`.
`application_fee_amount` es precisamente el mecanismo de marketplace de Stripe Connect.

No lo afirmo como defecto porque depende de qué signifique "quitar marketplace" en el alcance del ticket:
puede referirse a eliminar cuentas gestionadas y conservar la comisión de plataforma, o a eliminar la
comisión también. **Pregunta para el equipo antes de cerrar**: ¿el criterio de aceptación implica que no
debería haber `application_fee_amount`?

Dato adicional de contraste: en **MercadoPago** el marketplace sí está activo de forma explícita —
`charges_details` trae un `third_payment` de 35 ARS con `accounts: {from: collector, to: marketplace_owner}`.

### 🟡 MG-20, MG-26, MG-27 — cerrar con alcance declarado

*Modificaciones de Stripe 3DS* en Carrier v1, Driver y Pax.

**Validado**: el 3DS se aplica y tiene éxito. Stripe reporta `3D Secure 2, Authenticated through 2.2.0`,
`Risk level: Normal`, en los tres orígenes probados (portal Carrier, App PAX Personal y Business, portal
Contractor).

**No validado**: el **challenge visible**. Las cinco autenticaciones de la campaña se resolvieron por
flujo **frictionless**, sin modal ni interacción del pasajero. Los casos del ATP que exigen que el modal
se presente —MG-257, MG-258, MG-259, MG-261— **no son ejecutables con la tarjeta real disponible**: harían
falta las tarjetas de prueba de Stripe o una regla de Radar que fuerce 3DS.

**Recomendación**: cerrables, dejando asentado en el ticket que la validación cubre el camino frictionless
y que el challenge visible queda pendiente para el entorno `test` con sandbox.

### 🟡 MG-24 — cerrar con la deuda heredada asentada

*[Stripe][BE] Borrar wallets huérfanas por cambio de cuenta en pasarela*

**El comportamiento actual funciona.** Al desvincular Authorize del carrier 1481, `cleaningWallets`
eliminó las tres wallets con `APP=21` y sus dos tarjetas (`CARD` 4646 y 4647). Verificado en base.

**Queda deuda histórica**: cuatro wallets con `APP=2` (Stripe) sobreviven desde el unlink del
2026-01-13, dos de ellas con tarjeta. No es defecto del código actual — se generaron con la versión
anterior o por un camino que no invocaba la limpieza.

**Recomendación**: cerrar el ticket por el comportamiento, y abrir una tarea aparte de limpieza de datos
para las huérfanas históricas.

### ⚪ MG-11 y MG-25 — no verificados en este smoke

- **MG-11** *Error al mantener la wallet de un pax borrado*: requiere borrar un pax, escenario que no se
  ejercitó. No cerrable con la evidencia disponible.
- **MG-25** *Modal de aviso de desvinculación*: se ejecutaron cuatro ciclos de vinculación y
  desvinculación, pero **no se registró si el modal apareció**. El caso equivalente en Authorize
  (TC-PAY-CFG-12 / MG-222) sigue en Tareas por hacer. Falta una verificación de un minuto.

### ⚪ MG-22 — fuera del alcance de QA funcional

*[Stripe][Producto] Documentación Stripe 3DS*. Entregable documental; su cierre lo valida Producto.

### Resumen de la recomendación

| Ticket | Recomendación |
|---|---|
| MG-43 | 🔴 **Reabrir** — el fix introduce un 500 |
| MG-3 · MG-13 | 🟠 **Consultar alcance** antes de cerrar (`application_fee_amount`) |
| MG-20 · MG-26 · MG-27 | 🟡 **Cerrar** declarando que el 3DS validado es frictionless |
| MG-24 | 🟡 **Cerrar** + abrir tarea de limpieza de huérfanas históricas |
| MG-11 | ⚪ **No cerrar** — sin verificar |
| MG-25 | ⚪ **Verificar el modal** (1 min) y cerrar |
| MG-22 | ⚪ Cierre de Producto, no de QA |

---

## §3 · Reporte estilo Allure — para pegar en el ATP MG-178

```text
=============================================================================
 QA REPORT | SMOKE UAT CON TARJETAS REALES | RELEASE PASARELAS DE PAGO (MG-178)
 Cierre de campaña - 2026-08-04 - entorno UAT - cuentas PRODUCTIVAS
=============================================================================

OVERVIEW
  Casos ejecutados ................... 22
  PASSED ............................. 18   (82%)
  EXECUTING (evidencia parcial) ......  2
  BLOCKED ............................  1
  NO EJECUTADOS (en los ATR) .........  9
  Pasarelas del release .............. 3 de 4 tocadas
  Viajes reales creados .............. 8
  Pre-autorizaciones colocadas ....... USD 1.996,03 - todas resueltas menos una
  Dinero efectivamente cobrado ....... USD 5,89
  Fondos retenidos sin resolver ...... USD 1,50 (hold 96)

-----------------------------------------------------------------------------
SUITE: AUTHORIZE.NET  - ATR MG-645 - carrier 1481 - 9 PASSED / 1 EXECUTING
-----------------------------------------------------------------------------
  [PASS] MG-220 CFG-10  Vinculacion con credenciales validas
  [PASS] MG-285 WAL-02  Alta de tarjeta real desde portal Carrier
  [PASS] MG-286 WAL-03  Alta de tarjeta real desde App PAX
  [PASS] MG-349 COB-04  Hold por estimado + margen (1%, cuatro mediciones)
  [PASS] MG-347 COB-02  Viaje desde App PAX culminado por App Driver
  [PASS] MG-524 COB-25  Cobro por priorAuthCapture sobre el hold
  [PASS] MG-352 COB-07  Monto final mayor al hold: cobra la diferencia
  [PASS] MG-356 COB-11  Cancelar con hold libera la autorizacion
  [PASS] MG-627 E-04    Reintegro al cancelar viaje programado
  [EXEC] MG-350 COB-05  Autorizado -> cobrado (falta captura del Merchant Interface)

-----------------------------------------------------------------------------
SUITE: STRIPE  - ATR MG-656 - carrier 1481 - 9 PASSED / 6 pendientes
-----------------------------------------------------------------------------
  [PASS] MG-212 CFG-02   Vinculacion en modo LIVE + exclusividad + cleaningWallets
  [PASS] MG-247 TRIP-21  Colaborador: hold, despacho y captura
  [PASS] MG-253 TRIP-27  Hold ON sin modal 3DS, viaje activo
  [PASS] MG-239 TRIP-13  App PAX modo Business: aislamiento por perfil + hold + captura
  [PASS] MG-278 TRIP-52  Portal Contractor: baja y alta de tarjeta, viaje sin hold
  [PASS] MG-351 COB-06   Monto final MENOR al hold: captura parcial + devolucion (x2)
  [PASS] MG-352 COB-07   Monto final MAYOR al hold: cobra la diferencia
  [PASS] MG-356 COB-11   Cancelar con hold libera la autorizacion
  [PASS] MG-627 E-04     Reintegro al cancelar viaje programado

-----------------------------------------------------------------------------
SUITE: MERCADOPAGO  - ATR MG-649 - carrier 1040 - BLOQUEADA
-----------------------------------------------------------------------------
  [BLOCKED] Viaje programado, usuario empresa individuo, desde portal Carrier

  MercadoPago RECHAZA la pre-autorizacion por su propio scoring de riesgo.
  No es fallo de MAGIIS: la llamada sale bien formada y el proveedor responde
  rechazo en 2 segundos.
      PaymentId 171881559716 - status rejected - cc_rejected_high_risk
      live_mode true - captured false - ARS 700 - dinero movido: NINGUNO
  El viaje queda en estado No Autorizada (STATE=10), sin cobro.

  Cadena del rechazo (CloudWatch UAT-Logs/UAT-Payments, hora UTC):
      18:41:20.869  viaje 722714 creado
      18:41:22.393  EpaymentServiceImpl.getCardHold - ejecuta el hold con sessionId
      18:41:24.192  ERROR - PaymentId 171881559716 - rejected - cc_rejected_high_risk

  Hipotesis vivas, ninguna confirmada: falta device_id / fingerprint del SDK
  (el tracking_id dice security:none) - falta payer.identification (DNI) -
  tarjeta EXTRANJERA (Citibank, Estados Unidos) sobre cuenta collector argentina
  cobrando ARS via aggregator - scoring mas estricto para pre-autorizaciones -
  reglas de fraude del panel de la cuenta.

-----------------------------------------------------------------------------
COMPORTAMIENTOS TRANSVERSALES ACREDITADOS
-----------------------------------------------------------------------------
  Margen del hold = 1%, medido en cinco viajes:
      37,21 -> 37,58   5,00 -> 5,05   1.926,18 -> 1.945,44   1,49 -> 1,50   1,54 -> 1,56
  priorAuthCapture correcto: el gatewayTransactionId del cobro es identico al
      INTENT_ID del hold. Discriminador tecnico frente a la venta directa: esta
      ultima crea un intent nuevo y trae gatewayClientSecret poblado.
  Captura parcial cuando el final queda por debajo del hold, con devolucion
      automatica del remanente ("captured, and released the remaining to the customer").
  Aislamiento por perfil: Personal y Business usan usuarios y wallets distintos,
      con un PaymentMethod propio por perfil en el PSP.
  Trazabilidad del portal de origen desde la base:
      config 480 / CHANNEL WC = contractor   580 / W = carrier   581 / MA = app pax
  Discriminador hold-de-viaje vs vinculacion en Stripe:
      pi_ = PaymentIntent (retiene fondos)   seti_ = SetupIntent (no retiene)

-----------------------------------------------------------------------------
CATEGORIES - hallazgos
-----------------------------------------------------------------------------
  [CRITICO - regresion] El fix de MG-43 rompe el reporte 028 del portal Contractor
      500 en genericReport/028/paginated. El ticket quedo marcado Finalizada el
      mismo dia, minutos antes de que la verificacion encontrara el error.

  [ALTA] Viaje programado que expira sin liberar su pre-autorizacion
      El viaje 722715 cerro en STATE=8 (programado vencido, sin CANCELEDBY y sin
      CHARGED) y su hold de USD 1,50 nunca se libero. En produccion, todo viaje
      programado que no consiga conductor dejaria fondos retenidos del pasajero.

  [ALTA - seguridad] Credenciales de pasarela en texto plano
      La tabla MERCADOPAGO_APP guarda ACCESS_TOKEN, SECRET_KEY y PUBLIC_KEY sin
      cifrar para las cuatro pasarelas, legibles por el usuario de aplicacion.

  [MEDIA] Los pagos rechazados no quedan en la base
      El intento rechazado de MercadoPago no existe en ninguna tabla de Oracle;
      solo se reconstruye desde CloudWatch. Ni la base ni la UI explican por que
      un viaje quedo No Autorizado.

  [MEDIA] El excedente sobre el hold puede quedar sin cobrar
      Viaje 722732: precio final 1,45 contra hold 1,19; la diferencia de 0,26 se
      intento como transaccion independiente y fue RECHAZADA. El viaje cerro en
      STATE=11 con 1,19 cobrado. Clasificado CORRECTO por el QA lead. Observacion
      tecnica: 0,26 esta por debajo del minimo de cobro de Stripe para USD (0,50).

  [A RESOLVER] Discrepancia entre especificacion y codigo en MercadoPago
      MG-160 dice que el alta debe caer al flujo verificationFoundsCard porque MP
      no soporta hold. El codigo ejecuto verificationCardWithHold y pidio una
      pre-autorizacion real (captured:false).

  [ABIERTO] Hold ausente sin causa determinada
      El viaje 722734 (portal Contractor, mismo dia) no coloco hold, mientras el
      722735 con el mismo canal y config si lo coloco. La unica diferencia
      observable es ISPROGRAMMED. Sin explicacion.

  [DESCARTADO - no era defecto] Hold con INTENT_ID = 0
      La cuenta Authorize estaba en Test Mode, y en ese modo Authorize aprueba
      pero devuelve transId = 0. Misconfiguracion del entorno de prueba,
      corregida en sesion. Tras el arreglo, 3 de 3 operaciones correctas.

-----------------------------------------------------------------------------
ENVIRONMENT
-----------------------------------------------------------------------------
  Entorno ............ UAT - apps-uat.magiis.com
  Base ............... Oracle magiis-uat-v6 (consultas read-only)
  Logs del backend ... AWS CloudWatch - UAT-Logs / UAT-Payments (us-east-2)
  Authorize .......... carrier 1481 UNITY US - cuenta PRODUCTIVA
  Stripe ............. carrier 1481 - acct_1LqOfJIVMuJxYnLP - modo LIVE confirmado
                       por el objeto Customer del PSP (livemode: true)
  MercadoPago ........ carrier 1040 - cuenta PRODUCTIVA (live_mode: true)
  Tarjetas ........... Mastercard ****6307 (CITIBANK N.A., Estados Unidos)
                       Visa ****3522 (BIN 493715)
  Ejecucion .......... manual (politica: automatizacion de gateway solo en test)
  Relojes ............ Oracle en UTC - ejecutor en UTC-3 - Authorize en EDT

-----------------------------------------------------------------------------
VERIFICACION DE LA PROPIA EVIDENCIA
-----------------------------------------------------------------------------
  Las 15 afirmaciones que sostienen los veredictos de Authorize se sometieron a
  dos revisores independientes con instruccion de REFUTARLAS, consultando la base
  por separado: 0 refutadas, confirmadas al decimal y al segundo. Cada run de los
  ATR tiene adjunta la evidencia de base con las consultas incluidas.

-----------------------------------------------------------------------------
VEREDICTO
-----------------------------------------------------------------------------
  NO-GO CONDICIONAL. Los dos comportamientos que gatean el pase estan acreditados
  en Authorize y en Stripe. Pendiente: la decision de alcance sobre MercadoPago,
  la correccion del 500 del reporte 028 (MG-43, hoy marcado Finalizada), y la
  liberacion del hold 96.

=============================================================================
```

---

## §4 · Retrospectiva — tres semanas de campaña

### Línea de tiempo por hitos

| Fecha | Hito | Artefacto |
|---|---|---|
| **20-07** | Se estructura el ATP por áreas de API y se crean 7 ATR | MG-510 a MG-516 |
| **23-07** | Primer E2E manual de cargo a bordo con colaborador | MG-553 |
| **24-07** | Se abre la línea de UI de configuración de pasarelas | MG-556 |
| **25-07** | Se confirma la modalidad TMS: **jira-xray**. ATR de CFG Authorize | MG-557 |
| **26-07** | **Ronda 1 por pasarela en entorno `test`** — se separan los cuatro PSP | MG-558 Authorize · MG-559 eBizCharge · MG-560 Stripe · MG-561 MercadoPago |
| 30-07 al 31-07 | Campaña eBizCharge: se acredita el ciclo hold→release consultando el PSP por SOAP | evidencia `evidence/test/ebizcharge/hold-release/` |
| **31-07** | Se crea el Test que faltaba para el reintegro y se ejecuta verde en `test` | MG-627 |
| **03-08** | **Arranca el smoke UAT con tarjetas reales**. Tres ATR nuevos | MG-645 Authorize · MG-649 MercadoPago · MG-656 Stripe |
| 03-08 | Authorize: 9 casos verdes, los dos comportamientos acreditados | MG-645 |
| 03-08 | MercadoPago: bloqueada por `cc_rejected_high_risk` | MG-649 |
| 04-08 | Stripe: 9 casos verdes, incluido el reintegro | MG-656 |

### Qué cambió en la forma de trabajar

**De la cobertura por área a la cobertura por pasarela.** El 20 de julio el ATP estaba organizado por
áreas de API — vinculación, tarjeta, hold, cobro, wallet, hardening. El 26 se reorganizó **por pasarela**,
porque los defectos no aparecían por área sino por integración: lo que funciona en una PSP falla en otra.
Esa decisión es la que permitió detectar que MercadoPago rechaza donde Stripe aprueba.

**De la verificación en una capa a la trifuerza más PSP.** La campaña de eBizCharge dejó la lección más
cara: un hold puede existir en el proveedor **sin ninguna fila en MAGIIS**. Desde entonces ningún caso se
considera acreditado sin correlacionar UI, base, logs del gateway y Merchant Interface del PSP, con el
mismo identificador de transacción en las cuatro.

**De sandbox a plástico real.** Todo lo anterior se ejerció con tarjetas de prueba. El smoke de UAT es la
primera vez que la release se prueba con dinero real, y aparecieron cuatro cosas que el sandbox no muestra:
el Test Mode devolviendo `transId = 0`, el rechazo por riesgo de MercadoPago, el mínimo de cobro de Stripe,
y el hold que sobrevive a un viaje vencido.

**De la evidencia manual a la evidencia generada.** Los artefactos de base se generan por script contra
Oracle, con las consultas incluidas en el propio archivo, y se adjuntan a cada run. Eso hizo posible algo
que ayer salvó la campaña: los artefactos de MG-285 y MG-286 se generaron **antes** de rotar la pasarela;
si se regeneraran ahora vendrían vacíos, porque `cleaningWallets` borró esas wallets al desvincular
Authorize. Capturar en el momento y no al cierre es lo que preservó la evidencia.

**De afirmar a refutar.** Las afirmaciones que sostienen los veredictos se someten a revisores
independientes con instrucción explícita de refutarlas consultando la base por separado. En la única
pasada ejecutada: 0 refutadas de 15.

### Correcciones que la campaña se hizo a sí misma

Vale registrarlas porque son la parte del proceso que funcionó:

1. **`INTENT_ID = '0'` no era un bug de mapeo de campos.** Era el Test Mode de Authorize. Se descartó la
   hipótesis inicial con la causa raíz aportada por el QA lead.
2. **MercadoPago sí envía la identidad del pagador.** Los `null` que se leyeron estaban en la *respuesta*
   del PSP, que no eco de vuelta el objeto `payer`. El log del backend probó que el email, el payer id y
   el nombre sí se envían. La hipótesis del payload incompleto quedó refutada.
3. **`cleaningWallets` sí limpia.** Se había reportado que las wallets sobrevivían a la desvinculación; la
   rotación a Stripe probó lo contrario y bajó la severidad del hallazgo a deuda heredada.
4. **MAGIIS sí ejecuta flujo de hold contra MercadoPago.** Se había afirmado que MP no usa hold; los logs
   mostraron `verificationCardWithHold` y `getCardHold`, y el payload trae `captured: false`.
5. **El reloj es UTC-3, no UTC-6**, y el driver de Oracle infla los ISO en +3h al reinterpretar los
   TIMESTAMP naive. Todas las cronologías se rehicieron con `TO_CHAR`.

### Capacidades nuevas que quedan instaladas

- **CloudWatch `UAT-Logs / UAT-Payments`** (us-east-2, cuenta 4897-2587-9881): la clase
  `EpaymentServiceImpl` loguea por `travelId` y `PaymentId`. Cierra la correlación viaje ↔ transacción del
  PSP sin depender del dashboard. Con una credencial AWS de sólo lectura sería automatizable.
- **Los logs del microservicio gateway viven en PostgreSQL** (schema `MGW_UAT`, tabla `logs`), con el
  request y la response crudos del PSP por endpoint. DBHub soporta postgres: cablearlo es la mejora
  pendiente de mayor impacto para la próxima pasarela.
- **Consulta read-only a Oracle UAT** desde el runner, con guard de sólo-`SELECT` y enmascarado de PAN.
- **Esquema documentado**: `CARD_HOLDS` usa `AMOUNT_HOLD`; `MGW_TRANSACTIONS` sólo se escribe en cobros,
  nunca en holds ni releases; `TRAVEL.CHANNEL` + `CARRIER_PAYMENT_METHOD_CONFIG_ID` identifican el portal;
  mapa de `STATE`: 0 creado · 3 en curso · 4 post-cobro · 6 finalizado · 7 cancelado · 8 programado
  vencido · 9 programado pendiente · 10 No Autorizado · 11 cobro parcial.

---

## §5 · Próxima iteración propuesta — valores límite en `test`

El smoke con dinero real cubrió el camino feliz y algunos bordes que aparecieron solos. Lo que **no se
puede** ejercitar con plástico real son los límites y los negativos, y ahí el entorno `test` con sandbox
es la herramienta correcta.

### Valores límite que el smoke dejó señalados

| Límite | Por qué importa | Cómo probarlo en `test` |
|---|---|---|
| **Monto por debajo del mínimo del PSP** (USD 0,50 en Stripe) | El viaje 722732 perdió 0,26 por esto | Viaje cuyo ajuste final caiga bajo el umbral, y verificar si el sistema lo detecta o lo intenta igual |
| **Monto final = hold exacto** | No se dio en ninguna corrida; es el borde entre captura total y parcial | Fijar precio final idéntico al hold |
| **Monto final muy superior al hold** | El 722732 falló con 0,26; ¿qué pasa con una diferencia grande? | Diferencia por encima del mínimo del PSP |
| **Hold de monto alto** | Se probó con 1.945,44 y funcionó; falta el límite del emisor | Escalar hasta el rechazo por límite |
| **Viaje programado a 1, 2 y 7 días** | La regla del hold del mismo día no se explicó con los datos: un viaje a otro día sí tuvo hold | Barrido de fechas y observar cuándo se coloca |
| **Expiración del hold** | `EXPIRED_DATE` son 48 h en MAGIIS; Stripe libera a los 7 días. Nadie probó qué pasa en el medio | Dejar vencer un hold y observar las dos capas |
| **Declines por número de tarjeta** | Cero cobertura de negativos con plástico real | Tarjetas de prueba: `4000...0002` genérico, `9995` fondos insuficientes, `9235` fail3DS |
| **3DS con challenge visible** | Las cinco autenticaciones fueron frictionless | `4000 0025 0000 3155` success3DS y `4000 0027 6000 3184` always_authenticate |

### Casos del ATP que esto desbloquea

Los de 3DS con modal —**MG-257, MG-258, MG-259, MG-261**— y los de decline —**MG-263, MG-283, MG-519 a
MG-523, MG-530, MG-532, MG-355**—, más los de reintegro que siguen en cero en las dos pasarelas:
**MG-528** y **MG-531** (refund de transacción liquidada), **MG-506** (cancelar un intent ya capturado
deriva a refund) y **MG-448** (compensación ante fallo post-confirm).

**MG-506 es el que señalaría primero.** Cancelar un viaje cuya tarjeta ya fue cobrada es un escenario real
y frecuente, y es la otra mitad del comportamiento que este smoke validó: si el sistema no siempre libera
un hold, la pregunta obvia es qué hace cuando ya capturó.

---

---

## Addendum 2026-08-04 (tarde) · Alcance ampliado y ejecución del cierre

El análisis original de §2 cubría los 10 tickets enlazados al ATP. La revisión del tablero completo
(columnas TEST y UAT) reveló **5 errores de gateway adicionales** y el cierre se ejecutó con
autorización explícita del QA lead.

### Ejecutado en Jira

**Transicionados a Listo para Produccion** (transición "Aprobado QA", con comentario de evidencia):

| Ticket | Evidencia que lo sostiene |
|---|---|
| MG-20 (3DS Carrier v1) | 3DS 2.2.0 exitoso en portal Carrier; frictionless declarado |
| MG-26 (3DS Driver) | Capturas desde App Driver sobre holds con 3DS previo (722731/722733/722734) |
| MG-27 (3DS Pax) | Altas y viajes desde App PAX Personal y Business; aislamiento por perfil |
| MG-24 (wallets huérfanas) | `cleaningWallets` verificado en vivo; MG-625 como tracker de residuales — decisión del QA lead |
| **MG-555** (no se puede pagar con Authorize) | **Verificado de facto por el smoke**: Authorize operó completo en el carrier 1481 (US); el default a Stripe no reproduce |

**Comentados sin transición** (evidencia ausente o en contra): MG-3 y MG-13 (pregunta de alcance:
`application_fee_amount: 50` sigue viajando), MG-11 (sin verificar; auditado por MG-625), MG-25 (falta
registrar el modal — 1 minuto), MG-22 (cierre de Producto), MG-604 (requiere declines forzados → `test`),
MG-626 (eBiz → campaña de `test`), MG-625 (sus 7 casos mapeados a la próxima iteración), MG-650 (ver
abajo), MG-43 (solicitud de reapertura — su estado no ofrece transiciones a QA).

Comentario de cierre de campaña publicado en el ATP MG-178 (id 34671) y en los tres ATR (MG-645,
MG-656, MG-649).

### Los 5 tickets que el análisis original no cubría

| Ticket | Estado | Qué es | Relación con el smoke |
|---|---|---|---|
| **MG-650** | TEST | 500 en detalle de viaje con cobro en 2 transacciones por hold insuficiente (`NonUniqueResultException`) | **Su reproducción cita nuestro viaje 722713.** El hallazgo de que `MERCADOPAGO_TRANSACTIONS` es genérica cross-gateway es la causa de datos; el patrón aplica a cualquier PSP (722713 es Authorize, 722732 es Stripe). Con margen de hold al 1% y estimaciones que subestiman, será frecuente en producción |
| **MG-625** | UAT | Errores de auditoría de MG-3, MG-11 y MG-24 | Sus 7 casos de prueba (borrados, 409/428, PG caído, INACCAR) no se ejercitaron; van a la iteración de `test` |
| **MG-604** | UAT | Authorize devuelve success con tarjeta incorrecta (`handleApiResponse`) | Familia "flujo marca OK con error del PSP" ya documentada; no verificable con tarjeta real |
| **MG-555** | → Listo para Produccion | Default a Stripe impedía pagar con Authorize en carriers US | El smoke es la prueba de que no reproduce |
| **MG-626** | UAT | Alta tarjeta EBIZ modo compañía exige `placeId` | Reproducido en `test` (carrier 1521); verificación con la campaña eBiz |

### Corrección al veredicto de MG-650 sobre la prioridad

El bug MG-650 eleva la importancia del hallazgo del excedente: **cada viaje que cobra en dos
transacciones deja su detalle inaccesible para el carrier** (500). No es sólo un tema de conciliación de
montos — es una pantalla operativa rota en un escenario frecuente.

---

*Documento de QA. La decisión de GO/NO-GO y el cierre de tickets son del coordinador del pasaje. Detalle
por caso en los comentarios de MG-645, MG-649 y MG-656, con evidencia de base adjunta a cada run.*

---

## Addendum 2026-08-05 · Cierre de la iteración con GO a producción

El equipo tomó la decisión de **pasar a producción** el 2026-08-05. El veredicto de QA del 04-08 era
NO-GO condicional y se conserva arriba sin retoques. El estado final de cada condicionante y la lista de
riesgos asumidos viven en la **sección 8 del documento GO/NO-GO**; acá queda lo que esta retrospectiva
tiene que corregir de sí misma y lo que se aprendió el último día.

### Dos condicionantes se cerraron el mismo día del pase

**C2 — el 500 del reporte 028 — quedó verificado en verde.** Era el bloqueante que esta retrospectiva
declaraba "el más grave, y por un motivo que va más allá del error: el ticket que lo introdujo está
marcado como resuelto". Medido en UAT el 05-08 desde el portal Contractor: `POST 028/paginated` → **200
OK**, `POST 028T/totals` → **200 OK**, el listado renderiza completo con grilla y totales, sin el
`TypeError ... reading 'CSS'`, y **sin necesitar la query correctiva en base** que el ticket exigía en su
Definition of Done.

**C1 — MercadoPago — se cerró por decisión de alcance**, con una mitigación aportada por desarrollo: el
estudio determina que no se toca código de MercadoPago en este release. QA confirma el núcleo (el rechazo
`cc_rejected_high_risk` es scoring del proveedor sobre una llamada bien formada, no un defecto de MAGIIS)
y deja asentado el matiz de la superficie compartida que sí cambió — `cleaningWallets`,
`MERCADOPAGO_TRANSACTIONS` genérica, y `CARD_HOLDS` común a las cuatro pasarelas.

### Corrección al veredicto de MG-43 de la §2

La §2 decía **"NO cerrar. Reabrir."** Esa recomendación queda superada por dos hechos:

1. **El comportamiento reportado ya no se reproduce** en el camino verificado — ver arriba.
2. **El ticket no se puede reabrir**: está en `Finalizada / Listo` y ese estado no ofrece ninguna
   transición. La solicitud de reapertura del 04-08 quedó sin vía procesal.

Lo que se hizo en su lugar, y que es el patrón a repetir cuando un ticket cerrado necesita verificación:
**crear la cobertura de prueba que faltaba y acreditar ahí**, no forzar el ticket. MG-43 no tenía ningún
Test asociado, de modo que no existía entidad sobre la que registrar nada. Quedaron creados **MG-668**
(Test manual de 9 pasos, hoy en `LISTO PARA RELEASE`), **MG-669** (precondición NO AUTH / NO PAY) y
**MG-670** (Test Execution en `uat`, run en PASSED con 5 evidencias), los tres enlazados al ticket.

**El PASSED se registró con su alcance declarado**, que es la parte que importa para la trazabilidad: el
dataset de la corrida no contenía viajes NO AUTH ni NO PAY, y los pasos de paginación, ordenamiento y gap
latente quedaron sin ejecutar. El run dice exactamente eso. Un verde con alcance escrito vale; un verde
que aparenta cobertura que no tuvo, no.

### El hallazgo del hold empeoró al mirarlo de nuevo

El que esta retrospectiva señalaba como el de mayor impacto escaló de categoría. El viaje 722715 **salió
de la tabla `TRAVEL`**: un job lo archivó en `TRAVEL_HISTORY` a las 09:00 del 05-08, con el hold todavía
activo. Las vistas del portal leen `TRAVEL`, así que el dinero quedó **sin ninguna vía de producto para
liberarse**. Y no es anecdótico: hay **tres precedentes** con el mismo patrón (holds 23 y 26 de nov-2024,
75 de may-2025), todos con `STATUS='HOLD'` y vencimiento pasado hace meses o años.

De ahí sale un hallazgo estructural que no estaba en el mapa: **`CARD_HOLDS.STATUS` nunca se reconcilia
con el PSP**. El estado del hold en MAGIIS miente indefinidamente. Cualquier reporte de conciliación o
consulta de soporte que se apoye en esa columna está leyendo un dato falso.

Al cierre había **dos holds vivos**: el 96 (USD 1,50, vence el 05-08 18:32) y el **101** (USD 0,77, del
viaje 722752 dado de alta hoy desde el portal Contractor, vence el 07-08 11:43).

### Capacidad nueva instalada el último día

**Validación automatizada del portal Contractor de UAT, sin intervención manual.** Un script Node
standalone carga `playwright` del proyecto `magiis-playwright` vía `createRequire`, lee credenciales del
`.env.uat` y ejercita el portal de punta a punta capturando red y consola. Piezas que costaron
descubrirse y conviene no volver a descubrir:

| Detalle | Valor |
|---|---|
| Navegador | `chromium.launch({ headless: true, channel: 'chrome' })` — el binario `chromium_headless_shell` no está instalado |
| Campo de usuario | `input[formcontrolname="email"]` |
| Login contractor | `/#/authentication/login/contractor` → aterriza en `#/home/contractor/travel/listed` |
| Endpoint del reporte | **POST** con `Authorization: Bearer` — un GET sin token devuelve **403 Access Denied** |
| Filtros | El listado **ignora los query params del hash** (`startDate`, `endDate`, `stateFilterParam`): mantiene "Periodo: Hoy" y no re-dispara el reporte. Hay que operar los desplegables |
| Tabla de áreas | `CONTRACTORAREA` (sin guion bajo), con `CONTRACTORACCOUNT_ID` como dueño |

### Hallazgo lateral que conviene mirar antes del pase siguiente

**El bundle de UAT corre en modo desarrollo** (`Angular is running in the development mode`). Vale
confirmar que el de producción llame a `enableProdMode()`: en devMode se pierde rendimiento y peso, y los
errores de binding se manifiestan distinto — un bug que sólo aparece en uno de los dos modos es
exactamente el tipo de cosa que se escapa entre ambientes.

### Estado del cierre

| Artefacto | Referencia |
|---|---|
| Informe de GO en el ATP | MG-178, comentario **34716** |
| Complemento (mitigación MP + escalada del hold) | MG-178, comentario **34721** |
| Cierre de iteración por ATR | MG-645 (**34720**) · MG-656 (**34717**) · MG-649 (**34719**) |
| Cobertura creada para MG-43 | MG-668 · MG-669 · MG-670 (comentarios **34724** y **34726**) |
| Xray Tests en `LISTO PARA RELEASE` | **61** |

Pendientes que sobreviven al cierre: liberar el hold 96 antes de las 18:32, decidir sobre el 722752 y su
hold 101, el minuto de verificación de MG-25, reejecutar MG-668 con un login del contractor 1604, y
reportar como defecto el camino "programado que expira sin liberar" junto con la no-reconciliación de
`CARD_HOLDS.STATUS`.

---

*Addendum de QA al cierre del 2026-08-05. El GO y el cierre de tickets son decisión del equipo; este
documento registra los hechos verificados, los riesgos asumidos y lo aprendido.*
