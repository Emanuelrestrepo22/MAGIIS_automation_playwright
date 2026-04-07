/**
 * MAGIIS — E2E Flow 1: Carrier Web + Driver App
 *
 * Actores:
 *   Actor 1 (este spec / Playwright): Dispatcher en portal Carrier web
 *   Actor 2 (fase Appium separada):   Driver en Android app
 *
 * Secuencia:
 *   1. [Web]    Dispatcher vincula tarjeta al pasajero
 *   2. [Web]    Dispatcher da de alta el viaje
 *   3. [Web]    Sistema procesa hold → viaje en estado SEARCHING_DRIVER
 *   4. [Handoff] Contexto del journey persiste en evidence/journey-context/
 *   5. [Appium] Driver recibe solicitud → acepta
 *   6. [Appium] Driver simula ruta
 *   7. [Appium] Driver finaliza viaje → evento de cobro
 *   8. [Validación] API/DB confirman payment CAPTURED
 *
 * CÓMO EJECUTAR:
 *   Fase web (este spec):
 *     pnpm test:test:e2e:flow1:web
 *
 *   Fase mobile (Appium — cuando esté implementado):
 *     pnpm test:test:e2e:flow1:mobile
 *
 * PREREQUISITOS para la fase Appium:
 *   - Appium Server corriendo: npx appium
 *   - Emulador Android iniciado o dispositivo físico conectado
 *   - Variables de entorno: APPIUM_SERVER_URL, ANDROID_DRIVER_APP_PATH
 *   - Ver: tests/mobile/appium/README.md (a crear)
 */

import { test, expect } from '../../TestBase';
import { loginAsDispatcher } from '../../fixtures/gateway.fixtures';
import { NewTravelPage }    from '../../pages/NewTravelPage';
import { TravelDetailPage } from '../../pages/TravelDetailPage';
import { GatewayPgJourneyOrchestrator } from '../../shared/orchestration/GatewayPgJourneyOrchestrator';
import { TEST_DATA } from '../../shared/gateway-pg/stripeTestData';
import { STRIPE_TEST_CARDS } from '../../data/stripe-cards';

const orchestrator = new GatewayPgJourneyOrchestrator();

test.describe('[E2E-FLOW-1] Carrier Web → Driver App @regression @stripe @hybrid-e2e', () => {
  test.fixme(true, 'BLOQUEADO: requiere Appium Server + emulador Android activo. Fase mobile no implementada.');

  test.use({ role: 'carrier', storageState: undefined });

  test.beforeEach(async ({ page }) => {
    await loginAsDispatcher(page);
  });

  test('FLOW1-TC01-validar-alta-viaje-web-handoff-a-driver', async ({ page }) => {
    // Precondiciones:
    //   - Dispatcher autenticado en portal Carrier mediante LoginPage
    //   - Pasajero con tarjeta Stripe vinculada (visa_success: 4242424242424242)
    //   - Ambiente: TEST con Stripe en test mode
    //   - Driver app lista para recibir solicitudes (fase Appium — separada)

    // ── Fase 1: Crear journey context ─────────────────────────────────────
    let journey = orchestrator.createDraftJourney({
      testCaseId: 'FLOW1-TC01',
      gateway: 'stripe',
      portal: 'carrier',
      role: 'carrier',
      flowType: 'carrier-web-driver-app',
    });

    const travelPage  = new NewTravelPage(page);
    const detailPage  = new TravelDetailPage(page);

    // ── Fase 2: Alta de viaje en portal web ───────────────────────────────
    await test.step('[FLOW1-TC01][STEP-01] Navegar a alta de viaje', async () => {
      await travelPage.goto();
    });

    await test.step('[FLOW1-TC01][STEP-02] Completar datos y tarjeta del viaje', async () => {
      await travelPage.fillMinimum({
        passenger: TEST_DATA.passenger,
        origin: TEST_DATA.origin,
        destination: TEST_DATA.destination,
        cardLast4: STRIPE_TEST_CARDS.visa_success.last4,
      });
    });

    await test.step('[FLOW1-TC01][STEP-03] Crear viaje — sistema procesa hold', async () => {
      // Assert: validar respuesta de la API de pagos
      const [response] = await Promise.all([
        page.waitForResponse(
          r => r.url().includes('/api/payments') && r.status() === 200
        ),
        travelPage.submit(),
      ]);
      const body = await response.json();
      expect(body.status).toMatch(/succeeded|authorized|requires_action/i);

      // Actualizar journey con referencia de pago
      journey = orchestrator.attachTripData(journey, {
        paymentReference: body.id ?? body.paymentIntentId ?? 'TODO-PAYMENT-ID',
      });
    });

    await test.step('[FLOW1-TC01][STEP-04] Verificar estado SEARCHING_DRIVER en portal', async () => {
      await page.waitForURL(/\/travels\/\w+/, { timeout: 15_000 });

      // Capturar tripId de la URL
      const url = page.url();
      const tripId = url.match(/\/travels\/(\w+)/)?.[1];
      expect(tripId).toBeTruthy();

      const statusBadge = await detailPage.getTravelStatus();
      // Debería mostrar estado Buscando conductor
      await expect(statusBadge).toContainText('Buscando conductor', { timeout: 20_000 });

      journey = orchestrator.attachTripData(journey, { tripId: tripId ?? 'TODO' });
    });

    // ── Fase 3: Preparar handoff hacia Driver App ─────────────────────────
    await test.step('[FLOW1-TC01][STEP-05] Persistir contexto para handoff a Driver App', async () => {
      journey = orchestrator.prepareMobileHandoff(
        journey,
        `Viaje ${journey.tripId} listo. Driver App debe aceptar y completar el viaje.`
      );
      const contextPath = await orchestrator.persist(journey);
      console.log(`[FLOW1-TC01] Journey context guardado: ${contextPath}`);
      console.log(`[FLOW1-TC01] Journey ID: ${journey.journeyId}`);
      console.log(`[FLOW1-TC01] Trip ID: ${journey.tripId}`);
      console.log('[FLOW1-TC01] ✓ Fase web completada — continuar con fase Appium (Driver App)');
    });

    // DB TODO: SELECT status FROM travels WHERE id = journey.tripId
    //          EXPECTED: 'SEARCHING_DRIVER'
    // DB TODO: SELECT status FROM payments WHERE travel_id = journey.tripId
    //          EXPECTED: 'AUTHORIZED' o 'PENDING_CAPTURE'
  });
});
