# Guía de herramientas AI — MAGIIS QA Automation

**Proyecto:** magiis-playwright  
**Stack:** Playwright + TypeScript + Appium + WebdriverIO  
**Modelos disponibles:** Claude Code (Sonnet 4.6) · Codex VS Code (GPT-5.1-Codex-Mini)

---

## Resumen rápido

| Tarea | Herramienta |
| --- | --- |
| Analizar documentación Excel / TXT / DOCX | Claude Code |
| Planificar arquitectura de tests | Claude Code |
| Configurar entorno, variables, CI/CD | Claude Code |
| Debuggear errores de Appium / Playwright | Claude Code |
| Mantener memoria del proyecto | Claude Code |
| Generar código repetitivo (specs, POs, helpers) | Codex VS Code |
| Refactorizar un archivo existente | Codex VS Code |
| Agregar comentarios / documentación a código | Codex VS Code |
| Completar TODOs en Screen Objects | Codex VS Code |
| Renombrar / reorganizar dentro de un archivo | Codex VS Code |

---

## Claude Code — cuándo usarlo

Claude Code es el **orquestador principal**. Tiene acceso al sistema de archivos, ejecuta comandos, mantiene contexto del proyecto entre sesiones y toma decisiones de arquitectura.

### Tareas específicas

#### 1. Análisis de documentación QA

```text
"Analizá el archivo tests/suites/GATEWAY_3DS.xlsx y extraé los test cases críticos"
"Leé este TXT de requisitos y normalizalo al formato TestCase del proyecto"
```

#### 2. Planificación y arquitectura

```text
"¿Qué Page Objects necesito para cubrir el flujo de alta de viajes?"
"Revisá si hay duplicación entre DriverHomeScreen y DriverTripRequestScreen"
"Planificá el backlog de automatización para el módulo de Wallet"
```

#### 3. Configuración del entorno

```text
"Configurá las variables de entorno para Appium con el Samsung Galaxy A05"
"Actualizá el appiumRuntime.ts para soportar el ambiente savio"
"Revisá por qué falla la sesión de Appium al cambiar de contexto"
```

#### 4. Debugging de errores

```text
"Este error de TypeScript en AppiumSessionBase: [pegar error]"
"El test flow1 falla con timeout en la fase de payment — analizá la causa"
"Appium no encuentra el contexto WebView en la Driver App"
```

#### 5. Integración y revisión de código generado

```text
"Revisá el spec que generó Codex y verificá que sigue las convenciones del proyecto"
"Integrá este Page Object generado con el TestBase existente"
"Detectá selectores frágiles en el spec generado"
```

#### 6. Memoria y contexto del proyecto

- Claude Code recuerda entre sesiones: dispositivos, packages Android, convenciones, feedback previo.
- Cuando descubrís algo nuevo (un selector, un package, un bug conocido) → pedirle que lo guarde en memoria.

---

## Codex VS Code — cuándo usarlo

Codex está integrado en VS Code y opera sobre el **archivo abierto o selección activa**. Es ideal para generación y transformación de código dentro de un contexto acotado.

### Tareas específicas

#### 1. Generar spec Playwright desde descripción

Abrís un archivo `.spec.ts` vacío y escribís en Codex:

```text
Generá un test Playwright para el flujo de 3DS fallido.
- describe: '[TC03] Fallo 3DS — reintento desde detalle'
- test.use({ role: 'carrier' })
- Importar ThreeDSModal desde '../../pages/ThreeDSModal'
- Verificar que aparece el popup de error con mensaje "Pago rechazado"
- Seguir convenciones MAGIIS: sin waitForTimeout, getByRole para selectores
```

#### 2. Completar TODOs en Screen Objects

Abrís `DriverHomeScreen.ts`, seleccionás un método con `throw new Error(...)` y pedís:

```text
Implementá este método usando:
- selector: ~go-online-btn (accessibility id confirmado con Appium Inspector)
- Esperar que el elemento sea visible antes del tap
- Seguir el patrón de AppiumSessionBase.tap()
```

#### 3. Refactorizar Page Objects

```text
Refactorizá este Page Object para separar los selectores en una constante
SELECTORS al inicio del archivo, siguiendo el patrón de tests/selectors/
```

#### 4. Generar test data

```text
Generá un objeto TypeScript con 5 usuarios de prueba para el ambiente TEST de MAGIIS.
Usar el formato de tests/data/ con campos: email, password, role, environment.
Sin datos reales — usar yopmail.com para emails de prueba.
```

#### 5. Agregar tipos TypeScript

```text
Agregá tipos estrictos a este helper, inferiendo desde el uso existente.
No cambies la lógica, solo los tipos.
```

#### 6. Documentar código existente

```text
Agregá JSDoc a los métodos públicos de esta clase.
Descripción breve, @param y @returns donde aplique.
```

---

## Flujo de trabajo combinado — ejemplo real

### Caso: automatizar el módulo GATEWAY desde Excel

```text
Paso 1 — Claude Code (análisis)
  "Leé tests/suites/GATEWAY_3DS.xlsx y dame los test cases críticos
   normalizados con su prioridad y dependencias técnicas"

Paso 2 — Claude Code (planificación)
  "¿Qué Page Objects y fixtures necesito? ¿Qué ya existe en el repo?"

Paso 3 — Codex VS Code (generación)
  Abrís tests/specs/gateway-pg/3ds-failure.spec.ts
  Pedís: "Implementá TC03 usando ThreeDSModal y los selectores de NewTravelPage"

Paso 4 — Claude Code (revisión)
  "Revisá el spec generado: convenciones, selectores frágiles, falta de assertions"

Paso 5 — Codex VS Code (correcciones)
  Corregís lo que Claude marcó directamente en el archivo

Paso 6 — Claude Code (integración)
  "Ejecutá el lint y typecheck. Actualizá el backlog de automatización."
```

---

## Convenciones que ambos modelos deben respetar

Estas reglas están en `CLAUDE.md` y deben pasarse como contexto a Codex cuando sea relevante:

| Convención | Regla |
| --- | --- |
| Auth en tests | `test.use({ role: 'carrier' })` — nunca `loginAsUser()` |
| Selectores | `getByRole()`, `getByLabel()`, `getByTestId()` — nunca CSS profundo |
| Esperas | Estado observable / navegación — nunca `waitForTimeout()` |
| ID en describe | `test.describe('[TC03] Título')` |
| Resultado esperado | Comentario `// Debería...` sobre el `expect()` |
| Tests pendientes | `test.fixme(true, 'pendiente — TC_ID')` |
| Tarjetas Stripe | `STRIPE_TEST_CARDS` de `tests/data/stripe-cards.ts` |
| Credenciales | Variables de entorno — nunca hardcodeadas |
| Appium selectores | `~accessibility-id` > `resource-id` > `xpath` > texto |

---

## Limitaciones conocidas

### Claude Code

- No ve la pantalla de la app en tiempo real (usar `chrome://inspect` o Appium Inspector para selectores).
- No puede ejecutar el emulador directamente (requiere Android Studio o adb manual).
- El contexto de sesión se comprime en conversaciones muy largas — ante dudas, pedir que lea el archivo relevante.

### Codex VS Code

- Opera sobre el archivo abierto — no tiene visión del repo completo.
- No conoce las convenciones del proyecto automáticamente — pasarle contexto o fragmentos de `CLAUDE.md`.
- **No ejecuta comandos ni scripts** — corre en sandbox sin red ni `node_modules`.
- Si Codex sugiere `npm install` o `npx ts-node ...`, ejecutarlo en la terminal de VS Code (`Ctrl + `` ` ``), no desde Codex.
- Cupo semanal limitado — reservarlo para generación de código, no para preguntas.

---

## Checklist antes de commitear código generado por AI

- [ ] TypeScript compila sin errores: `npx tsc --noEmit`
- [ ] Lint pasa: `pnpm lint`
- [ ] No hay `waitForTimeout()` ni credenciales hardcodeadas
- [ ] Los selectores tienen comentario `// TODO: validar con Inspector` si no fueron verificados
- [ ] El test tiene ID trazable: `[TC_ID]` en el describe
- [ ] Los imports apuntan a rutas existentes en el proyecto
- [ ] Si es borrador: tiene `test.fixme(true, '...')` en cada test sin implementar

---

## Referencias rápidas

| Recurso | Ubicación |
| --- | --- |
| Convenciones globales | `CLAUDE.md` (raíz del proyecto) |
| Mapa del framework | `CLAUDE.md` → sección "Mapa del framework" |
| Setup Appium paso a paso | `CLAUDE.md` → sección "Setup de Appium" |
| Packages Android por ambiente | `tests/mobile/appium/config/appiumRuntime.ts` |
| Tarjetas Stripe de prueba | `tests/data/stripe-cards.ts` |
| Fixture base con auth | `tests/TestBase.ts` |
| Excel reader | `tests/utils/excel-reader.ts` |
| Flows E2E documentados | `CLAUDE.md` → sección "Flujos E2E híbridos" |
