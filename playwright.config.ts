import { defineConfig, PlaywrightTestConfig } from '@playwright/test';
import MyReporter from './project-root/custom-reporter';
import * as dotenv from 'dotenv';
dotenv.config();

const config: PlaywrightTestConfig = {
  testDir: './tests/specs',
  timeout: 30 * 1000,
  retries: 1,
  workers: 1,
  reporter: [
    [new MyReporter()], // ✅ Instancia del custom reporter
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    // Usa BASE_URL desde .env, con fallback al entorno de pruebas compartido
    baseURL: process.env.BASE_URL ?? 'https://apps-test.magiis.com',
    headless: true,
  },
};

export default defineConfig(config);
