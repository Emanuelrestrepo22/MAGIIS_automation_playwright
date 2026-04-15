# Prompt Governance

## Objetivo
Mantener a Antigravity, Gemini, Codex y Claude Code alineados al mismo objetivo del proyecto, sin ambiguedades entre documentos.

## Orden de precedencia documental
Si hay conflicto entre documentos, aplicar este orden:

1. Instrucciones de sistema y de ejecucion del entorno (runtime).
2. `CLAUDE.md` (reglas operativas del repositorio).
3. `AGENTS.md` (contrato neutral del repo para herramientas).
4. Prompts de tarea en `docs/codex-prompts/*.md`.
5. Arquitectura ejecutable de Gateway PG en `docs/gateway-pg/stripe/ARCHITECTURE.md`.
6. `GATEWAY_PG_ARCHITECTURE.md` solo como contexto historico/conceptual.

## Gemini bootstrap
Cuando se use Gemini Chat para una tarea de este repositorio:

1. Leer `AGENTS.md`.
2. Leer `CLAUDE.md`.
3. Leer `docs/reference/ai-tools-guide.md`.
4. Cargar el prompt de tarea y los documentos fuente relevantes.
5. Pedir salida normalizada o resumida antes de editar archivos.
6. Pasar el resultado normalizado a Codex solo para cambios concretos de codigo.

## Recorder-driven workflow
Si una implementacion Playwright tiene poco contexto o faltan selectores reales:

1. Pedir el archivo `.recorded.ts` correspondiente desde VS Code / Playwright Recorder.
2. Pasarlo primero por Gemini para normalizar pasos, pantallas y evidencia de interaccion.
3. Reintentar la implementacion con esa evidencia adicional.
4. Usar el recording como referencia para POMs, constructores y secuencia de acciones.
5. No inventar rutas, locators ni assertions si el recording no las muestra.

## Mapa canonico del repo (resumen operativo)

- Specs fuente (implementacion): `tests/features/gateway-pg/specs/stripe/**`
- Specs wrapper (ejecucion config gateway): `tests/specs/gateway-pg/stripe/**`
- POMs web canonicos: `tests/pages/shared/**` y `tests/pages/carrier/**`
- Data canonica de gateway: `tests/features/gateway-pg/data/**`
- Appium canonico: `tests/mobile/appium/**`

## Regla de no ambiguedad
Cada cambio relevante en estructura o flujo debe mantener coherencia entre:

- Prompt de tarea (`docs/codex-prompts`)
- Contrato de agentes (`AGENTS.md`)
- Documento de arquitectura activa
- Configuracion de ejecucion (`playwright*.config.ts`, scripts de `package.json`)

No se considera terminado un cambio si el codigo y los `.md` quedaron desalineados.

## Checklist obligatorio por tarea

1. Identificar documento canonico aplicable.
2. Implementar codigo siguiendo ese documento.
3. Ejecutar validaciones minimas:
   - `npx tsc --noEmit`
   - `npx playwright test <scope> --list`
4. Si hubo cambios de rutas, tags, proyectos o convenciones:
   - actualizar el `.md` canonico en el mismo ciclo de trabajo
   - agregar nota de compatibilidad transitoria si aplica

## Convencion de estado en documentos
Todo documento de arquitectura debe declarar su estado:

- `CANONICAL`: fuente de verdad para implementacion y ejecucion.
- `LEGACY`: referencia historica; no define rutas ni reglas ejecutables.

## Ciclo de vida de arquitectura por Feature
Para evitar que los agentes confundan contextos al escalar la aplicacion, se adopta el siguiente ciclo iterativo:

1. **Desarrollo Activo:** El documento de arquitectura del feature en curso (`FEATURE_ARCHITECTURE.md`) vive en la raiz del proyecto (`/`) para dar prelacion a todos los agentes que aterricen en el espacio de trabajo.
2. **Cierre de Feature:** Una vez finalizada la implementacion y cobertura del feature, el documento **debe ser movido y archivado** en su directorio final bajo `docs/<feature>/`.
3. **Nueva Iteracion:** Al iniciar otra feature, la raiz estara limpia. El documento previo ya es `LEGACY`, evitando que los agentes arrastren reglas de negocio viejas hacia features nuevos.

## Mapa rapido de prompts activos

- `refactor-pom-centralization.md`: centralizacion de POMs.
- `implement-carrier-specs-by-recording.md`: implementacion de specs guiada por grabaciones.
- `implement-carrier-negative-specs.md`: cobertura de variantes y casos negativos.
- `implement-contractor-specs-by-recording.md`: implementacion de specs del portal contractor guiada por grabaciones.
- `implement-driver-app-flow2.md`: pausado / legado hasta reactivacion explicita.
- `implement-passenger-app-flow2.md`: lane activo para Passenger App, empezando por wallet, alta de viaje y trip status. Selectors ya validados: `Modo Personal`, `Compañía`, `Mi cuenta`, `Billetera`, `Origen`, `Destino`, `Seleccionar Vehiculo`, `Ahora`, `AGREGAR`, `GUARDAR`, y Stripe iframe `cardnumber`/`cc-exp-month`/`cc-exp-year`/`cc-csc`. Implementacion activa: `tests/mobile/appium/harness/PassengerTripHappyPathHarness.ts`, `tests/features/gateway-pg/data/passenger-personal-no3ds-scenarios.ts`, `tests/features/gateway-pg/data/passenger-flow2-scenarios.ts`, `tests/features/gateway-pg/data/passenger-business-scenarios.ts`, `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-no3ds.e2e.spec.ts`, `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-3ds.e2e.spec.ts`, `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-no3ds.e2e.spec.ts`, `tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-3ds.e2e.spec.ts`, y `docs/test-cases/mobile/TC-PASSENGER-FLOW.md`. Smoke recomendado: `pnpm mobile:passenger:profile-mode-smoke`; flujo completo personal 3DS + hold: `pnpm mobile:passenger:personal-3ds-hold-flow`.

## Recorder + runtime notes
- When a flow is blocked on login or dashboard bootstrap, verify `tests/config/runtime.ts`, `tests/pages/shared/LoginPage.ts`, and `tests/pages/carrier/DashboardPage.ts` before drafting new specs.
- For carrier and contractor, the shell check comes from the runtime pattern; do not assume `/dashboard` or `Nuevo Viaje` are valid for every role.
- For contractor portal web work, use the contractor role and keep the focus on `tests/features/gateway-pg/specs/stripe/contractor/**`.
- If the recording validates a better wait condition or anchor, refresh the prompt and the agent/skill contract in the same cycle.
