# Contrato de Agentes de MAGIIS

## Propósito
Contrato compartido del repositorio para agentes e IDEs. Antigravity, Gemini, Codex u otras herramientas deben leer este archivo primero para tener una visión concisa del proyecto sin necesidad del historial completo de la conversación.

## Fuente de la Verdad
- `CLAUDE.md` define el contrato del repositorio.
- `docs/reference/ai-tools-guide.md` define el enrutamiento y el proceso de inicio (bootstrapping).
- `docs/codex-prompts/README.md` define el gobierno y precedencia de los prompts.
- `docs/gateway-pg/stripe/ARCHITECTURE.md` define la estructura canónica de Gateway PG.
- `tests/coverage/` almacena la documentación de cobertura de Stripe / Gateway PG.
- `tests/features/gateway-pg/recorded/**` almacena las trazas del grabador de Playwright que actúan como evidencia de interacción y selectores para los borradores.

## Stack Actual
- Antigravity: administración de sesiones y orquestación de múltiples pasos del repositorio.
- Gemini 3.1 Pro: análisis de contexto extenso, normalización de documentos, priorización del backlog y bootstrapping del contexto.
- Codex GPT-5.x: generación de código, refactors y ediciones dirigidas a archivos.
- Claude Sonnet 4.6: razonamiento opcional de segunda pasada para compensaciones difíciles (tradeoffs).
- Claude Code: respaldo opcional, únicamente si está disponible en otro espacio de trabajo.

## Mapa de Agentes a Modelos
| Agente | Modelo | Razón |
| --- | --- | --- |
| `playwright-docs-orchestrator` | Gemini 3.1 Pro |  Inicia el contexto de la sesión, lee documentos extensos y arma la primera pasada de normalización. |
| `qa-doc-analyst` | Gemini 3.1 Pro | Mejor opción para matrices extensas, extracción de documentos, normalización y entrada dependiente de trazabilidad. |
| `critical-flow-prioritizer` | Gemini 3.1 Pro | Recibe el input normalizado y clasifica los flujos / elementos del backlog evaluando el contexto general. |
| `playwright-draft-generator` | Codex GPT-5.x | La mejor opción para escribir borradores de Playwright/TypeScript, reuso de POM y generación de código apuntada. |
| `appium-hybrid-collaborator` | Codex GPT-5.x | También enfocado a implementación, pero para flujos móviles/Appium y borradores conscientes del intercambio de entorno (handoff). |

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
