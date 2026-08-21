import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

// Config dedicada a la suite de contrato API de MG-116 (places/autocomplete).
//
// POR QUE UNA CONFIG SEPARADA Y NO UN PROJECT EN LA PRINCIPAL. `globalSetup` en Playwright es
// GLOBAL: no se puede desactivar por project. La config principal declara
// `global-setup.multi-role.ts`, que abre browsers y hace login de carrier y contractor para dejar
// storageState preautenticado. Esta suite no toca browser ni portales web — se autentica sola por
// HTTP con `RoleToAttempt: ROLE_PASSENGER` — asi que ese setup era ~28 de los ~30 segundos de la
// corrida y dos logins de UI que no se usan. Omitiendo `globalSetup` aca, la suite queda en el
// orden de 1-2 segundos y no depende de que los portales web esten sanos.
//
// Es el mismo patron que ya usa `playwright.gateway-pg.config.ts`: extender la base y recortar.
//
// Uso: `pnpm test:uat:mg116:api` (ver package.json).
//
// GOTCHA para trazabilidad: NO pasar `--reporter=<x>` por CLI. Ese flag PISA la lista completa de
// reporters de la config, incluido el `xray-reporter` que traduce las anotaciones `tms` a
// `evidence/<env>/xray-results.json`. Con `--reporter=list` la corrida se ve bien y el JSON de Xray
// nunca se escribe. Para ver salida tipo lista y conservar el reporter, usar `XRAY=1` sin el flag.
export default defineConfig({
  ...baseConfig,
  // Sin globalSetup: se sobreescribe explicitamente el de la base a undefined.
  globalSetup: undefined,
  testDir: "./tests/features/mg116/api",
  testMatch: /\.api\.spec\.ts$/,
  // Un solo worker: el token del pasajero se cachea por worker, y con 3 tests no hay nada que ganar
  // paralelizando salvo 3 POST /auth/login en vez de 1.
  fullyParallel: false,
  workers: 1,
  // Sin reintentos: un fallo aca es un cambio real del contrato del backend, no flakiness de UI.
  retries: 0,
  timeout: 30 * 1000,
  projects: [
    {
      name: "api-mg116",
      // Sesion limpia explicita: esta suite no debe heredar storageState de ningun portal.
      use: { storageState: { cookies: [], origins: [] } },
    },
  ],
});
