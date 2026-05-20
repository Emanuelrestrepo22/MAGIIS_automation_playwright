import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config";

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
    // BL-043 (2026-05-19) — Unit project: specs con network mocking de
    // gateways. NO carga browser real para asserts UI — solo lanza el
    // page.route() interception y valida el comportamiento MAGIIS frente
    // a respuestas controladas del SDK. <2s por spec vs >30s vs sandbox.
    // Reproducible 100% (sin dependencia de servicios externos).
    {
      name: "unit",
      testMatch: /\.unit\.spec\.ts$/,
      use: {
        browserName: "chromium",
      },
    },
    // BL-043 (2026-05-19) — API project: contract tests directos contra
    // sandbox externo (Authorize, Stripe API). Match canónico *.api.spec.ts.
    // Override testDir porque los specs API viven en /api/, no en /specs/.
    // Los specs usan APIRequestContext nativo — no llaman al browser, pero
    // browserName requerido por el config base (overhead despreciable).
    {
      name: "api",
      testDir: "./tests/features/gateway-pg/api",
      testMatch: /\.api\.spec\.ts$/,
      use: {
        browserName: "chromium",
      },
    },
  ],
});
