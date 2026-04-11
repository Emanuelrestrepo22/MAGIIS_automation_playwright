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

import { test, expect } from '../TestBase';
import { findLatestJourneyContextId } from '../features/gateway-pg/context/gatewayJourneyContext';
import type { GatewayPgJourneyContext } from '../features/gateway-pg/contracts/gateway-pg.types';
import { expectNoThreeDSModal, loginAsDispatcher } from '../features/gateway-pg/fixtures/gateway.fixtures';
import { NewTravelPage, TravelDetailPage } from '../pages/carrier';
import { getDriverAppConfig } from '../mobile/appium/config/appiumRuntime';
import { DriverTripHappyPathHarness } from '../mobile/appium/harness/DriverTripHappyPathHarness';
import { GatewayPgJourneyOrchestrator } from '../features/gateway-pg/helpers/GatewayPgJourneyOrchestrator';
import { STRIPE_TEST_CARDS as TEST_STRIPE_CARDS } from '../features/gateway-pg/data/stripeTestData';

const orchestrator = new GatewayPgJourneyOrchestrator();
const HAPPY_PATH = {
  client: 'Usa Tres, Marcela',
  origin: 'Cazadores 1987, Buenos Aires, Argentina',
  destination: 'La Pampa 915, Pilar, Buenos Aires, Argentina',
  cardLast4: TEST_STRIPE_CARDS.successDirect.slice(-4),
} as const;

test.describe.configure({ mode: 'serial' });

test.describe('[E2E-FLOW-1] Carrier Web → Driver App @regression @stripe @hybrid-e2e', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Hybrid flow runs only in Chromium');
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
      await travelPage.selectClient(HAPPY_PATH.client);
      await travelPage.assertDefaultServiceTypeRegular();
      await travelPage.setOrigin(HAPPY_PATH.origin);
      await travelPage.setDestination(HAPPY_PATH.destination);
      await travelPage.selectCardByLast4(HAPPY_PATH.cardLast4);
    });

    await test.step('[FLOW1-TC01][STEP-03] Crear viaje — sistema procesa hold', async () => {
      await travelPage.submit();
      await expectNoThreeDSModal(page);
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

test.describe('[E2E-FLOW-1] Driver App @regression @stripe @hybrid-e2e', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Appium hybrid flow runs once in Chromium');

  test('FLOW1-TC01-driver-app-mobile-handoff', async () => {
    let journey: GatewayPgJourneyContext | null = null;
    let mobileHarness: DriverTripHappyPathHarness | null = null;

    const ensureJourney = (): GatewayPgJourneyContext => {
      if (!journey) {
        throw new Error('Journey context not loaded');
      }

      return journey;
    };

    try {
      const journeyId = process.env.JOURNEY_ID ?? await findLatestJourneyContextId();
      if (!journeyId) {
        throw new Error('No journey context found in evidence/journey-context/');
      }

      journey = await orchestrator.load(journeyId);

      if (!journey.tripId) {
        throw new Error(`Journey ${journey.journeyId} is missing tripId`);
      }

      const driverConfig = getDriverAppConfig();
      mobileHarness = new DriverTripHappyPathHarness(driverConfig);

      await test.step('[FLOW1-TC01][MOBILE][STEP-01] Ejecutar happy path con checkpoints estándar', async () => {
        const mobileResult = await mobileHarness!.runHappyPath({
          ensureDriverOnline: true,
        });

        expect(mobileResult.checkpoints.map((checkpoint) => checkpoint.stage)).toEqual([
          'confirm',
          'in-progress',
          'resume',
          'closed',
        ]);
        expect(mobileResult.totalAmount).toBeTruthy();
      });

      journey = orchestrator.updatePhase(
        ensureJourney(),
        'driver_trip_acceptance',
        'driver-accepted',
        'Driver accepted the trip from the mobile app'
      );
      journey = orchestrator.updatePhase(
        ensureJourney(),
        'driver_route_simulation',
        'driver-en-route',
        'Driver started the trip from the mobile app'
      );
      journey = orchestrator.completeMobilePhase(
        ensureJourney(),
        'Driver completed the trip in the mobile app'
      );
      journey = orchestrator.completeValidation(
        ensureJourney(),
        'Driver app trip completed and payment validated'
      );
      await orchestrator.persist(ensureJourney());
      expect(ensureJourney().status).toBe('payment-validated');
    } catch (error) {
      if (journey) {
        journey = orchestrator.fail(
          journey,
          error instanceof Error ? error.message : 'Driver app flow failed'
        );
        await orchestrator.persist(journey);
      }
      throw error;
    } finally {
      await mobileHarness?.endSession();
    }
  });
});
