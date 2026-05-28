// tests/setup/carrier.setup.ts
//
// BL-041 — Setup project (reemplaza globalSetup multi-role para el rol carrier).
//
// Este "test" no es funcional: es el setup project que Playwright ejecuta como
// dependencia del project 'carrier' antes de que cualquier spec consuma el
// storageState autenticado.
//
// Beneficios vs globalSetup multi-role:
//   1. Auths paralelas — carrier/contractor/web corren en paralelo entre sí
//      (antes el for-loop del globalSetup era secuencial).
//   2. Lazy — si corrés `--project=carrier`, NO se ejecuta auth de contractor ni web.
//   3. Retry independiente — si la auth falla, el retry del setup project no
//      requiere abortar la suite completa (BL-002).
//   4. Visible en UI Mode como nodo separado (mejor debugging).
//
// Replicamos la lógica de validación del dashboard del global-setup.multi-role.ts:
// hash-routed SPA + `Promise.race` con polling, porque `waitForURL` a veces no
// dispara aunque la URL final ya cumpla el patrón en cambios de hash.
import { test as setup, expect } from '@playwright/test';
import { getCurrentEnv, getEnvFile, getRoleRuntimeConfig, getStorageStatePath } from '../config/runtime';
import { getCredentialsForRole } from '../fixtures/users';
import { LoginPage } from '../pages/shared';
import * as dotenv from 'dotenv';

const ROLE = 'carrier' as const;

// Cargamos el .env antes de resolver runtime/credenciales, igual que el globalSetup.
dotenv.config({ path: getEnvFile() });

const storageStatePath = getStorageStatePath(ROLE, getCurrentEnv());

setup(`authenticate ${ROLE}`, async ({ page }) => {
	const roleConfig = getRoleRuntimeConfig(ROLE);
	const credentials = getCredentialsForRole(ROLE);
	const loginPage = new LoginPage(page, ROLE, roleConfig.baseURL);

	console.log(`[setup][${ROLE}] Navigating to ${roleConfig.baseURL}${roleConfig.loginPath}`);
	await loginPage.goto();
	await loginPage.login(credentials.username, credentials.password);

	// Validación del dashboard idéntica a global-setup.multi-role.ts (Promise.race
	// entre waitForURL con `waitUntil: 'commit'` y polling manual cada 500ms).
	const matchesDashboard = (href: string) => href.includes('/home') && href.includes(roleConfig.dashboardPattern);

	await Promise.race([
		page.waitForURL(url => matchesDashboard(url.href), {
			timeout: 30_000,
			waitUntil: 'commit'
		}),
		(async () => {
			const deadline = Date.now() + 30_000;
			const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
			while (Date.now() < deadline) {
				if (matchesDashboard(page.url())) return;
				await sleep(500);
			}
			throw new Error(
				`[setup][${ROLE}] dashboard pattern "${roleConfig.dashboardPattern}" no alcanzado en 30s (url actual: ${page.url()})`
			);
		})()
	]);

	// Assertion explícita post-race: si el polling resolvió, validamos también vía
	// expect para que el reporter muestre el dashboard pattern como check formal.
	await expect(page, `[setup][${ROLE}] dashboard pattern "${roleConfig.dashboardPattern}"`).toHaveURL(url =>
		matchesDashboard(url.href)
	);

	console.log(`[setup][${ROLE}] Dashboard pattern "${roleConfig.dashboardPattern}" confirmed at ${page.url()}`);

	// Persistir storageState para que el project 'carrier' lo consuma.
	await page.context().storageState({ path: storageStatePath });
	console.log(`[setup][${ROLE}] Storage state saved to ${storageStatePath}`);
});
