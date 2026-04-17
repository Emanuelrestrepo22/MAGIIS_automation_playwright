import { chromium } from "@playwright/test";
import * as dotenv from "dotenv";
import {
  getConfiguredRoles,
  getEnvFile,
  getRoleRuntimeConfig,
  resolveRoleCredentials,
} from "./tests/config/runtime";
import { LoginPage } from "./tests/pages/shared";

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

    try {
      const loginPage = new LoginPage(page, role, roleConfig.baseURL);

      console.log(
        `[GlobalSetup][${role}] Navigating to ${roleConfig.baseURL}${roleConfig.loginPath}`,
      );
      await loginPage.goto();
      await loginPage.login(credentials.username, credentials.password);

      // Validamos el dashboard con el patrón declarado por el rol en runtime.ts
      // para soportar carrier/contractor/owner/futuros sin hardcodear nombres.
      // waitUntil: 'commit' evita que el hash-routing de la SPA bloquee la espera
      // aguardando un evento 'load' que nunca dispara en cambios de hash.
      // Fallback con polling: en hash-routed SPAs, `waitForURL` a veces no dispara
      // aunque la URL final ya haga match; el polling lee `page.url()` cada 500ms
      // y resuelve el primero que cumpla el patrón.
      const matchesDashboard = (href: string) =>
        href.includes("/home") && href.includes(roleConfig.dashboardPattern);

      await Promise.race([
        page.waitForURL((url) => matchesDashboard(url.href), {
          timeout: 30_000,
          waitUntil: "commit",
        }),
        (async () => {
          const deadline = Date.now() + 30_000;
          const sleep = (ms: number) =>
            new Promise<void>((resolve) => setTimeout(resolve, ms));
          while (Date.now() < deadline) {
            if (matchesDashboard(page.url())) return;
            await sleep(500);
          }
          throw new Error(
            `[GlobalSetup][${role}] dashboard pattern "${roleConfig.dashboardPattern}" no alcanzado en 30s (url actual: ${page.url()})`,
          );
        })(),
      ]);
      console.log(
        `[GlobalSetup][${role}] Dashboard pattern "${roleConfig.dashboardPattern}" confirmed at ${page.url()}`,
      );

      // Cada rol guarda su propio estado para que las specs puedan reutilizarlo
      // sin mezclarse entre sí.
      await page.context().storageState({ path: roleConfig.storageStatePath });
      console.log(
        `[GlobalSetup][${role}] Storage state saved to ${roleConfig.storageStatePath}`,
      );
    } catch (err) {
      console.warn(
        `[GlobalSetup][${role}] ⚠️  Login failed — skipping storage state. Specs using this role will need storageState: { cookies: [], origins: [] }.\n  Reason: ${(err as Error).message}`,
      );
    } finally {
      await page.close();
    }
  }

  await browser.close();
}

export default globalSetup;
