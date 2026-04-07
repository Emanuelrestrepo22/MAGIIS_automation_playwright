import { test, expect } from '../TestBase';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { NewTravelPage } from '../pages/NewTravelPage';
import { STRIPE_TEST_CARDS, TEST_DATA } from '../shared/gateway-pg/stripeTestData';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('[SMOKE] Carrier - alta de viaje', () => {
  test('crea un viaje con selectores accesibles y estables', async ({ page, credentials }) => {
    const loginPage = new LoginPage(page, 'carrier');
    const dashboardPage = new DashboardPage(page);
    const travelPage = new NewTravelPage(page);
    const { username, password } = credentials;

    await test.step('Abrir login limpio', async () => {
      await loginPage.goto();
    });

    await test.step('Autenticar dispatcher', async () => {
      await loginPage.login(username, password);
    });

    await test.step('Validar dashboard', async () => {
      await dashboardPage.ensureDashboardLoaded();
    });

    await test.step('Abrir formulario de nuevo viaje', async () => {
      await dashboardPage.openNewTravel();
      await travelPage.ensureLoaded();
    });

    await test.step('Completar formulario de viaje', async () => {
      await travelPage.fillMinimum({
        passenger: TEST_DATA.passenger,
        origin: TEST_DATA.origin,
        destination: TEST_DATA.destination,
        cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4)
      });
    });

    await test.step('Enviar formulario', async () => {
      await travelPage.submit();
      await expect(page).toHaveURL(/\/travels\/[\w-]+/, { timeout: 15_000 });
    });
  });
});

