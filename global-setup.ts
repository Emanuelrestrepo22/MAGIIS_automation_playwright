//global-setup.ts
import { chromium, FullConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
import { loginSelectors } from './tests/selectors/login';


async function globalSetup(config: FullConfig) {
  dotenv.config({ path: '.env.test' });

  const baseUrl = process.env.BASE_URL;
  const username = process.env.USER_CARRIER;
  const password = process.env.PASS_CARRIER;

  if (!baseUrl) throw new Error('❌ BASE_URL no está definida en .env.test');
  if (!username) throw new Error('❌ USER_CARRIER no está definida en .env.test');
  if (!password) throw new Error('❌ PASS_CARRIER no está definida en .env.test');

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false', // por defecto true, false solo si se indica
  });
  const page = await browser.newPage();

  console.log('[GlobalSetup] Navegando a:', baseUrl);
  //await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.goto(`${baseUrl}/carrier/#/auth/login`, { waitUntil: 'networkidle' });


  // ✅ Selectores simplificados (más robustos)
  const emailInput = page.locator(loginSelectors.emailInput);
  console.log('[GlobalSetup] Esperando que #email sea visible...');
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  const passwordInput = page.locator(loginSelectors.passwordInput);
  const loginButton = page.locator(loginSelectors.submitButton);
  await page.screenshot({ path: 'debug-login.png' });


  console.log('[GlobalSetup] Completando login con usuario:', username);
  await emailInput.fill(username);
  await passwordInput.fill(password);
  await loginButton.click();

  // ✅ Esperar redirección (ajusta la URL real del dashboard)
  await page.waitForURL('**/dashboard', { timeout: 15000 });

  // ✅ Validar que el login fue exitoso con presencia de nombre de usuario
  const userName = page.locator('span.user-name-text');
  await userName.waitFor({ state: 'visible', timeout: 5000 });

  console.log('[GlobalSetup] Login exitoso. Guardando estado de sesión...');

  await page.context().storageState({
    path: 'storage/state-carrier-test.json',
  });

  await browser.close();
}

export default globalSetup;
