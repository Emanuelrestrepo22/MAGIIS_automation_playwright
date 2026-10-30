import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";
import baseConfig from "./playwright.config";

// Config dedicada a la smoke de Otros Costos en la App Driver (TM-1099, Universal F1).
//
// Mismo patrón que `playwright.mg117-device.config.ts`: extiende la base y recorta.
// - Sin `globalSetup`: la base hace login de UI de carrier y contractor para dejar storageState;
//   esta suite no abre portales y NUNCA hace login con contraseña (la API usa una sesión guardada).
// - Un worker, sin paralelismo ni reintentos: hay UN dispositivo y la spec crea datos reales
//   (concepto + viaje); un reintento automático crearía un segundo viaje sobre el mismo chofer.
//
// OVERLAY DE DISPOSITIVO. `MOBILE_ENV_OVERLAY` (ej. `.env.emulator-uat`) se aplica ENCIMA del
// `.env.<ENV>` que ya cargó la base: `.env.uat` apunta al teléfono físico y el overlay cambia udid,
// modelo y chromedriver al emulador sin tocar el archivo del ambiente. Se evalúa también en cada
// worker (Playwright recarga la config), así que el overlay llega al proceso que abre Appium.
//
// GOTCHA de trazabilidad: NO pasar `--reporter=<x>` por CLI; pisa el `xray-reporter` de la base.
//
// Uso: `pnpm test:uat:othercosts:driver` (ver package.json).
if (process.env.MOBILE_ENV_OVERLAY) {
  dotenv.config({ path: process.env.MOBILE_ENV_OVERLAY, override: true });
}

export default defineConfig({
  ...baseConfig,
  globalSetup: undefined,
  testDir: "./tests/mobile/appium/driver/specs",
  testMatch: /other-costs-driver-close-smoke[.]spec[.]ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Sesión Appium + ir a disponible + aceptar/iniciar/finalizar + Otros + firma + cierre + oráculo API.
  timeout: 420 * 1000,
  projects: [
    {
      name: "device-othercosts-driver",
      use: { storageState: { cookies: [], origins: [] } },
    },
  ],
});
