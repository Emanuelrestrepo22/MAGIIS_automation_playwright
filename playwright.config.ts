import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

// 🔄 Carga dinámica del archivo .env (ej: ENV_FILE=.env.test)
dotenv.config({ path: process.env.ENV_FILE || '.env' });

export default defineConfig({
  testDir: './tests/specs',
  timeout: 60 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,

  globalSetup: './global-setup.ts', // ✅ Ejecuta login y guarda storageState

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.BASE_URL,
    headless: process.env.HEADLESS !== 'false', // ✅ Se puede setear HEADLESS=false en local
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    storageState: 'storage/state-carrier-test.json', // ✅ Usa el login guardado
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
    {
      name: 'firefox',
      use: { browserName: 'firefox' },
    },
    {
      name: 'webkit',
      use: { browserName: 'webkit' },
    },
  ],
});
