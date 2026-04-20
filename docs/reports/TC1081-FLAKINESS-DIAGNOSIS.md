# TC1081 — Diagnóstico de Flakiness

**Fecha:** 2026-04-19
**Autor:** Agente diagnóstico (Claude Sonnet 4.6)
**Rama:** scripts/eslint-lint-diag-tc1081

---

## Test Case

- **ID:** TS-STRIPE-TC1081
- **Archivo spec:** `tests/features/smoke/specs/gateway-pg.smoke.spec.ts:230`
- **Descripción matriz:** Validar Alta de viaje desde carrier para usuario personal – cargo a bordo – pago exitoso
- **Flujo:** Portal Carrier (Playwright) — dispatcher crea viaje para pasajero AppPax con método de pago "Cargo a Bordo / Tarjeta de Crédito". No interviene Stripe form ni modal 3DS. El backend valida que el método esté habilitado para el pasajero y que no se haya superado el límite diario.

---

## Síntoma

El test falla de forma intermitente en el step `And: precondición verificada — pasajero AppPax tiene tarjeta 4242 activa` o, cuando la precondición pasa, en el step `And: formulario completado con método Cargo a Bordo` al completar la creación del viaje.

La URL post-submit redirige a `?limitExceeded=false` en lugar de crear el viaje satisfactoriamente. El paso de aserción en gestión de viajes (`expectPassengerInPorAsignar`) falla porque el viaje no queda en estado `SEARCHING_DRIVER`.

Documentado previamente en `docs/gateway-pg/stripe/EXTERNAL-BLOCKERS.md` (sección TC1081).

---

## Hipótesis de root cause

### Categoría sugerida: ENV / DATA

**Dos causas independientes confirmadas por evidencia documental:**

**Causa A — Método de pago no habilitado (ENV):**
El backend devuelve `limitExceeded=false` cuando el método "Cargo a Bordo / Tarjeta de Crédito" no está habilitado para el pasajero `emanuel.restrepo@yopmail.com` en el ambiente TEST. Esta es una configuración de datos de ambiente que no se restaura automáticamente entre ejecuciones.

**Causa B — Exceso de tarjetas vinculadas (DATA):**
El pasajero AppPax acumula tarjetas duplicadas (especialmente `last4=4242`) a través de ejecuciones paralelas o sucesivas del mismo usuario. Cuando el pasajero supera ~20 tarjetas, Stripe rechaza nuevos PaymentMethods y el backend responde con `limitExceeded=false` incluso seleccionando una tarjeta ya guardada. Este fenómeno está documentado en `card-precondition.ts:237-238`.

**Nota:** El test tiene una precondición activa en línea 241-248 que lanza error explícito si `hasRequiredCard=false`. Cuando la Causa A está activa, el test puede pasar la precondición de tarjeta pero fallar en el submit del viaje porque `limitExceeded` es una validación de negocio en el backend, independiente de la tarjeta vinculada.

---

## Evidencia recogida

**Código relevante — spec (gateway-pg.smoke.spec.ts:240-248):**
```typescript
await test.step('And: precondición verificada — pasajero AppPax tiene tarjeta 4242 activa [SMOKE-GW-TC04]', async () => {
    const check = await validateCardPrecondition(page, {
        passengerName:  PASSENGERS.appPax.apiSearchQuery!,
        requiredLast4:  '4242',
    });
    if (!check.hasRequiredCard) {
        throw new Error(`[SMOKE-GW-TC04] PRECONDICIÓN: AppPax sin tarjeta 4242 activa — vincular manualmente en TEST.`);
    }
});
```

La precondición solo valida `hasRequiredCard` (tarjeta 4242 vinculada) pero NO valida `creditCardEnabled` (método Cargo a Bordo habilitado para el pasajero). Esta es la brecha: el campo `creditCardEnabled` está disponible en `CardPreconditionResult` pero no se usa en el test.

**Código relevante — card-precondition.ts:419:**
```typescript
creditCardEnabled: (paymentData.paymentMethods ?? []).includes('CREDIT_CARD'),
```

El helper ya resuelve `creditCardEnabled` vía la respuesta de `paymentMethodsByPax`. El dato está disponible, simplemente no se valida en el test.

**Timeouts actuales:**
- Suite: `test.describe.configure({ timeout: 180_000 })` — adecuado.
- `travel.clickSelectVehicle()` / `travel.clickSendService()` — sin timeout explícito visible; dependen del default del POM (`waitForVehicleSelectionReady` no se llama en TC04).

**POMs involucrados:**
- `tests/pages/carrier/DashboardPage.ts`
- `tests/pages/carrier/NewTravelPage.ts` (extiende `NewTravelPageBase.ts`)
- `tests/pages/carrier/TravelManagementPage.ts`

**Helper de precondición:**
- `tests/features/gateway-pg/helpers/card-precondition.ts`

**Datos de prueba:**
- Pasajero: `PASSENGERS.appPax.apiSearchQuery` (Emanuel Restrepo `emanuel.restrepo@yopmail.com`)
- Tarjeta: `last4=4242` (Stripe success direct, sin 3DS)
- Método de pago: `CargoABordo` → texto dropdown: `'Tarjeta de Crédito - Cargo'`

**Dependencias externas:**
- Backend MAGIIS TEST: configuración de `paymentMethods` por pasajero, límites diarios
- Stripe: no interviene directamente (Cargo a Bordo cobra desde Driver App al finalizar viaje)

**Referencia documental preexistente:**
- `docs/gateway-pg/stripe/EXTERNAL-BLOCKERS.md:7-22`
- `docs/gateway-pg/stripe/CHANGELOG.md` (sin mención directa de TC1081)

---

## Propuesta de fix

### Opción A — low-risk: validar `creditCardEnabled` en la precondición

Extender el step de precondición existente para verificar también que el método Cargo a Bordo esté habilitado para el pasajero. Si no lo está, fallar el test con mensaje diagnóstico claro en lugar de dejar que el viaje falle silenciosamente en el submit.

**Diff mental (gateway-pg.smoke.spec.ts:240-248):**
```typescript
// ANTES
if (!check.hasRequiredCard) {
    throw new Error(`[SMOKE-GW-TC04] PRECONDICIÓN: AppPax sin tarjeta 4242 activa...`);
}

// DESPUÉS
if (!check.hasRequiredCard) {
    throw new Error(`[SMOKE-GW-TC04] PRECONDICIÓN FALLA: AppPax sin tarjeta 4242 activa — vincular manualmente en TEST.`);
}
if (!check.creditCardEnabled) {
    throw new Error(
        `[SMOKE-GW-TC04] PRECONDICIÓN FALLA: Método "Cargo a Bordo / Tarjeta de Crédito" NO habilitado para AppPax en TEST. ` +
        `Habilitar desde: Carrier → Configuración → Pasajeros → Emanuel Restrepo → Métodos de pago. ` +
        `Ref: docs/gateway-pg/stripe/EXTERNAL-BLOCKERS.md §TC1081`
    );
}
console.log(`[SMOKE-GW-TC04][PRE] AppPax tarjetas activas: ${check.activeCards}, tiene 4242: ${check.hasRequiredCard}, CargoABordo habilitado: ${check.creditCardEnabled}`);
```

**Beneficio:** el test falla fast en la precondición con mensaje exacto del blocker, en lugar de fallar en assertions de UI 30-60s después con un error críptico de "elemento no visible" o URL inesperada.

### Opción B — medium-risk: agregar `waitForVehicleSelectionReady` antes de `clickSelectVehicle`

En TC01, TC02, TC03, TC05, TC06, TC08 se llama `travel.waitForVehicleSelectionReady()` antes de `clickSelectVehicle()`. TC04 (TC1081) lo omite (línea 267-269). Si el backend tarda en procesar la creación del viaje con método Cargo a Bordo, el click en el botón de vehículo puede ocurrir antes de que esté disponible.

Agregar `await travel.waitForVehicleSelectionReady()` antes de `travel.clickSelectVehicle()` en TC04 haría el flujo consistente con los demás tests. Riesgo: si el botón no se habilita por Causa A, el test esperaría el timeout completo antes de fallar — Opción A es más eficiente como fix primario.

---

## Decisión para esta rama

**Se aplica fix Opción A en este mismo MR.**

El cambio es de una línea (agregar un `if (!check.creditCardEnabled)` check) en el step de precondición ya existente. No modifica el flujo de negocio ni los POMs. Convierte un fallo tardío opaco en un fallo rápido con mensaje diagnóstico completo.

---

## Fix aplicado

**Archivo:** `tests/features/smoke/specs/gateway-pg.smoke.spec.ts`
**Línea:** después de la comprobación `!check.hasRequiredCard` (línea ~247)

Se agrega la validación de `creditCardEnabled` en el step de precondición de TC04.

---

## Próximos pasos

- [x] Fix Opción A aplicado — precondición ahora valida `creditCardEnabled`
- [ ] Acción humana requerida: habilitar "Cargo a Bordo / Tarjeta de Crédito" para AppPax en TEST si está deshabilitado. Ver `docs/gateway-pg/stripe/EXTERNAL-BLOCKERS.md §TC1081`.
- [ ] Considerar Opción B (agregar `waitForVehicleSelectionReady`) en MR separado si el fix Opción A no es suficiente.
- [ ] Verificar si el mismo problema de `creditCardEnabled` afecta TC07 (TC1096) y TC09 (TC1111) que también usan Cargo a Bordo — aplicar mismo patrón si corresponde.
- [ ] Si el límite diario sigue siendo causa de fallo, investigar si existe endpoint para resetear el límite vía API o si requiere acción manual en el portal carrier.
