# Codex Task — Implementar casos negativos y variantes carrier (Stripe)

## Memoria — guardar al iniciar

```
TAREA: implement-carrier-negative-specs
ESTADO: en_progreso
SPECS_COMPLETADAS: []
SPECS_PENDIENTES: [
  apppax-hold-no3ds variantes TC1051/1057/1059/1052/1058/1060,
  apppax-hold-3ds variantes TC1055/1061/1063/1056/1062/1064,
  colaborador-hold-no3ds variantes TC1027-1035,
  empresa-hold-no3ds variantes TC1015-1023,
  apppax-cargo-declines TC1082-1086,
  apppax-cargo-antifraud TC1087-1091
]
TSC: pendiente
LIST: pendiente
```
Actualizar SPECS_COMPLETADAS y SPECS_PENDIENTES a medida que se completan. Al finalizar marcar ESTADO: completado.

---

## Contexto del proyecto

Repositorio: `magiis-playwright` — Playwright + TypeScript, portal carrier de MAGIIS.

El framework usa:
- `tests/TestBase.ts` — fixture base con `test.use({ role: 'carrier' })`
- `tests/pages/carrier/` — POMs: `DashboardPage`, `NewTravelPage`, `OperationalPreferencesPage`, `TravelManagementPage`, `TravelDetailPage`, `ThreeDSModal`, `ThreeDSErrorPopup`
- `tests/features/gateway-pg/fixtures/gateway.fixtures.ts` — exports: `loginAsDispatcher`, `expectNoThreeDSModal`, `STRIPE_TEST_CARDS`, `TEST_DATA`
- `tests/features/gateway-pg/data/stripeTestData.ts` — tarjetas disponibles (ver sección Tarjetas)

---

## Tarjetas disponibles en STRIPE_TEST_CARDS

```typescript
STRIPE_TEST_CARDS.successDirect      // 4242 4242 4242 4242 — aprobado sin 3DS
STRIPE_TEST_CARDS.success3DS         // 4000 0025 0000 3155 — requiere 3DS → aprobar
STRIPE_TEST_CARDS.fail3DS            // 4000 0000 0000 9235 — requiere 3DS → falla
STRIPE_TEST_CARDS.insufficientFunds  // 4000 0000 0000 9995 — fondos insuficientes
STRIPE_TEST_CARDS.declined           // 4000 0000 0000 0002 — rechazo genérico
STRIPE_TEST_CARDS.lostCard           // 4000 0000 0000 9987 — tarjeta perdida
STRIPE_TEST_CARDS.stolenCard         // 4000 0000 0000 9979 — tarjeta robada
STRIPE_TEST_CARDS.incorrectCvc       // 4000 0000 0000 0101 — CVC incorrecto
STRIPE_TEST_CARDS.expiredCard        // 4000 0000 0000 0069 — tarjeta expirada
STRIPE_TEST_CARDS.highestRisk        // tarjeta riesgo máximo (antifraude)
STRIPE_TEST_CARDS.alwaysBlocked      // tarjeta siempre bloqueada (antifraude)
```

---

## Datos de prueba disponibles en TEST_DATA

```typescript
TEST_DATA.appPaxPassenger   // pasajero tipo AppPax con tarjeta vinculada
TEST_DATA.colaborador       // pasajero tipo Colaborador
TEST_DATA.empresa           // pasajero tipo Empresa
TEST_DATA.origin            // dirección de origen preconfigurada
TEST_DATA.destination       // dirección de destino preconfigurada
TEST_DATA.passenger         // alias de appPaxPassenger (legacy)
```

---

## Especificación del comportamiento esperado en casos negativos

### Tarjeta rechazada / fondos insuficientes / antifraude
El sistema MAGIIS debe:
1. Mostrar un mensaje de error o toast después de intentar enviar el servicio
2. El viaje NO debe aparecer en "Por asignar" en gestión de viajes
3. El viaje NO debe tener estado "Buscando conductor"
4. Puede aparecer en "En conflicto" si el hold se procesa pero falla

La assertion a usar es:
```typescript
// Debería mostrar error en pantalla
await detail.expectStatus('NO_AUTORIZADO');
// O bien verificar que NO hay navegación a /travels/:id exitosa
// O verificar toast de error visible
```

**Nota:** Si el comportamiento exacto del sistema ante cada tarjeta rechazada NO es conocido con certeza, implementar el test con un `TODO` comment indicando qué assertion debe validarse, pero sin dejarlo como `test.fixme`. El test debe al menos ejecutar el flujo hasta el punto de falla.

---

## Patrón de implementación de referencia

El test de referencia es `apppax-hold-no3ds.spec.ts` — TC1049 (hold ON) y TC1050 (hold OFF con try/finally).

### Estructura estándar — variante de mismo flujo con datos distintos

```typescript
test('[TS-STRIPE-TC1051] @regression @hold hold+cobro app pax sin 3DS variante', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    const preferences = new OperationalPreferencesPage(page);
    const travel = new NewTravelPage(page);
    const management = new TravelManagementPage(page);
    const detail = new TravelDetailPage(page);

    await loginAsDispatcher(page);

    await test.step('Validar que el hold esté activado', async () => {
        await preferences.goto();
        await preferences.ensureHoldEnabled();
        await preferences.assertHoldEnabled();
    });

    await test.step('Ir al formulario de nuevo viaje', async () => {
        await dashboard.openNewTravel();
        await travel.ensureLoaded();
    });

    await test.step('Completar formulario con tarjeta sin 3DS', async () => {
        await travel.fillMinimum({
            client: TEST_DATA.appPaxPassenger,
            passenger: TEST_DATA.appPaxPassenger,
            origin: TEST_DATA.origin,
            destination: TEST_DATA.destination,
            cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4),
        });
    });

    await test.step('Seleccionar vehículo y enviar', async () => {
        await travel.clickSelectVehicle();
        await travel.clickSendService();
    });

    await test.step('Verificar sin 3DS', async () => {
        await expectNoThreeDSModal(page);
    });

    await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
    const travelId = extractTravelId(page.url());

    await test.step('Validar en gestión — Por asignar', async () => {
        await management.goto();
        await management.expectPassengerInPorAsignar(TEST_DATA.appPaxPassenger, TEST_DATA.destination);
    });

    await test.step('Abrir detalle', async () => {
        await management.openDetailForPassenger(TEST_DATA.appPaxPassenger, TEST_DATA.destination);
        await page.waitForURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
        expect(extractTravelId(page.url())).toBe(travelId);
    });

    await test.step('Validar estado — Buscando conductor', async () => {
        await detail.expectStatus('Buscando conductor');
    });
});
```

### Estructura estándar — caso negativo (tarjeta rechazada)

```typescript
test('[TS-STRIPE-TC1082] @regression @cargo-a-bordo pago rechazado genérico', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    const preferences = new OperationalPreferencesPage(page);
    const travel = new NewTravelPage(page);
    const management = new TravelManagementPage(page);

    await loginAsDispatcher(page);

    await test.step('Validar hold activo', async () => {
        await preferences.goto();
        await preferences.ensureHoldEnabled();
    });

    await test.step('Ir al formulario de nuevo viaje', async () => {
        await dashboard.openNewTravel();
        await travel.ensureLoaded();
    });

    await test.step('Seleccionar servicio cargo y completar formulario con tarjeta rechazada', async () => {
        await travel.selectServiceType('cargo');
        await travel.selectClient(TEST_DATA.appPaxPassenger);
        await travel.selectPassenger(TEST_DATA.appPaxPassenger);
        await travel.setOrigin(TEST_DATA.origin);
        await travel.setDestination(TEST_DATA.destination);
        await travel.selectCardByLast4(STRIPE_TEST_CARDS.declined.slice(-4));
    });

    await test.step('Enviar el viaje', async () => {
        await travel.clickSelectVehicle();
        await travel.clickSendService();
    });

    await test.step('Verificar que el viaje queda en estado NO_AUTORIZADO o error visible', async () => {
        // TODO: validar comportamiento real del sistema ante tarjeta rechazada
        // Opción A: await detail.expectStatus('NO_AUTORIZADO');
        // Opción B: await expect(page.locator('.toast-message')).toBeVisible();
        // Opción C: await management.goto(); await management.expectPassengerInEnConflicto(...)
    });
});
```

---

## Specs a implementar — detalle por archivo

### 1. `tests/features/gateway-pg/specs/stripe/carrier/hold/apppax-hold-no3ds.spec.ts`

Desactivar `test.fixme` e implementar:

| TC | Tipo | Hold | Tarjeta | Diferencia vs base |
|---|---|---|---|---|
| TC1051 | regression | ON | successDirect | datos alternativos de origen/destino |
| TC1057 | regression | ON | successDirect | pasajero diferente (colaborador) |
| TC1059 | regression | ON | successDirect | segunda ejecución (idempotencia) |
| TC1052 | regression | OFF | successDirect | datos alternativos |
| TC1058 | regression | OFF | successDirect | pasajero diferente |
| TC1060 | regression | OFF | successDirect | segunda ejecución |

Las variantes "set 2" pueden usar `TEST_DATA.colaborador` como pasajero alternativo si está disponible, o una segunda corrida con los mismos datos de TC1049/TC1050.

### 2. `tests/features/gateway-pg/specs/stripe/carrier/hold/apppax-hold-3ds.spec.ts`

Desactivar `test.fixme` e implementar:

| TC | Tipo | Hold | Tarjeta | Diferencia vs base |
|---|---|---|---|---|
| TC1055 | regression | ON | success3DS | datos alternativos |
| TC1061 | regression | ON | success3DS | pasajero diferente |
| TC1063 | regression | ON | success3DS | segunda ejecución |
| TC1056 | regression | OFF | success3DS | datos alternativos |
| TC1062 | regression | OFF | success3DS | pasajero diferente |
| TC1064 | regression | OFF | success3DS | segunda ejecución |

### 3. `tests/features/gateway-pg/specs/stripe/carrier/hold/colaborador-hold-no3ds.spec.ts`

Desactivar `test.fixme` e implementar TC1027–TC1035 como variantes de TC1025/TC1026 cambiando datos de origen/destino o segunda corrida.

### 4. `tests/features/gateway-pg/specs/stripe/carrier/hold/empresa-hold-no3ds.spec.ts`

Desactivar `test.fixme` e implementar TC1015–TC1023 como variantes de TC1013/TC1014.

### 5. `tests/features/gateway-pg/specs/stripe/carrier/cargo-a-bordo/apppax-cargo-declines.spec.ts`

Implementar los 5 casos negativos. Cada uno sigue el mismo flujo que TC1081 pero con tarjeta diferente y assertion de error:

| TC | Tarjeta a usar | Comportamiento esperado |
|---|---|---|
| TC1082 | `STRIPE_TEST_CARDS.declined` | Error genérico — viaje NO en Por asignar |
| TC1083 | `STRIPE_TEST_CARDS.insufficientFunds` | Fondos insuficientes — viaje NO en Por asignar |
| TC1084 | `STRIPE_TEST_CARDS.lostCard` | Tarjeta perdida — viaje NO en Por asignar |
| TC1085 | `STRIPE_TEST_CARDS.incorrectCvc` | CVC incorrecto — viaje NO en Por asignar |
| TC1086 | `STRIPE_TEST_CARDS.stolenCard` | Tarjeta robada — viaje NO en Por asignar |

### 6. `tests/features/gateway-pg/specs/stripe/carrier/cargo-a-bordo/apppax-cargo-antifraud.spec.ts`

Implementar los 5 casos de antifraude. Mismo flujo que TC1081 con tarjeta antifraude:

| TC | Tarjeta a usar |
|---|---|
| TC1087 | `STRIPE_TEST_CARDS.incorrectCvc` |
| TC1088 | `STRIPE_TEST_CARDS.highestRisk` |
| TC1089 | `STRIPE_TEST_CARDS.alwaysBlocked` |
| TC1090 | No existe en STRIPE_TEST_CARDS todavía — dejar `test.fixme` con nota: 'PENDIENTE: zip_fail_elevated no implementado en stripeTestData' |
| TC1091 | No existe en STRIPE_TEST_CARDS todavía — dejar `test.fixme` con nota: 'PENDIENTE: address_unavailable no implementado en stripeTestData' |

---

## Imports requeridos en cada spec

```typescript
import { expect } from '@playwright/test';
import { test } from '../../../../../../TestBase';
import {
    DashboardPage,
    NewTravelPage,
    OperationalPreferencesPage,
    TravelManagementPage,
    TravelDetailPage,
    ThreeDSModal,
} from '../../../../../../pages/carrier';
import {
    loginAsDispatcher,
    expectNoThreeDSModal,
    STRIPE_TEST_CARDS,
    TEST_DATA,
} from '../../../../fixtures/gateway.fixtures';
```

Ajustar profundidad de `../../` según la ubicación del archivo.

---

## Reglas

1. NO modificar los tests ya implementados (TC1049, TC1050, TC1025, TC1026, TC1013, TC1014, TC1081).
2. NO cambiar la firma ni lógica de ningún POM.
3. Las variantes de un mismo flujo pueden tener pasos idénticos con datos distintos — no abstraer si no aporta claridad.
4. Para casos negativos donde el comportamiento real no está confirmado: implementar el flujo completo hasta el paso de envío y agregar un `// TODO: assert comportamiento real` en lugar de omitir el assertion.
5. Correr `npx tsc --noEmit` al finalizar cada archivo.

## Validación final

```bash
npx tsc --noEmit
npx playwright test tests/features/gateway-pg/specs/stripe/carrier/ --list
```

El `--list` debe mostrar todos los TCs de cada spec sin errores de colección. Los `test.fixme` aparecerán como skipped — eso es correcto para TC1090 y TC1091.
