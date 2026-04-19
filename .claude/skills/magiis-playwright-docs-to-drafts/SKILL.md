---
name: magiis-playwright-docs-to-drafts
description: Analiza la documentación técnica de QA de formatos excel, txt, docx y markdown para identificar flujos críticos organizando todo de mayor a menor jerarquía. Produce trazas fiables con un pipeline funcional completo con Playwright en su modalidad de borradores y recarga el documento de control del reporte QA cuando abarca matrices manuales ligadas al alcance de Stripe o el Gateway PG. Se trata de la canalización canónica fundamental de repositorios desde los documentos QA hasta el espectro de borrador técnico con Playwright.
---

# Objetivo
Transformar el tejido textual de los documentos elaborados de QA y encadenarlos unificados como automatizaciones generadas a través de borradores convalidados de Playwright en una arquitectura de ejecución única (pipeline).

Esta constituye la habilidad central canoníca "docs-to-drafts" que maneja íntegramente las entrañas de este repositorio.
Debes accionarlo de entrada siempre que resulte inminente derivar la formulación estática en QA hacia su correspondiente representación para la fase Backlog de Automatización o como constancia final general del `Coverage`.

# Cuándo Invocar
- El usuario provee o vincula un documento base funcional de QA (`.xlsx`, `.txt`, `.docx`, `.md`) para requerir que de ese andamiaje germines y estipules las ejecuciones prácticas automatizadas correspondientes.
- El usuario solicita desgranar casos de pruebas en bloque, priorizar los de alto riesgo/negocio, y asentar la ruta de automatización al trazar la línea crítica para el equipo técnico.
- Se encomienda constatar y reajustar los borradores formulados emanados de este skill (validaciones posteriores).
- Si el usuario persigue forzar una actualización integral a nivel de cobertura (`Coverage`) usando el histórico de matrices de pruebas dedicadas a Stripe/Gateway PG.
- El usuario proporciona alguna evidencia originada como prueba estática de grabadoras (`.recorded.ts` como en Playwright Recorder) que es un activo irreemplazable para la recolección exhaustiva e identificativa, las acciones o la red correlativa del interfaz pre-borrado (pre-drafting).

# Cuándo NO invocar
- El usuario se enfoca íntegramente de reparar (fixing), probar (running) o encontrar vacíos funcionales o lógicos en automatizaciones vigentes consolidadas de Playwright -> usa el workflow de mantenimiento directo que provee Playwright.
- Cuando la demanda de especificación de Playwright deba arrancar "desde cero" (scratch) y carece radicalmente del pilar normativo (documentos) que valide dicho actuar -> usa el workflow de mantenimiento directo de Playwright.
- El objetivo remita directa y profundamente a las bifurcaciones y ecosistemas móviles (Appium Flows) en Android -> recae en el skill afín: `magiis-appium-hybrid-e2e`.
- Cuando se requiere de la reescritura u ordenación específica aplicable exclusivamente al formato interno en formato Excel -> convoca `xlsx`.

# Entradas (Inputs)
Plataforma y ficheros fuente preferentes:
- `.xlsx` - Prioritario en escalabilidad
- `.txt`
- `.docx`
- `.md`
- `.recorded.ts` - Refuerzo excepcional u ordinario ante el declive e inconsistencia presente en reportes de evidencia con selectores a ratificar.

# Propiedad del Pipeline
Esta skill canaliza bajo su propia supervisión la invocación en fila a los grandes peritos analistas:
- `qa-doc-analyst` - aísla la carga masiva y formatea equitativamente su valor en los casos de uso originales
- `critical-flow-prioritizer` - jerarquiza ininterrumpidamente las ramas evaluando rigurosamente su coste comercial (Business Impact) frente a un mal paso técnico
- `playwright-draft-generator` - propulsa al marco normativo TypeScript asumiendo toda su infraestructura y la consolidación de moldes subyacentes POMs y fixtures
- Creador general de Cobertura (Coverage) - reinicia automáticamente su valor bajo `tests/coverage/` en el acople documentario ligado a la métrica Stripe o matriz general Gateway PG 
- Auto-review (Auto-revisión en línea) - escaneo del resultado orgánico directo y frontal; carece de perito intermedio de especialización ya que recae directamente a nivel de las bases constitutivas elementales en esta misma skill

# Comportamiento requerido
1. Ejecuta primero un mapeado global del contenido de los documentos de entrada.
2. Filtra minuciosamente la raíz principal separándola de precondiciones y reglas satélites.
3. Trasládalo a una anatomía genérica y estructurada ("Normalization").
4. Realiza saltos para encontrar líneas de "Críticos absolutos".
5. Clasifica en la jerarquía las prioridades por el sesgo en el riesgo de impacto de negocio o caída de sistemas de tecnología base (Prioritizing).
6. Construye un espectro visual sólido entregando en su orden:
   - Los tests catalogados y emulados a formato JSON (normalized test cases)
   - Patrón de criticidades funcionales puras
   - Su pertinente mapa temporal de rezago laboral pre-autorizado o "backlog"
   - Cielos exploratorios y de test codificado Playwright Spec sin compromiso oficial
7. En el preciso momento en el que converja simultáneamente el apunte QA sin soporte real suficiente (document gaps) estando adjuntada la correlación o derivado natural en grabadora visual (`.recorded.ts`), analiza, depura y reconfigura tu arquitectura usando su estampa fehaciente extraída por la UI antes del asalto e intentos pre-desarrollo (pre-drafts).
8. Tratando la red transaccional para pasarelas en Stripe o su similar en Gateway PG debes recargar simultáneamente su trazo (coverage files) encuadrado hacia `tests/coverage/`.
9. Exige al código y toda red conectiva que no deje diluir la identidad rastreable de las claves de documento original en sus IDs únicos funcionales.
10. Refrenda todos y cada uno del set preliminar frente al muro de retención del Auto-Revisor o bloque inyectado como "# Fase de validación en automático". 
   Evitar colapsos - Enciende una luz roja visible negando la continuidad ante flagrantes imperfecciones, enviándolos al control manual explícito insertado dentro del registro: `auto-review-report`.

# Modelo de prioridades
P1:
- Accesos, log in e inicios autorizados de sesión (auth)
- Nómadas de gateway / reservas directas y wallet / la red transaccional hold off/on / derivado al modal 3DS y ciclos funcionales de cargo asimilado (charge)

P2:
- Barras de control (navbar) / verificaciones primarias elementales (smoke portal)
- Recaída funcional reincidente temporal ligada a reportes pasados sobre el resarcimiento (Historical bug regression).

Dada su vital y peculiar carga en Stripe se readecúa con prelación a su favor el abanico para concentrar la atención hacia el Gateway general, balance interior sobre las billeteras, procesos retenidos en espera sin asestar (Hold On / Hold Off), desafíos para blindajes anti-pagos cruzados como el desafío 3D (3DS) finalizando en cierres consolidados o declinaciones por cargo de tarjeta estricto (charge).

# Restricciones
- Inhibición radical a fusionar o comprometer envíos directos de redacción a la rama fundamental local `main`.
- Las rutinas deberán someterse a ramas exclusivas satélites de desarrollo o variables `feature branches`.
- Ningún selector funcional debe ser hipotético, carente de arraigo funcional del modelo objeto.
- Denegada e impedida en su totalidad toda integración oculta de credenciales en duros al repositorio (no hardcoding).
- No dispares tu rutina sin avisos si los resultados concluyen de plano una etapa "Productiva Lista a Unir -Merge-" sin fase de validación técnica posterior. Todo recae primariamente en "Borrador de Borradores" (Drafts first).

# Reglas de Trazabilidad y Anti-Ambigüedad (OBLIGATORIAS)

> Estas reglas son la raíz del proyecto. A escala de miles de TCs, el orden aquí es lo que permite filtrar, diagnosticar y evitar duplicados. Cualquier draft generado por este pipeline DEBE cumplirlas antes de proponer merge.

## Regla 1 — Trazabilidad TC → matriz → spec → xlsx → reportes

Todo TC automatizado o documentado en cualquier parte del repo debe tener su **ID canónico** definido en `docs/gateway-pg/stripe/matriz_cases.md` o `matriz_cases2.md`.

**Cadena obligatoria:**

```
matriz_cases.md (fuente)
  ↓ mismo ID
normalized-test-cases.json (estructura ejecutable)
  ↓ mismo ID
tests/features/**/*.spec.ts (describe con ID entre [brackets])
  ↓ mismo ID
STRIPE_Test_Suite_Matriz_Sincronizado.xlsx (reporte operacional)
  ↓ mismo ID
evidence/test/junit.xml (reporte CI) → GitLab pipeline Tests tab
```

**Prohibido:**
- Inventar IDs (`P2-TC003`, `TC-NEW-01`) sin crearlos primero en la matriz.
- Usar un ID en spec sin que exista en `normalized-test-cases.json`.
- Dejar specs con `[SIN-ID-MATRIZ]` en rama principal (solo toleran en draft temporal).

**Verificación antes de commit:**

```bash
grep "TS-STRIPE-TC1057" docs/gateway-pg/stripe/matriz_cases.md
grep "TS-STRIPE-TC1057" docs/gateway-pg/stripe/normalized-test-cases.json
```

## Regla 2 — Coherencia sección ↔ descripción (no ambigüedad por contexto)

Cada TC vive dentro de una sección `## N. Título` de la matriz. La descripción del TC debe ser coherente con el título de su sección.

| Sección dice | Descripción debe contener | Prohibido en esa sección |
|---|---|---|
| `Alta de Viaje desde App Pax` | `"desde app pax"` | `"Alta carrier"`, `"desde carrier"`, `"desde contractor"` |
| `Alta de Viaje desde Carrier` | `"Alta carrier"` o `"desde carrier"` | `"desde app pax"`, `"desde contractor"` |
| `Alta de Viaje ... Contractor` / `Portal Contractor` | `"desde contractor"` o `"portal contractor"` | `"desde app pax"`, `"desde carrier"` |
| `Usuario Personal` | `"usuario personal"` | otros roles |
| `Usuario Business` / `Colaborador` | `"business"` o `"colaborador"` | `"personal"` |
| `Usuario Empresa Individuo` | `"empresa individuo"` o `"empresa"` | otros roles |
| `Cargo a Bordo` | `"cargo a bordo"` | `"hold desde alta"` como flujo principal |
| `Viajes Recurrentes` | `"recurrente"` | otros patrones |

Si la descripción contradice la sección, **mover el TC**, NO deformar la descripción.

## Regla 3 — Parámetros diferenciadores obligatorios (ejes de decision table)

Para que dos TCs NO sean duplicados semánticos, cada uno debe diferenciarse por al menos una de estas dimensiones:

| Eje | Dimensión | Valores posibles |
|---|---|---|
| 1 | **Portal** (origen) | App Pax / Carrier / Contractor / App Driver |
| 2 | **Tipo de usuario** | Personal / Business / Colaborador / Empresa Individuo |
| 3 | **Tarjeta** | 4242 (sin 3DS) / 3155 (3DS éxito) / 9235 (3DS fail) / 9995 (fondos insuf.) / 1629 (declined post-auth) |
| 4 | **Hold** | ON / OFF |
| 5 | **Flujo cargo** | Preautorizada+AppDriver / Cargo a Bordo / Recurrente / Clonación / Edición / Reactivación |
| 6 | **Flujo tarjeta** | Vincular nueva / Usar vinculada existente |

Dos TCs con los mismos 6 ejes = duplicado. Consolidar en uno, marcar el otro como alias deprecated.

## Regla 4 — Anti-duplicación pares card-flow

Cuando un TC describe un flujo de pago con tarjeta, **obligatorio** especificar si es:
- **Vincular tarjeta nueva** (pasa por Stripe form + posible 3DS)
- **Usar tarjeta vinculada existente** (selecciona de wallet, salta el form)

Ejemplo correcto:
```
TS-STRIPE-TC1017 — ...con Tarjeta Preautorizada Hold ON — Vincular tarjeta nueva
TS-STRIPE-TC1019 — ...con Tarjeta Preautorizada Hold ON — Usar tarjeta vinculada existente
```

Ejemplo prohibido (ambiguo):
```
TS-STRIPE-TC1017 — ...con Tarjeta Preautorizada Hold ON
```

## Regla 5 — Workflow obligatorio al agregar un TC nuevo

Orden estricto. Saltar pasos = romper trazabilidad.

1. Identificar sección destino en `matriz_cases.md` o `matriz_cases2.md` según Regla 2.
2. Asignar ID consecutivo disponible (buscar último usado + 1).
3. Redactar descripción cumpliendo Regla 2 + Regla 3 (todos los parámetros diferenciadores explícitos).
4. Verificar anti-duplicación (Regla 3, Regla 4).
5. Agregar fila al `.md` correspondiente.
6. Regenerar `normalized-test-cases.json` (`scripts/ai/matriz-coherencia/sync-json.py`).
7. Sincronizar xlsx (`scripts/ai/matriz-coherencia/sync-xlsx.py`).
8. Si hay spec, agregar `describe('[TS-STRIPE-TCxxxx] ...')` con el ID exacto.
9. Validar: `npx tsc --noEmit` + `grep "TS-STRIPE-TCxxxx" docs/gateway-pg/stripe/normalized-test-cases.json`.
10. Commit siguiendo `magiis-branch-convention`: `feat(<scope>): [TS-STRIPE-TCxxxx] descripción`.

## Regla 6 — Casos especiales

### Aliases deprecated
- Mantener como alias con marca: `DEPRECATED — duplicado redundante de TS-STRIPE-TCxxxx`.
- Usar `test.skip()` en specs para que no se ejecuten pero sí aparezcan en pipeline Tests tab.

### Fuera-de-sección
- NO deformar descripción para forzar encaje.
- SÍ crear sección nueva o mover TC a sección correcta.
- Marcar con flag `fuera-de-seccion` hasta resolución.

### `[SIN-ID-MATRIZ]` temporal
Permitido solo en:
- Drafts en rama feature (no merged).
- Specs que documentan un flujo nuevo mientras se negocia el ID canónico.

Debe convertirse a ID real **antes** del merge a `main`.

## Regla 7 — Herramientas de verificación

- `docs/gateway-pg/stripe/AUDIT-REPORT.md` — auditoría vigente de coherencia.
- `docs/gateway-pg/stripe/TRACEABILITY.md` — mapa TC → sección → spec → xlsx row.
- `docs/gateway-pg/stripe/CHANGELOG.md` — historial de correcciones aplicadas a la matriz.
- `scripts/ai/matriz-coherencia/audit.py` — regenerar auditoría ad hoc.
- `scripts/ai/matriz-coherencia/sync-*.py` — scripts de sincronización.

## Regla 8 — Técnicas QA formales (ya aplicadas en Stripe, referencia para features futuras)

Para el dominio Stripe, estas técnicas ya están aplicadas en `tests/coverage/` — no regenerar. Para features NUEVAS (no-Stripe) aplicarlas ANTES de escribir matriz:

- **Decision table:** cada combinación de los 6 ejes (Regla 3) = 1 TC único. Gaps = falta cobertura.
- **Particiones equivalentes:** agrupar inputs por comportamiento esperado.
- **Valores límite:** identificar tarjetas de borde (rechazo, 3DS, decline post-auth).

Documentar la decision table por feature en `docs/<feature>/coverage-manifest.md`.

## Regla 9 — Errores conocidos corregidos (ver CHANGELOG)

Lista histórica de correcciones aplicadas a la matriz. Detalle completo en `docs/gateway-pg/stripe/CHANGELOG.md`:

- **TC1009**: redundancia `"desde app pax desde app pax"` → `"desde app pax"`.
- **TC1011/TC1012/TC1016**: `"Alta carrier"` en sección "desde App Pax" → `"Alta de Viaje desde app pax"`.
- **P2-TC082/P2-TC083**: descripción `"Clonación"` en sección "Edición de Viajes Programados" → `"Edición de viaje programado"`.
- **P2-TC088/P2-TC089**: descripción `"Clonación"` en sección "Edición en conflicto" → `"Edición en conflicto"`.
- **Rename masivo** (2026-04-19): `"Usuario App Pax"` → `"Usuario Personal"` en Eje 2 (tipo de usuario). Portal App Pax (Eje 1) preservado.

# Salidas esperadas (Required outputs)
- `normalized-test-cases.json`
- `critical-flows.json`
- `automation-backlog.md`
- `traceability-map.json`
- Borradores especuladores para rutinas de Playwright
- Reporte detallado del escaneo funcional `auto-review-report`
- Frente a un alcance transaccional centrado en Stripe/Gateway PG para el rastrero minucioso y legal hacia métricas `Coverage Scope`:
  - `tests/coverage/README.md`
  - `tests/coverage/coverage-manifest.json`
  - Rutas adjuntas trazadas con actor documentado orientando a cobertura formal técnica inmersa en  `tests/coverage/`

# Reglas de generación de drafts
- Reclusión operativa forzosa a TypeScript.
- Recurre permanentemente al cimiento operativo de los Playwright tests funcionales (`test`, `expect`).
- Aplica el principio fundamental universal "Reuse Page Objects / Fixtures" y jamás partas la homogeneidad por simple vanidad.
- Obligatoriedad por nomenclatura basada y regida universalmente en formato (Identificables o ID-based).
- Agrega metadatos adjuntos con las etiquetas correspondidas: smoke, regression y referenciando concretamente cada sector.
- Involucrar a plenitud y remarcar visualmente y semánticamente mediante los comandos de bloqueo "TODO Blocks" la espera de los procesos inermes atados en espera para una API externa, bases de datos (BD/DB), verificación Stripe global o la recarga del desafió 3DS donde la carencia en automatizar nos lo imponga.
- Preservar los renglones correspondientes con rigor y firme equivalencia al registro global de rastreadores base desde IDs al momento de formalizarlos a la etapa de planeación preliminar.
- Inclínate de sobra y recíprocamente opta porque todo registro y el reacomodo lógico procedimental transiten usando los descubrimientos limpios al leer el `.recorded.ts` como huella visible de un trazado UI (DOM).

# Fase de validación en automático (Evaluación continua)
Transcurridas todas la instancias de gestación de tus borrones técnicos correspondientes deberás certificar de plano sus bases de constitución en correlato a las cláusulas descritas debajo (Checklist).

Checklist para su aval y corroboración afirmativa conjunta:
- [ ] Elementos vitales a asimilar: `test_case_id`, `módulo funcional`, variables asociadas al `portal`, variables contextuales `environment`, al unísono de su grado imperativo adjunto: `Priority`, y todos sin omitir, deben poblar afirmativamente en todas las specs.
- [ ] Tu reajuste preliminar se apropia, domina y vuelve a ensamblar las estructuras canónicas pre-establecidas en la gama POM (Page Objects), sin procrear de manera repetida nada nuevo que compita funcionalmente con lo preexistente.
- [ ] Constancia empírica de inexistencias e ilusiones (carencias de selectors imaginarios sin correlación comprobable real extraíble vía evidencia externa o del sistema DOM visual)
- [ ] Categoría imperante sustentada y validada según el espectro jerárquico aludido (Modelación de Prioridades P1/P2) y un asenso estricto, vetando subidas categóricas de prioridades menores (P2) hasta culminar el peldaño principal crítico (coberturas globales para flujos y derivaciones principales de P1).
- [ ] Resaltes en forma de notas bloqueadoras, omisiones parciales de códigos no factibles en forma de TODOs y un acuse documental riguroso evidenciando el origen base de interdependencias fallidas.

Restricciones e incidencias críticas que sepultan radicalmente con la aprobación:
- Múltiples reajustes y procreaciones duplicados de un POM a espaldas del Page Object nativo central.
- Códigos masivos entrelazados e irracionales carentes funcionalmente del tamiz o filtro reduccionista.
- Selectores infundados de su procedencia legal.
- Categoría jerárquicas irresponsables e irrazonables alzando las variables dependientes o segundarias al vuelo del P1 saltándose normativas.
- Proclamación anticipada garantizando que su nivel y cualidad es el peldaño absoluto "final y productable - Merge-Ready" con evitación del revisado oficial de las ramas anexas.

# Referencias para carga a discreción (load on demand)
- `references/excel-schema.md` - identificadores y referencias lógicas, reglas para simplificar atributos genéricos y de estandarización correlativas en ponderación jerárquica
- `references/framework-map.md` - ecosistema técnico presente de los esqueletos POM, anclas auxiliares o dependencias para reciclar funciones (helpers)
- `references/parsing-rules.md` - la táctica técnica y teórica general para exprimir toda metadata valiosa desde distintos abanicos portadores referenciales y fuentes documentarias dispares
- `references/prioritization-rules.md` - estipulaciones o marco referencial puro rigiendo el acomodo y validación para las P1 con relación al sesgo complementario adosado sobre los P2.
- `references/playwright-generation-rules.md` - pautas funcionales aplicables con patrones lógicos puros centrados a la especificación programática en TypeScripts y al patrón de prueba nativo subyacente para validación
- `references/output-contracts.md` - geometría requerida o fisionomía del armazón mandatorio a exportar vía formato referenciado en JSON y enmarcadas normativas 
- `references/output-format.md` - visual y estilo canónico adjunto en entrega, que gobierna todos sus módulos adjuntados de forma oficial
- `references/gateway-prioritization-rules.md` - limitación expresa: activar si y sólo si el dominio del entorno subyace dentro de la línea de pagos, carteras web directas e instancias retenidas en pre-autorizaciones transaccionales de control u hold. Encierra tablas ponderadas para calibrar criticidad funcional, fichas modelos preliminares, parámetros Stripe (tarjetas ficticias) y tags condicionales.

# Secuencias en orden de presentación saliente (Output Order)
1. Resumen técnico acoplado a desbaratar y aislar transiciones del eje crítico medular.
2. Planeación pospuesta jerarquizada y controlada según tiempos ("backlog formal - Prioritized").
3. Diagrama formal proyectivo englobando sugerencias para sus árboles de ficheros adjuntos y jerarquizaciones en archivos y módulos propuestos.
4. Generación nativa a partir del esbozo, como test o encuadre de rutinas procedimentales TypeScript en forma abstractas y legibles por Playwright ("Spec"). 
5. Constancia analítica emitida obligatoria después del análisis general: reporte del rastreador automático "Auto-Review report", delineando en él hallazgos de irregularidades de detención ("red flags") frente a sus homologaciones funcionales acertadas ("Pass/Failed per draft").
6. Listado anexo final para referenciación a huecos ciegos (gaps), zonas inciertas de compatibilidad funcional (blockers) y falencias latentes en la dependencia.

## Bootstrap y mejora continua
- Para carrier y contractor, usar `tests/config/runtime.ts` como fuente de verdad para `loginPath` y `dashboardPattern` antes de generar nuevos drafts.
- Si un recorder o una ejecución valida un mejor shell, wait condition o anchor, preferir esa evidencia y actualizar el contrato del repo en el mismo ciclo.
- No asumir que contractor comparte el CTA `Nuevo Viaje`; si el shell es valido pero el CTA no existe, marcar esa divergencia en el draft o en la cobertura.
- Cuando cambie el bootstrap validado, refrescar `AGENTS.md`, `docs/reference/ai-tools-guide.md` y `docs/codex-prompts/README.md` junto con el skill.
