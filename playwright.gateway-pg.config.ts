import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";
import { getCurrentEnv, getStorageStatePath } from "./tests/config/runtime";

// Resolvemos env una vez para reutilizarlo en projects que necesitan storageState.
const env = getCurrentEnv();

export default defineConfig({
  // Partimos de la config general y recortamos solo lo necesario para la suite de gateway.
  ...baseConfig,
  // Gateway-pg vive en su propia carpeta porque suele requerir reglas de ejecución más estrictas.
  //
  // BL-024 + organización 2026-05-13 — multi-gateway:
  // testDir cubre TODOS los gateways (stripe/, authorize/ cuando entre runtime,
  // _parametrized/ para specs cross-gateway). Para correr solo un gateway,
  // usar los scripts npm específicos:
  //   - pnpm test:test:gateway-pg:stripe     → solo specs/stripe/**
  //   - pnpm test:test:gateway-pg:authorize  → solo specs/authorize/** (BL-025)
  //   - pnpm test:test:gateway-pg            → todos los gateways
  testDir: "./tests/features/gateway-pg/specs",
  testMatch: /\.spec\.ts$/,
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
      // BL-044 — excluir @visual también para que la regresión web por default
      // no intente comparar baselines de visual regression (opt-in vía --project=visual).
      grepInvert: /@mobile|@smoke|@critical|@visual/,
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
    {
      // BL-044 — Visual regression opcional, opt-in.
      // NO incluido en regression-web ni smoke por default.
      // Correr con: pnpm exec playwright test --project=visual -c playwright.gateway-pg.config.ts
      // Generar baselines (humano, una sola vez por componente):
      //   pnpm exec playwright test --project=visual --update-snapshots -c playwright.gateway-pg.config.ts
      name: "visual",
      testDir: "./tests/features/gateway-pg/specs/visual",
      use: {
        browserName: "chromium",
        storageState: getStorageStatePath("carrier", env),
      },
    },
  ],
});
