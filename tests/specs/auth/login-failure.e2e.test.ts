// tests/specs/auth/login-failure.e2e.test.ts
import { test, expect } from '../../TestBase';
import { DataGenerator } from '../../utils/dataGenerator';

const LOGIN_NEGATIVE_FLAGS = {
  NOT_ON_LOGIN_URL: 'FLAG-TC02-001',
  ERROR_NOT_VISIBLE: 'FLAG-TC02-002',
  ERROR_TEXT_UNEXPECTED: 'FLAG-TC02-003',
} as const;

test.describe('TS-AUTH-XX Login negativo', () => {
  // ⚠️ Evitamos storageState logueado, para que exista pantalla de login
  test.use({ storageState: undefined });

  test.beforeEach(() => {
    // Datos reproducibles si hace falta debugear un caso puntual
    DataGenerator.seedOnce();
  });

  test('TS-AUTH-TC02-login-con-credenciales-invalidas', async ({ loginPage, page }) => {
    const { email, password } = DataGenerator.getInvalidCredentials();
    console.log(`[TS-AUTH-TC02][DATA] email: ${email} | password: ${password}`);

    await test.step('[TS-AUTH-TC02][STEP-01] Navegar a pantalla de login', async () => {
      await loginPage.goto();
      const url = page.url();
      if (!url.includes('/auth/login')) {
        console.warn(
          `[${LOGIN_NEGATIVE_FLAGS.NOT_ON_LOGIN_URL}] URL inesperada después de goto: ${url}`,
        );
      }
    });

    await test.step(
      '[TS-AUTH-TC02][STEP-02] Intentar login con credenciales inválidas',
      async () => {
        await loginPage.login(email, password);
      },
    );

    await test.step(
      '[TS-AUTH-TC02][STEP-03] Validar que se muestre mensaje de error',
      async () => {
        const errorVisible = await loginPage.isLoginErrorVisible();
        console.log(`[TS-AUTH-TC02][CHECK] ¿Error visible?: ${errorVisible}`);

        if (!errorVisible) {
          console.error(
            `[${LOGIN_NEGATIVE_FLAGS.ERROR_NOT_VISIBLE}] No se mostró el mensaje de error esperado`,
          );
        }

        await expect(errorVisible).toBeTruthy();
      },
    );

    await test.step(
      '[TS-AUTH-TC02][STEP-04] Validar texto del mensaje de error',
      async () => {
        const errorMessage = await loginPage.getLoginErrorMessage();
        console.log(
          `[TS-AUTH-TC02][CHECK] Mensaje recibido: "${errorMessage?.trim()}"`,
        );

        try {
          await expect(loginPage.errorMessage).toHaveText(
            'Email or Password is Incorrect.',
          );
        } catch (err) {
          console.error(
            `[${LOGIN_NEGATIVE_FLAGS.ERROR_TEXT_UNEXPECTED}] Texto de error distinto al esperado`,
          );
          throw err;
        }
      },
    );
  });
});
