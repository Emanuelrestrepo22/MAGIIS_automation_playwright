# DEFECT (borrador listo para filear) — El alta de tarjeta con eBizCharge vincula como válidas tarjetas DECLINADAS por el procesador

> **Estado**: BORRADOR — MG es scope Xray-only para QA; este reporte lo abre el usuario/líder en
> el proyecto de desarrollo que corresponda (DEV/MX). Clasificación según
> `defect-management-doctrine`: la integración eBizCharge es feature **pre-release** → **Defect**
> (no Bug). **Severidad: Critical** (flujo de dinero) → Prioridad derivada: Highest/High.
> Componente: Payments / Gateway (eBizCharge). Fuente de evidencia: campaña QA gateway-pg,
> `docs/gateway-pg/ebizcharge/RUN-LOG.md` Ronda 1.

## Resumen

Al vincular una tarjeta desde el alta de viaje del portal Carrier (pasarela eBizCharge activa),
el sistema da por VÁLIDAS tarjetas que el procesador **declina** (Do not Honor 05, fondos
insuficientes 51, transacción inválida 12, emisor inválido 15, restringida 62, reject
antifraude). La tarjeta queda vinculada como método de pago del pasajero.

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

La tarjeta se valida como correcta y queda vinculada como método de pago. Reproducido con las
6 tarjetas de la serie decline/fraud-reject (05, 51, 12, 15, 62, fraud reject).

## Ambiente

`test` (apps-test.magiis.com) · carrier 1521 · pasarela eBizCharge (cuenta merchant sandbox del
equipo) · 2026-07-30/31.

## Evidencia

1. **UI**: corridas de la matriz `ebizcharge-card-outcomes.spec.ts` — 6 casos con la tarjeta
   declinable ACEPTADA (screenshots/videos en `evidence/test/playwright-artifacts/` por corrida).
2. **PSP directo (aísla a MAGIIS)**: `runTransaction` SOAP `authonly` contra
   `soap.ebizcharge.net` con las MISMAS credenciales del merchant:
   - `4000300211112228` → `ResultCode D — Declined · ErrorCode 10205 "Do not Honor"`
     (RefNum 3234133983).
   - `4000100011112224` (control) → `ResultCode A — Approved` (RefNum 3234189813).
   - `4000100511112229` → `ResultCode A — Approved` con echo `AvsResultCode NNN`
     (RefNum 3234189816) — y sin embargo el alta MAGIIS la RECHAZA.
3. **Consola merchant**: transacciones de validación del alta visibles con montos > $10
   (confirmado por QA, 2026-07-30).

## Hipótesis técnica (para orientar al dev, no vinculante)

Los dos comportamientos observados (declines vinculados + approve-con-AVS-NNN rechazado) se
explican juntos si la validación del alta decide por el **resultado AVS** de la transacción de
verificación y no por el **approve/decline** del procesador.

## Impacto

Un pasajero con tarjeta sin fondos / declinada viaja igual: el rechazo real aparecería recién
al cobrar (fin del viaje), con el servicio ya prestado. Afecta el flujo core de cobro del
release de pasarelas.

## DB Queries

N/A en este reporte (la evidencia PSP + UI es suficiente; si el dev necesita el estado
persistido: tabla de tarjetas del pax usado en la corrida, cards con last4 2228/2225/2226/2227).
