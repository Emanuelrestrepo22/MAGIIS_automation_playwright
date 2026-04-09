// playwright.config.ts
import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";
import {
  getCurrentEnv,
  getDefaultRole,
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
const defaultRole = getDefaultRole();

export default defineConfig({
  // Carpeta raíz donde vive la mayoría de las specs del proyecto.
  testDir: "./tests",

  // Timeouts globales que equilibran estabilidad y velocidad de feedback.
  timeout: 60 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: true,

  // Ejecuta login y guarda storageState antes de los tests
  globalSetup: "./global-setup.multi-role.ts",

  // Reporters: consola + HTML + custom
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: `evidence/${env}/report` }],
    ["./project-root/custom-reporter.ts"],
  ],

  use: {
    // Config base compartida por cada test si la spec no la sobreescribe.
    baseURL: process.env.BASE_URL,
    headless: process.env.HEADLESS !== "false",
    trace: "on-first-retry",

    // Evidencia organizada por entorno
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    storageState: getStorageStatePath(defaultRole, env),

    // Timeouts para flujos con 3DS (modales bancarios pueden tardar)
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  // Directorio de salida de artefactos por entorno
  outputDir: `evidence/${env}/artifacts`,

  // Navegadores soportados para la regresión cross-browser.
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
