import { chromium } from "@playwright/test";
import * as dotenv from "dotenv";
import {
  getConfiguredRoles,
  getEnvFile,
  getRoleRuntimeConfig,
} from "./tests/config/runtime";
import { getCredentialsForRole } from "./tests/fixtures/users";
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
    const credentials = getCredentialsForRole(role);
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
      //
      // Detección por POLLING de `page.url()` únicamente (mismo enfoque que
      // DashboardPage.ensureDashboardLoaded). NO usar `page.waitForURL`: en la SPA
      // hash-routed post-login se aterriza primero en `/#/home` y el redirect al
      // dashboard del rol puede tardar; `waitForURL` rechazaba por timeout antes de
      // capturar la URL final. Timeout amplio (60s) para tolerar el redirect lento.
      //
      // `dashboardPattern` es un GLOB (ej. "**/dashboard"): hay que convertirlo a
      // regex. El bug previo lo comparaba con String.includes() → "**/dashboard"
      // NUNCA aparece como substring de una URL real → falso "Login failed" siempre.
      const globToRegExp = (glob: string): RegExp =>
        new RegExp(
          glob
            .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
            .replace(/\*\*/g, ".*")
            .replace(/\*/g, "[^/]*"),
        );
      const dashboardRe = globToRegExp(roleConfig.dashboardPattern);
      const matchesDashboard = (href: string) =>
        href.includes("/home") && dashboardRe.test(href);

      const deadline = Date.now() + 60_000;
      const sleep = (ms: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, ms));
      while (Date.now() < deadline && !matchesDashboard(page.url())) {
        await sleep(500);
      }
      if (!matchesDashboard(page.url())) {
        throw new Error(
          `[GlobalSetup][${role}] dashboard pattern "${roleConfig.dashboardPattern}" no alcanzado en 60s (url actual: ${page.url()})`,
        );
      }
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
        `[GlobalSetup][${role}] ⚠️  Login failed — skipping storage state. Specs using this role will need storageState: { cookies: [], origins: [] }.\n  Reason: ${(err as Error).message}\n  url final: ${page.url()}`,
      );
    } finally {
      await page.close();
    }
  }

  await browser.close();
}

export default globalSetup;
