// tests/setup/contractor.setup.ts
//
// BL-041 — Setup project (reemplaza globalSetup multi-role para el rol contractor).
//
// Ver `carrier.setup.ts` para racional completo. Este setup replica la misma
// lógica de validación del dashboard que usa global-setup.multi-role.ts (común
// a todos los roles): no forzamos anclas específicas de carrier porque el portal
// contractor puede no exponer el mismo CTA (CLAUDE.md §Bootstrap validado).
//
// El patrón `matchesDashboard` aplica igual a contractor porque el SPA comparte
// origen con carrier y `dashboardPattern` viene resuelto por `runtime.ts`.
import { test as setup, expect } from '@playwright/test';
import { getCurrentEnv, getEnvFile, getRoleRuntimeConfig, getStorageStatePath } from '../config/runtime';
import { getCredentialsForRole } from '../fixtures/users';
import { LoginPage } from '../pages/shared';
import * as dotenv from 'dotenv';

const ROLE = 'contractor' as const;

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
