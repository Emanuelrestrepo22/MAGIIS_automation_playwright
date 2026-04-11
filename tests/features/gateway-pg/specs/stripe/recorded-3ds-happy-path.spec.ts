/**
 * GRABACIÓN — Happy Path 3DS
 * Flujo: Login carrier → nuevo viaje → vincular tarjeta 3DS → crear viaje → aprobar 3DS → viaje activo
 *
 * Observaciones del flujo real (entorno TEST):
 *   - El portal puede tener sesión activa → LoginPage.goto() limpia cookies/storage
 *   - El formulario pre-carga dirección "home" del pasajero como origen → setOrigin() la limpia con X
 *
 * Tarjeta: 4000 0025 0000 3155 (3DS required — success)
 */

import { test, expect } from '../../../../TestBase';
import { LoginPage } from '../../../../pages/shared';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, ThreeDSModal } from '../../../../pages/carrier';
import { STRIPE_TEST_CARDS, TEST_DATA } from '../../data/stripeTestData';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('[TC-3DS-01] Happy Path — Alta de viaje con tarjeta 3DS', () => {
  test('crear viaje con tarjeta 3DS y aprobar autenticación', async ({ page, credentials }) => {
    test.setTimeout(90_000);

    const loginPage     = new LoginPage(page, 'carrier');
    const dashboardPage = new DashboardPage(page);
    const preferences   = new OperationalPreferencesPage(page);
    const travelPage    = new NewTravelPage(page);
    const { username, password } = credentials;

    await test.step('Login carrier', async () => {
      await loginPage.goto();
      await loginPage.login(username, password);
      await dashboardPage.ensureDashboardLoaded();
    });

    await test.step('Validar preferencias operativas con hold activo', async () => {
      await preferences.goto();
      await preferences.ensureHoldEnabled();
      await preferences.assertHoldEnabled();
    });

    await test.step('Volver a nuevo viaje', async () => {
      await dashboardPage.openNewTravel();
      await travelPage.ensureLoaded();
    });

    await test.step('Completar formulario con tarjeta 3DS', async () => {
      await travelPage.fillMinimum({
        passenger:   TEST_DATA.passenger,
        origin:      TEST_DATA.origin,
        destination: TEST_DATA.destination,
        cardLast4:   STRIPE_TEST_CARDS.success3DS.slice(-4) // 3155
      });
    });

    await test.step('Crear viaje — sistema ejecuta hold Stripe', async () => {
      await travelPage.submit();
    });

    await test.step('Aprobar modal 3DS de Stripe', async () => {
      const threeDS = new ThreeDSModal(page);
      await threeDS.waitForVisible();
      await threeDS.completeSuccess();
      await threeDS.waitForHidden();
    });

    await test.step('Seleccionar vehículo y enviar el viaje', async () => {
      await travelPage.clickSelectVehicle();
      await travelPage.clickSendService();
    });

    await test.step('Validar que el formulario quedó en su pantalla', async () => {
      await expect(page).toHaveURL(/\/home\/carrier\/travel\/create/, { timeout: 15_000 });
    });
  });
});
