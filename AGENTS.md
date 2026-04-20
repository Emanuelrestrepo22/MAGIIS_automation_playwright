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
  - Foco activo: portal contractor web, empezando por `tests/features/gateway-pg/specs/stripe/web/contractor/vinculacion-tarjeta.spec.ts`.
- El frente `Passenger App` ya tiene lane activo bajo `docs/codex-prompts/implement-passenger-app-flow2.md` y `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-3ds.e2e.spec.ts`.
- Antes de cualquier flujo de Passenger, validar el home mode con `pnpm mobile:passenger:profile-mode-smoke`; el label bajo el `ion-toggle` decide si el lane es `personal` o `business`.
- Para Passenger personal con hold + 3DS, el runner canónico es `pnpm mobile:passenger:personal-3ds-hold-flow`; para Passenger business sin 3DS, usar `pnpm mobile:passenger:business-no3ds-hold-flow`.
- En wallet de Passenger, la tarjeta principal se cambia desde `button.card-item-opts` y el popover visible expone `Principal` / `Eliminar`; no asumir acciones de star ocultas sin evidencia.
- El frente `App Driver` queda pausado hasta nueva reactivación explícita.
- Si una tarea mezcla contractor y driver, implementar primero contractor web y tratar driver como legado temporal.

## Mapa de Agentes a Modelos

| Agente | Modelo | Función |
| --- | --- | --- |
| `orquestador` | Gemini 3.1 Pro | Inicia el contexto de la sesión, lee documentos extensos y arma la primera pasada de normalización. |
| `analista-docs` | Gemini 3.1 Pro | Matrices extensas, extracción de documentos, normalización y entrada dependiente de trazabilidad. |
| `priorizador-flujos` | Gemini 3.1 Pro | Recibe el input normalizado y clasifica los flujos / elementos del backlog evaluando el contexto general. |
| `generador-drafts` | Codex GPT-5.x / Claude Code / Gemini 3.1 Pro | Borradores Playwright/TypeScript, reuso de POM y generación de código dirigida. |
| `colaborador-appium` | Codex GPT-5.x / Claude Code / Gemini 3.1 Pro | Flujos móviles/Appium y borradores conscientes del handoff web→mobile. |

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
- `NewTravelPageBase.selectCardByLast4()` ahora incluye `clickValidateCard()` al final. Specs que usen ese método NO deben llamarlo por separado; hacerlo duplica el click y puede romper el flujo 3DS.
- Con cliente `appPax`, el campo `#passenger` recibe `ng-reflect-is-disabled="true"` (auto-asignado). Nunca llamar `selectPassenger` cuando ese atributo está presente. `fillMinimum` ya maneja esto internamente.
- `playwright.gateway-pg.config.ts` apunta a `tests/features/gateway-pg/specs/stripe` (no `tests/specs/`). Los proxies en `tests/specs/` están obsoletos — no se ejecutan con la config de gateway.
- Si el backend devuelve `?limitExceeded=false` al crear un viaje, es un problema de datos de entorno (pasajero sin tarjeta Cargo a Bordo activa o límite bloqueado). Usar `Promise.race` para capturarlo con mensaje de precondición en lugar de dejar que el test haga timeout.
- `DriverTripPaymentScreen` (TC1082–TC1121 fase Driver App) está en `tests/mobile/appium/driver/DriverTripPaymentScreen.ts`. Expone `fillAndSubmit(card)`, `handle3DSChallenge(action)` y `waitForPaymentOutcome()`. Selectores marcados con TODO — confirmar con Appium Inspector en pantalla de cobro Stripe del Driver App.
- El locator `SuperPage.newTravelLink` no debe usar `.or()` compuesto — Playwright strict mode lo rechaza si ambas ramas resuelven elementos. Usar `resolveNewTravelLink()` con `.isVisible()` por candidato separado y fallback al bannerLink con `.first()`.
- `global-setup.multi-role.ts` debe validar el dashboard con predicado `url.href.includes("/home") && url.href.includes("dashboard")` (no pattern string) para matchear correctamente `#/home/carrier/dashboard`.

## Bloqueadores de Ambiente (NO son bugs de código)

| Bloqueador | Ambiente | Usuario/Cliente | TCs afectados | Causa | Acción requerida |
| --- | --- | --- | --- | --- | --- |
| `limitExceeded=false` | TEST | Emanuel Restrepo | TC1013, TC1025 (Passenger App E2E) | Pasajero sin tarjeta Cargo a Bordo activa O excedió límite de crédito en Stripe | Admin debe activar tarjeta de pago del cliente o resetear límite en Stripe test account |
| `waitForEnabledButton` timeout (45s en vehicleButton) | TEST | Colaborador / Empresa (appPax) | TC1025 (business no-3DS), TC1013 (personal 3DS) | Datos del cliente mal provisioned en TEST, o el pasajero no tiene permisos para crear viajes | Admin debe validar provisioning del passenger en TEST: perfiles habilitados, tarjeta Cargo a Bordo activa, límites configurados |

**Indicadores de diagnóstico:**
- Revisar la respuesta de `POST /api/v1/journey/create`: si contiene `?limitExceeded=false`, es el bloqueador de límite.
- Si `waitForEnabledButton` hace timeout, revisar consola/network: `400 Bad Request` en journeys → problema de datos del cliente, no de test/selectores.
- NO modificar specs ni aumentar timeouts si el bloqueador es de ambiente; crear un issue de ENV / Jira de admin.

**Nota de Emanuel:** LC no debe ser interpretada como bug de tests. Es síntoma de que el cliente no está listo para E2E en TEST. Cada nuevo usuario requiere setup previo.
