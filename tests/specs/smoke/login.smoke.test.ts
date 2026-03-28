// tests/specs/smoke/login.smoke.test.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { loginSelectors } from '../../selectors/login';
import { DataGenerator } from '../../utils/dataGenerator';

const env = process.env.ENV ?? 'test';

test.describe(`[SMOKE][${env.toUpperCase()}] Login - Portal Carrier`, () => {
	// Sesión limpia para validar login desde cero en cada test
	test.use({ storageState: { cookies: [], origins: [] } });

	test.beforeEach(() => {
		DataGenerator.seedOnce();
	});

	test('SMOKE-AUTH-TC01 - Login exitoso con credenciales válidas', async ({ page }) => {
		const username = process.env.USER_CARRIER as string;
		const password = process.env.PASS_CARRIER as string;
		const loginPage = new LoginPage(page);

		await test.step(`[SMOKE-AUTH-TC01][STEP-01] Navegar a pantalla de login (${env.toUpperCase()})`, async () => {
			await loginPage.goto();
		});

		await test.step('[SMOKE-AUTH-TC01][STEP-02] Ingresar credenciales válidas y hacer login', async () => {
			await loginPage.login(username, password);
		});

		await test.step('[SMOKE-AUTH-TC01][STEP-03] Validar que ya no estamos en pantalla de login', async () => {
			const loginInput = page.locator(loginSelectors.emailInput);
			await expect(loginInput).toBeHidden({ timeout: 20_000 });
			console.log(`[SMOKE-AUTH-TC01] Login exitoso en ${env.toUpperCase()} ✅`);
		});
	});

	test('SMOKE-AUTH-TC02 - Login fallido con credenciales inválidas', async ({ page }) => {
		const { email, password } = DataGenerator.getInvalidCredentials();
		console.log(`[SMOKE-AUTH-TC02][DATA] email: ${email} | password: ${password}`);
		const loginPage = new LoginPage(page);

		await test.step('[SMOKE-AUTH-TC02][STEP-01] Navegar a pantalla de login', async () => {
			await loginPage.goto();
		});

		await test.step('[SMOKE-AUTH-TC02][STEP-02] Intentar login con credenciales inválidas', async () => {
			await loginPage.login(email, password);
		});

		await test.step('[SMOKE-AUTH-TC02][STEP-03] Validar que aparece mensaje de error', async () => {
			const errorVisible = await loginPage.isLoginErrorVisible();
			console.log(`[SMOKE-AUTH-TC02][CHECK] ¿Error visible?: ${errorVisible}`);
			await expect(errorVisible).toBeTruthy();
		});
	});
});
