# DEFECT (borrador listo para filear) — El alta de tarjeta con eBizCharge vincula como válidas tarjetas DECLINADAS por el procesador

> **Estado**: BORRADOR — MG es scope Xray-only para QA; este reporte lo abre el usuario/líder en
> el proyecto de desarrollo que corresponda (DEV/MX). Clasificación según
> `defect-management-doctrine`: la integración eBizCharge es feature **pre-release** → **Defect**
> (no Bug). **Severidad: Critical** (flujo de dinero) → Prioridad derivada: Highest/High.
> Componente: Payments / Gateway (eBizCharge). Fuente de evidencia: campaña QA gateway-pg,
> `docs/gateway-pg/ebizcharge/RUN-LOG.md` Ronda 1.

## Resumen

Al vincular una tarjeta desde el alta de viaje del portal Carrier (pasarela eBizCharge activa),
el sistema da por VÁLIDAS tarjetas que el procesador **declina**. La tarjeta queda vinculada como
método de pago del pasajero, y el rechazo real recién aparecería al cobrar el viaje.

**Alcance preciso (refinado 2026-07-31 con verificación por transacción): 4 tarjetas.** La ronda de
trifuerza consultó el PSP por cada intento y separó lo que antes se leía como un solo hallazgo de 6:

| Tarjeta | `RefNum` del intento | Veredicto del procesador | ¿Quedó vinculada? |
|---|---|---|---|
| `4000300211112228` | 3234213576 | `D-Declined` · código **10205 "Do not Honor"** | **sí** |
| `4000300611112224` | 3234213591 | `D-Declined` · código **10251 "Insufficient funds"** | **sí** |
| `4000300311112227` | 3234213603 | `D-Declined` · código **10212 "Invalid Transaction"** | **sí** |
| `4000300911112221` | 3234213606 | `D-Declined` · código **10262 "Restricted Card"** | **sí** |

**Quedan FUERA de este defecto** (se reportaban antes como parte de las 6; la verificación por
transacción los excluye):

- `4000301511112223` (fraud reject): el procesador **APROBÓ** el intento (RefNum 3234213621,
  `A-Approved`). Que MAGIIS la acepte es coherente con la respuesta del PSP — el fraud profiler de
  esta cuenta merchant no declina. No es defecto de integración.
- `4000300411112226` (emisor inválido 15): es la única con `exp 0922` (vencida). La request **no
  llega al procesador** (cero transacciones) y la tarjeta **no persiste** — la expiración se valida
  del lado del cliente. Comportamiento correcto, distinto del defecto.

## Pasos

1. Carrier 1521 (apps-test) con eBizCharge vinculada (App Store).
2. Portal Carrier → Nuevo Viaje → completar origen/destino/pax → Forma de pago: Tarjeta de
   Crédito - Preautorizada.
3. Ingresar la tarjeta de prueba **4000300211112228** (fila "Do not Honor 05" de la tabla
   oficial del sandbox), exp `09/30`, CVV `999`, dirección `1234 Main Street, Los Angeles`.
4. Click "Validar".

## Resultado esperado

Debería mostrarse el error de la pasarela y la tarjeta NO debería quedar vinculada: el
procesador declina esa tarjeta (verificado — ver evidencia 2).

## Resultado obtenido

La tarjeta se valida como correcta y queda vinculada como método de pago. Reproducido con las **4
tarjetas** que el procesador declina explícitamente (05, 51, 12, 62) — cada una con el `RefNum` de su
intento y el código de decline del PSP en la tabla del Resumen. En los 4 casos se verificó además, vía
`paymentMethodsByPax`, que la tarjeta quedó activa como método de pago del pasajero (pax 5289).

## Ambiente

`test` (apps-test.magiis.com) · carrier 1521 · pasarela eBizCharge (cuenta merchant sandbox del
equipo) · 2026-07-30/31.

## Evidencia

1. **UI**: corridas de la matriz `ebizcharge-card-outcomes.spec.ts` — screenshots/videos por caso en
   `evidence/test/playwright-artifacts/`.
2. **PSP — la transacción REAL de cada alta** (la evidencia más fuerte, agregada 2026-07-31): el
   camino de decline del spec consulta ahora el procesador por SOAP y adjunta su respuesta al
   diagnóstico (`trifuerza-decline-<INTENT>.txt` en los artifacts). Los 4 `RefNum` de la tabla del
   Resumen son las autorizaciones que MAGIIS mismo disparó al validar la tarjeta — no probes
   externos. Cada una: `ResultCode D — Declined` con su `ErrorCode`.
3. **Persistencia**: `paymentMethodsByPax` del pax 5289 confirma, en los 4 casos, que la tarjeta
   quedó ACTIVA como método de pago después del decline.
4. **Probes SOAP independientes** (2026-07-31, aíslan a MAGIIS del PSP): `4000300211112228` →
   `D — Declined · 10205 "Do not Honor"` (RefNum 3234133983) · `4000100011112224` control →
   `A — Approved` (RefNum 3234189813) · `4000100511112229` → `A — Approved` con echo
   `AvsResultCode NNN` (RefNum 3234189816), y sin embargo el alta MAGIIS la RECHAZA (ver Hallazgo 2
   del RUN-LOG: divergencia AVS, decisión de negocio pendiente — NO forma parte de este defecto).
5. **Consola merchant**: transacciones de validación del alta visibles con montos > $10
   (confirmado por QA, 2026-07-30).

## Hipótesis técnica (para orientar al dev, no vinculante)

Los dos comportamientos observados (declines vinculados + approve-con-AVS-NNN rechazado) se
explican juntos si la validación del alta decide por el **resultado AVS** de la transacción de
verificación y no por el **approve/decline** del procesador.

La verificación por transacción la **refuerza**: las 4 declinadas devolvieron `AvsResultCode YYY`
(dirección y ZIP coinciden) y fueron aceptadas, mientras la aprobada con `AVS NNN` fue rechazada. En
los 4 casos el `ResultCode` era `D` y el `ErrorCode` distinto de 0 — datos disponibles en la misma
respuesta que el AVS, es decir: el veredicto del procesador está ahí y no se está mirando.

## Impacto

Un pasajero con tarjeta sin fondos / declinada viaja igual: el rechazo real aparecería recién
al cobrar (fin del viaje), con el servicio ya prestado. Afecta el flujo core de cobro del
release de pasarelas.

## DB Queries

N/A en este reporte (la evidencia PSP + UI es suficiente; si el dev necesita el estado
persistido: tabla de tarjetas del pax usado en la corrida, cards con last4 2228/2225/2226/2227).
