# Screen canónica del tramo resumen/cierre del Chofer — recomendación (paso 0)

Fecha: 2026-11-11. Solo lectura de `tests/mobile/appium/driver/`.

## Recomendación

Queda canónica **`DriverTripSummaryScreen`**. **`DriverTripCompletionScreen`** se marca `@deprecated` y se retira cuando se migre `DriverTripNavigationScreen` (ver abajo).

## Evidencia

| Aspecto | `DriverTripSummaryScreen` (429 l) | `DriverTripCompletionScreen` (273 l) |
|---|---|---|
| Quién la usa | `harness/DriverTripHappyPathHarness.ts:8,186,203` (camino real del runner F5, líneas 138-150); `harness/DriverCargoDeclineHarness.ts:30,904,918`; `scripts/driver-cargo-payment-validate.ts:23,140` | Solo `driver/DriverTripNavigationScreen.ts:10,398,403` (métodos `verifyTripCompleted` y `closeTrip`) |
| Consumidores de ese puente | — | Ninguno: `verifyTripCompleted` y `closeTrip` no se llaman desde ningún archivo de `tests/mobile/appium/` (grep). Es código muerto transitivo |
| Selectores | Confirmados con DOM dump 2026-04-13 (`/TravelResumePage`, `app-travel-resume`, `button.btn.finish`), cabecera `DriverTripSummaryScreen.ts:1-23`; usa `DRIVER_ACTION_SELECTORS`/`DRIVER_UI_TEXTS` | Heurística: `waitForCompletionScreen` acepta cualquier texto `finalizado|completado|pago|amount|resumen` (`:136-166`); `close()` tiene `TODO: reemplazar heurística del cierre por selector confirmado` (`:~190`) |
| Cobertura funcional | Pago (`selectPaymentMethod`, `assertPaymentMethod`, `getActivePaymentMethod`), total (`getTotalAmount`), cierre (`confirmAndFinish`), firma de cuenta corriente (`requiresSignature`, `signAndConfirm`), extras (`addToll`, `addParking`) | Espera + monto cobrado + cierre genérico; sin firma ni pago |
| Cubierta por unit | `DriverFlowSelectors.unit.ts` cubre los selectores que consume | Ninguna |

## Siguiente paso sugerido (fuera de este PR)

1. En `DriverTripNavigationScreen`, quitar `verifyTripCompleted`/`closeTrip` (sin consumidores) o redirigirlos a `DriverTripSummaryScreen`.
2. Borrar `DriverTripCompletionScreen.ts` y, antes, revisar `gateway-pg/DriverTripCompletionDraft.ts` (borrador homónimo, no importa la clase; verificar que no la referencie por texto).
3. No mover `addToll`/`addParking` a PBO hasta que `OtherCostsPBO` tenga >= 2 consumidores (regla PBO (c) del doc).
