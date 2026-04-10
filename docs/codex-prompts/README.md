# Codex Prompt Governance

## Objetivo
Mantener a Codex y Claude Code alineados al mismo objetivo del proyecto, sin ambiguedades entre documentos.

## Orden de precedencia documental
Si hay conflicto entre documentos, aplicar este orden:

1. Instrucciones de sistema y de ejecucion del entorno (runtime).
2. `CLAUDE.md` (reglas operativas del repositorio).
3. Prompts de tarea en `docs/codex-prompts/*.md`.
4. Arquitectura ejecutable de Gateway PG en `docs/gateway-pg/stripe/ARCHITECTURE.md`.
5. `GATEWAY_PG_ARCHITECTURE.md` solo como contexto historico/conceptual.

## Mapa canonico del repo (resumen operativo)

- Specs fuente (implementacion): `tests/features/gateway-pg/specs/stripe/**`
- Specs wrapper (ejecucion config gateway): `tests/specs/gateway-pg/stripe/**`
- POMs web canonicos: `tests/pages/shared/**` y `tests/pages/carrier/**`
- Data canonica de gateway: `tests/features/gateway-pg/data/**`
- Appium canonico: `tests/mobile/appium/**`

## Regla de no ambiguedad
Cada cambio relevante en estructura o flujo debe mantener coherencia entre:

- Prompt de tarea (`docs/codex-prompts`)
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

## Mapa rapido de prompts activos

- `refactor-pom-centralization.md`: centralizacion de POMs.
- `implement-carrier-specs-by-recording.md`: implementacion de specs guiada por grabaciones.
- `implement-carrier-negative-specs.md`: cobertura de variantes y casos negativos.
