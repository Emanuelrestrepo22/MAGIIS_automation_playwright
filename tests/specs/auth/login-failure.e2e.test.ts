import { test, expect } from '../../TestBase';
import { DataGenerator } from '../../utils/dataGenerator';

test.describe('TS-AUTH-XX Login negativo', () => {
  test('TS-AUTH-TC02-login-con-credenciales-invalidas', async ({ loginPage }) => {
    const { email, password } = DataGenerator.getInvalidCredentials();

    console.log(`[TS-AUTH-TC02] Intentando login con: ${email}`);

    // Arrange
    await loginPage.goto();

    // Act
    await loginPage.login(email, password);

    // Wait for error message to appear (si hay delay en mostrarla)
    const errorVisible = await loginPage.isLoginErrorVisible();
    console.log(`[TS-AUTH-TC02] ¿Error visible?: ${errorVisible}`);

    // Assert
    await expect(errorVisible).toBeTruthy();

    const errorMessage = await loginPage.getLoginErrorMessage();
    console.log(`[TS-AUTH-TC02] Mensaje de error recibido: "${errorMessage?.trim()}"`);

    await expect(loginPage['errorMessage']).toHaveText('Email or Password is Incorrect.');
  });
});
