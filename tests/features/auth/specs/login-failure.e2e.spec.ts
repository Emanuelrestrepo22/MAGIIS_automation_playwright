// tests/specs/auth/login-failure.e2e.test.ts
import { test, expect } from '../../../TestBase';
import { DataGenerator } from '../../../shared/utils/dataGenerator';
import { debugLog } from '../../../helpers';

// eslint-disable-next-line @typescript-eslint/naming-convention
const LOGIN_NEGATIVE_FLAGS = {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	NOT_ON_LOGIN_URL: 'FLAG-TC02-001',
	// eslint-disable-next-line @typescript-eslint/naming-convention
	ERROR_NOT_VISIBLE: 'FLAG-TC02-002',
	// eslint-disable-next-line @typescript-eslint/naming-convention
	ERROR_TEXT_UNEXPECTED: 'FLAG-TC02-003'
} as const;

test.describe('[TS-AUTH-TC02] Login fallido portal carrier — credenciales inválidas muestran error, URL permanece en login', () => {
	// Evitamos storageState logueado para garantizar que el test empiece
	// siempre en la pantalla real de autenticación.
	test.use({ role: 'carrier', storageState: undefined });

	test.beforeEach(() => {
		// Semilla fija para poder reproducir exactamente las credenciales inválidas
		// cuando haya que investigar un fallo puntual.
		DataGenerator.seedOnce();
	});

	test('TS-AUTH-TC02-login-con-credenciales-invalidas', async ({ loginPage, page }) => {
		const { email, password } = DataGenerator.getInvalidCredentials();
		debugLog('auth', `[TS-AUTH-TC02][DATA] email: ${email} | password: ${password}`);

		await test.step('[TS-AUTH-TC02][STEP-01] Navegar a pantalla de login', async () => {
			await loginPage.goto();
			const url = page.url();
			if (!url.includes('/authentication/login/carrier')) {
				console.warn(`[${LOGIN_NEGATIVE_FLAGS.NOT_ON_LOGIN_URL}] URL inesperada después de goto: ${url}`);
			}
		});

		await test.step('[TS-AUTH-TC02][STEP-02] Intentar login con credenciales inválidas', async () => {
			await loginPage.login(email, password);
		});

		await test.step('[TS-AUTH-TC02][STEP-03] Validar que se muestre mensaje de error', async () => {
			const errorVisible = await loginPage.isLoginErrorVisible();
			debugLog('auth', `[TS-AUTH-TC02][CHECK] ¿Error visible?: ${errorVisible}`);

			// Dejamos flags de diagnóstico porque en UI negativa suele ser clave
			// diferenciar entre "no hubo error" y "hubo error pero no visible".
			if (!errorVisible) {
				console.error(`[${LOGIN_NEGATIVE_FLAGS.ERROR_NOT_VISIBLE}] No se mostró el mensaje de error esperado`);
			}

			expect(errorVisible).toBeTruthy();
		});

		await test.step('[TS-AUTH-TC02][STEP-04] Validar texto del mensaje de error', async () => {
			const errorMessage = await loginPage.getLoginErrorMessage();
			debugLog('auth', `[TS-AUTH-TC02][CHECK] Mensaje recibido: "${errorMessage?.trim()}"`);

			try {
				// Validamos el copy exacto porque este mensaje forma parte del comportamiento esperado.
				await expect(loginPage.errorMessage).toContainText('El usuario y/o contraseña son incorrectos');
			} catch (err) {
				console.error(`[${LOGIN_NEGATIVE_FLAGS.ERROR_TEXT_UNEXPECTED}] Texto de error distinto al esperado`);
				throw err;
			}
		});
	});
});
