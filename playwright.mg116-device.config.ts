import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

// Config dedicada a la suite de dispositivo de MG-116 (autocomplete de la App PAX).
//
// POR QUE EXISTE, y no es cosmetico. Dos razones medidas el 2026-08-22:
//
// 1. EL TIMEOUT DE LOS HOOKS. `test.describe.configure({ timeout })` sube el timeout de los TESTS,
//    pero el `beforeAll` seguia tomando el valor global de la config base (60 s) y abortaba con
//    "beforeAll hook timeout of 60000ms exceeded" — se llevo puesta la superficie S7 entera. Un
//    beforeAll de este spec relanza la app y navega hasta tres pantallas: 60 s no alcanzan.
//    Subir el timeout ACA es lo unico que alcanza a los hooks.
//
// 2. EL globalSetup QUE NO SE USA. La config principal declara `global-setup.multi-role.ts`, que abre
//    browsers y loguea carrier y contractor por UI para dejar storageState. Esta suite habla con un
//    telefono por Appium y no toca ningun portal web: eran dos logins inutiles antes de cada corrida.
//    `globalSetup` es GLOBAL en Playwright — no se puede desactivar por project, de ahi la config aparte.
//
// Es el mismo patron, y por las mismas razones, que `playwright.mg117-device.config.ts`.
//
// Uso: `pnpm test:uat:mg116:all`.
//
// GOTCHA de trazabilidad: NO pasar `--reporter=<x>` por CLI. Ese flag PISA la lista completa de
// reporters de la config, incluido el `xray-reporter` que traduce las anotaciones `tms` a
// `evidence/<env>/xray-results.json`. Para ver salida tipo lista y conservar el reporter, usar `XRAY=1`.
export default defineConfig({
  ...baseConfig,
  // Sin globalSetup: se sobreescribe explicitamente el de la base a undefined.
  globalSetup: undefined,
  testDir: "./tests/mobile/appium/passenger/specs",
  testMatch: /pax-address-(behaviors|surfaces)[.]spec[.]ts$/,
  // Un solo worker y sin paralelismo: hay UN dispositivo fisico y la sesion Appium se comparte.
  fullyParallel: false,
  workers: 1,
  // Sin reintentos: un reintento vuelve a pagar el relanzamiento de la app y la navegacion, y la
  // disciplina de veredicto de esta suite ya distingue SIN_DATOS de FAIL — un rojo aca es una medicion,
  // no flakiness que convenga tapar repitiendo.
  retries: 0,
  // 240 s, el mismo valor que el spec ya declaraba en sus describe.configure. Aplica TAMBIEN a los
  // hooks, que es el punto (ver razon 1): con los 60 s de la base el beforeAll abortaba.
  //
  // NO subirlo mas. Se probo con 600 s y fue peor: cuando la sesion Appium no arranca — cosa que pasa
  // cuando el telefono acumula corridas y se queda sin memoria — cada intento fallido quema 10 minutos
  // en vez de 4, y una corrida entera se fue a 2,6 HORAS para dejar 28 tests sin correr. El timeout
  // no arregla un dispositivo degradado, solo hace mas cara la falla.
  timeout: 240 * 1000,
  // TECHO DE LA CORRIDA COMPLETA. Sin esto, un servidor Appium que muere a mitad de camino no aborta
  // nada: cada test agota su propio timeout contra un puerto muerto y la suite sigue. Medido el
  // 2026-08-23, exactamente asi: NUEVE HORAS (32.672 s) de corrida para cero mediciones. Con 33 tests
  // a 240 s el peor caso legitimo esta muy por debajo de 45 minutos, asi que cruzar este techo
  // significa que algo se rompio, no que la suite sea lenta.
  globalTimeout: 45 * 60 * 1000,
  projects: [
    {
      name: "device-mg116",
      // Sesion limpia explicita: esta suite no debe heredar storageState de ningun portal.
      use: { storageState: { cookies: [], origins: [] } },
    },
  ],
});
