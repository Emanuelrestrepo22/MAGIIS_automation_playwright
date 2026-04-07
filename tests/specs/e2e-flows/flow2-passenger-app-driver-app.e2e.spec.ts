/**
 * MAGIIS — E2E Flow 2: Passenger App + Driver App
 *
 * Actores:
 *   Actor 1 (fase Appium): Passenger en Android app
 *   Actor 2 (fase Appium): Driver en Android app
 *
 * Secuencia:
 *   1. [Appium/Passenger] Passenger agrega tarjeta a su wallet
 *   2. [Appium/Passenger] Passenger crea viaje y selecciona tarjeta
 *   3. [Handoff]          Contexto persiste en evidence/journey-context/
 *   4. [Appium/Driver]    Driver recibe push notification → acepta
 *   5. [Appium/Driver]    Driver simula ruta
 *   6. [Appium/Driver]    Driver finaliza viaje → evento de cobro
 *   7. [Appium/Passenger] Passenger ve viaje completado + cobro procesado
 *   8. [Validación]       API/DB confirman payment CAPTURED
 *
 * NOTA: Este flujo es 100% mobile. NO requiere Playwright/web.
 * Ambas fases usan Appium + WebdriverIO.
 *
 * TODO: este spec es un DRAFT. Requiere WebdriverIO instalado y
 * las screens de Passenger y Driver implementadas.
 * Ver: tests/mobile/appium/ para la implementación de screens.
 *
 * CÓMO EJECUTAR (cuando esté implementado):
 *   Fase passenger:
 *     pnpm test:test:e2e:flow2:passenger
 *   Fase driver:
 *     pnpm test:test:e2e:flow2:driver
 */

import { test, expect } from '@playwright/test';
import { GatewayPgJourneyOrchestrator } from '../../shared/orchestration/GatewayPgJourneyOrchestrator';

// TODO: descomentar cuando las screens estén implementadas con WebdriverIO
// import { PassengerWalletScreen }    from '../../mobile/appium/passenger/PassengerWalletScreen';
// import { PassengerNewTripScreen }   from '../../mobile/appium/passenger/PassengerNewTripScreen';
// import { PassengerTripStatusScreen } from '../../mobile/appium/passenger/PassengerTripStatusScreen';
// import { DriverHomeScreen }          from '../../mobile/appium/driver/DriverHomeScreen';
// import { DriverTripRequestScreen }   from '../../mobile/appium/driver/DriverTripRequestScreen';
// import { DriverTripNavigationScreen } from '../../mobile/appium/driver/DriverTripNavigationScreen';
// import { getPassengerAppConfig, getDriverAppConfig } from '../../mobile/appium/config/mobileRuntime';
// import { STRIPE_TEST_CARDS } from '../../data/stripe-cards';

const orchestrator = new GatewayPgJourneyOrchestrator();

test.describe('[E2E-FLOW-2] Passenger App → Driver App @regression @stripe @hybrid-e2e', () => {
  test.fixme(true, 'BLOQUEADO: 100% mobile. Requiere WebdriverIO + Appium + screens implementadas.');

  test('FLOW2-TC01-validar-alta-viaje-passenger-app-completado-por-driver', async () => {
    test.fixme(
      true,
      'FLOW2-TC01: Draft pendiente. Requiere WebdriverIO + Appium + screens implementadas. ' +
      'Pasos: 1) instalar webdriverio, 2) implementar AppiumSessionBase.startSession(), ' +
      '3) validar selectores con Appium Inspector, 4) activar este test.'
    );

    // ── Crear journey context ─────────────────────────────────────────────
    let journey = orchestrator.createDraftJourney({
      testCaseId: 'FLOW2-TC01',
      gateway: 'stripe',
      portal: 'pax',
      role: 'passenger',
      flowType: 'passenger-app-driver-app',
    });

    // ── FASE PASSENGER (Appium) ───────────────────────────────────────────

    // TODO: iniciar sesión Appium para Passenger app
    // const passengerConfig = getPassengerAppConfig();
    // const walletScreen = new PassengerWalletScreen(passengerConfig);
    // await walletScreen.startSession();

    // STEP-01: Agregar tarjeta al wallet
    // await walletScreen.openWallet();
    // await walletScreen.tapAddCard();
    // await walletScreen.fillCardForm(STRIPE_TEST_CARDS.visa_success);
    // await walletScreen.saveCard();
    // await walletScreen.verifyCardAdded(STRIPE_TEST_CARDS.visa_success.last4);

    // STEP-02: Crear viaje desde la app passenger
    // const newTripScreen = new PassengerNewTripScreen(passengerConfig);
    // await newTripScreen.openNewTrip();
    // await newTripScreen.setOrigin('Av. Corrientes 1234, CABA');
    // await newTripScreen.setDestination('Av. Santa Fe 5678, CABA');
    // await newTripScreen.selectPaymentCard(STRIPE_TEST_CARDS.visa_success.last4);
    // const tripId = await newTripScreen.confirmTrip();
    // journey = orchestrator.attachTripData(journey, { tripId: tripId ?? 'TODO' });

    // STEP-03: Persistir handoff para fase Driver
    // journey = orchestrator.prepareMobileHandoff(journey, 'Passenger creó el viaje. Driver debe aceptar.');
    // await orchestrator.persist(journey);

    // ── FASE DRIVER (Appium) ──────────────────────────────────────────────

    // TODO: iniciar sesión Appium para Driver app (puede ser mismo dispositivo o segundo device)
    // const driverConfig = getDriverAppConfig();
    // const driverHomeScreen = new DriverHomeScreen(driverConfig);
    // await driverHomeScreen.startSession();

    // STEP-04: Driver recibe solicitud y la acepta
    // await driverHomeScreen.goOnline();
    // await driverHomeScreen.waitForTripRequest(journey.tripId!, 30_000);
    // await driverHomeScreen.openTripRequest();
    // const requestScreen = new DriverTripRequestScreen(driverConfig);
    // await requestScreen.acceptTrip();

    // STEP-05: Driver simula ruta
    // const navScreen = new DriverTripNavigationScreen(driverConfig);
    // await navScreen.startTrip();
    // await navScreen.simulateRoute([
    //   { lat: -34.6037, lng: -58.3816, label: 'Origen' },
    //   { lat: -34.5955, lng: -58.3772, label: 'Medio camino' },
    //   { lat: -34.5875, lng: -58.3720, label: 'Destino' },
    // ]);

    // STEP-06: Driver finaliza viaje → cobro
    // await navScreen.endTrip();
    // await navScreen.verifyTripCompleted();

    // ── FASE PASSENGER (verificar cobro) ─────────────────────────────────
    // STEP-07: Passenger ve el cobro procesado
    // const statusScreen = new PassengerTripStatusScreen(passengerConfig);
    // await statusScreen.waitForTripCompleted(120_000);
    // await statusScreen.verifyPaymentProcessed();

    // ── Actualizar journey y validar ─────────────────────────────────────
    // journey = orchestrator.completeMobilePhase(journey, 'Driver finalizó el viaje. Cobro procesado.');
    // await orchestrator.persist(journey);

    // DB TODO: SELECT status FROM travels WHERE id = journey.tripId
    //          EXPECTED: 'COMPLETED'
    // DB TODO: SELECT status FROM payments WHERE travel_id = journey.tripId
    //          EXPECTED: 'CAPTURED'
    // API TODO: GET /api/travels/{tripId} — verificar status, amount, payment_reference
  });
});
