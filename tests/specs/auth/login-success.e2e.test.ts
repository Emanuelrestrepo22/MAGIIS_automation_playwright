// tests/specs/auth/login-success.e2e.test.ts
import { test, expect } from '../../TestBase';
import { DataGenerator } from '../../utils/dataGenerator';

test.describe('TS-AUTH-XX Login negativo', () => {
  test('TS-AUTH-TC01-login-con-credenciales-invalidas', async ({ loginPage }) => {
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

test.describe('TS-AUTH-XX Login - Portal Carrier', () => {
  test('TS-AUTH-TC02-validar-login-exitoso-portal-carrier', async ({ loginPage, page }) => {
    const username = process.env.USER_CARRIER as string;
    const password = process.env.PASS_CARRIER as string;
    console.log('[TS-AUTH-TC01] usando usuario de env:', username);

    // Arrange + Act
    await loginPage.goto();
    await loginPage.login(username, password);

    // Assert URL correcta
    await expect(page).toHaveURL('https://apps-test.magiis.com/carrier/#/dashboard', {
      timeout: 15_000,
    });
    // O más flexible:
    // await expect(page).toHaveURL(/\/carrier\/#\/dashboard$/);

    // Assert header con nombre de usuario
    const userName = page.locator('span.user-name-text');
    await expect(userName).toHaveText('S&G Remis', { timeout: 15_000 });
  });
});
