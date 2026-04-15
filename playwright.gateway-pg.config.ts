import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

export default defineConfig({
  // Partimos de la config general y recortamos solo lo necesario para la suite de gateway.
  ...baseConfig,
  // Gateway-pg vive en su propia carpeta porque suele requerir reglas de ejecución más estrictas.
  testDir: "./tests/features/gateway-pg/specs/stripe",
  fullyParallel: false,
  workers: 1,
  timeout: 120 * 1000,
  use: {
    // Repetimos estos timeouts explícitamente para dejar claro que son críticos en 3DS.
    ...baseConfig.use,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "smoke",
      grep: /@smoke/,
      use: {
        browserName: "chromium",
      },
    },
    {
      name: "critical",
      grep: /@critical/,
      use: {
        browserName: "chromium",
      },
    },
    {
      name: "regression-web",
      grepInvert: /@mobile|@smoke|@critical/,
      use: {
        browserName: "chromium",
      },
    },
    {
      name: "cargo-a-bordo",
      grep: /@cargo-a-bordo/,
      use: {
        browserName: "chromium",
      },
    },
    {
      name: "e2e-mobile",
      grep: /@mobile/,
      use: {
        browserName: "chromium",
      },
    },
    {
      name: "gateway-pg-chromium",
      use: {
        browserName: "chromium",
      },
    },
  ],
});
