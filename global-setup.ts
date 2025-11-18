// global-setup.ts
import { chromium, FullConfig } from '@playwright/test';
import * as dotenv from 'dotenv';

async function globalSetup(config: FullConfig) {
  dotenv.config(); // carga .env.test por ejemplo

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(process.env.BASE_URL as string);
  await page.fill('#email', process.env.USER_CARRIER as string);
  await page.fill('#password-input', process.env.PASS_CARRIER as string);
  await page.click('text=Login'); // ajustar al selector real

  // Esperar a estar en el home
  await page.waitForURL('**/carrier/home'); // ajustar URL esperada

  await page.context().storageState({ path: 'storage/state-carrier-test.json' });
  await browser.close();
}

export default globalSetup;
