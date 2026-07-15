# Runbook — E2E UAT green-run en CI

> Recipe para dar **green-run consistente a todos los TCs** contra UAT desde CI, sin el muro
> del FS de OneDrive que rompe el runner local.

## Por qué CI (y no local)

El repo vive bajo OneDrive. El runner local de Playwright falla intermitente al cargar
`playwright-core` / `@playwright/test` (`UNKNOWN: read`, `ERR_MODULE_NOT_FOUND`) — es el
filesystem de OneDrive, **no** UAT ni los tests ni los locators (validado: los flujos SÍ son
drivables; el smoke API y la UI por MCP corren OK contra UAT). En un runner Ubuntu con clone
fresco + `pnpm install`, `tsc` y el runner funcionan normal. **Conclusión: el green-run
consistente se corre en CI (o un clone fuera de OneDrive), no en el checkout de OneDrive.**

## Cómo correr

GitHub → **Actions → "E2E Tests — UAT Environment" → Run workflow**, elegir `scope`:

| scope | qué corre |
| --- | --- |
| `all` | regression + gateway (`playwright.gateway-pg.config.ts`) + flights (`tests/features/flights`) |
| `regression` | `--grep @regression` (config base) |
| `gateway` | suite gateway-pg (`--grep @gateway`) |
| `flights` | `tests/features/flights` (alta + edición de vuelo) |
| `smoke` | `--grep @smoke` |

Input opcional `test_filter`: patrón `-g` extra. Artefacto: **`allure-report-uat-<run>`** (14 días);
en fallo, `evidence-uat-<run>` (7 días).

## Secrets requeridos (Settings → Secrets and variables → Actions · environment `UAT`)

| Secret | Valor |
| --- | --- |
| `USER_CARRIER` / `PASS_CARRIER` | carrier UAT **con la app de Vuelos (AVIATION) vinculada** — necesario para que `getFlights` devuelva vuelos (ver caveat) |
| `USER_CONTRACTOR` / `PASS_CONTRACTOR` | portal contractor |

Vars opcionales: `BASE_URL` (default `https://apps-uat.magiis.com`), `AUTH_API_URL`.

## Caveats (honestos — leer antes de esperar 100% verde)

1. **Estado de vinculación AVIATION del carrier (crítico para flight).** `getFlights` = proxy
   FlightAware AeroAPI y solo devuelve vuelos si el carrier **tiene la app Vuelos vinculada**.
   El carrier `uatremiseriamagiis` mostró "No se encontraron vuelos" (app NO vinculada) → alta
   manual. Para green-run de los TCs de flight-API usar un carrier CON AVIATION vinculada; el
   flujo **manual** (sin API) está en el recording `app-link-lifecycle` y es otro camino de test.
2. **Specs de flights = referencia, aún sin validación runtime.** `features/flights/*` derivan de
   recordings de codegen; algunos locators (selección de fila del vuelo, confirm de Recalcular)
   están marcados `NOTE(tier3-recorder)` y la disponibilidad de vuelos es data-dependiente. La
   **primera corrida en CI va a surfacear cuáles necesitan ajuste de selector/dato** → iterar con
   el Allure. NO se garantiza verde en la primera pasada; el gateway-pg sí es la suite madura.
3. **Tag `@flight`.** Las specs de flight no llevan `@regression` → se corren con `scope=flights`
   o `scope=all` (no entran en `scope=regression`).
4. **Auto-triggers desactivados (BL-035).** El workflow es `workflow_dispatch` only, como el resto.

## Flujo de iteración a verde

1. Correr `scope=all` (o `flights` para acotar) → bajar el `allure-report` del artefacto.
2. Por cada fallo: ajustar selector/dato en el POM/spec (los `NOTE(tier3-recorder)` son los
   candidatos) → commit → re-run.
3. Repetir hasta verde. Los flujos ya están probados como drivables (UI por MCP + smoke API),
   así que los fixes son de selector/dato puntual, no de arquitectura.
