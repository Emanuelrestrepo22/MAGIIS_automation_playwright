// tests/setup/web.setup.ts
//
// BL-041 — Setup project (reemplaza globalSetup multi-role para el rol web).
//
// 'web' es el alias histórico del runtime web genérico — comparte el SPA con
// carrier pero entra por `/#/authentication/login` (ver runtime.ts
// DEFAULT_LOGIN_PATHS.web). El fixture de credenciales resuelve a DISPATCHER
// (ver `tests/fixtures/users/index.ts` → `getCredentialsForRole('web')`).
//
// Ver `carrier.setup.ts` para racional completo del patrón.
import { test as setup, expect } from '@playwright/test';
import { getCurrentEnv, getEnvFile, getRoleRuntimeConfig, getStorageStatePath } from '../config/runtime';
import { getCredentialsForRole } from '../fixtures/users';
import { LoginPage } from '../pages/shared';
import * as dotenv from 'dotenv';

const ROLE = 'web' as const;

dotenv.config({ path: getEnvFile() });

const storageStatePath = getStorageStatePath(ROLE, getCurrentEnv());

setup(`authenticate ${ROLE}`, async ({ page }) => {
	const roleConfig = getRoleRuntimeConfig(ROLE);
	const credentials = getCredentialsForRole(ROLE);
	const loginPage = new LoginPage(page, ROLE, roleConfig.baseURL);

	console.log(`[setup][${ROLE}] Navigating to ${roleConfig.baseURL}${roleConfig.loginPath}`);
	await loginPage.goto();
	await loginPage.login(credentials.username, credentials.password);

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

	await expect(page, `[setup][${ROLE}] dashboard pattern "${roleConfig.dashboardPattern}"`).toHaveURL(url =>
		matchesDashboard(url.href)
	);

	console.log(`[setup][${ROLE}] Dashboard pattern "${roleConfig.dashboardPattern}" confirmed at ${page.url()}`);

	await page.context().storageState({ path: storageStatePath });
	console.log(`[setup][${ROLE}] Storage state saved to ${storageStatePath}`);
});
