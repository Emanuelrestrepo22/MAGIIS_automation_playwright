// tests/specs/api/auth-login.api.test.ts
import { test, expect } from '../../TestBase';

test.describe('TS-AUTH-XX API Login Carrier', () => {
	// La API se prueba con el mismo rol "carrier" que usamos en UI
	// para mantener alineados ambos flujos.
	test.use({ role: 'carrier' });

	test('TS-AUTH-TC02-validar-login-api-portal-carrier', async ({ apiClient }) => {
		// Mientras el bug siga abierto en TEST, marcamos fixme para que la suite
		// documente el gap sin romper corridas conocidas.
		test.fixme(process.env.ENV === 'test', 'AUTH-XXX: /auth/login devuelve 500 en TEST');

		const { response, status, rawBody } = await apiClient.loginCarrier();

		// Cuando backend quede sano, este check debería confirmar un 2xx real.
		await expect(response, `TS-AUTH-TC02 FAILED: Status=${status}, body=${rawBody}`).toBeOK();

		// El body esperado documenta el contrato mínimo que la autenticación debe devolver.
		const body = JSON.parse(rawBody);
		expect(body.userId).toBeDefined();
		expect(body.token).toBeTruthy();
		expect(body.roleUser).toBe('ROLE_CARRIER');
		expect(body.enabledUser).toBe('T');
	});
});
