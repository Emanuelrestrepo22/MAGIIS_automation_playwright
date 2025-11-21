import { defineConfig, PlaywrightTestConfig } from '@playwright/test';
import MyReporter from './project-root/custom-reporter/MyReporter';
import * as dotenv from 'dotenv';
dotenv.config();

const config: PlaywrightTestConfig = {
  testDir: './tests/specs',
  timeout: 30 * 1000,
  retries: 1,
  workers: 1,
  reporter: [
    [new MyReporter()], // ✅ Instancia del custom reporter
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ]
};

export default defineConfig(config);
