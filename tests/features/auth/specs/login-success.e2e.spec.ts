// tests/specs/auth/login-success.e2e.test.ts
import { test, expect } from '../../../TestBase';
import { DashboardPage } from '../../../pages/carrier';

test.describe('TS-AUTH-XX Login - Portal Carrier', () => {
	// Forzamos una sesión limpia para validar el flujo completo de login
	// y no depender del storageState generado por el global setup.
	test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

	test('TS-AUTH-TC01-validar-login-exitoso-portal-carrier', async ({ page, loginPage, credentials }) => {
		// Tomamos las credenciales resueltas por el fixture para mantener
		// el test desacoplado de nombres concretos de variables de entorno.
		const { username, password } = credentials;
		const dashboardPage = new DashboardPage(page);

		await test.step('[TS-AUTH-TC01][STEP-01] Navegar a login', async () => {
			await loginPage.goto();
		});

		await test.step('[TS-AUTH-TC01][STEP-02] Hacer login', async () => {
			await loginPage.login(username, password);
		});

		await test.step('[TS-AUTH-TC01][STEP-03] Validar dashboard', async () => {
			await dashboardPage.ensureDashboardLoaded();
			console.log('[TS-AUTH-TC01] Dashboard cargado y visible');
		});

		await test.step('[TS-AUTH-TC01][STEP-04] Validar token de sesión persistente en localStorage', async () => {
			// Leer todas las claves del localStorage para detectar cuál contiene el token
			// independientemente del nombre exacto que use la app Angular.
			const storageSnapshot = await page.evaluate(() => {
				const entries: Record<string, string> = {};
				for (let i = 0; i < localStorage.length; i++) {
					const key = localStorage.key(i);
					if (key) entries[key] = localStorage.getItem(key) ?? '';
				}
				return entries;
			});

			console.log('[TS-AUTH-TC01][STORAGE] Claves en localStorage:', Object.keys(storageSnapshot));

			// Buscar cualquier clave que contenga "token" o "auth" (case-insensitive)
			// para ser resiliente al nombre exacto que use la app.
			const tokenEntry = Object.entries(storageSnapshot).find(
				([key]) => /token|auth|jwt|session/i.test(key)
			);

			if (tokenEntry) {
				const [tokenKey, tokenValue] = tokenEntry;
				console.log(`[TS-AUTH-TC01][STORAGE] Token encontrado → key: "${tokenKey}", length: ${tokenValue.length}`);
				// Debería existir un token con valor no vacío tras el login exitoso
				expect(tokenValue, `Token en "${tokenKey}" no debe estar vacío`).toBeTruthy();
			} else {
				// Si no hay clave con "token", puede estar en una cookie — registramos y seguimos
				console.warn('[TS-AUTH-TC01][STORAGE] No se encontró clave de token en localStorage — puede estar en cookie de sesión');

				const cookies = await page.context().cookies();
				const sessionCookie = cookies.find(c => /token|session|auth/i.test(c.name));
				if (sessionCookie) {
					console.log(`[TS-AUTH-TC01][COOKIE] Sesión en cookie → name: "${sessionCookie.name}", domain: ${sessionCookie.domain}`);
					expect(sessionCookie.value, 'Cookie de sesión no debe estar vacía').toBeTruthy();
				} else {
					// Falla informativa: adjunta el snapshot completo para diagnóstico
					console.error('[TS-AUTH-TC01][STORAGE] Snapshot completo:', JSON.stringify(storageSnapshot, null, 2));
					expect.soft(false, 'No se encontró token en localStorage ni en cookies — revisar cómo persiste la sesión').toBeTruthy();
				}
			}
		});
	});
});
