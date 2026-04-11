# Codex Task — Centralizar POMs en tests/pages/

## Contexto del proyecto

Repositorio: `magiis-playwright` — automatización E2E Playwright + TypeScript para plataforma MAGIIS.

MAGIIS tiene 4 portales:
- **Carrier** y **Contractor**: portales web (Playwright). Contractor comparte ~90% de la UI de Carrier.
- **Driver App** y **Passenger App**: apps Android (Appium + WebdriverIO). Ya organizadas en `tests/mobile/appium/`.

## Problema actual

Los Page Objects (POMs) están dispersos en dos lugares:
- `tests/features/auth/pages/` — tiene las implementaciones reales (LoginPage, DashboardPage, SuperPage)
- `tests/features/gateway-pg/pages/` — mezcla de POMs reales + re-exports de auth

Esto viola el principio de fuente canónica única. Si cambia un selector de DashboardPage, hay que buscarlo en features/auth/pages y verificar que no haya copia en gateway-pg/pages.

## Arquitectura objetivo

```
tests/pages/
├── shared/
│   ├── LoginPage.ts       ← formulario login (carrier + contractor comparten)
│   ├── SuperPage.ts       ← base: openNewTravel, ensureNewTripVisible
│   └── index.ts           ← barrel export
└── carrier/
    ├── DashboardPage.ts
    ├── NewTravelPageBase.ts
    ├── NewTravelPage.ts
    ├── TravelManagementPage.ts
    ├── TravelDetailPage.ts
    ├── GatewayPgCardLinkingPage.ts
    ├── OperationalPreferencesPage.ts
    ├── ThreeDSModal.ts
    ├── ThreeDSErrorPopup.ts
    ├── ErrorPopup.ts
    └── index.ts           ← barrel export
```

Después de la migración:
- `tests/features/auth/pages/` → eliminado (sus archivos se mueven a `tests/pages/`)
- `tests/features/gateway-pg/pages/` → eliminado (sus archivos se mueven a `tests/pages/carrier/`)
- Todo import de POMs en specs/fixtures apunta a `tests/pages/shared/` o `tests/pages/carrier/`

## Archivos fuente canónicos actuales

Estos son los archivos con la implementación real (NO los re-exports):

### Fuente: tests/features/auth/pages/
- `LoginPage.ts` → mover a `tests/pages/shared/LoginPage.ts`
- `SuperPage.ts` → mover a `tests/pages/shared/SuperPage.ts`
- `DashboardPage.ts` → mover a `tests/pages/carrier/DashboardPage.ts`
- `index.ts` → reemplazar por barrel exports desde nuevas rutas

### Fuente: tests/features/gateway-pg/pages/
- `NewTravelPageBase.ts` → mover a `tests/pages/carrier/NewTravelPageBase.ts`
- `NewTravelPage.ts` → mover a `tests/pages/carrier/NewTravelPage.ts`
- `TravelManagementPage.ts` → mover a `tests/pages/carrier/TravelManagementPage.ts`
- `TravelDetailPage.ts` → mover a `tests/pages/carrier/TravelDetailPage.ts`
- `GatewayPgCardLinkingPage.ts` → mover a `tests/pages/carrier/GatewayPgCardLinkingPage.ts`
- `OperationalPreferencesPage.ts` → mover a `tests/pages/carrier/OperationalPreferencesPage.ts`
- `ThreeDSModal.ts` → mover a `tests/pages/carrier/ThreeDSModal.ts`
- `ThreeDSErrorPopup.ts` → mover a `tests/pages/carrier/ThreeDSErrorPopup.ts`
- `ErrorPopup.ts` → mover a `tests/pages/carrier/ErrorPopup.ts`
- `LoginPage.ts` (re-export) → eliminar
- `DashboardPage.ts` (re-export) → eliminar

## Importaciones internas que deben actualizarse

Archivos que importan desde las rutas viejas y deben apuntar a las nuevas:

### tests/features/auth/specs/
- `login-success.e2e.spec.ts` — importa `DashboardPage` desde `../pages`
- `login-failure.e2e.spec.ts` — importa `LoginPage` desde `../pages`

### tests/features/gateway-pg/fixtures/
- `gateway.fixtures.ts` — importa `DashboardPage, LoginPage` desde `../../auth/pages`; importa POMs carrier desde `../pages`

### tests/features/gateway-pg/helpers/
- `stripe.helpers.ts` — importa POMs desde `../pages`

### tests/features/gateway-pg/specs/stripe/ (y subdirectorios)
Todos los specs que importan desde rutas relativas `../../pages/` o `../../../../pages/` deben actualizarse a la ruta correcta desde su profundidad hacia `tests/pages/carrier/` o `tests/pages/shared/`.

Lista completa de specs afectados:
- `stripe/3ds-failure.spec.ts`
- `stripe/3ds-retry-card-change.spec.ts`
- `stripe/hold-capture.spec.ts`
- `stripe/recorded-3ds-happy-path.spec.ts`
- `stripe/carrier/hold/apppax-hold-3ds.spec.ts`
- `stripe/carrier/hold/apppax-hold-no3ds.spec.ts`
- `stripe/carrier/hold/colaborador-hold-no3ds.spec.ts`
- `stripe/carrier/hold/empresa-hold-no3ds.spec.ts`
- `stripe/carrier/cargo-a-bordo/apppax-cargo-happy.spec.ts`

### tests/features/smoke/specs/
- `portals.smoke.spec.ts` — importa `DashboardPage, LoginPage` desde `../../auth/pages`

### tests/e2e/
- `flow1-carrier-driver.e2e.spec.ts` — importa desde `../features/gateway-pg/pages`

### tests/pages/
- `LoginPage.ts` — actualmente es re-export de `features/auth`; reemplazar con implementación real o eliminar si ya existe en `tests/pages/shared/LoginPage.ts`

## Reglas para importaciones internas dentro de pages/

Atención: DashboardPage extiende SuperPage. Al mover los archivos, actualizar la importación interna:

```typescript
// tests/pages/carrier/DashboardPage.ts
import { SuperPage } from '../shared/SuperPage';
```

NewTravelPage extiende NewTravelPageBase:
```typescript
// tests/pages/carrier/NewTravelPage.ts
import { NewTravelPageBase } from './NewTravelPageBase';
```

## Barrel exports requeridos

### tests/pages/shared/index.ts
```typescript
export { LoginPage } from './LoginPage';
export { SuperPage } from './SuperPage';
```

### tests/pages/carrier/index.ts
```typescript
export { DashboardPage } from './DashboardPage';
export { NewTravelPageBase } from './NewTravelPageBase';
export { NewTravelPage } from './NewTravelPage';
export { TravelManagementPage } from './TravelManagementPage';
export { TravelDetailPage } from './TravelDetailPage';
export { GatewayPgCardLinkingPage } from './GatewayPgCardLinkingPage';
export { OperationalPreferencesPage } from './OperationalPreferencesPage';
export { ThreeDSModal } from './ThreeDSModal';
export { ThreeDSErrorPopup } from './ThreeDSErrorPopup';
export { ErrorPopup } from './ErrorPopup';
```

## Criterios de validación

Al finalizar la tarea, ejecutar:

```bash
npx tsc --noEmit
```

Debe retornar EXIT:0 sin errores de tipo.

```bash
npx playwright test tests/features/ --list
```

Debe listar los mismos tests que antes (no debe fallar ninguno en la fase de recolección).

## Instrucciones de ejecución

1. Leer cada archivo fuente antes de moverlo — no reescribir ni modificar lógica, solo mover y actualizar imports.
2. Crear los directorios `tests/pages/shared/` y `tests/pages/carrier/` si no existen.
3. Mover los archivos en este orden para evitar dependencias rotas:
   a. `SuperPage.ts` → `pages/shared/`
   b. `LoginPage.ts` → `pages/shared/`
   c. `DashboardPage.ts` → `pages/carrier/` (actualizar import de SuperPage)
   d. Resto de POMs carrier → `pages/carrier/`
   e. Crear barrel exports `index.ts` en ambos directorios
   f. Actualizar todos los imports en specs, fixtures y helpers
   g. Eliminar `features/auth/pages/` y `features/gateway-pg/pages/`
4. Correr `npx tsc --noEmit` después de cada bloque (a-d, e, f, g) para detectar errores temprano.
5. NO modificar la lógica interna de ningún POM — solo mover archivos y actualizar rutas de import.
6. NO crear nuevos tests ni modificar assertions existentes.

## Memoria para Codex — guardar al iniciar la tarea

Al comenzar esta tarea, guardar en memoria:

```
TAREA ACTIVA: refactor-pom-centralization
OBJETIVO: Mover todos los POMs web a tests/pages/shared/ y tests/pages/carrier/
ESTADO: en progreso
ARCHIVOS MOVIDOS: [] (actualizar a medida que se completan)
ARCHIVOS PENDIENTES: [SuperPage, LoginPage, DashboardPage, NewTravelPageBase, NewTravelPage, TravelManagementPage, TravelDetailPage, GatewayPgCardLinkingPage, OperationalPreferencesPage, ThreeDSModal, ThreeDSErrorPopup, ErrorPopup]
IMPORTS ACTUALIZADOS: [] (actualizar por archivo)
VALIDACION TSC: pendiente
VALIDACION LIST: pendiente
```

Actualizar la memoria al completar cada archivo movido y cada grupo de imports actualizados.
Al finalizar, marcar ESTADO: completado y registrar resultado de las validaciones.
