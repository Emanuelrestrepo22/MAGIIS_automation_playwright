// global-setup.ts
//
// ⚠️  DEPRECATED — NO USAR.
// Este archivo quedó como referencia histórica del flujo de autenticación
// "single-role" basado en LOGIN_PATH fijo `/carrier/#/auth/login`.
//
// La configuración activa (`playwright.config.ts`) usa
// `./global-setup.multi-role.ts`, que autentica todos los roles configurados
// en el .env (carrier, contractor, y futuros) resolviendo rutas desde
// `tests/config/runtime.ts`.
//
// Mantener por ahora para no romper scripts externos que lo referencien.
// Si detectás que nadie lo usa, eliminalo junto con su entrada en tsconfig.json
// y las menciones en README.md.
import type { FullConfig } from "@playwright/test";
import { chromium } from "@playwright/test";
import * as dotenv from "dotenv";
import { DashboardPage } from "./tests/pages/carrier";
import { LoginPage } from "./tests/pages/shared";

async function globalSetup(config: FullConfig) {
  // Este setup "legacy" prepara una sola sesión carrier y guarda su storageState.
  // Sigue siendo útil para entender el flujo base de autenticación sin la capa multi-role.
  console.warn(
    "[global-setup.ts] ⚠️  DEPRECATED: este setup solo autentica carrier con rutas hardcodeadas. " +
      "Migrar a global-setup.multi-role.ts (la config activa ya lo usa).",
  );

  // Carga el .env correcto según ENV_FILE o el entorno (ENV)
  const envFile = process.env.ENV_FILE ?? `.env.${process.env.ENV ?? "test"}`;
  dotenv.config({ path: envFile });

  // Leemos toda la configuración necesaria al inicio para fallar rápido si falta algo.
  const env = process.env.ENV ?? "test";
  const baseUrl = process.env.BASE_URL;
  const username = process.env.USER_CARRIER;
  const password = process.env.PASS_CARRIER;
  const loginPath = process.env.LOGIN_PATH ?? "/carrier/#/auth/login";
  const storageStatePath = `storage/state-carrier-${env}.json`;

  if (!baseUrl) throw new Error(`❌ BASE_URL no está definida en ${envFile}`);
  if (!username)
    throw new Error(`❌ USER_CARRIER no está definida en ${envFile}`);
  if (!password)
    throw new Error(`❌ PASS_CARRIER no está definida en ${envFile}`);

  console.log(`[GlobalSetup] Entorno: ${env.toUpperCase()}`);
  console.log(`[GlobalSetup] Navegando a: ${baseUrl}${loginPath}`);

  // Abrimos un navegador real porque necesitamos ejecutar el login completo
  // y capturar cookies/localStorage tal como lo haría un usuario.
  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== "false",
  });
  const page = await browser.newPage();
  const loginPage = new LoginPage(page, 'carrier', baseUrl);
  const dashboardPage = new DashboardPage(page);

  await loginPage.goto();

  // Reproducimos el login manual paso a paso para obtener un estado autenticado confiable.
  console.log("[GlobalSetup] Completando login con usuario:", username);
  await loginPage.login(username, password);
  await dashboardPage.ensureDashboardLoaded();

  console.log(`[GlobalSetup] Login exitoso. URL actual: ${page.url()}`);
  console.log(`[GlobalSetup] Guardando estado en: ${storageStatePath}`);

  // Persistimos el estado para que los tests arranquen ya autenticados
  // y no repitan el login en cada ejecución.
  await page.context().storageState({ path: storageStatePath });

  await browser.close();
}

export default globalSetup;
