# TS-STRIPE-TC1011 — DRAFT: Alta de Viaje AppPax (Preautorizada) + Hold + Cobro App Driver

> **Estado:** DRAFT — análisis de gap, contrato de handoff y selectores conocidos.
> No contiene implementación funcional: requiere sesión Appium activa
> (emulador/dispositivo + servidor + APKs) para validar selectores faltantes.
> **Backlog:** `docs/ops/BACKLOG.md` → BL-021 (P2).

---

## 1. Identidad del caso

| Campo | Valor |
| --- | --- |
| `test_case_id` | `TS-STRIPE-TC1011` |
| Título | Validar Alta de Viaje desde app pax para usuario personal con Tarjeta Preautorizada — Hold desde Alta de Viaje y Cobro desde App Driver |
| Módulo | `gateway-pg-stripe/trip-create` |
| Portal | `app-pax` + `app-driver` (100% mobile híbrido, sin fase web) |
| Ambiente | TEST |
| Prioridad | P1 (flujo crítico de pago Stripe — hold + capture end-to-end) |
| `source_type` | md |
| `source_file` | `docs/gateway-pg/stripe/matriz_cases.md` |
| Sección fuente | Alta de Viaje desde App Pax – Usuario Personal / Tarjeta Preautorizada – sin validación 3DS |
| `critical_flow` | true |
| Alias colapsados | `TS-STRIPE-TC-RV003` → redirige a TC1011 |
| Tags | `@stripe`, `@gateway-pg`, `@hold`, `@app-pax`, `@app-driver`, `@carrier` |
| Flow E2E | `passenger-app-driver-app` (matcheable con `tests/e2e/gateway/flow2-passenger-driver/`) |

**Nota matriz:** TC1011 cae en subsección *"Tarjeta Preautorizada – sin validación 3DS"*.
Card canónica sugerida: `4242 4242 4242 4242`. Variante 3DS del mismo escenario vive en TC1013 y usa `4000 0025 0000 3155`.

---

## 2. Precondiciones

### Técnicas

- [ ] Appium Server corriendo (`APPIUM_SERVER_URL=http://localhost:4723`).
- [ ] Dispositivo/emulador Android con **dos apps** instaladas:
  - Passenger APK (`ANDROID_PASSENGER_APP_PATH`, package `com.magiis.app.test.passenger`).
  - Driver APK (`ANDROID_DRIVER_APP_PATH`, package `com.magiis.app.test.driver`).
- [ ] `getPassengerAppConfig()` y `getDriverAppConfig()` resuelven a dispositivos disponibles (pueden ser dos emuladores distintos o dos sesiones Appium secuenciales sobre el mismo dispositivo alternando package).
- [ ] Stripe test mode habilitado en backend (`pk_test_*`).

### De datos

- [ ] Usuario passenger de prueba: `PASSENGER_EMAIL=emanuel.restrepo@yopmail.com`, `PASSENGER_PASSWORD=123`.
- [ ] Usuario driver de prueba disponible, **online** o capaz de pasar a online desde `DriverHomeScreen.goOnline()`.
- [ ] **Precondición crítica — limpieza previa:** el pasajero NO debe tener viajes en estado
  `SEARCHING_DRIVER`, `EN_CURSO` ni `NO_AUTORIZADO`. Caso contrario la app bloquea con modal
  "Ya tiene un viaje creado" (ver `PassengerNewTripScreen.detectTripAlreadyCreatedModal()`).
  La limpieza se hace desde Carrier portal (ver `TC-PAX-NEW-TRIP-BLOCKED-BY-ACTIVE-OR-CONFLICT.md`).
- [ ] Wallet del passenger: sin tarjetas previas o con la tarjeta `...4242` ya persistida.
- [ ] Límite de crédito del passenger habilitado (si el backend retorna `limitExceeded=true`
  se emite `ENV_BLOCKER` — ver `throwIfCreditLimitExceeded()` en `PassengerNewTripScreen`).

### De ambiente

- [ ] Mock GPS habilitado en el emulador Driver para simular ruta.
- [ ] Ambiente TEST con backend que soporte `requires_capture` hold + `capture` posterior.

---

## 3. Flujo canónico (pasos)

### Fase A — Passenger (App Pax)

1. Login Passenger App → HomePage (`app-home.ion-page`).
2. Side menu → **Billetera** (`app-cards`) — validar estado inicial.
3. Si no existe tarjeta `...4242`: tap **AGREGAR** → modal `app-credit-card-payment-data`.
4. Ingresar número `4242 4242 4242 4242` en iframe `cardNumber` → `StripeElement--complete`.
5. Ingresar expiry `12/34` en iframe `cardExpiry` → `StripeElement--complete`.
6. Ingresar CVC `123` en iframe `cardCvc` → `StripeElement--complete`.
7. Ingresar **Nombre del Titular** en `ion-input[formcontrolname="cardholderName"]`.
8. Tap **GUARDAR** → **sin popup 3DS** → modal cierra → tarjeta `VISA ...4242` visible en wallet.
9. Volver a **Home** tab.
10. Completar **Origen** (`input[placeholder="Origen "]`) y elegir sugerencia.
11. Completar **Destino** (`input[placeholder="Destino "]`) y elegir sugerencia.
12. Tap **Seleccionar Vehículo** → navega a `app-travel-info`.
13. Verificar que `VISA ...4242` aparece como método de pago default.
14. Tap **Viajo Ahora Standard - $precio** → **sin popup 3DS** → navega a `app-driver-available`
    con texto "Buscando servicio... Standard" y botón `Cancelar Viaje` (`button.btn.outline`).
15. **Estado Stripe esperado:** `payment_intent.status = requires_capture` (hold autorizado).
16. **Checkpoint handoff:** escribir JourneyContext con `status='passenger-trip-created'` y luego `'ready-for-driver'` con `tripId` extraído vía `extractTripCode()`.

### Fase B — Driver (App Driver)

17. Driver App abierta y usuario **online** (`DriverHomeScreen.goOnline()` si no lo está).
18. Esperar notificación push → navega a `app-travel-confirm` (`DRIVER_CHECKPOINT_SELECTORS.confirm`).
19. Tap **Aceptar** (`DriverTripRequestScreen.acceptTrip()`) → checkpoint `confirm` observado.
20. Tap **Iniciar viaje** (`DriverTripNavigationScreen.startTrip()`) → estado `driver-en-route`.
21. Simular ruta GPS hasta llegar a destino → esperar checkpoint `in-progress`
    (`waitForTravelInProgressPage`).
22. Tap **Finalizar viaje** (`endTrip()`) + confirmar popup (`confirmEndTripPopup()`).
23. Pantalla de resumen (`DriverTripSummaryScreen`) → checkpoint `resume`.
24. Leer `getTotalAmount()` + `getActivePaymentMethod()`.
25. Tap **Confirmar** (`confirmAndFinish()`) → checkpoint `closed`.
26. **Estado Stripe esperado:** `payment_intent.status = succeeded` (capture efectivo del hold).
27. **Checkpoint handoff final:** JourneyContext `status='driver-completed'`.

### Fase C — Validación passenger (opcional)

28. (Opcional) Retornar a Passenger App → verificar pantalla post-viaje
    con cobro procesado (`PassengerTripStatusScreen.verifyPaymentProcessed()`).
29. JourneyContext final: `status='payment-validated'`.

---

## 4. Resultado esperado

> **Debería** crear el viaje con hold Stripe autorizado (`requires_capture`), permitir al driver aceptar, recorrer y finalizar el viaje, y ejecutar el capture del hold (`succeeded`) al cerrar el viaje desde la Driver App, dejando el JourneyContext en `driver-completed` (o `payment-validated` si se valida desde passenger).

Assertions concretas:

- `JourneyContext.status === 'driver-completed'` al terminar Fase B.
- `checkpoints` contiene `['wallet-added' | 'wallet-existing', 'trip-created', 'driver-assigned', 'trip-completed', 'payment-processed']`.
- `totalAmount` extraído desde `DriverTripSummaryScreen` > 0.
- `paymentMethod` coincide con `card-4242`.

---

## 5. Gap analysis — qué existe vs qué falta

### Screens Passenger (reutilizables)

| Screen | Estado | Métodos utilizables para TC1011 |
| --- | --- | --- |
| `PassengerHomeScreen` | ✅ Implementado | `ensureProfileMode('personal')` |
| `PassengerWalletScreen` | ✅ Implementado | `openWallet()`, `hasCard()`, `tapAddCard()`, `fillCardForm()`, `saveCard()`, `verifyCardAdded()` |
| `PassengerNewTripScreen` | ✅ Implementado | `openNewTrip()`, `setOrigin()`, `setDestination()`, `selectPaymentCard()`, `confirmTrip()`, `detectTripAlreadyCreatedModal()`, `dismissTripAlreadyCreatedModal()` |
| `PassengerTripStatusScreen` | ⚠️ Parcial | `waitForDriverAssigned()`, `waitForTripCompleted()`, `verifyPaymentProcessed()` — basados en keywords DOM heurísticos, sin selector canónico |

**Gap Passenger:** ninguno crítico para el happy path sin 3DS. Los selectores manualmente registrados en `TC-PAX-HOLD-STEPS.md` (Flujo 2 — sin 3DS) ya cubren los pasos 1–16 de Fase A.

### Screens Driver (reutilizables)

| Screen | Estado | Métodos utilizables para TC1011 |
| --- | --- | --- |
| `DriverHomeScreen` | ✅ Implementado | `isDriverOnline()`, `goOnline()`, `waitForClosedCheckpoint()` |
| `DriverTripRequestScreen` | ✅ Implementado | `waitForTripConfirmPage()`, `acceptTrip()` |
| `DriverTripNavigationScreen` | ✅ Implementado | `startTrip()`, `waitForTravelInProgressPage()`, `endTrip()`, `confirmEndTripPopup()` |
| `DriverTripSummaryScreen` | ✅ Implementado | `waitForSummaryScreen()`, `getTotalAmount()`, `getActivePaymentMethod()`, `confirmAndFinish()` |
| `DriverTripCompletionScreen` | ⚠️ Parcial | Snapshot de resumen post-viaje; no usado directo por harness |

**Gap Driver:** **no hay gap estructural**. Todos los checkpoints (`confirm → in-progress → resume → closed`) están cubiertos por `DriverTripHappyPathHarness.runHappyPath()`. Falta validar selectores en dispositivo real (`DRIVER_CHECKPOINT_SELECTORS` en `DriverFlowSelectors.ts` — requiere dump en vivo).

### Harness / Orquestación

| Harness | Estado | Observación |
| --- | --- | --- |
| `PassengerTripHappyPathHarness` | ✅ Implementado | Cubre Fase A + C standalone (no conecta Driver App) |
| `DriverTripHappyPathHarness` | ✅ Implementado | Cubre Fase B standalone |
| **Harness combinado TC1011** | ❌ **FALTA** | No existe orquestador que conecte las dos sesiones Appium y el `JourneyContext` entre ambas |
| `JourneyBridge` (E2E Flow 1) | ✅ Implementado | `initJourneyContext`, `markReadyForDriver`, `markMobileCompleted`. `buildJourneyId()` **hardcodea prefijo `flow1-`** — TC1011 necesita prefijo `flow2-` |

**Gap crítico — orquestación:**
1. No existe un spec Playwright que lance ambos harnesses secuencialmente (passenger termina → escribe JourneyContext → driver lee y ejecuta → final write).
2. `JourneyBridge.buildJourneyId()` asume Flow 1 (`flow1-<gateway>-...`). Para TC1011 hay que parametrizar el prefijo o crear `JourneyBridge` variante Flow 2.
3. `initJourneyContext()` asume `flowType: 'carrier-web-driver-app'`. Para TC1011 debe ser `'passenger-app-driver-app'` y `currentActor: 'passenger'`.

---

## 6. Selectores conocidos vs TODO

### Conocidos (fuente: `TC-PAX-HOLD-STEPS.md` Flujo 2 + dumps en `evidence/manual-capture/pax-hold/`)

| Pantalla | Selector | Notas |
| --- | --- | --- |
| Home Passenger | `app-home.ion-page`; tab **Inicio** en `ion-tabs` | Validado en Flujo 1 y 2 |
| Billetera | `app-cards`; empty state `Aún no tienes Tarjetas para este País.` | Validado |
| Modal nueva tarjeta | `app-credit-card-payment-data` (dentro de `ion-modal`) | Validado |
| Card number iframe | `ion-item.card-number.stripe-item` → `.stripe-element.StripeElement--complete` | Validado |
| Card expiry iframe | Segundo `ion-item.stripe-item` wrapper `stripe-element-small` | Validado |
| Card CVC iframe | Tercer `ion-item.stripe-item` wrapper `stripe-element-small` | Validado |
| Holder name | `ion-input[formcontrolname="cardholderName"] input` | Validado |
| GUARDAR btn | `button.btn.primary` con span `GUARDAR` | Validado |
| Origen input | `input[placeholder="Origen "]` | Validado |
| Destino input | `input[placeholder="Destino "]` | Validado |
| Travel info | `app-travel-info.ion-page`; `ion-row.travel-estimate`; `span.travel-type` | Validado |
| Payment method | `ion-row.travel-payment-info`; span `VISA ...4242` | Validado |
| Viajo Ahora btn | `button.travel-btn-confirm` (span `travel-type = Standard`) | Validado |
| Searching state | `app-driver-available.ion-page`; `button.btn.outline` = `Cancelar Viaje` | Validado |
| Modal "Ya tiene viaje" | `app-confirm-modal` con span `Ya tiene un viaje creado` | Validado (bloqueo) |

### TODO — requieren dump en vivo

| Pantalla | Selector heurístico actual | Acción requerida |
| --- | --- | --- |
| Passenger: estado "driver asignado" | keyword match DOM (`asignado`, `conductor`, `driver`, `en camino`) | Dump en vivo cuando llega el driver — registrar selector de `app-travel-status` o similar |
| Passenger: estado "viaje completado" | keyword match (`completado`, `finalizado`, `cobro`, `captured`, `resumen`) | Dump post-cierre desde driver — registrar texto canónico |
| Passenger: cobro procesado | keyword match (`cobro`, `pago`, `charged`, `captured`) | Dump cuando capture ejecutado — registrar UI elemento |
| Driver: checkpoints | `DRIVER_CHECKPOINT_SELECTORS.{confirm,in-progress,resume,closed}` en `DriverFlowSelectors.ts` | Confirmar URL tokens + webSelectors con dump driver app en dispositivo real |
| Driver Home: `isDriverOnline()` toggle | Definido en `DriverHomeScreen` | Validar contra dump driver actual |

---

## 7. Handoff contract Passenger → Driver

### JourneyContext — campos requeridos para TC1011

```json
{
  "journeyId": "flow2-stripe-hold-no3ds-<uuid8>",
  "testCaseId": "TS-STRIPE-TC1011",
  "flowType": "passenger-app-driver-app",
  "gateway": "stripe",
  "portal": "app-pax",
  "role": "passenger",
  "passengerProfileMode": "personal",
  "currentActor": "passenger",
  "phase": "passenger_trip_creation",
  "status": "draft",
  "requires3ds": false,
  "requiresMobileCompletion": true,
  "sharedCardForm": false,
  "tags": ["@e2e", "@stripe", "@hold", "@passenger", "@driver", "@TC1011"],
  "tripId": null,
  "driverId": null,
  "riderId": "<passenger user id>",
  "paymentReference": null,
  "cardReference": "card-4242",
  "driverHandoff": { "actor": "driver", "platform": "android", "status": "pending", "appPathEnv": "ANDROID_DRIVER_APP_PATH", "appiumServerEnv": "APPIUM_SERVER_URL" },
  "passengerHandoff": { "actor": "passenger", "platform": "android", "status": "pending", "appPathEnv": "ANDROID_PASSENGER_APP_PATH", "appiumServerEnv": "APPIUM_SERVER_URL" }
}
```

### Transiciones de estado

```
draft
  └─> passenger-trip-created   (después de Fase A, paso 14 — hold requires_capture)
       └─> ready-for-driver    (tripId extraído + JourneyContext persistido)
            └─> driver-accepted   (Fase B, paso 19)
                 └─> driver-en-route (paso 20-21)
                      └─> driver-completed (paso 25 — capture succeeded)
                           └─> payment-validated (Fase C opcional, paso 28)
                                └─> failed (cualquier paso con error)
```

### API de handoff requerida (adaptar `JourneyBridge`)

- `initJourneyContextPassenger(flowConfig, 'TS-STRIPE-TC1011')` — construye context `flow2-*`.
- `markPassengerTripCreated(journeyId, tripId, cardLast4)` — status `passenger-trip-created` + `ready-for-driver`.
- `markDriverCompleted(result)` — status `driver-completed` con `totalAmount`, `paymentMethod`, checkpoints.
- `readFinalContext(journeyId)` — ya existe, reutilizable.

---

## 8. Riesgos y gaps de integración

| # | Riesgo | Mitigación propuesta |
| --- | --- | --- |
| R1 | Dos apps Appium coexistiendo en mismo dispositivo/sesión pueden chocar en context switching (WEBVIEW passenger vs WEBVIEW driver) | Usar dos sesiones Appium secuenciales (passenger → end → driver start) o dos dispositivos/emuladores distintos |
| R2 | `JourneyBridge.buildJourneyId()` hardcoded a `flow1-*` | Parametrizar prefijo o crear variante Flow 2 antes de implementar spec TC1011 |
| R3 | `initJourneyContext()` asume `flowType='carrier-web-driver-app'` | Extender firma para aceptar `flowType` como parámetro |
| R4 | `PassengerTripStatusScreen` usa keywords heurísticos sin selectores canónicos — puede dar falsos positivos si el DOM cambia | Priorizar dump live durante próxima sesión Appium para formalizar selectores |
| R5 | El modal "Ya tiene viaje creado" (`ENV_BLOCKER`) puede disparar en sesiones paralelas si el user emanuel.restrepo@yopmail.com se usa en múltiples tests simultáneos | Serializar con `workers: 1` en el project `e2e` + limpieza previa desde Carrier |
| R6 | Notificación push del driver puede no llegar si el emulador no tiene Google Play Services o FCM configurado | Alternar a polling del backend: driver navega manualmente a lista de viajes si no hay push |
| R7 | `DriverTripHappyPathHarness` asume que el driver ya recibió un viaje — no espera handshake con passenger | Añadir espera explícita `waitForTripAvailable()` antes de `waitForTripConfirmPage()` para el caso TC1011 |
| R8 | Capture efectivo puede tardar varios segundos post cierre — timeout de `verifyPaymentProcessed` (120s) puede ser estrecho en ambientes lentos | Validar contra webhook Stripe o DB (no solo UI passenger) como fuente secundaria |
| R9 | Flow 2 spec actual (`tests/e2e/gateway/flow2-passenger-driver/flow2.e2e.spec.ts`) está marcado `test.fixme()` y planea 4 TCs propios (TC001–TC004) que no se mapean 1:1 con TC1011 | Decidir: (a) extender flow2 con variante TC1011 o (b) crear spec dedicado `flow2-tc1011-appPax-preautorizada.e2e.spec.ts` — ver recomendación abajo |

---

## 9. Recomendación de integración con Flow 2 existente

Opción elegida: **extender `tests/e2e/gateway/flow2-passenger-driver/flow2.e2e.spec.ts` con un bloque `[TS-STRIPE-TC1011]` paralelo a los `[E2E-FLOW2-TC001..004]` existentes**, en lugar de crear un spec dedicado, porque:

1. Flow 2 ya está pensado para `passenger-app-driver-app` — TC1011 es exactamente ese flujo.
2. Reutiliza `PassengerTripHappyPathHarness` + `DriverTripHappyPathHarness` sin duplicación.
3. Mantiene la trazabilidad matriz → spec (TC1011 convive con E2E-FLOW2-TC001, que es el mismo flujo pero con ID interno de proyecto).

Paralelamente dejar un skeleton en `tests/e2e/flow1-appPax-preautorizada-hold-cobro.e2e.spec.ts` **NO es recomendable** — el nombre sugiere Flow 1 (carrier+driver) y genera confusión. Se recomienda no crear spec adicional.

El entregable de este BL-021 es:
- Este `TC1011-DRAFT.md`.
- **Opcional:** agregar un bloque `test.describe('[TS-STRIPE-TC1011]')` con `test.fixme()` dentro de `flow2.e2e.spec.ts` cuando haya consenso con el PO.

---

## 10. Trazabilidad

| Artefacto | Path / referencia |
| --- | --- |
| Matriz fuente | `docs/gateway-pg/stripe/matriz_cases.md` (sección 2 — Tarjeta Preautorizada sin 3DS) |
| Normalized JSON | `docs/gateway-pg/stripe/normalized-test-cases.json` (entry `TS-STRIPE-TC1011`) |
| Alias colapsado | `TS-STRIPE-TC-RV003` → `TS-STRIPE-TC1011` |
| Evidencia manual (selectores) | `evidence/manual-capture/pax-hold/` + `TC-PAX-HOLD-STEPS.md` |
| TC hermanos (3DS) | `TS-STRIPE-TC1013` (mismo flujo con 3DS) |
| Spec objetivo | `tests/e2e/gateway/flow2-passenger-driver/flow2.e2e.spec.ts` (extender) |
| Mobile phase entry | `tests/e2e/gateway/flow2-passenger-driver/mobile-phase-passenger.ts` |
| Harness passenger | `tests/mobile/appium/harness/PassengerTripHappyPathHarness.ts` |
| Harness driver | `tests/mobile/appium/harness/DriverTripHappyPathHarness.ts` |
| Bridge handoff | `tests/e2e/gateway/shared/JourneyBridge.ts` (requiere variante Flow 2) |
| Types contract | `tests/features/gateway-pg/contracts/gateway-pg.types.ts` |
| Backlog item | `docs/ops/BACKLOG.md` → BL-021 |

---

## 11. Próxima acción (cuando haya sesión Appium)

1. Correr `PassengerTripHappyPathHarness` standalone con `CARD_LAST4=4242` y capturar dumps de `PassengerTripStatusScreen` en estados `driver-assigned`, `trip-completed`, `payment-processed`.
2. Consolidar selectores canónicos en `PassengerTripStatusScreen` (reemplazar keywords heurísticos).
3. Correr `DriverTripHappyPathHarness` standalone desde `tests/mobile/appium/scripts/validate-driver-happy-path.ts` para validar los 4 checkpoints del driver.
4. Extender `JourneyBridge` para soportar `flowType='passenger-app-driver-app'` (parametrizar `buildJourneyId` + `initJourneyContext`).
5. Agregar bloque `test.describe('[TS-STRIPE-TC1011]')` en `flow2.e2e.spec.ts` que orqueste Fase A + Fase B + Fase C.
6. Validación end-to-end en dispositivo real antes de quitar `test.fixme()`.

---

## 12. Comandos de ejecución (cuando esté desbloqueado)

```bash
# Standalone passenger (debugging Fase A)
E2E_JOURNEY_ID=standalone \
APPIUM_SERVER_URL=http://localhost:4723 \
PASSENGER_EMAIL=emanuel.restrepo@yopmail.com \
PASSENGER_PASSWORD=123 \
E2E_CARD_LAST4=4242 \
npx ts-node --esm tests/e2e/gateway/flow2-passenger-driver/mobile-phase-passenger.ts

# Standalone driver (debugging Fase B)
pnpm tsx tests/mobile/appium/scripts/validate-driver-happy-path.ts

# Spec E2E completo (cuando fixme sea removido)
pnpm playwright test tests/e2e/gateway/flow2-passenger-driver/flow2.e2e.spec.ts \
  --project=e2e --workers=1 --grep "@TC1011"
```
