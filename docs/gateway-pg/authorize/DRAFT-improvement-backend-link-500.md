# DRAFT — Improvement backend: link de pasarela Authorize responde 500/409 en caso de éxito (odnService)

> **DRAFT — filing sujeto a confirmación (scope MG = solo Xray; destino DEV/MX).**
> NO crear en Jira desde este repo sin confirmación explícita del líder QA. Este borrador
> existe para que el quirk documentado (HANDOFF §2) tenga su reporte listo y los oráculos
> de QA que hoy toleran 500/409 tengan un TODO de revert rastreable.

## Título

Backend: link de pasarela Authorize responde 500/409 en caso de éxito (odnService)

## Tipo / Severidad / Prioridad

- Tipo: Improvement (API smell — no bloquea la operación, la vinculación SÍ funciona)
- Severidad: Low / mejora
- Prioridad: derivada de severidad (Low)

## Ambiente

- TEST (`apps-test`), carrier 1521 (compartido por la suite gateway), portal Carrier → Magiis App Store.

## Pasos

1. Loguearse en el portal Carrier como dispatcher (carrier 1521).
2. Navegar a Magiis App Store (`/#/home/carrier/integrations/list`).
3. Con el slot de pasarela libre, click "Vincular"/"Link" en la card Authorize.Net.
4. Completar el modal de credenciales (`apiLoginKey` + `transactionKey` sandbox válidas) y click "Continuar".
5. Observar en la pestaña Network la request de mutación del link (endpoint del backend MAGIIS: `odnService` — NO `/vendor/`).

## Resultado esperado

La vinculación exitosa responde un status **2xx** (convención HTTP: éxito = 2xx).

## Resultado obtenido

- **HTTP 500** cuando la vinculación se hace desde estado limpio → la pasarela queda CONECTADA (éxito funcional con status de error de servidor).
- **HTTP 409** cuando el carrier ya estaba vinculado por otra sesión → también CONECTADA.
- **HTTP 400** = NO conectada (único código que sí refleja fallo).

## Evidencia

- `docs/gateway-pg/authorize/HANDOFF-live-reconciliation-2026-07-24.md` §2 + addendum 2026-07-25 (verificación en vivo, apps-test, carrier 1521).
- Oráculo automatizado que tolera el quirk: `tests/components/ui/carrier/AppStoreGatewaysPage.ts` → `expectLinkStatusOk` (MG-226) + `authorizeGatewayAdapter.linkSuccessStatuses = [500, 409]`.

## Impacto

- Los oráculos de QA quedan obligados a **tolerar códigos de error como éxito** (`[500, 409]`), debilitando la señal del test: un 500 real (fallo genuino del backend durante el link) es indistinguible del 500-de-éxito actual.
- Cualquier consumidor del endpoint (FE, monitoreo, alertas) que siga la convención HTTP clasifica vinculaciones exitosas como errores de servidor.
- Al corregirse a 2xx: revertir `linkSuccessStatuses` en `tests/features/gateway-pg/data/` (fuente única), el assert de `expectLinkStatusOk`, y la nota de `matriz_cases.md` TS-AUTHORIZE-TC1008 (TODO revert documentado en ambos).

## DB Queries

- N/A (comportamiento observable por HTTP status; el estado vinculado se verifica por UI/API del App Store).
