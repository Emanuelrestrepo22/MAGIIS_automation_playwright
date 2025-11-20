// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// ENV puede ser: test | uat | prod
const envName = process.env.ENV || 'test';

// Carga del .env específico por environment
dotenv.config({ path: `.env.${envName}` });

// Archivo de storageState por environment
const storageByEnv: Record<string, string> = {
  test: 'storage/state-carrier-test.json',
  uat:  'storage/state-carrier-uat.json',
  prod: 'storage/state-carrier-prod.json',
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  // Login previo + generación de storageState
  globalSetup: require.resolve('./global-setup'),

  // Config compartida
  use: {
    baseURL: process.env.BASE_URL,
    storageState: storageByEnv[envName],
    // Descomenta si querés controlar por variable:
    // headless: process.env.HEADLESS === 'true' || !!process.env.CI,
  },

  // Solo Chromium (Chrome) como navegador
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
