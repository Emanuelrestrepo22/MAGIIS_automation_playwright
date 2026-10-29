import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

// Config dedicada a los guards de dispositivo de MG-117 (autocomplete de la App Driver).
//
// POR QUE UNA CONFIG SEPARADA Y NO UN PROJECT EN LA PRINCIPAL. `globalSetup` en Playwright es
// GLOBAL: no se puede desactivar por project. La config principal declara
// `global-setup.multi-role.ts`, que abre browsers y hace login de carrier y contractor para dejar
// storageState preautenticado. Esta suite no toca ningun portal web — habla con el dispositivo por
// Appium — asi que ese setup eran dos logins de UI que no se usan, medidos en ~28 de los ~30
// segundos previos a la corrida. Sin `globalSetup` la suite arranca directo contra el telefono.
//
// Es el mismo patron que `playwright.gateway-pg.config.ts`: extender la base y recortar. Lo
// usaba tambien `playwright.mg116-api.config.ts`, retirado el 2026-08-22 cuando la suite de
// contrato de MG-116 se movio a magiis-api-e2e (las automatizaciones de API viven en ese repo).
//
// Uso: `pnpm test:uat:mg117:all` (ver package.json).
//
// GOTCHA de trazabilidad: NO pasar `--reporter=<x>` por CLI. Ese flag PISA la lista completa de
// reporters de la config, incluido el `xray-reporter` que traduce las anotaciones `tms` a
// `evidence/<env>/xray-results.json`. Con `--reporter=list` la corrida se ve bien y el JSON de Xray
// nunca se escribe. Para ver salida tipo lista y conservar el reporter, usar `XRAY=1` sin el flag.
export default defineConfig({
  ...baseConfig,
  // Sin globalSetup: se sobreescribe explicitamente el de la base a undefined.
  globalSetup: undefined,
  testDir: "./tests/mobile/appium/driver/specs",
  testMatch: /driver-address-surfaces[.]spec[.]ts$/,
  // Un solo worker y sin paralelismo: hay UN dispositivo fisico. Appium no se comparte.
  fullyParallel: false,
  workers: 1,
  // Sin reintentos: la bateria corre una sola vez en `beforeAll` y los 12 tests leen su resultado,
  // asi que un reintento no volveria a medir nada — repetiria la lectura del mismo array.
  retries: 0,
  // La bateria completa son 11 casos con settle de 4,2 s cada uno, mas la sesion Appium (~15 s),
  // la navegacion por taps nativos y tres escenarios de inyeccion de fallos. El spec ya declara
  // este timeout en su `describe.configure`; se repite aca para que valga tambien si se corre suelto.
  timeout: 600 * 1000,
  projects: [
    {
      name: "device-mg117",
      // Sesion limpia explicita: esta suite no debe heredar storageState de ningun portal.
      use: { storageState: { cookies: [], origins: [] } },
    },
  ],
});
