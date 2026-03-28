//global-setup.ts
import type { FullConfig } from "@playwright/test";
import { chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import { loginSelectors } from './tests/selectors/login';

async function globalSetup(config: FullConfig) {
  // Carga el .env correcto según ENV_FILE o el entorno (ENV)
  const envFile = process.env.ENV_FILE ?? `.env.${process.env.ENV ?? 'test'}`;
  dotenv.config({ path: envFile });

  const env = process.env.ENV ?? 'test';
  const baseUrl = process.env.BASE_URL;
  const username = process.env.USER_CARRIER;
  const password = process.env.PASS_CARRIER;
  const loginPath = process.env.LOGIN_PATH ?? '/carrier/#/auth/login';
  const dashboardPattern = process.env.DASHBOARD_URL_PATTERN ?? '**/dashboard';
  const storageStatePath = `storage/state-carrier-${env}.json`;

  if (!baseUrl) throw new Error(`❌ BASE_URL no está definida en ${envFile}`);
  if (!username)
		throw new Error(`❌ USER_CARRIER no está definida en ${envFile}`);
  if (!password)
		throw new Error(`❌ PASS_CARRIER no está definida en ${envFile}`);

  console.log(`[GlobalSetup] Entorno: ${env.toUpperCase()}`);
  console.log(`[GlobalSetup] Navegando a: ${baseUrl}${loginPath}`);

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
  });
  const page = await browser.newPage();

  await page.goto(`${baseUrl}${loginPath}`, { waitUntil: 'load' });

  const emailInput = page.locator(loginSelectors.emailInput);
  console.log('[GlobalSetup] Esperando que #email sea visible...');
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });

  const passwordInput = page.locator(loginSelectors.passwordInput);
  const loginButton = page.locator(loginSelectors.submitButton);

  console.log('[GlobalSetup] Completando login con usuario:', username);
  await emailInput.fill(username);
  await passwordInput.fill(password);
  await loginButton.click();

  // waitForFunction es más fiable que waitForURL con hash-routing (SPAs)
  await page.waitForFunction(
    (pattern) => window.location.href.includes(pattern),
    "dashboard",
    { timeout: 20000 },
	);

  console.log(`[GlobalSetup] Login exitoso. URL actual: ${page.url()}`);
  console.log(`[GlobalSetup] Guardando estado en: ${storageStatePath}`);

  await page.context().storageState({ path: storageStatePath });

  await browser.close();
}

export default globalSetup;
