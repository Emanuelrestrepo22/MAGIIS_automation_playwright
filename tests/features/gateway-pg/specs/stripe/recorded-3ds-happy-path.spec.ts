/**
 * TCs: TS-STRIPE-TC1053
 * Feature: Carrier · App Pax · Hold ON · Alta de viaje con tarjeta success3DS (4000 0025 0000 3155) — modal 3DS aprobado, viaje activo
 * Tags: @smoke @3ds @hold @web-only
 *
 * Observaciones del flujo real (entorno TEST):
 *   - El portal puede tener sesión activa → LoginPage.goto() limpia cookies/storage
 *   - El formulario pre-carga dirección "home" del pasajero como origen → setOrigin() la limpia con X
 */

import { test, expect } from '../../../../TestBase';
import { LoginPage } from '../../../../pages/shared';
import { DashboardPage, NewTravelPage, OperationalPreferencesPage, ThreeDSModal } from '../../../../pages/carrier';
import { STRIPE_TEST_CARDS, TEST_DATA } from '../../data/stripeTestData';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('[TS-STRIPE-TC1053] Hold ON + success3DS (4000 0025 0000 3155) — modal 3DS se presenta, pasajero aprueba, viaje pasa a "Buscando conductor"', () => {
  test('crear viaje con tarjeta 3DS, aprobar autenticación y validar viaje activo', async ({ page, credentials }) => {
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

    await test.step('Validar hold activo en preferencias operativas', async () => {
      await preferences.goto();
      await preferences.ensureHoldEnabled();
      await preferences.assertHoldEnabled();
    });

    await test.step('Abrir formulario de nuevo viaje', async () => {
      await dashboardPage.openNewTravel();
      await travelPage.ensureLoaded();
    });

    await test.step('Completar formulario con pasajero app pax y tarjeta success3DS (4000 0025 0000 3155)', async () => {
      await travelPage.fillMinimum({
        passenger:   TEST_DATA.passenger,
        origin:      TEST_DATA.origin,
        destination: TEST_DATA.destination,
        cardLast4:   STRIPE_TEST_CARDS.success3DS.slice(-4), // 3155
      });
    });

    await test.step('Enviar viaje — sistema ejecuta hold Stripe y presenta modal 3DS', async () => {
      await travelPage.submit();
    });

    await test.step('Aprobar autenticación en modal 3DS de Stripe', async () => {
      const threeDS = new ThreeDSModal(page);
      await threeDS.waitForVisible();
      await threeDS.completeSuccess();
      await threeDS.waitForHidden();
    });

    await test.step('Seleccionar vehículo y enviar el servicio', async () => {
      await travelPage.clickSelectVehicle();
      await travelPage.clickSendService();
    });

    await test.step('Validar redirección al formulario de nuevo viaje — flujo completado', async () => {
      await expect(page).toHaveURL(/\/home\/carrier\/travel\/create/, { timeout: 15_000 });
    });
  });
});
