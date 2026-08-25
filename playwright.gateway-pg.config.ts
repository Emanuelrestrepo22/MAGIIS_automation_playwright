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
  //   - pnpm test:test:gateway:stripe     → solo specs/stripe/**
  //   - pnpm test:test:gateway:authorize  → solo specs/authorize/** (BL-025)
  //   - pnpm test:test:gateway            → todos los gateways
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
      grepInvert: /@e2e-hybrid|@smoke|@critical|@visual/,
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
      grep: /@e2e-hybrid/,
      // Los flujos en device (wallet add-card + alta de viaje + polling del código) superan
      // los 120s globales. Timeout dedicado para no cortar pasos legítimos del dispositivo.
      timeout: 300 * 1000,
      // El alta de tarjeta en device es flaky por selección no-determinística de página/frame
      // del webview en Appium (el form nativo app-credit-card-payment-data SÍ monta, pero
      // switchContext cae a veces en el iframe de firebase-auth → no se ve el form). Retries para
      // estabilizar la regresión en device (práctica estándar de suites móviles); el retry de
      // tapAddCard cubre el residual dentro de una misma sesión. Debug determinístico del frame
      // pendiente vía Appium MCP.
      retries: 2,
      use: {
        browserName: "chromium",
      },
    },
    {
      name: "gateway-pg-chromium",
      // El journey de alta de viaje con hold (13 pasos: login + cliente/pasajero + direcciones
      // + form de tarjeta + validación contra la pasarela + vehículo + envío + grilla + cleanup)
      // supera los 120s globales cuando `apps-test` está lento — tarda ~1.5 min en verde.
      // Timeout dedicado para no cortar pasos legítimos, mismo criterio que el project
      // `e2e-mobile`. Sin esto el reporte da FALSOS NEGATIVOS: en la campaña Authorize del
      // 2026-07-29 hubo casos donde el viaje se creó, el oráculo "Por asignar" pasó y el
      // cleanup canceló el viaje, y el test igual se reportó `failed` por
      // "Test timeout of 120000ms exceeded" — el peor tipo de fallo para triar.
      // Nota: `test.describe.configure({ timeout })` dentro de las factories NO alcanza
      // (hold.factory declara 240s y aun así vencía a los 120s); el project sí manda.
      //
      // 300s → 600s (2026-07-29): con 300s el bloque B1 dio 3 failed donde 2 casos habían
      // COMPLETADO su objetivo — viaje creado, oráculo "Por asignar" PASS y viaje cancelado por
      // el cleanup — y el test se reportó failed igual. El journey aislado tarda ~90s, pero
      // encadenando casos contra `apps-test` lento el acumulado (login ~50s + 13 pasos) pasa los
      // 5 min. Con el techo bajo el reporte miente en la dirección más cara de triar: dice que
      // falló algo que funcionó.
      timeout: 600 * 1000,
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
