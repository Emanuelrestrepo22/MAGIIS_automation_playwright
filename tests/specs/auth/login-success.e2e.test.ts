// tests/specs/auth/login-success.e2e.test.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';

test('TS-AUTH-TC01-validar-login-exitoso-portal-carrier', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.login('usuario_qa', 'password_qa');

  await expect(page).toHaveURL(/home\/carrier\/dashboard/);
});
