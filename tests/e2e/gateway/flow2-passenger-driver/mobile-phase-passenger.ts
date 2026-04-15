/**
 * mobile-phase-passenger.ts — Fase mobile del E2E Flow 2 (Passenger App).
 * Proyecto: e2e
 *
 * Entry point ts-node: lanzado como child process desde el spec Playwright.
 * Ejecuta el happy path del pasajero via PassengerTripHappyPathHarness:
 *   1. Login en Passenger App
 *   2. Agregar tarjeta al wallet (si no existe)
 *   3. Crear viaje (origen → destino)
 *   4. Esperar driver asignado
 *   5. Esperar viaje completado
 *   6. Verificar cobro procesado
 *
 * Estado: ESTRUCTURA LISTA — ejecución bloqueada hasta que el dispositivo
 * Android de prueba esté disponible para validar selectores de PassengerWalletScreen.
 *
 * TODO (requieren dispositivo):
 *   - Validar selectores de PassengerWalletScreen con Appium Inspector
 *   - Completar PassengerNewTripScreen.createTrip() selectors
 *   - Confirmar PassengerTripStatusScreen.waitForDriverAssigned()
 *
 * Variables de entorno requeridas:
 *   E2E_JOURNEY_ID              — journeyId escrito por la fase web (si existe)
 *                                  o 'standalone' si el flow inicia desde la app
 *   APPIUM_SERVER_URL            — URL del servidor Appium
 *   ANDROID_PASSENGER_APP_PACKAGE — package de la Passenger App (ej: com.magiis.app.test.passenger)
 *
 * Variables opcionales:
 *   E2E_MOBILE_TIMEOUT_MS       — timeout total en ms (default: 240000)
 *   PASSENGER_EMAIL             — email del usuario pasajero de prueba
 *   PASSENGER_PASSWORD          — contraseña del usuario pasajero de prueba
 *   E2E_CARD_LAST4              — últimos 4 dígitos de la tarjeta a usar (default: 4242)
 *   E2E_ORIGIN                  — origen del viaje (default: TEST_DATA.origin)
 *   E2E_DESTINATION             — destino del viaje (default: TEST_DATA.destination)
 *
 * Ejecutar de forma aislada (debugging):
 *   E2E_JOURNEY_ID=standalone \
 *   APPIUM_SERVER_URL=http://localhost:4723 \
 *   npx ts-node --esm tests/e2e/gateway/flow2-passenger-driver/mobile-phase-passenger.ts
 */

import { getPassengerAppConfig } from '../../../mobile/appium/config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../../../mobile/appium/harness/PassengerTripHappyPathHarness';
import { markMobileCompleted, readFinalContext } from '../shared/JourneyBridge';
import type { MobilePhaseResult } from '../shared/e2eFlowConfig';
import { TEST_DATA } from '../../../features/gateway-pg/fixtures/gateway.fixtures';

// ─── Config desde env ─────────────────────────────────────────────────────────

const JOURNEY_ID  = process.env.E2E_JOURNEY_ID;
const TIMEOUT_MS  = Number(process.env.E2E_MOBILE_TIMEOUT_MS ?? '240000');
const CARD_LAST4  = process.env.E2E_CARD_LAST4 ?? '4242';
const ORIGIN      = process.env.E2E_ORIGIN      ?? TEST_DATA.origin;
const DESTINATION = process.env.E2E_DESTINATION ?? TEST_DATA.destination;

if (!JOURNEY_ID) {
	console.error('[flow2/mobile-phase-passenger] ERROR: E2E_JOURNEY_ID no está definido.');
	console.error('  Uso: E2E_JOURNEY_ID=<journeyId|standalone> npx ts-node mobile-phase-passenger.ts');
	process.exit(1);
}

const log = (msg: string) => console.log(`[flow2/mobile-phase-passenger][${JOURNEY_ID}] ${msg}`);

// ─── Ejecución principal ──────────────────────────────────────────────────────

async function run(): Promise<void> {
	log('Iniciando fase mobile — Passenger App (Flow 2)');
	log(`  card: ****${CARD_LAST4} | origin: ${ORIGIN} | destination: ${DESTINATION}`);

	// ── 1. Leer JourneyContext si existe ──────────────────────────────────────
	// En Flow 2 puro (passenger → driver) no hay fase web previa.
	// El journey se crea aquí directamente desde la app.
	// JOURNEY_ID = 'standalone' indica que el pasajero inicia el flow.
	if (JOURNEY_ID !== 'standalone') {
		const ctx = await readFinalContext(JOURNEY_ID!);
		log(`JourneyContext leído — status: ${ctx.status} | gateway: ${ctx.gateway}`);
	} else {
		log('Modo standalone — el flow inicia desde la Passenger App');
	}

	// ── 2. Construir config Appium ─────────────────────────────────────────────
	log('Construyendo config Appium passenger...');
	const passengerConfig = getPassengerAppConfig();
	log(`  device: ${passengerConfig.deviceName} | env: ${passengerConfig.environment}`);

	// ── 3. Ejecutar happy path via harness ─────────────────────────────────────
	log('Iniciando PassengerTripHappyPathHarness...');
	const harness = new PassengerTripHappyPathHarness(passengerConfig);

	// TODO: reemplazar number con el número completo de la tarjeta de prueba
	// según CARD_LAST4. Actualmente hardcodeado a 4242 para tests sin 3DS.
	// Usar STRIPE_TEST_CARDS de stripeTestData.ts cuando los selectores estén validados.
	const cardInput = {
		number:     '4242424242424242', // TODO: mapear desde CARD_LAST4
		expiry:     '12/28',
		cvc:        '123',
		holderName: 'Test Passenger',
	};

	const harnessResult = await harness.runHappyPath(
		cardInput,
		ORIGIN,
		DESTINATION,
		{
			ensureWalletCard:       true,
			waitForDriverAssigned:  true,
			waitForTripCompleted:   true,
			verifyPaymentProcessed: true,
			timeoutsMs: {
				wallet:    30_000,
				trip:      60_000,
				assigned:  Math.min(TIMEOUT_MS, 90_000),
				completed: 120_000,
				payment:   120_000,
			},
		},
	);

	log(`✓ Harness completado — cardLast4: ${harnessResult.cardLast4}`);
	log(`  driverAssigned: ${harnessResult.driverAssigned} | tripCompleted: ${harnessResult.tripCompleted}`);
	log(`  paymentProcessed: ${harnessResult.paymentProcessed}`);

	// ── 4. Serializar resultado ────────────────────────────────────────────────
	const result: MobilePhaseResult = {
		journeyId:     JOURNEY_ID!,
		status:        harnessResult.tripCompleted ? 'driver-completed' : 'failed',
		totalAmount:   '', // TODO: extraer desde PassengerTripStatusScreen cuando selectores estén listos
		paymentMethod: harnessResult.cardLast4 ? `card-${harnessResult.cardLast4}` : '',
		checkpoints:   [
			...(harnessResult.walletState === 'added' ? ['wallet-added'] : ['wallet-existing']),
			'trip-created',
			...(harnessResult.driverAssigned  ? ['driver-assigned']  : []),
			...(harnessResult.tripCompleted   ? ['trip-completed']   : []),
			...(harnessResult.paymentProcessed ? ['payment-processed'] : []),
		],
	};

	// ── 5. Actualizar JourneyContext si no es standalone ───────────────────────
	if (JOURNEY_ID !== 'standalone') {
		log('Actualizando JourneyContext → driver-completed...');
		await markMobileCompleted(result);
	}

	// ── 6. Escribir resultado en stdout para que el spec lo lea ───────────────
	const OUTPUT_MARKER = 'E2E_MOBILE_RESULT:';
	console.log(`${OUTPUT_MARKER}${JSON.stringify(result)}`);

	log('✓ Fase mobile passenger Flow 2 completada exitosamente.');
}

// ─── Entry point ─────────────────────────────────────────────────────────────

run().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[flow2/mobile-phase-passenger] ERROR: ${message}`);

	if (JOURNEY_ID && JOURNEY_ID !== 'standalone') {
		markMobileCompleted({
			journeyId:     JOURNEY_ID!,
			status:        'failed',
			totalAmount:   '',
			paymentMethod: '',
			checkpoints:   [],
			errorMessage:  message,
		}).catch(() => {});
	}

	process.exit(1);
});
