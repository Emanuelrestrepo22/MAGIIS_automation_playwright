// global-setup.ts


import { chromium, FullConfig } from '@playwright/test';
import * as dotenv from 'dotenv';

async function globalSetup(config: FullConfig) {
  // Carga variables de TEST
  dotenv.config({ path: '.env.test' });

  const baseUrl = process.env.BASE_URL;
  const username = process.env.USER_CARRIER;
  const password = process.env.PASS_CARRIER;

  if (!baseUrl) throw new Error('BASE_URL no está definida en .env.test');
  if (!username) throw new Error('USER_CARRIER no está definida en .env.test');
  if (!password) throw new Error('PASS_CARRIER no está definida en .env.test');

  const browser = await chromium.launch({ headless: false }); // headed para debug local
  const page = await browser.newPage();

  // Ir a la página de login
  await page.goto(baseUrl);

  // Selectores CSS que pasaste
  const emailInput = page.locator(
    'body > app-layout > login-carrier > div > div.content-login > div > div.card-login-right > form > div:nth-child(1) > input'
  );
  const passwordInput = page.locator(
    'body > app-layout > login-carrier > div > div.content-login > div > div.card-login-right > form > div:nth-child(2) > input'
  );
  const loginButton = page.locator(
    'body > app-layout > login-carrier > div > div.content-login > div > div.card-login-right > form > div.container-btn-login > button'
  );

  // 1) Click + escribir user
  await emailInput.click();
  await emailInput.fill(username);

  // 2) Click + escribir password
  await passwordInput.click();
  await passwordInput.fill(password);

  // 3) Click botón ingresar
  await loginButton.click();

  // Espera de navegación POST-login
  // Opcional: si conocés la URL destino, descomenta y ajusta el patrón
  // await page.waitForURL('**/carrier/home');
  await page.waitForLoadState('networkidle');

  // Guardar estado de sesión
  await page.context().storageState({
    path: 'storage/state-carrier-test.json',
  });

  await browser.close();
}

export default globalSetup;
