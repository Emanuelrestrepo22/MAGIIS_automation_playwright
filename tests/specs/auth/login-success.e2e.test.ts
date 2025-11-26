// tests/specs/auth/login-success.e2e.test.ts
import { test, expect } from '../../TestBase';
import { DataGenerator } from '../../utils/dataGenerator';
import { dashboardSelectors } from '../../selectors/dashboard';


test.describe('TS-AUTH-XX Login - Portal Carrier', () => {
  test('TS-AUTH-TC01-validar-login-exitoso-portal-carrier', async ({ loginPage, page }) => {
    const username = process.env.USER_CARRIER as string;
    const password = process.env.PASS_CARRIER as string;
    console.log('[TS-AUTH-TC01] usando usuario de env:', username);

    // 🧪 Arrange + Act
    await loginPage.goto();
    await loginPage.login(username, password);

    // ✅ Assert 1: Validar URL esperada
    await expect(page).toHaveURL('**/dashboard', { timeout: 15_000 });
    console.log('[Assert] Redireccionado correctamente al dashboard.');

    // ✅ Assert 2: Encabezado y nombre de usuario visibles (solo presencia)
    const userMenu = page.locator(dashboardSelectors.userMenu);
    await expect(userMenu, 'El menú de usuario debe estar visible en el header').toBeVisible();

    const userName = page.locator(dashboardSelectors.userName);
    await expect(userName, 'Debe mostrarse un nombre o alias de usuario').toBeVisible();
    console.log('[Assert] Encabezado y nombre de usuario presentes.');

    // ✅ Assert 3: Navbar lateral cargado
    const sidebar = page.locator(dashboardSelectors.sidebar);
    await expect(sidebar, 'El menú lateral debe estar renderizado').toBeVisible();
    console.log('[Assert] Menú lateral cargado correctamente.');

    // ✅ Assert 4: Botón de logout disponible
    const logoutButton = page.locator(dashboardSelectors.logoutButton);
    await expect(logoutButton, 'El botón de logout debe estar disponible para cerrar sesión').toBeVisible();
    console.log('[Assert] Botón de logout disponible.');
  });
});
