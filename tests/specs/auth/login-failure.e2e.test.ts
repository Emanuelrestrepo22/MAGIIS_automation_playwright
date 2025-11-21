import { test, expect } from '../../TestBase';
import { DataGenerator } from '../../utils/dataGenerator';

test.describe('TS-AUTH-XX Login negativo', () => {
  test('TS-AUTH-TC02-login-con-credenciales-invalidas', async ({ loginPage }) => {
    const { email, password } = DataGenerator.getInvalidCredentials();

    console.log(`[Negativo] Intentando login con: ${email}`);

    // Arrange + Act
    await loginPage.goto();
    await loginPage.login(email, password);

    // Assert
    await expect(await loginPage.isLoginErrorVisible()).toBeTruthy();

    const errorMessage = await loginPage.getLoginErrorMessage();
    console.log(`[Negativo] Error mostrado en pantalla: "${errorMessage?.trim()}"`);

    await expect(loginPage['errorMessage']).toHaveText('Email or Password is Incorrect.');
  });
});
