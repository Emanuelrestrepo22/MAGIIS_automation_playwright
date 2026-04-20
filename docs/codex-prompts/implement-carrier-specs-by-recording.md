# Codex Task — Implementar specs carrier a partir de grabaciones

## Instrucción de trabajo

Este prompt se ejecuta **en etapas**. Cada etapa corresponde a un archivo `.recorded.ts`.
Procesar **una etapa a la vez**, en el orden indicado. No avanzar a la siguiente etapa sin haber completado y validado la anterior con `npx tsc --noEmit`.

Si un flujo no tiene contexto suficiente, pedir primero el `.recorded.ts` correspondiente desde VS Code / Playwright Recorder y usarlo como evidencia primaria para reconstruir selectors, secuencia de interaccion y comportamiento observado.

---

## Memoria — guardar al iniciar

```
TAREA: implement-carrier-specs-by-recording
ESTADO: en_progreso
ETAPA_ACTUAL: 1
ETAPAS_COMPLETADAS: []
ETAPAS_PENDIENTES: [1, 2, 3, 4, 5]
SPECS_IMPLEMENTADAS: []
TSC_POR_ETAPA: {}
```

Actualizar `ETAPA_ACTUAL`, `ETAPAS_COMPLETADAS` y `SPECS_IMPLEMENTADAS` al completar cada etapa.
Al finalizar cada etapa: registrar resultado de `npx tsc --noEmit` en `TSC_POR_ETAPA`.

---

## Contexto del framework

**Imports estándar para todos los specs:**
```typescript
import { expect } from '@playwright/test';
import { test } from '../../../../../../TestBase';  // ajustar profundidad
import {
    DashboardPage,
    NewTravelPage,
    OperationalPreferencesPage,
    TravelManagementPage,
    TravelDetailPage,
    ThreeDSModal,
    ThreeDSErrorPopup,
} from '../../../../../../pages/carrier';  // ajustar profundidad
import {
    loginAsDispatcher,
    expectNoThreeDSModal,
    STRIPE_TEST_CARDS,
    TEST_DATA,
} from '../../../../fixtures/gateway.fixtures';  // ajustar profundidad
```

**Tarjetas disponibles:**
```typescript
STRIPE_TEST_CARDS.successDirect      // 4242...4242 — aprobado sin 3DS
STRIPE_TEST_CARDS.success3DS         // 4000...3155 — 3DS → aprobar
STRIPE_TEST_CARDS.fail3DS            // 4000...9235 — 3DS → rechazar → NO_AUTORIZADO
STRIPE_TEST_CARDS.insufficientFunds  // fondos insuficientes
STRIPE_TEST_CARDS.declined           // rechazo genérico
STRIPE_TEST_CARDS.lostCard           // tarjeta perdida
STRIPE_TEST_CARDS.stolenCard         // tarjeta robada
STRIPE_TEST_CARDS.incorrectCvc       // CVC incorrecto
STRIPE_TEST_CARDS.expiredCard        // tarjeta expirada
STRIPE_TEST_CARDS.highestRisk        // riesgo máximo (antifraude)
STRIPE_TEST_CARDS.alwaysBlocked      // siempre bloqueada (antifraude)
```

**Regla general para variantes:**
Una variante de un TC base es el mismo flujo con datos alternativos. Usar como datos alternativos:
- Origen: `'Av. Corrientes 1234, Buenos Aires'`
- Destino: `'Av. Santa Fe 2100, Buenos Aires'`
- O reutilizar los datos del recorded como referencia de selectores reales.

**Regla para hold ON/OFF:**
- Hold ON: llamar `preferences.ensureHoldEnabled()` al inicio.
- Hold OFF: usar `try/finally` — desactivar hold antes del test, restaurar en `finally`.

```typescript
// Patrón hold OFF con try/finally
await loginAsDispatcher(page);
try {
    await preferences.goto();
    await preferences.setHoldEnabled(false);
    await preferences.save();
    // ... flujo del test ...
} finally {
    await preferences.goto();
    await preferences.setHoldEnabled(true);
    await preferences.save();
}
```

---

## ETAPA 1 — Archivo: `alta-viaje-full.recorded.ts`

**Archivo fuente:** `tests/features/gateway-pg/recorded/alta-viaje-full.recorded.ts`

**Qué cubre este recorded:** Formulario completo de Alta de Viaje — cliente, pasajero, origen, destino, tipo de servicio, tarifa, vehículo, tarjeta, envío. Este es el flujo base para todos los happy path.

**Specs a implementar en esta etapa:**

### 1a. `hold/apppax-hold-no3ds.spec.ts` — desactivar fixme e implementar:

| TC | Hold | Descripción | Datos |
|---|---|---|---|
| TC1051 | ON | variante datos alternativos | origin: 'Av. Corrientes 1234, Buenos Aires', dest: 'Av. Santa Fe 2100' |
| TC1057 | ON | set 2 — segunda corrida | mismos datos que TC1049 |
| TC1059 | ON | variante 2 | origin: 'Florida 100, CABA', dest: 'Palermo Soho, CABA' |
| TC1052 | OFF | variante datos alternativos | mismos alternativos que TC1051 |
| TC1058 | OFF | set 2 | mismos datos que TC1050 |
| TC1060 | OFF | variante 2 | mismos que TC1059 |

Todos usan `STRIPE_TEST_CARDS.successDirect`. Estructura idéntica a TC1049 (hold ON) o TC1050 (hold OFF) cambiando solo los datos de origin/destination en `travel.fillMinimum({...})`.

### 1b. `hold/colaborador-hold-no3ds.spec.ts` — desactivar fixme e implementar:

| TC | Hold | Descripción |
|---|---|---|
| TC1027 | ON | variante datos alternativos |
| TC1029 | ON | set 2 |
| TC1031 | ON | variante 2 |
| TC1033 | ON | variante 3 |
| TC1035 | ON | variante 4 |
| TC1028 | OFF | variante datos alternativos |
| TC1030 | OFF | set 2 |
| TC1032 | OFF | variante 2 |
| TC1034 | OFF | variante 3 |

Estructura idéntica a TC1025 (hold ON) y TC1026 (hold OFF). Usar `TEST_DATA.colaborador` como cliente/pasajero. Variar origin/destination con las 3 combinaciones de la tabla anterior.

### 1c. `hold/empresa-hold-no3ds.spec.ts` — desactivar fixme e implementar:

| TC | Hold | Descripción |
|---|---|---|
| TC1015 | ON | variante datos alternativos |
| TC1017 | ON | set 2 |
| TC1019 | ON | variante 2 |
| TC1021 | ON | variante 3 |
| TC1023 | ON | variante 4 |
| TC1016 | OFF | variante datos alternativos |
| TC1018 | OFF | set 2 |
| TC1020 | OFF | variante 2 |
| TC1022 | OFF | variante 3 |

Estructura idéntica a TC1013 y TC1014. Usar `TEST_DATA.empresa` como cliente/pasajero.

### 1d. `hold/apppax-hold-3ds.spec.ts` — desactivar fixme e implementar:

| TC | Hold | Descripción | Tarjeta |
|---|---|---|---|
| TC1055 | ON | variante datos alternativos | success3DS |
| TC1061 | ON | set 2 | success3DS |
| TC1063 | ON | variante 2 | success3DS |
| TC1056 | OFF | variante datos alternativos | success3DS |
| TC1062 | OFF | set 2 | success3DS |
| TC1064 | OFF | variante 2 | success3DS |

Estructura idéntica a TC1053 (hold ON) y TC1054 (hold OFF). Incluye paso de aprobar 3DS: `await threeDS.completeSuccess()`.

**Validación etapa 1:**
```bash
npx tsc --noEmit
npx playwright test tests/features/gateway-pg/specs/stripe/web/carrier/hold/ --list
```

---

## ETAPA 2 — Archivo: `card-declined-generic.recorded.ts`

**Archivo fuente:** `tests/features/gateway-pg/recorded/card-declined-generic.recorded.ts`

**Qué cubre este recorded:** Flujo de alta de viaje con tarjeta rechazada — qué mensaje muestra el sistema, qué estado queda el viaje, si navega o no a `/travels/:id`.

**Antes de implementar:** Leer el recorded completo para identificar:
1. ¿El sistema navega a `/travels/:id` después del rechazo?
2. ¿Aparece algún toast o mensaje de error visible?
3. ¿El viaje aparece en "En conflicto" o no aparece en ninguna columna?

**Specs a implementar en esta etapa:**

### 2a. `cargo-a-bordo/apppax-cargo-declines.spec.ts` — implementar los 5 TCs:

| TC | Tarjeta | Comportamiento esperado (verificar en recorded) |
|---|---|---|
| TC1082 | `STRIPE_TEST_CARDS.declined` | error visible / NO en Por asignar |
| TC1083 | `STRIPE_TEST_CARDS.insufficientFunds` | error visible / NO en Por asignar |
| TC1084 | `STRIPE_TEST_CARDS.lostCard` | error visible / NO en Por asignar |
| TC1085 | `STRIPE_TEST_CARDS.incorrectCvc` | error visible / NO en Por asignar |
| TC1086 | `STRIPE_TEST_CARDS.stolenCard` | error visible / NO en Por asignar |

**Estructura base para casos negativos:**
```typescript
test('[TS-STRIPE-TC1082] @regression pago rechazado genérico', async ({ page }) => {
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

    await test.step('Completar formulario — servicio cargo con tarjeta rechazada', async () => {
        await travel.selectServiceType('cargo');
        await travel.selectClient(TEST_DATA.appPaxPassenger);
        await travel.selectPassenger(TEST_DATA.appPaxPassenger);
        await travel.setOrigin(TEST_DATA.origin);
        await travel.setDestination(TEST_DATA.destination);
        await travel.selectCardByLast4(STRIPE_TEST_CARDS.declined.slice(-4));
    });

    await test.step('Enviar viaje', async () => {
        await travel.clickSelectVehicle();
        await travel.clickSendService();
    });

    await test.step('Verificar error — el viaje no avanza a Buscando conductor', async () => {
        // Usar el selector de error observado en el recorded
        // Ejemplo: await expect(page.locator('.toast-message')).toBeVisible();
        // O verificar que NO navegó a /travels/:id:
        // await expect(page).not.toHaveURL(/\/travels\/[\w-]+/);
    });
});
```

**Validación etapa 2:**
```bash
npx tsc --noEmit
npx playwright test tests/features/gateway-pg/specs/stripe/web/carrier/cargo-a-bordo/apppax-cargo-declines.spec.ts --list
```

---

## ETAPA 3 — Archivo: `card-insufficient-funds.recorded.ts`

**Archivo fuente:** `tests/features/gateway-pg/recorded/card-insufficient-funds.recorded.ts`

**Qué cubre este recorded:** Mismo flujo que etapa 2 pero con tarjeta de fondos insuficientes. Si el comportamiento es idéntico al rechazo genérico, reutilizar la estructura de etapa 2 directamente.

**Specs a implementar en esta etapa:**

### 3a. `cargo-a-bordo/apppax-cargo-antifraud.spec.ts` — implementar 3 TCs, mantener 2 en fixme:

| TC | Tarjeta | Acción |
|---|---|---|
| TC1087 | `STRIPE_TEST_CARDS.incorrectCvc` | implementar — misma estructura que declines |
| TC1088 | `STRIPE_TEST_CARDS.highestRisk` | implementar |
| TC1089 | `STRIPE_TEST_CARDS.alwaysBlocked` | implementar |
| TC1090 | N/A | mantener fixme — `'PENDIENTE: zip_fail_elevated no disponible en stripeTestData'` |
| TC1091 | N/A | mantener fixme — `'PENDIENTE: address_unavailable no disponible en stripeTestData'` |

**Validación etapa 3:**
```bash
npx tsc --noEmit
npx playwright test tests/features/gateway-pg/specs/stripe/web/carrier/cargo-a-bordo/apppax-cargo-antifraud.spec.ts --list
```

---

## ETAPA 4 — Archivo: `3ds-failure-no-autorizado.recorded.ts`

**Archivo fuente:** `tests/features/gateway-pg/recorded/3ds-failure-no-autorizado.recorded.ts`

**Qué cubre este recorded:** Flujo completo de falla 3DS — alta de viaje → modal 3DS → rechazar → estado NO_AUTORIZADO → botón "Reintentar" visible → flujo de reintento.

**Antes de implementar:** Leer el recorded para identificar:
1. Selector exacto del mensaje de error post-falla 3DS
2. Selector del botón "Reintentar autenticación"
3. Selector del red flag "Validación 3DS pendiente"
4. Si el viaje aparece en "En conflicto" en gestión de viajes

**Specs a implementar en esta etapa:**

### 4a. `cargo-a-bordo/apppax-cargo-3ds.spec.ts` — implementar TC1092 y TC1093, dejar TC1094/TC1095 en fixme si dependen de flujo mobile:

| TC | Tarjeta | Descripción |
|---|---|---|
| TC1092 | `success3DS` | cargo + 3DS aprobado → Buscando conductor |
| TC1093 | `fail3DS` | cargo + 3DS rechazado → NO_AUTORIZADO visible |
| TC1094 | `fail3DS` | cargo + 3DS rechazado + reintento exitoso |
| TC1095 | — | mantener fixme si requiere flujo mobile |

Para TC1092: mismo flujo que TC1081 pero con `success3DS` y paso de `await threeDS.completeSuccess()`.
Para TC1093: mismo flujo pero `fail3DS` y `await threeDS.completeFail()`, luego verificar estado NO_AUTORIZADO.

**Selectors confirmados en `3ds-failure.spec.ts` existente** (usar como referencia):
- `setupTravelWithFailed3DS()` — helper en fixtures
- `ThreeDSModal.completeFail()`
- `detail.expectStatus('NO_AUTORIZADO')`

**Validación etapa 4:**
```bash
npx tsc --noEmit
npx playwright test tests/features/gateway-pg/specs/stripe/web/carrier/cargo-a-bordo/apppax-cargo-3ds.spec.ts --list
```

---

## ETAPA 5 — Archivo: `edit-travel-new-card.recorded.ts` o `edit-travel-wallet-card.recorded.ts`

**Archivo fuente:** El que esté disponible primero entre:
- `tests/features/gateway-pg/recorded/edit-travel-new-card.recorded.ts`
- `tests/features/gateway-pg/recorded/edit-travel-wallet-card.recorded.ts`

**Qué cubre este recorded:** Flujo de edición de viaje desde gestión — abrir viaje existente → editar → cambiar tarjeta → guardar.

**Specs a implementar en esta etapa:**

### 5a. `operaciones/edicion-programados.spec.ts` — implementar TC base (P2-TC078):

Crear el POM `EditTravelPage` si no existe en `tests/pages/carrier/`, con los métodos observados en el recorded:
- `openEditModal()` o `clickEditButton()`
- `changeCard(last4: string)`
- `saveEdit()`

Luego implementar P2-TC078 con flujo:
1. Login carrier
2. Navegar a gestión de viajes
3. Abrir viaje programado existente
4. Editar — cambiar tarjeta
5. Verificar estado post-edición

Los TCs P2-TC079 a P2-TC083 (variantes) quedan en fixme hasta confirmar P2-TC078 estable.

### 5b. `operaciones/edicion-conflicto.spec.ts` — mantener todos en fixme

Este flujo requiere un viaje previo en estado "En conflicto" (hold fallido). No es posible implementarlo sin una precondición que genere ese estado. Dejar el fixme con nota actualizada:
```
'PENDIENTE: requiere viaje en estado NO_AUTORIZADO/En conflicto como precondición — implementar tras estabilizar flujo de falla 3DS'
```

**Validación etapa 5:**
```bash
npx tsc --noEmit
npx playwright test tests/features/gateway-pg/specs/stripe/web/carrier/operaciones/ --list
```

---

## Reglas generales para todas las etapas

1. **Leer el recorded completo antes de escribir cualquier línea** — el recorded es la fuente de selectores reales y comportamiento observado del sistema.
2. **No inventar selectores** — si un selector no aparece en el recorded ni en los POMs existentes, agregar un `// TODO: verificar selector real` comment.
3. **No modificar los TCs ya implementados** (TC1049, TC1050, TC1025, TC1026, TC1013, TC1014, TC1081, los 7 tests de 3ds-failure.spec.ts).
4. **No crear nuevos POMs** a menos que el recorded confirme una pantalla sin POM existente (caso edición en etapa 5).
5. **Mantener en fixme** los TCs que dependan de flujos mobile, datos externos no disponibles, o precondiciones no automatizables.
6. Correr `npx tsc --noEmit` al finalizar cada etapa — no avanzar si hay errores.

---

## Validación final (después de todas las etapas)

```bash
npx tsc --noEmit
npx playwright test tests/features/gateway-pg/specs/stripe/web/carrier/ --list
```

El `--list` debe mostrar todos los TCs de todos los specs. Los `test.fixme` aparecen como skipped — eso es esperado y correcto para los casos que aún dependen de grabaciones pendientes.
## Nota de bootstrap role-aware
- Para carrier y contractor, el bootstrap web debe leerse desde `tests/config/runtime.ts` y no desde un `/dashboard` hardcoded.
- Si el recorded valida un shell o un wait condition mejor que el actual, actualizar `LoginPage`, `DashboardPage` y el contrato de agentes/prompts en el mismo ciclo.
- Contractor puede compartir el login pero no siempre comparte el CTA `Nuevo Viaje`; no forzar esa ancla en etapas donde el role no la expone.
