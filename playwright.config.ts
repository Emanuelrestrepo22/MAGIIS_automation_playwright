// playwright.config.ts
import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";
import {
  getCurrentEnv,
  getEnvFile,
  getStorageStatePath,
} from "./tests/config/runtime";

// Este archivo concentra la configuración "general" de Playwright para el portal web.
// La idea es que casi todos los tests hereden esta base y solo las suites especiales
// extiendan lo necesario.

// Carga el .env correcto según ENV_FILE o ENV (ej: ENV=prod → .env.prod)
const envFile = getEnvFile();
dotenv.config({ path: envFile });

// Calculamos estos valores una sola vez para reutilizarlos en reporters, storage y artefactos.
const env = getCurrentEnv();

export default defineConfig({
  // Carpeta raíz donde vive la mayoría de las specs del proyecto.
  testDir: "./tests",

  // Timeouts globales que equilibran estabilidad y velocidad de feedback.
  timeout: 60 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: true,

  // Ejecuta login y guarda storageState antes de los tests
  globalSetup: "./global-setup.multi-role.ts",

  // Reporters: consola + HTML + JUnit (para GitLab CI pipeline Tests tab) + custom
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: `evidence/${env}/report` }],
    ["junit", { outputFile: `evidence/${env}/junit.xml` }],
    // Allure OPT-IN (ALLURE=1) — condicional para no romper el runner default.
    ...(process.env.ALLURE ? [["allure-playwright", { resultsDir: "allure-results", detail: true, links: [{ type: "tms", urlTemplate: "https://magiis.atlassian.net/browse/%s" }, { type: "issue", urlTemplate: "https://magiis.atlassian.net/browse/%s" }] }]] : []),
    // Xray OPT-IN (XRAY=1) — emite evidence/<env>/xray-results.json para import a Xray (fase B/C).
    ...(process.env.XRAY ? [["./tests/utils/reporters/xray-reporter.ts", { outputFile: `evidence/${env}/xray-results.json` }]] : []),
    ["./tests/utils/reporters/custom-reporter.ts"],
  ] as import("@playwright/test").ReporterDescription[],

  use: {
    // Config base compartida por cada test si la spec no la sobreescribe.
    baseURL: process.env.BASE_URL,
    headless: process.env.HEADLESS !== "false",
    trace: "on-first-retry",

    // Evidencia organizada por entorno
    screenshot: "only-on-failure",
    video: "retain-on-failure",

    // Nota: NO definimos storageState global aquí a propósito.
    // Motivo: el "Record new" / codegen hereda este `use` y, si cargáramos una
    // sesión carrier autenticada por defecto, cualquier URL (incluyendo
    // /contractor o /owner) aterrizaría en el dashboard carrier con login hecho.
    // Cada spec declara su propio storageState vía test.use({ role, storageState }).

    // Timeouts para flujos con 3DS (modales bancarios pueden tardar)
    actionTimeout: 15_000,
    navigationTimeout: 30_000,

    // Pre-concedemos geolocalización para que el prompt nativo de Chrome
    // ("¿Deseas usar tu ubicación?") no aparezca y bloquee la página en modo headed.
    // Sin esto, la app llama a navigator.geolocation y el diálogo nativo (fuera del DOM)
    // congela la interacción hasta un click manual → timeouts/"browser has been closed".
    // Coords = origin canónico de los datos de prueba (Buenos Aires).
    permissions: ["geolocation"],
    geolocation: { latitude: -34.60014, longitude: -58.37217 },
  },

  // Directorio de salida de artefactos por entorno
  // Usamos un nombre separado para evitar choques con carpetas bloqueadas por OneDrive.
  outputDir: `evidence/${env}/playwright-artifacts`,

  // Proyectos:
  //  - chromium/firefox/webkit → regresión cross-browser (sesión neutra).
  //  - carrier/contractor/web  → proyectos por rol con storageState preautenticado;
  //    útiles para correr una suite completa contra un portal específico.
  //  - codegen                 → sesión limpia explícita para "Record new".
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
    {
      name: "carrier",
      use: {
        browserName: "chromium",
        storageState: getStorageStatePath("carrier", env),
      },
    },
    {
      name: "contractor",
      use: {
        browserName: "chromium",
        storageState: getStorageStatePath("contractor", env),
      },
    },
    {
      name: "web",
      use: {
        browserName: "chromium",
        storageState: getStorageStatePath("web", env),
      },
    },
    {
      name: "codegen",
      use: {
        browserName: "chromium",
        storageState: { cookies: [], origins: [] },
      },
    },
  ],
});
