// playwright.config.ts
import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

// Carga el .env correcto según ENV_FILE o ENV (ej: ENV=prod → .env.prod)
const envFile = process.env.ENV_FILE ?? `.env.${process.env.ENV ?? 'test'}`;
dotenv.config({ path: envFile });

const env = process.env.ENV ?? 'test';

export default defineConfig({
  testDir: './tests/specs',
  timeout: 60 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: true,

  // Ejecuta login y guarda storageState antes de los tests
  globalSetup: './global-setup.ts',

  // Reporters: consola + HTML + custom
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: `evidence/${env}/report` }],
    ['./project-root/custom-reporter.ts'],
  ],

  use: {
    baseURL: process.env.BASE_URL,
    headless: process.env.HEADLESS !== 'false',
    trace: 'on-first-retry',

    // Evidencia organizada por entorno
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    storageState: `storage/state-carrier-${env}.json`,
  },

  // Directorio de salida de artefactos por entorno
  outputDir: `evidence/${env}/artifacts`,

  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox',  use: { browserName: 'firefox' } },
    { name: 'webkit',   use: { browserName: 'webkit' } },
  ],
});
