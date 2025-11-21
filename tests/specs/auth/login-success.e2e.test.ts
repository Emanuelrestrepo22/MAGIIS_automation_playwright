// tests/specs/auth/login-success.e2e.test.ts
import { test, expect } from '../../TestBase';
import { DataGenerator } from '../../utils/dataGenerator';
import { dashboardSelectors } from '../../selectors/dashboard';


test.describe('TS-AUTH-XX Login - Portal Carrier', () => {
  test('TS-AUTH-TC02-validar-login-exitoso-portal-carrier', async ({ loginPage, page }) => {
    const username = process.env.USER_CARRIER as string;
    const password = process.env.PASS_CARRIER as string;
    console.log('[TS-AUTH-TC01] usando usuario de env:', username);

    // 🧪 Arrange + Act
    await loginPage.goto();
    await loginPage.login(username, password);

    // ✅ Assert 1: Validar URL esperada
    await expect(page).toHaveURL('**/dashboard', { timeout: 15_000 });
    console.log('[Assert] Redireccionado correctamente al dashboard.');

    // ✅ Assert 2: Nombre de usuario visible
    const userName = page.locator(dashboardSelectors.userName); //selector para el nombre de usuario
    await expect(userName).toBeVisible();
    await expect(userName).toHaveText('S&G Remis'); // Reemplazar si cambia
    console.log('[Assert] Nombre de usuario visible y correcto.');

    // ✅ Assert 3: Navbar lateral cargado
    const sidebar = page.locator(dashboardSelectors.sidebar); //selector para el sidebar
    await expect(sidebar).toBeVisible();
    console.log('[Assert] Menú lateral cargado correctamente.');

    // ✅ Assert 4: Botón de logout disponible
     const logoutButton = page.locator(dashboardSelectors.logoutButton); //selector para el botón de logout
    await expect(logoutButton).toBeVisible();
    console.log('[Assert] Botón de logout disponible.');
  });
});
