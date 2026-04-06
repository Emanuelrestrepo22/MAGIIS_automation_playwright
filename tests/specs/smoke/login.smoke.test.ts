// tests/specs/smoke/login.smoke.test.ts
import { test, expect } from '../../TestBase';
import { LoginPage } from '../../pages/LoginPage';
import { loginSelectors } from '../../selectors/login';
import { DataGenerator } from '../../utils/dataGenerator';

const env = process.env.ENV ?? 'test';

test.describe(`[SMOKE][${env.toUpperCase()}] Login - Portal Carrier`, () => {
	// Smoke de login siempre parte desde sesión limpia para detectar rápido
	// problemas reales de autenticación en el ambiente.
	test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

	test.beforeEach(() => {
		// Repetibilidad para que el caso negativo sea fácil de reconstruir.
		DataGenerator.seedOnce();
	});

	test('SMOKE-AUTH-TC01 - Login exitoso con credenciales válidas', async ({ page }) => {
		// En smoke usamos credenciales reales del ambiente porque queremos
		// validar la disponibilidad básica del portal.
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
			// Para smoke alcanza con confirmar que el formulario desapareció:
			// es una señal barata y estable de que el login funcionó.
			const loginInput = page.locator(loginSelectors.emailInput);
			await expect(loginInput).toBeHidden({ timeout: 20_000 });
			console.log(`[SMOKE-AUTH-TC01] Login exitoso en ${env.toUpperCase()} ✅`);
		});
	});

	test('SMOKE-AUTH-TC02 - Login fallido con credenciales inválidas', async ({ page }) => {
		// Este segundo smoke cubre el guardrail mínimo del formulario:
		// rechazar credenciales incorrectas mostrando feedback al usuario.
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
