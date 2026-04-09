import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

export default defineConfig({
  // Partimos de la config general y recortamos solo lo necesario para la suite de gateway.
  ...baseConfig,
  // Gateway-pg vive en su propia carpeta porque suele requerir reglas de ejecución más estrictas.
  testDir: "./tests/features/gateway-pg/specs/stripe",
  fullyParallel: false,
  workers: 1,
  timeout: 60 * 1000,
  use: {
    // Repetimos estos timeouts explícitamente para dejar claro que son críticos en 3DS.
    ...baseConfig.use,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      // Reducimos la suite a Chromium porque los journeys de pagos son sensibles
      // y primero buscamos estabilidad funcional antes que cobertura cross-browser.
      name: "gateway-pg-chromium",
      use: {
        ...(Array.isArray(baseConfig.projects) && baseConfig.projects[0]?.use
          ? baseConfig.projects[0].use
          : { browserName: "chromium" }),
      },
    },
  ],
});
