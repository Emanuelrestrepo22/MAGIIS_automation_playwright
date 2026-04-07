// tests/specs/auth/login-success.e2e.test.ts
import { test } from '../../TestBase';
import { DashboardPage } from '../../pages/DashboardPage';

test.describe('TS-AUTH-XX Login - Portal Carrier', () => {
	// Forzamos una sesión limpia para validar el flujo completo de login
	// y no depender del storageState generado por el global setup.
	test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

	test('TS-AUTH-TC01-validar-login-exitoso-portal-carrier', async ({ page, loginPage, credentials }) => {
		// Tomamos las credenciales resueltas por el fixture para mantener
		// el test desacoplado de nombres concretos de variables de entorno.
		const { username, password } = credentials;
		const dashboardPage = new DashboardPage(page);

		await test.step('[TS-AUTH-TC01][STEP-01] Navegar a login', async () => {
			await loginPage.goto();
		});

		await test.step('[TS-AUTH-TC01][STEP-02] Hacer login', async () => {
			await loginPage.login(username, password);
		});

		await test.step('[TS-AUTH-TC01][STEP-03] Validar dashboard', async () => {
			await dashboardPage.ensureDashboardLoaded();
			console.log('[TS-AUTH-TC01] Dashboard cargado y visible');
		});
	});
});
