import { chromium } from "@playwright/test";
import * as dotenv from "dotenv";
import {
  getConfiguredRoles,
  getEnvFile,
  getRoleRuntimeConfig,
  resolveRoleCredentials,
} from "./tests/config/runtime";
import { loginSelectors } from "./tests/selectors/login";

async function globalSetup(): Promise<void> {
  // Este setup autentica todos los roles configurados en el .env
  // y deja un storageState separado para cada uno.
  const envFile = getEnvFile();
  dotenv.config({ path: envFile });

  // Si un rol no tiene credenciales configuradas, preferimos saltearlo
  // antes que romper toda la corrida.
  const configuredRoles = getConfiguredRoles();
  if (configuredRoles.length === 0) {
    console.warn(
      `[GlobalSetup] No role credentials found in ${envFile}. Skipping shared storage setup.`,
    );
    return;
  }

  console.log(
    `[GlobalSetup] Environment: ${(process.env.ENV ?? "test").toUpperCase()}`,
  );

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== "false",
  });

  for (const role of configuredRoles) {
    // Resolvemos la configuración específica del rol en cada iteración:
    // URL, patrón de dashboard, credenciales y destino del storage.
    const roleConfig = getRoleRuntimeConfig(role);
    const credentials = resolveRoleCredentials(role);
    const page = await browser.newPage();

    console.log(
      `[GlobalSetup][${role}] Navigating to ${roleConfig.baseURL}${roleConfig.loginPath}`,
    );
    await page.goto(`${roleConfig.baseURL}${roleConfig.loginPath}`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    const emailInput = page.locator(loginSelectors.emailInput);
    const passwordInput = page.locator(loginSelectors.passwordInput);
    const loginButton = page.locator(loginSelectors.submitButton);

    await emailInput.waitFor({ state: "visible", timeout: 30_000 });
    await emailInput.fill(credentials.username);
    await passwordInput.fill(credentials.password);
    await loginButton.click();

    // En portales con hash-routing esperamos un fragmento de URL en lugar
    // de una ruta exacta, para evitar falsos negativos.
    // waitForURL soporta patrones glob como "**/dashboard".
    await page.waitForURL(
      (url) => url.href.includes('dashboard'),
      { timeout: 30_000 },
    );

    // Cada rol guarda su propio estado para que las specs puedan reutilizarlo
    // sin mezclarse entre sí.
    await page.context().storageState({ path: roleConfig.storageStatePath });
    console.log(
      `[GlobalSetup][${role}] Storage state saved to ${roleConfig.storageStatePath}`,
    );
    await page.close();
  }

  await browser.close();
}

export default globalSetup;
