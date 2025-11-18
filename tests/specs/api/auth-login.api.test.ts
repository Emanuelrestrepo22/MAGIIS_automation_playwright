// tests/specs/api/auth-login.api.test.ts
import { test, expect } from '@playwright/test';

test.describe('TS-AUTH-XX API Login Carrier', () => {
  test('TS-AUTH-TC02-validar-login-api-portal-carrier', async ({ request }) => {
    // Arrange
    const url = process.env.AUTH_API_URL as string;
    const username = process.env.USER_CARRIER as string;
    const password = process.env.PASS_CARRIER as string;

    const payload = { username, password };

    // Act
    const response = await request.post(url, {
      data: payload,
    });

    // Assert
    await expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const body = await response.json();

    // Validaciones mínimas
    expect(body.userId).toBeDefined();
    expect(body.token).toBeTruthy();
    expect(body.roleUser).toBe('ROLE_CARRIER');
    expect(body.enabledUser).toBe('T');
  });
});
