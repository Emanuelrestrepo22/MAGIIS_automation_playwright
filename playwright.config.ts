// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Carga de variables por defecto desde .env.test (environment TEST)
const envName = process.env.ENV || 'test';    
dotenv.config({ path: `.env.${envName}` });


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

  // Login previo y storageState para reutilizar sesión
  globalSetup: require.resolve('./global-setup'),

  // Opciones compartidas para todos los proyectos
  use: {
    baseURL: process.env.BASE_URL,
    storageState: storageByEnv[envName],
    headless: process.env.HEADLESS === 'true',   // ver punto 3,
    // trace: 'on-first-retry',
  },

  // Proyectos por navegador
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // móviles y otros navegadores quedan comentados para cuando los necesites
  ],

  // webServer opcional si tu app corre local
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
