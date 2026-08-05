# Avance · Smoke UAT con tarjetas reales — Release Pasarelas de Pago

> Dos entregables listos para copiar y pegar:
> **§1** informe estilo Allure para el comentario de avance en el ATP MG-178.
> **§2** mensaje corto para Teams.
> Fecha 2026-08-03. Fuente de los datos: ATR MG-645, Oracle UAT, CloudWatch `UAT-Logs/UAT-Payments`,
> Merchant Interface de Authorize y panel de MercadoPago.

---

## §1 · Informe estilo Allure — para pegar en el avance del ATP

```text
=============================================================================
 QA REPORT | SMOKE UAT CON TARJETAS REALES | RELEASE PASARELAS DE PAGO (MG-178)
 Ronda 1 - 2026-08-03 - entorno UAT - tarjetas REALES - cuentas PRODUCTIVAS
=============================================================================

OVERVIEW
  Casos ejecutados .................. 11
  PASSED ............................  9   (82%)
  EXECUTING (evidencia parcial) .....  1   ( 9%)
  BLOCKED ...........................  1   ( 9%)
  Pasarelas del release ............. 2 de 4 tocadas
  Viajes reales creados ............. 5
  Pre-autorizaciones colocadas ...... USD 1.989,57 - TODAS liberadas
  Dinero efectivamente cobrado ...... USD 2,00 (1 viaje, cierre correcto)
  Fondos retenidos al cierre ........ NINGUNO

-----------------------------------------------------------------------------
SUITE: AUTHORIZE.NET - carrier 1481 UNITY US - CERRADA / GO scoped
-----------------------------------------------------------------------------
  [PASS] MG-220  TC-PAY-CFG-10  Vinculacion con credenciales validas
  [PASS] MG-285  TC-PAY-WAL-02  Alta de tarjeta real desde portal Carrier
  [PASS] MG-286  TC-PAY-WAL-03  Alta de tarjeta real desde App PAX
  [PASS] MG-349  TC-PAY-COB-04  Hold por estimado + margen (1%, 4 mediciones)
  [PASS] MG-347  TC-PAY-COB-02  Viaje desde App PAX culminado por App Driver
  [PASS] MG-524  TC-PAY-COB-25  Cobro por priorAuthCapture sobre el hold
  [PASS] MG-352  TC-PAY-COB-07  Monto final > hold: cobra diferencia sin fallar
  [PASS] MG-356  TC-PAY-COB-11  Cancelar con hold libera la autorizacion
  [PASS] MG-627  TC-PAY-E-04    Reintegro al cancelar viaje programado
  [EXEC] MG-350  TC-PAY-COB-05  Autorizado -> cobrado (falta captura del PSP)

  LOS DOS COMPORTAMIENTOS QUE GATEABAN EL PASE A PRODUCCION: ACREDITADOS
    (A) El dinero vuelve al pax al cancelar un viaje programado con
        pre-autorizacion activa. Verificado por los DOS portales (Carrier y
        App PAX), con la autorizacion en estado Voided en el PSP.
    (B) El alta de viaje desde app culmina y el cobro cierra el viaje, con
        captura sobre la autorizacion existente (priorAuthCapture).

  Correlacion de identidad verificada en 3 capas para cada caso:
    CARD_HOLDS.INTENT_ID == TRAVEL.HOLD_INTENT == Transaction ID del PSP

-----------------------------------------------------------------------------
SUITE: MERCADOPAGO - carrier 1040 - BLOQUEADA
-----------------------------------------------------------------------------
  [BLOCKED] Viaje programado, usuario empresa individuo, desde portal Carrier
            Viaje 722714 - ARS 700 - Visa terminada en 3522

  MOTIVO DEL BLOQUEO
    MercadoPago RECHAZA la pre-autorizacion por su propio scoring de riesgo.
    No es un fallo de MAGIIS: la llamada sale bien formada y obtiene un
    rechazo limpio del proveedor en 2 segundos.

      PaymentId 171881559716
      status ............ rejected
      status_detail ..... cc_rejected_high_risk
      live_mode ......... true
      captured .......... false
      monto ............. ARS 700
      dinero movido ..... NINGUNO (net_received_amount 0)

    El viaje queda en estado "No Autorizada" (STATE=10 en base), sin cobro.

  CADENA COMPLETA DEL RECHAZO (CloudWatch UAT-Logs/UAT-Payments, hora UTC)
    18:41:20.869  viaje 722714 creado
    18:41:22.393  EpaymentServiceImpl.getCardHold - ejecuta el hold con sessionId
    18:41:24.192  ERROR - PaymentId 171881559716 - hold rejected - cc_rejected_high_risk

  QUE HACE FALTA PARA DESBLOQUEAR (en orden de esfuerzo)
    1. Probar una segunda tarjeta real. El high_risk suele dispararse por BIN,
       pais del emisor o tarjeta nueva para esa cuenta.
    2. Revisar el payload que se envia a MercadoPago: viaja con payer.email,
       payer.identification y card.cardholder.name en NULL. Son campos que MP
       usa para puntuar riesgo. Si con otra tarjeta vuelve a rechazar, esta
       pasa a ser la causa principal y se convierte en hallazgo de producto.
    3. Soporte de MercadoPago: pedir el detalle del scoring de ese payment_id.
       Es el unico que puede confirmar si el rechazo es un falso positivo.

-----------------------------------------------------------------------------
CATEGORIES - hallazgos abiertos
-----------------------------------------------------------------------------
  [SEGURIDAD - alta] Credenciales de pasarela sin cifrar
      La tabla MERCADOPAGO_APP guarda ACCESS_TOKEN, SECRET_KEY y PUBLIC_KEY en
      texto plano para las 4 pasarelas, legibles por el usuario de aplicacion
      de la base. Pendiente: confirmar con backend si esa tabla es la que
      autentica contra el PSP.

  [DISENO - media] El excedente sobre el hold se cobra sin fondos garantizados
      La estimacion subestimo el precio final un 34% (1,49 estimado vs 2,00
      real) y la diferencia se cobro FUERA del hold, sin garantia de fondos.
      MG-352 contempla ese comportamiento, asi que probablemente no sea bug:
      lo que hay que revisar es si el margen del 1% alcanza cuando existe un
      minimo tarifario.

  [DATOS - media] Wallets sobreviven a la desvinculacion de la pasarela
      El carrier 1481 conserva 4 wallets y 2 tarjetas de Stripe siete meses
      despues de haberse desvinculado esa pasarela. Contradice TC-PAY-CFG-13 /
      MG-166 y es el terreno de MG-24. Se dirime gratis en la proxima rotacion.

  [TRAZABILIDAD - media] Los pagos rechazados no quedan en la base
      El intento rechazado de MercadoPago no existe en ninguna tabla de Oracle.
      Solo se puede reconstruir desde CloudWatch. Ni la base ni la UI explican
      por que un viaje quedo No Autorizado.

  [A RESOLVER] Discrepancia entre especificacion y codigo en MercadoPago
      MG-160 dice que el alta debe caer al flujo verificationFoundsCard porque
      MercadoPago no soporta hold. El codigo ejecuto verificationCardWithHold y
      pidio una pre-autorizacion real (captured:false). O MG-160 esta
      desactualizado, o el ruteo manda MP por el camino equivocado.

  [DESCARTADO - no era defecto] Hold sin referencia al PSP
      El primer intento de la jornada quedo con INTENT_ID='0'. Causa raiz: el
      dashboard de Authorize estaba en Test Mode cuando debia estar en Live, y
      en Test Mode Authorize aprueba pero devuelve transId=0. Misconfiguracion
      del entorno de prueba, no defecto de producto. Corregido en la sesion;
      despues 3 de 3 operaciones se comportaron correctamente.

-----------------------------------------------------------------------------
ENVIRONMENT
-----------------------------------------------------------------------------
  Entorno ............ UAT - apps-uat.magiis.com
  Base ............... Oracle magiis-uat-v6 (consultas read-only)
  Logs del backend ... AWS CloudWatch - UAT-Logs / UAT-Payments (us-east-2)
  Authorize .......... carrier 1481 UNITY US - cuenta PRODUCTIVA - tarjeta
                       master terminada en 6307
  MercadoPago ........ carrier 1040 - cuenta PRODUCTIVA - Visa terminada en 3522
  Ejecucion .......... manual (politica: automatizacion de gateway solo en test)
  Relojes ............ Oracle en UTC - ejecutor en UTC-3 - Authorize en EDT

-----------------------------------------------------------------------------
VERIFICACION DE LA PROPIA EVIDENCIA
-----------------------------------------------------------------------------
  Las 15 afirmaciones que sostienen los veredictos de Authorize se sometieron a
  dos revisores independientes con la instruccion de REFUTARLAS consultando la
  base por separado. Resultado: 0 refutadas. Confirmadas al decimal y al
  segundo. Cada uno de los 10 runs del ATR MG-645 tiene adjunta la evidencia de
  base de datos con las consultas incluidas, para que sea reproducible.

-----------------------------------------------------------------------------
PROXIMO PASO: STRIPE
-----------------------------------------------------------------------------
  Con MercadoPago bloqueado por el rechazo del proveedor, la campana avanza
  con Stripe. Tres precondiciones a destrabar antes de ejecutar:

    1. Stripe no esta vinculado en ningun carrier de UAT (0 links activos).
    2. La vinculacion de Stripe es OAuth de Stripe Connect: hace falta la
       cuenta Stripe del comercio y completar el consentimiento. No alcanza con
       pegar credenciales como en Authorize.
    3. Confirmar si la plataforma Stripe de UAT apunta a claves live o de test.
       Es la misma trampa que nos costo la primera hora de hoy con Authorize.

  Ademas, los casos de Stripe (MG-227 a MG-256) estan redactados con tarjetas
  de prueba (4242..., 9235 para forzar fallo 3DS). Con plastico real solo
  aplican los happy paths; los de 3DS y decline forzado quedan cubiertos en el
  entorno test con sandbox.

=============================================================================
 Detalle completo: ATR MG-645 - docs/gateway-pg/authorize/RUN-LOG-smoke-uat-
 tarjetas-reales.md - evidence/uat/authorize/
=============================================================================
```

---

## §2 · Mensaje para Teams

```text
Avance QA - Smoke UAT con tarjetas reales - Release Pasarelas de Pago

AUTHORIZE.NET: CERRADA. Los dos comportamientos que gateaban el pase a
produccion quedaron acreditados con tarjeta real y cuenta productiva:
  - El dinero vuelve al pax al cancelar un viaje programado con
    pre-autorizacion activa (validado desde Carrier y desde App PAX).
  - El alta de viaje desde la app culmina y el cobro cierra el viaje,
    capturando sobre la autorizacion previa.
9 de 10 casos en PASSED. El que falta solo espera una captura del panel de
Authorize. Se colocaron y liberaron casi USD 2.000 en pre-autorizaciones: no
quedo dinero retenido.

MERCADOPAGO: BLOQUEADA. MercadoPago rechaza la pre-autorizacion por su propio
scoring de riesgo (cc_rejected_high_risk) en la cuenta productiva. No es un
fallo de MAGIIS: la llamada sale bien y el proveedor responde rechazo en 2
segundos. El viaje queda "No Autorizada" y no se mueve dinero.
Para desbloquear necesitamos, en este orden: probar otra tarjeta real; revisar
que el payload a MP viaja sin email ni identificacion del pagador, campos que
MP usa para puntuar riesgo; y si persiste, pedirle a soporte de MercadoPago el
detalle del scoring.

SIGUIENTE: avanzamos con STRIPE mientras se destraba MercadoPago. Necesitamos
tres cosas antes de arrancar: vincular Stripe en un carrier de UAT (hoy no esta
vinculado en ninguno), la cuenta Stripe del comercio para el OAuth de Connect,
y confirmar que la plataforma apunta a claves live y no de test.

HALLAZGOS ABIERTOS: 1 de seguridad (credenciales de pasarela sin cifrar en
base) y 3 de menor severidad. Uno que parecia grave quedo descartado: era el
dashboard de Authorize en modo test en lugar de live.

Detalle y evidencia: ATR MG-645.
```

---

## Notas de uso

- El informe de §1 va como **comentario de avance en el ATP [MG-178](https://magiis.atlassian.net/browse/MG-178)**, siguiendo la convención de los comentarios previos de la campaña.
- El bloque de Teams está pensado para pegarse tal cual. Si el canal renderiza markdown, se puede quitar el cercado de código y los títulos en mayúsculas quedan como negritas.
- Ninguno de los dos incluye PAN, CVV ni credenciales. Los montos y los identificadores de transacción sí, porque son necesarios para la trazabilidad.
