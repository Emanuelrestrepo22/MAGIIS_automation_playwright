# Contrato de Agentes de MAGIIS

## Propósito
Contrato compartido del repositorio para agentes e IDEs. Antigravity, Gemini, Codex u otras herramientas deben leer este archivo primero para tener una visión concisa del proyecto sin necesidad del historial completo de la conversación.

## Fuente de la Verdad
- `CLAUDE.md` define el contrato del repositorio.
- `docs/reference/ai-tools-guide.md` define el enrutamiento y el proceso de inicio (bootstrapping).
- `docs/codex-prompts/README.md` define el gobierno y precedencia de los prompts.
- `docs/gateway-pg/stripe/ARCHITECTURE.md` define la estructura canónica de Gateway PG.
- `tests/config/runtime.ts` y `global-setup.multi-role.ts` definen el bootstrap role-aware y los patrones de dashboard por rol.
- `tests/config/aiRuntime.ts` y `tests/shared/utils/geminiClient.ts` definen el runtime compartido de Gemini y la resolución de la API key.
- `tests/coverage/` almacena la documentación de cobertura de Stripe / Gateway PG.
- `docs/codex-prompts/implement-contractor-specs-by-recording.md` define el flujo activo de contractor web guiado por recordings.
- `tests/features/gateway-pg/recorded/**` almacena las trazas del grabador de Playwright que actúan como evidencia de interacción y selectores para los borradores.

## Stack Actual
- Antigravity: administración de sesiones y orquestación de múltiples pasos del repositorio.
- Gemini 3.1 Pro: análisis de contexto extenso, normalización de documentos, priorización del backlog y bootstrapping del contexto.
- Codex GPT-5.x: generación de código, refactors y ediciones dirigidas a archivos.
- Claude Sonnet 4.6: razonamiento opcional de segunda pasada para compensaciones difíciles (tradeoffs).
- Claude Code: respaldo opcional, únicamente si está disponible en otro espacio de trabajo.
- Gemini API runtime: `tests/config/aiRuntime.ts` resuelve `GEMINI_API_KEY` con fallback a `AI_STUDIO_GEMINI_MAGIIS`, y `tests/shared/utils/geminiClient.ts` centraliza las llamadas REST al modelo.

## Prioridad actual
- Foco activo: portal contractor web, empezando por `tests/features/gateway-pg/specs/stripe/contractor/vinculacion-tarjeta.spec.ts`.
- El frente `App Driver` queda pausado hasta nueva reactivación explícita.
- Si una tarea mezcla contractor y driver, implementar primero contractor web y tratar driver como legado temporal.

## Mapa de Agentes a Modelos

| Agente | Modelo | Función |
| --- | --- | --- |
| `orquestador` | Gemini 3.1 Pro | Inicia el contexto de la sesión, lee documentos extensos y arma la primera pasada de normalización. |
| `analista-docs` | Gemini 3.1 Pro | Matrices extensas, extracción de documentos, normalización y entrada dependiente de trazabilidad. |
| `priorizador-flujos` | Gemini 3.1 Pro | Recibe el input normalizado y clasifica los flujos / elementos del backlog evaluando el contexto general. |
| `generador-drafts` | Codex GPT-5.x | Borradores Playwright/TypeScript, reuso de POM y generación de código dirigida. |
| `colaborador-appium` | Codex GPT-5.x | Flujos móviles/Appium y borradores conscientes del handoff web→mobile. |

## Gemini Runtime
- Preferir `GEMINI_API_KEY` como variable estándar cuando una herramienta o runner ya lo soporte.
- Si el entorno expone `AI_STUDIO_GEMINI_MAGIIS`, `tests/config/aiRuntime.ts` lo toma como alias local y lo espeja a `GEMINI_API_KEY` para el proceso actual.
- Usar `tests/shared/utils/geminiClient.ts` como punto único para llamadas al API de Gemini en código del repositorio.
- Mantener `docs/reference/ai-tools-guide.md` y `docs/codex-prompts/README.md` sincronizados con este contrato.

## Reglas de Trabajo
- Mantener el análisis de documentación separado de la generación de código.
- Preservar la trazabilidad desde el caso de origen (ID) hacia el spec, page object, fixture y fila de cobertura.
- Reutilizar POMs, selectores, fixtures, utilidades y contratos compartidos existentes primero.
- No inventar selectores, localizadores, credenciales o casos de prueba sin evidencia.
- Cuando existan trazas de grabación, solicitarlas antes de generar selectores o constructores.
- Mantener separada la cobertura web de la cobertura móvil.
- Preferir prompts pequeños y alcances reducidos al trabajar con un agente.

## Bootstrapping de la Sesión
1. Empezar leyendo `AGENTS.md`.
2. Leer `CLAUDE.md` para las reglas detalladas del proyecto.
3. Leer `docs/reference/ai-tools-guide.md` para el enrutamiento.
4. Cargar el prompt de la tarea y solo la documentación fuente necesaria.
5. Pedirle a Gemini la salida normalizada antes de editar cualquier cosa.

## Mapa del Repositorio
- Specs web: `tests/features/gateway-pg/specs/stripe/**`
- Specs wrapper: `tests/specs/gateway-pg/stripe/**`
- POMs web canónicos: `tests/pages/shared/**` y `tests/pages/carrier/**`
- Appium: `tests/mobile/appium/**`
- Documentación de cobertura: `tests/coverage/**`

## Aprendizajes de bootstrap
- Para carrier y contractor, `tests/config/runtime.ts` define `loginPath` y `dashboardPattern`. No hardcodear `/dashboard` si el rol ya expone un patron estable.
- `tests/pages/shared/LoginPage.ts` ya valida el formulario con `domcontentloaded`; si el login falla por carga lenta, revisar primero ese bootstrap antes de tocar specs.
- `tests/pages/carrier/DashboardPage.ts` es una validacion compartida del shell web; el CTA `Nuevo Viaje` sirve como ancla carrier, pero no debe forzarse en contractor si la UI no lo expone.
- `global-setup.multi-role.ts` debe confirmar el dashboard con el patron del runtime antes de persistir storageState.
- `tests/config/aiRuntime.ts` debe ser la fuente de verdad para resolver claves Gemini cuando se automatice el bootstrap de agentes o prompts desde el repo.
- Para contractor, cualquier caso que dependa de `hold` debe preconfigurarse desde carrier antes de ejecutar el portal contractor; contractor no debe asumir que puede mutar ese estado por si mismo.
- Cuando un flujo contractor necesite nuevo contexto visual o selectores, pedir el recording completo del recorrido login -> vinculacion de tarjeta -> alta de viaje antes de inventar aliases o herencias de POM.
- `tests/test-7.spec.ts` deja como evidencia que `4000 0027 6000 3184` dispara challenge 3DS y que la ausencia de ese challenge, con la misma tarjeta, es una señal de `hold` desactivado.
- Si el portal contractor abre sobre la sesion cacheada del carrier, el flujo de grabacion debe incluir logout/limpieza antes del login contractor.
- El mismo recorder contractor muestra `Nuevo Viaje` en el shell post-login, así que el dashboard compartido y el formulario de alta pueden reutilizarse con carrier cuando el runtime lo confirme.
- Cuando una ejecucion valida una mejor ruta, actualizar `AGENTS.md`, `docs/reference/ai-tools-guide.md` y la skill/prompt que la consume en el mismo ciclo.
