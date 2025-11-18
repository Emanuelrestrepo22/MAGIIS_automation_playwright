// tests/specs/auth/login-success.e2e.test.ts
import { test, expect } from '../../TestBase';

test.describe('TS-AUTH-XX Login - Portal Carrier', () => {
  test('TS-AUTH-TC01-validar-login-exitoso-portal-carrier', async ({ loginPage, page }) => {
    // Arrange
    const username = process.env.USER_CARRIER as string;
    const password = process.env.PASS_CARRIER as string;

    // Act
    await loginPage.goto();
    await loginPage.login(username, password);

    // Assert
    // Suposición: al loguear correctamente se ve algo del home, ejemplo un texto o menú "Gestión de Viajes"
    const homeTitle = page.getByText('Gestión de Viajes', { exact: false });
    await expect(homeTitle).toBeVisible();
  });
});
