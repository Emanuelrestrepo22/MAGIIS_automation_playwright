# Codex Prompt — Flow 2: App Driver — Spec E2E y Test Cases

## Contexto
Repositorio: `magiis-playwright` (Playwright + TypeScript + Appium/WebdriverIO v9).
Este prompt cubre la capa **App Driver** del flujo híbrido E2E.
El pivote actual es **Flow 2: App Passenger → App Driver**.
Todos los Screen Objects del Driver están confirmados con dumps reales de DOM.
Los Screen Objects del Passenger están como esqueletos — se construirán cuando lleguen los dumps.

## Objetivo
1. Escribir los **test cases en formato Markdown** del flujo Driver App (IDs canónicos).
2. Crear el **spec E2E Appium** del flujo Driver en modo draft (con `test.fixme()` donde falte evidencia de Passenger).
3. Actualizar `DriverTripSummaryScreen.ts` para agregar `assertPaymentMethod()` con selector real.

---

## Estado real del repositorio (leer antes de escribir)

### Screen Objects disponibles y completos (App Driver)
```
tests/mobile/appium/driver/
├── AppiumSessionBase.ts          ← base con switchToWebView, getDriver, getContexts
├── DriverFlowSelectors.ts        ← fuente de verdad de selectores
├── DriverHomeScreen.ts           ← home, disponibilidad
├── DriverTripRequestScreen.ts    ← TravelConfirmPage → acceptTrip()
├── DriverTripNavigationScreen.ts ← ToStart → InProgress → startTrip, endTrip, modales
├── DriverTripSummaryScreen.ts    ← TravelResumePage → confirmAndFinish, addToll, addParking
└── DriverTripCompletionScreen.ts ← post-cierre
```

### Selectores confirmados con DOM dump (NO inventar otros)
```
TravelConfirmPage    → button.btn.primary          text="Aceptar"
TravelToStartPage    → button.btn.primary.trip-pax-start text="Empezar Viaje"
Modal inicio         → app-confirm-modal button     text="Si"
TravelInProgressPage → app-page-travel-in-progress button.btn.finish text="Finalizar Viaje"
Modal fin            → app-confirm-modal button     text="Si"
TravelResumePage     → app-travel-resume button.btn.finish text="Cerrar Viaje"
Post-cierre URL      → /navigator/home;FROM_TRAVEL_CLOSED=true
Forma de pago activa → button.payment.active        text="VISA XXXX"
Botón peaje          → button                       text="Peaje"     (sin clase)
Botón estac.         → button                       text="Estac."    (sin clase)
```

### Screen Objects del Passenger (NO implementar — solo referenciar con TODO)
```
tests/mobile/appium/passenger/
├── PassengerWalletScreen.ts      ← throw new Error — sin selectores
├── PassengerNewTripScreen.ts     ← throw new Error — sin selectores
└── PassengerTripStatusScreen.ts  ← throw new Error — sin selectores
```

---

## Tarea 1 — Test Cases Markdown

Crear: `docs/test-cases/mobile/TC-DRIVER-FLOW.md`

Estructura de cada caso:

```markdown
## TC-DRIVER-01 — Aceptar viaje asignado

| Campo | Valor |
|---|---|
| Módulo | App Driver |
| Portal | Driver Android App |
| Tipo | Positivo |
| Prioridad | P1 |
| Ambiente | TEST |
| Precondiciones | Driver online y disponible. Viaje creado desde Carrier o Passenger. |

### Pasos
1. App Driver recibe notificación de viaje disponible (TravelConfirmPage)
2. Driver hace tap en "Aceptar"

### Resultado esperado
Debería navegar a TravelToStartPage mostrando dirección del pasajero.

### Trazabilidad
- Selector: `button.btn.primary` text="Aceptar" en `app-page-travel-confirm`
- Screen Object: `DriverTripRequestScreen.acceptTrip()`
- Flow: E2E-FLOW-2, fase driver
```

Casos a documentar (uno por sección):

| ID | Título | Tipo |
|---|---|---|
| TC-DRIVER-01 | Aceptar viaje asignado | Positivo P1 |
| TC-DRIVER-02 | Empezar viaje hacia pasajero | Positivo P1 |
| TC-DRIVER-03 | Confirmar inicio de viaje (modal "¿Desea empezar?") | Positivo P1 |
| TC-DRIVER-04 | Finalizar viaje en curso | Positivo P1 |
| TC-DRIVER-05 | Confirmar fin de viaje (modal "¿Finalizar Viaje?") | Positivo P1 |
| TC-DRIVER-06 | Cerrar resumen y volver al home | Positivo P1 |
| TC-DRIVER-07 | Validar método de pago activo en resumen | Positivo P2 |
| TC-DRIVER-08 | Agregar peaje en pantalla de resumen | Positivo P2 |
| TC-DRIVER-09 | Agregar estacionamiento en pantalla de resumen | Positivo P2 |
| TC-DRIVER-10 | Driver rechaza modal de inicio (tap "No") | Negativo P2 |
| TC-DRIVER-11 | Driver rechaza modal de fin (tap "No") | Negativo P2 |
| TC-DRIVER-12 | Cerrar viaje con tarjeta 3DS obligatoria (4000000000003220) — popup Stripe → Complete | Positivo P1 |
| TC-DRIVER-13 | Cerrar viaje con tarjeta "Autenticar siempre" (4000002760003184) — popup Stripe → Complete | Positivo P1 |

---

## Tarea 2 — Spec E2E Appium (Flow 2 — fase Driver)

Crear: `tests/mobile/appium/specs/driver-trip-full-flow.spec.ts`

### Estructura obligatoria

```typescript
import { describe, it, before, after } from 'mocha';
// Importar Screen Objects desde paths existentes
// NO crear nuevos helpers — usar los Screen Objects ya definidos

describe('[TC-DRIVER-FLOW] App Driver — flujo completo de viaje', () => {

  // Setup: crear sesión Appium con la config de driver
  // usar MobileActorConfig + buildAndroidCapabilities

  describe('[TC-DRIVER-01] Aceptar viaje asignado', () => {
    it('debería navegar a TravelToStartPage al aceptar', async () => {
      // Esperar TravelConfirmPage → tap Aceptar → assert URL TravelToStartPage
    });
  });

  describe('[TC-DRIVER-02] Empezar viaje', () => {
    it('debería mostrar modal de confirmación al tocar "Empezar Viaje"', async () => {
      // tap btn.primary.trip-pax-start → assert app-confirm-modal visible
    });
  });

  // ... continuar para TC-DRIVER-03 a TC-DRIVER-09

  // TC-DRIVER-10 y TC-DRIVER-11: test.fixme() con mensaje explicativo hasta tener
  // datos de viaje controlados desde Passenger App
});
```

### Reglas de implementación
1. Cada `it()` mapea exactamente a un TC de Tarea 1.
2. Comentario `// Debería…` sobre cada `expect()` — copiar del resultado esperado del TC.
3. `test.fixme()` solo para casos que dependan de Passenger App (aún sin selectores).
4. Sin `waitForTimeout` — usar `waitFor*()` de los Screen Objects.
5. Datos de configuración desde variables de entorno (`.env.test`), no hardcodeados.
6. Al final del archivo: bloque de comentario con riesgos y gaps.

---

## Tarea 3 — Actualizar DriverTripSummaryScreen

Archivo: `tests/mobile/appium/driver/DriverTripSummaryScreen.ts`

Método `assertPaymentMethod()` — implementar con selector real:
```
button.payment.active  dentro de  app-travel-resume
```

El método debe:
1. Obtener texto de `button.payment.active` visible en `app-travel-resume`
2. Si recibe `last4` ("4242"), verificar que el texto incluya ese valor
3. Loggear el método de pago encontrado

---

## Memoria para Codex

Al iniciar esta tarea, guardar en tu memoria:

```
TASK: implement-driver-app-flow2
STATUS: in-progress
BRANCH: feature/ai-draft-driver-flow2
FILES_TO_CREATE:
  - docs/test-cases/mobile/TC-DRIVER-FLOW.md
  - tests/mobile/appium/specs/driver-trip-full-flow.spec.ts
FILES_TO_EDIT:
  - tests/mobile/appium/driver/DriverTripSummaryScreen.ts (assertPaymentMethod)
DO_NOT_TOUCH:
  - tests/mobile/appium/passenger/ (sin selectores confirmados)
  - tests/pages/ (pivot activo, no carrier web)
  - main branch
```

---

## Validación

Antes de marcar done:
```bash
npx tsc --noEmit   # debe salir EXIT:0
```

Confirmar que el spec importa correctamente los Screen Objects existentes sin crear duplicados.
Confirmar que `docs/test-cases/mobile/TC-DRIVER-FLOW.md` tiene los 11 casos con trazabilidad.
