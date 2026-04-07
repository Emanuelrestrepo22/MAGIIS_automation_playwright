/**
 * GRABACIÓN — Happy Path 3DS
 * Flujo: Login carrier → nuevo viaje → vincular tarjeta 3DS → crear viaje → aprobar 3DS → viaje activo
 *
 * Observaciones del flujo real (entorno TEST):
 *   - El portal puede tener sesión activa → LoginPage.goto() limpia cookies/storage
 *   - El formulario pre-carga dirección "home" del pasajero como origen → setOrigin() la limpia con X
 *
 * Tarjeta: 4000 0025 0000 3155 (3DS required — success)
 * TODO: reemplazar TEST_DATA.passenger con pasajero real del entorno TEST
 * TODO: validar selectores del modal 3DS con recorder (iframe Stripe)
 */

import { test, expect } from '../../../TestBase';
import { LoginPage } from '../../../pages/LoginPage';
import { DashboardPage } from '../../../pages/DashboardPage';
import { NewTravelPage } from '../../../pages/NewTravelPage';
import { STRIPE_TEST_CARDS, TEST_DATA } from '../../../shared/gateway-pg/stripeTestData';

test.use({ role: 'carrier', storageState: { cookies: [], origins: [] } });

test.describe('[TC-3DS-01] Happy Path — Alta de viaje con tarjeta 3DS', () => {
  test('crear viaje con tarjeta 3DS y aprobar autenticación', async ({ page, credentials }) => {
    const loginPage     = new LoginPage(page, 'carrier');
    const dashboardPage = new DashboardPage(page);
    const travelPage    = new NewTravelPage(page);
    const { username, password } = credentials;

    await test.step('Login carrier', async () => {
      await loginPage.goto();
      await loginPage.login(username, password);
      await dashboardPage.ensureDashboardLoaded();
    });

    await test.step('Navegar a formulario de nuevo viaje', async () => {
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
      // TODO: implementar ThreeDSModal.completeSuccess() con selectores del iframe validados
      test.fixme(true, 'Modal 3DS pendiente: validar selectores del iframe Stripe con recorder');
    });

    await test.step('Verificar viaje activo — Buscando conductor', async () => {
      // Debería redirigir al detalle y mostrar estado SEARCHING_DRIVER
      await expect(page).toHaveURL(/\/travels\/[\w-]+|\/travel\/detail/, { timeout: 15_000 });
    });
  });
});

