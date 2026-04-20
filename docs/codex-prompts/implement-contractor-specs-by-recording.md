# Codex Task — Implementar specs contractor a partir de grabaciones

## Instruccion de trabajo

Este prompt se usa para avanzar el portal contractor web como foco activo del repositorio.
Procesar una etapa a la vez y no inventar selectors, rutas o assertions sin evidencia.

Si un flujo contractor no tiene contexto suficiente, pedir primero el `.recorded.ts` correspondiente desde VS Code / Playwright Recorder y usarlo como evidencia primaria para reconstruir selectores, secuencia de interaccion y comportamiento observado.

---

## Memoria — guardar al iniciar

```text
TAREA: implement-contractor-specs-by-recording
ESTADO: en_progreso
ETAPA_ACTUAL: 1
ETAPAS_COMPLETADAS: []
ETAPAS_PENDIENTES: [1]
SPECS_IMPLEMENTADAS: []
TSC_POR_ETAPA: {}
```

---

## Contexto del framework

- `tests/config/runtime.ts` es la fuente de verdad para `contractor`.
- `tests/pages/shared/LoginPage.ts` debe usarse para el bootstrap de login.
- `tests/pages/carrier/DashboardPage.ts` valida el shell web y sirve tambien para contractor cuando el runtime lo permita.
- `tests/features/gateway-pg/specs/stripe/web/contractor/vinculacion-tarjeta.spec.ts` es el entrypoint actual del portal contractor.
- `tests/pages/carrier/OperationalPreferencesPage.ts` es la pieza compartida para preparar `hold` desde carrier cuando un caso contractor lo necesita.
- `tests/pages/carrier/NewTravelPageBase.ts` y `tests/pages/carrier/NewTravelPage.ts` son la base compartida para el formulario de alta; contractor debe heredar esos contratos si el recording confirma el mismo shell.
- `tests/test-7.spec.ts` se toma como evidencia primaria de esta etapa para contractor: muestra logout de carrier, login contractor, vinculación de tarjeta, alta de viaje y challenge 3DS durante el flujo.
- En ese mismo recorder contractor aparece `Nuevo Viaje` despues del login, así que el shell contractor puede reutilizar el anchor y el formulario compartido de carrier cuando el runtime lo confirme.

**Reglas de trabajo**
- Reutilizar primero los contratos compartidos existentes.
- No crear una capa de contractor nueva si el flujo puede resolverse con las piezas actuales.
- Si el recording muestra un shell o anchor mejor que el actual, actualizar el contrato y el prompt en el mismo ciclo.
- Mantener separada cualquier cobertura mobile/App Driver; este prompt es solo para contractor web.
- Si el caso contractor depende de `hold`, preparar primero ese estado en carrier y dejarlo documentado como precondicion de la misma corrida.
- Para esta etapa, la tarjeta de evidencia es `4000 0027 6000 3184` ("Autenticar siempre"): si `hold` está activo, el alta de viaje debe disparar 3DS; si `hold` está inactivo, la ausencia de 3DS actúa como señal del estado.

---

## ETAPA 1 — Portal Contractor / Vinculacion de Tarjeta

**Archivo fuente esperado:** recordings de contractor web desde Playwright Recorder.

**Flujo minimo que debe quedar grabado**
- logout carrier si la sesión cacheada redirige al portal previo
- login contractor
- llegada al dashboard contractor
- vinculacion de tarjeta
- alta de viaje
- cierre del flujo

**Flujo carrier previo, si el caso depende de `hold`**
- activar `hold` en carrier para casos con hold
- desactivar `hold` en carrier para casos sin hold
- guardar la precondicion antes de entrar a contractor

**Spec objetivo**
- `tests/features/gateway-pg/specs/stripe/web/contractor/vinculacion-tarjeta.spec.ts`

**Cobertura esperada**
- `P2-TC001` a `P2-TC006`
- Tags: `@smoke @contractor @web-only`

**Instrucciones para implementacion**
1. Revisar el stub actual del spec contractor.
2. Si faltan recordings, pedirlos antes de implementar selectors o assertions.
3. Reemplazar `test.fixme()` solo cuando exista evidencia suficiente.
4. Reutilizar login, dashboard y contratos compartidos ya existentes.
5. Heredar el formulario de alta desde los POMs compartidos de carrier si el recording confirma el mismo shell y la misma secuencia.
6. Ejecutar `npx tsc --noEmit` al cerrar la etapa.

**Recordings que se deben pedir si no existen**
- contractor: login -> card linking -> alta de viaje
- carrier: toggle de hold activo/inactivo para la precondicion
- 3DS contractor: solo si el recording del flujo completo lo muestra de forma explicita

**Observaciones funcionales para validar**
- La presencia del challenge 3DS durante el alta de viaje es la señal operativa de que `hold` quedo activo.
- Si se usa la tarjeta `4000 0027 6000 3184` y no aparece 3DS en contractor, revisar primero la precondicion de `hold` en carrier antes de tocar el spec.
- El portal contractor puede abrir con cache/sesion del carrier; en ese caso el flujo de grabacion debe incluir el cierre de sesion previo o la limpieza equivalente antes del login contractor.

**No tocar**
- `tests/mobile/appium/**`
- `docs/codex-prompts/implement-driver-app-flow2.md` mientras siga pausado
- `main` branch

---

## Criterio de cierre

La etapa se considera lista cuando:
- el spec contractor deja de estar en `fixme` para los casos con evidencia disponible,
- la trazabilidad TC -> spec queda clara,
- y `npx tsc --noEmit` pasa sin errores.
