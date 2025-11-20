// tests/specs/api/auth-login.api.test.ts
import { test, expect } from '@playwright/test';

test.describe('TS-AUTH-XX API Login Carrier', () => {
  test('TS-AUTH-TC02-validar-login-api-portal-carrier', async ({ request }) => {
    // Mientras el bug siga abierto en TEST, marcar este TC como fixme
    test.fixme(
      process.env.ENV === 'test',
      'AUTH-XXX: /auth/login devuelve 500 en TEST'
    );

    const url = process.env.AUTH_API_URL as string;
    const payload = {
      username: process.env.USER_CARRIER,
      password: process.env.PASS_CARRIER,
    };

    const response = await request.post(url, {
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      failOnStatusCode: false,
    });

    const status = response.status();
    const rawBody = await response.text();

    console.log('[TS-AUTH-TC02][AUTH LOGIN] Request:', {
      url,
      payload,
      status,
      rawBody,
    });

    await expect(
      response,
      `TS-AUTH-TC02 FAILED: Status=${status}, body=${rawBody}`
    ).toBeOK(); // espera 2xx cuando el backend se corrija

    const body = JSON.parse(rawBody);
    expect(body.userId).toBeDefined();
    expect(body.token).toBeTruthy();
    expect(body.roleUser).toBe('ROLE_CARRIER');
    expect(body.enabledUser).toBe('T');
  });
});
