// playwright.config.ts
import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';

// 🔄 Carga dinámica del archivo .env (ej: ENV_FILE=.env.test)
dotenv.config({ path: process.env.ENV_FILE || '.env' });

export default defineConfig({
  testDir: './tests/specs',
  timeout: 60 * 1000,
  expect: {
    timeout: 5000
  },
  fullyParallel: true,

  // ✅ Ejecuta login y guarda storageState
  globalSetup: './global-setup.ts',

  // ✅ Reporters: estándar + HTML + tu reporter custom
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['./project-root/custom-reporter.ts'] // ⬅️ PATH CORREGIDO
  ],

  use: {
    baseURL: process.env.BASE_URL,
    headless: process.env.HEADLESS !== 'false',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    storageState: 'storage/state-carrier-test.json'
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' }
    },
    {
      name: 'firefox',
      use: { browserName: 'firefox' }
    },
    {
      name: 'webkit',
      use: { browserName: 'webkit' }
    }
  ]
});
