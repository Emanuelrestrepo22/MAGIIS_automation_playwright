---
name: magiis-appium-hybrid-e2e
description: Lee documentación QA en formato Excel, identifica las fases móviles en los viajes E2E híbridos y genera borradores de artefactos trazables para Appium Android que colaboran con la capa de automatización web de Playwright. Úsalo cuando un agente autónomo necesite convertir los casos de prueba provistos por Excel en cobertura de viaje para la app del driver/passenger, contratos de intercambio (handoff), planes de ejecución móviles o borradores Appium para flujos de pago web -> mobile en MAGIIS.
---

# Objetivo
Transformar documentos QA en propuestas (borradores) de artefactos de automatización Appium exclusivos para los viajes híbridos E2E (web hacia aplicación móvil).

# Cuándo NO invocar
- El documento fuente solo contiene casos de prueba exclusivos para la web sin involucrar fases móviles -> usa `magiis-playwright-docs-to-drafts`
- La labor trata puramente de la automatización Playwright sin presencia alguna de las aplicaciones de conductor (driver) o pasajero (passenger) -> usa `magiis-playwright-docs-to-drafts`
- Tareas funcionales para la creación de documentos QA estandarizados donde no se requiere salida codificada -> recurre al flujo documental propio del repositorio

# Entradas (Inputs)
Fuentes soportadas:
- `.xlsx` funciona como la base principal
- `.txt`
- `.docx`
- `.md`

# Comportamiento requerido
1. Extraer lecturas correspondientes del documento origen.
2. Identificar y segregar los procesos/pasos dirigidos a la parte web y a la móvil.
3. Cosechar a los actores móviles, los vínculos dependientes y las transmisiones de datos (handoff).
4. Normalizar la porción móvil adentrándose en el contrato actual de integración híbrida del proyecto.
5. Construir un andamiaje o marco de pruebas con Appium capaz de unificarse ordenadamente con el esqueleto Playwright. Evita clonarlo.
6. Mantener inalterable el rastro identificativo y dependencias (IDs) nacidas desde las fuentes.

# Actores móviles
- `driver`
- `passenger`

# Fases del viaje híbrido
- `web_setup`
- `web_trip_creation`
- `passenger_wallet_setup`
- `passenger_trip_creation`
- `driver_trip_acceptance`
- `driver_route_simulation`
- `driver_trip_completion`
- `payment_validation`

# Reglas de colaboración
- Asume categóricamente que Playwright dirige los arreglos primarios y evaluaciones de respuesta en el web setup.
- Asume con confianza que Appium ostenta la jerarquía de las aplicaciones móviles del lado del conductor y del pasajero en Android.
- Aprovecha los contratos estructurados del journey e intercambio.
- Siempre reutiliza las utilidades previas contenidas en la base principal y pantallas de Appium antes de arriesgar una propuesta desde cero.
- Nunca debes incorporar y fijar las dependencias locales estáticas para un `APK` local o URL en duro (hardcodeadas) para el servidor Appium.
- Integra a `appium-mcp` como la central suprema de inspección y descubrimientos a la hora de corroborar localizadores web y de pantalla nativa antes de imponer o "cablear" localizadores móviles de facto.

# Restricciones
- No apliques modificaciones ni apuntes a la rama `main`.
- Nunca presumas localizadores y variables lógicas si no se ven soportadas explícitamente en base a las capturas por el Appium Inspector.
- No conjetures que todos los formularios inyectados para el Stripe SDK asumen controles de visualización nativa.
- Evita zanjar las aprobaciones y validaciones del proceso de pago valiéndose meramente con la Interfaz de Usuario (UI) al transitar por validaciones vitales del backend o pasarelas de confirmación directa (API).
- Otorga prioridad a emitir los borradores antes que el código formal definitivo.

# Salidas esperadas
- `appium-mobile-backlog.md`
- `appium-handoff-map.json`
- `mobile-phase-coverage.json`
- Borradores o planes de ejecución bajo `appium`
- Bloqueos e incongruencias visualizadas `mobile`

# Orden de entrega
1. Resumen técnico o funcional del flujo híbrido móvil 
2. Relatividad (mapa) del empalme para pasar desde la lógica de Playwright hacia lo comandado en Appium (Handoff Map)
3. Un exhaustivo e individualizado backlog de la zona móvil con preeminencia prioritaria
4. Archivos borradores Appium correspondientes a capturas o scripts (specs y execution plans)
5. Alerta detallada contra riegos de la cadena de integración.

# Referencias para consulta intermitente (load on demand)
- `references/appium-implementation-rules.md`
- `references/appium-mcp-workflow.md`
- `references/hybrid-collaboration-contract.md`
- `references/output-contracts.md`

# Referencias del Repositorio
- `tests/shared/contracts/gateway-pg.ts`
- `tests/shared/orchestration/GatewayPgJourneyOrchestrator.ts`
- `tests/mobile/appium/base/AppiumSessionBase.ts`
- `tests/mobile/appium/config/appiumRuntime.ts`
- `tests/mobile/appium/config/appiumMcp.ts`
- `tests/mobile/appium/config/mobileRuntime.ts`
- `tests/mobile/appium/scripts/generateAppiumMcpConfig.mjs`
- `tests/mobile/appium/README.md`
- `tests/mobile/appium/driver/*`
- `tests/mobile/appium/passenger/*`
- `docs/gateway-pg/CONTEXT.md`
- `GATEWAY_PG_ARCHITECTURE.md`
- `docs/mobile/appium-mcp-integration.md`

## Bootstrap y mejora continua
- No empezar borradores Appium hasta que el lado web haya estabilizado el login y el dashboard role-aware, y haya persistido el storageState correcto.
- Si el handoff web cambia porque un recorder o una ejecucion valida un mejor shell o un mejor selector, actualizar el mapa de handoff antes de proponer screens mobile.
- Mantener `tests/config/runtime.ts` y el bootstrap web como precondicion del viaje hibrido; Appium debe continuar desde un contexto ya validado, no corregir un bootstrap roto.
