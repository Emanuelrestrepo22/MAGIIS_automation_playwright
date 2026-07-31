# DRAFT — Defecto de backend: el link de pasarela Authorize acepta credenciales INVÁLIDAS

> **Estado:** BORRADOR listo para filear · **NO creado en Jira**.
> **Scope:** en MG la gobernanza QA se limita a entidades Xray (`mg-scope-xray-only`), así que este
> hallazgo NO se abre en MG: destino **DEV/MX**, con autorización explícita del owner.
> **Hallado:** 2026-07-28, campaña exploratoria Authorize (Fase 6, ATP MG-178) · Ambiente: `test`
> (apps-test.magiis.com, carrier 1521 Remises EEUU).
> **SUPERSEDE al borrador anterior de este archivo** (Improvement por el quirk `500|409` del link):
> ese comportamiento **ya no reproduce** — el endpoint responde **200** con credenciales válidas, y
> el oráculo de `TS-AUTHORIZE-TC1008` volvió al AC original. El defecto real es el que sigue.

## Resumen

`POST /magiis-v0.2/vendor/authorize` **no valida las credenciales contra Authorize.Net**: acepta
cualquier `apiLoginId` / `transactionKey`, responde **200** y deja la pasarela **vinculada**. El
operador queda con una configuración que aparenta estar correcta y que fallará en todos los cobros.

## Pasos para reproducir

1. Loguearse en el portal Carrier (`apps-test.magiis.com`) con un carrier con Authorize disponible
   (probado: carrier 1521 · usuario dispatcher).
2. Ir a **MAGIIS Apps Store → Interfaces de pago** (`/#/home/carrier/integrations/list`).
3. Si Authorize.Net figura **Desvincular**, desvincularla primero (la card debe quedar en **Vincular**).
4. Click en **Vincular** de la card Authorize.Net.
5. Completar el modal con credenciales **claramente inválidas**, p. ej.
   `API Login ID = INVALID_LOGIN_QA` · `Transaction Key = INVALID_KEY_QA`.
6. Confirmar (**Continuar**).

## Resultado esperado

- Debería rechazar la vinculación con un **error controlado y visible** (el AC de matriz
  `TS-AUTHORIZE-TC1003` lo redacta como "mostrar error controlado sin activar el gateway"; el código
  de Authorize.Net para credenciales inválidas es **E00008 / Invalid authentication**).
- Debería **NO** activar la pasarela: la card debe permanecer en **Vincular**.

## Resultado obtenido

| Capa (trifuerza) | Observado |
|---|---|
| **API** | `POST /magiis-v0.2/vendor/authorize` → **200** (sin cuerpo de error) |
| **UI** | **Ningún** mensaje de error, toast ni validación — el modal cierra como si fuera exitoso |
| **Estado** | La card Authorize.Net pasa a **Desvincular** → la pasarela queda **VINCULADA** con credenciales basura |

Contraste que confirma la ausencia de validación: con credenciales **válidas** el mismo endpoint
responde también **200** — la respuesta es indistinguible del caso inválido.

## Evidencia

- Probe de red automatizado (campaña exploratoria, temporal bajo
  `tests/features/gateway-pg/specs/authorize/probe/`): log con `POST vendor/authorize -> 200` usando
  `INVALID_LOGIN_QA`/`INVALID_KEY_QA`, cero líneas de error en el texto de la página y
  `readState('authorize') = linked` posterior.
- El test automatizado **`TS-AUTHORIZE-TC1003`** (Xray **MG-221**, suite CFG del ATP MG-178) queda
  **FALLANDO a propósito**: su oráculo exige el error de autenticación y la no-activación. No se
  debilitó — revela este defecto. Ese rojo es la evidencia viva del bug.

## Impacto

- **Configuración falsamente exitosa**: el carrier cree tener la pasarela operativa; los cobros
  fallarán recién en runtime, con el viaje ya tomado (usuario final afectado).
- **Regla de exclusividad ocupada por una configuración inválida**: al quedar "vinculada", bloquea
  vincular otra pasarela válida hasta desvincularla.
- **Diagnóstico costoso**: sin error en el alta, el soporte no tiene señal de la causa.
- Ambiente `test` verificado; **presumible en producción** (mismo endpoint) → confirmar antes de cerrar.

## Severidad / Prioridad sugerida

**Severidad Major / Prioridad High** — no rompe el sistema, pero permite persistir una configuración
de cobro inválida sin señal alguna, y su síntoma aparece lejos de la causa.

## Notas para DEV

- La validación esperada es una llamada de verificación al PSP antes de persistir el vínculo
  (Authorize.Net expone `authenticateTestRequest` para exactamente esto).
- Al corregir: devolver un 4xx con el código/mensaje del PSP para que el FE muestre el error, y
  **no** persistir `MGWLinked`.
- Cuando esté corregido, `TS-AUTHORIZE-TC1003` (MG-221) pasa a verde **sin tocar el test**.

## Correcciones de documentación derivadas (ya aplicadas en el repo)

Dos afirmaciones del `HANDOFF-live-reconciliation-2026-07-24.md` §2 quedaron desmentidas por la
evidencia del 2026-07-28 y fueron corregidas en `data/link-status-defaults.ts` + el ATC `MG-226`:

| Afirmación previa | Evidencia 2026-07-28 |
|---|---|
| Endpoint del link = `odnService` (MG-476), "NO /vendor/" | Es **`POST vendor/authorize`** — única mutación del submit |
| Quirk de éxito = `500` (limpio) / `409` (ya vinculada) | Responde **200**; el quirk no reproduce |
