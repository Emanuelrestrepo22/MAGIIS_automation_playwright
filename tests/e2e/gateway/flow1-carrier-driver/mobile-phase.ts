/**
 * mobile-phase.ts — Fase mobile del E2E Flow 1 (Driver App).
 *
 * Entry point ts-node: lanzado como child process desde el spec Playwright.
 * Lee el JourneyContext escrito por la fase web, ejecuta el happy path
 * del driver via DriverTripHappyPathHarness, y escribe el resultado final.
 *
 * Variables de entorno requeridas:
 *   E2E_JOURNEY_ID        — journeyId del context a leer/actualizar
 *   APPIUM_SERVER_URL     — URL del servidor Appium (ej: http://localhost:4723)
 *   ANDROID_DEVICE_NAME   — nombre del dispositivo (default: Pixel_7)
 *   ENV                   — ambiente: test | uat | prod (default: test)
 *
 * Variables opcionales:
 *   E2E_MOBILE_TIMEOUT_MS — timeout total en ms (default: 180000)
 *   ANDROID_UDID          — UDID del dispositivo físico (ej: R92XB0B8F3J)
 *
 * Ejecutar de forma aislada (debugging):
 *   E2E_JOURNEY_ID=flow1-stripe-hold-abc123 \
 *   APPIUM_SERVER_URL=http://localhost:4723 \
 *   npx ts-node --esm tests/e2e/gateway/flow1-carrier-driver/mobile-phase.ts
 *
 * Salida:
 *   exit 0 — driver completed sin errores
 *   exit 1 — error en cualquier paso (mensaje en stderr)
 */

import { getDriverAppConfig } from '../../../mobile/appium/config/appiumRuntime';
import { DriverTripHappyPathHarness } from '../../../mobile/appium/harness/DriverTripHappyPathHarness';
import { markMobileCompleted, readFinalContext } from '../shared/JourneyBridge';
import type { MobilePhaseResult } from '../shared/e2eFlowConfig';

// ─── Config desde env ────────────────────────────────────────────────────────

const JOURNEY_ID  = process.env.E2E_JOURNEY_ID;
const TIMEOUT_MS  = Number(process.env.E2E_MOBILE_TIMEOUT_MS ?? '180000');

if (!JOURNEY_ID) {
	console.error('[mobile-phase] ERROR: E2E_JOURNEY_ID no está definido.');
	console.error('  Uso: E2E_JOURNEY_ID=<journeyId> npx ts-node mobile-phase.ts');
	process.exit(1);
}

// ─── Logger ──────────────────────────────────────────────────────────────────

const log = (msg: string) => console.log(`[mobile-phase][${JOURNEY_ID}] ${msg}`);

// ─── Ejecución principal ─────────────────────────────────────────────────────

async function run(): Promise<void> {
	log('Iniciando fase mobile — Driver App');

	// ── 1. Leer contexto generado por la fase web ────────────────────────────
	log('Leyendo JourneyContext...');
	const ctx = await readFinalContext(JOURNEY_ID!);

	if (ctx.status !== 'ready-for-driver') {
		throw new Error(
			`JourneyContext status inválido: "${ctx.status}". ` +
			`Se esperaba "ready-for-driver". ` +
			`Verificar que la fase web completó exitosamente.`
		);
	}

	log(`tripId: ${ctx.tripId ?? 'N/A'}`);
	log(`gateway: ${ctx.gateway}`);

	// ── 2. Construir config Appium ────────────────────────────────────────────
	log('Construyendo config Appium driver...');
	const driverConfig = getDriverAppConfig();
	log(`  device: ${driverConfig.deviceName} | env: ${driverConfig.environment}`);
	log(`  package: ${driverConfig.appPackage ?? 'N/A'}`);

	// ── 3. Ejecutar happy path via harness ────────────────────────────────────
	log('Iniciando DriverTripHappyPathHarness...');
	const harness = new DriverTripHappyPathHarness(driverConfig);

	const harnessResult = await harness.runHappyPath({
		ensureDriverOnline: true,
		timeoutsMs: {
			// El timeout de "confirm" incluye el tiempo que tarda la push
			// notification en llegar al dispositivo desde la creación del viaje.
			confirm:     Math.min(TIMEOUT_MS, 90_000),
			'in-progress': 60_000,
			resume:      60_000,
			closed:      60_000,
		},
	});

	log(`✓ Harness completado — amount: ${harnessResult.totalAmount} | method: ${harnessResult.paymentMethod}`);
	log(`  Checkpoints: ${harnessResult.checkpoints.map(c => c.stage).join(' → ')}`);

	// ── 4. Serializar resultado ───────────────────────────────────────────────
	const result: MobilePhaseResult = {
		journeyId:     JOURNEY_ID!,
		status:        'driver-completed',
		totalAmount:   harnessResult.totalAmount,
		paymentMethod: harnessResult.paymentMethod,
		checkpoints:   harnessResult.checkpoints.map(c => c.stage),
	};

	// ── 5. Actualizar JourneyContext con resultado final ──────────────────────
	log('Actualizando JourneyContext → driver-completed...');
	await markMobileCompleted(result);

	// ── 6. Escribir resultado en stdout para que el spec lo lea ──────────────
	// El spec Playwright captura stdout del child process y parsea esta línea.
	const OUTPUT_MARKER = 'E2E_MOBILE_RESULT:';
	console.log(`${OUTPUT_MARKER}${JSON.stringify(result)}`);

	log('✓ Fase mobile completada exitosamente.');
}

// ─── Entry point ─────────────────────────────────────────────────────────────

run().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[mobile-phase] ERROR: ${message}`);

	// Intentar escribir estado fallido en el context aunque sea parcial
	markMobileCompleted({
		journeyId:     JOURNEY_ID!,
		status:        'failed',
		totalAmount:   '',
		paymentMethod: '',
		checkpoints:   [],
		errorMessage:  message,
	}).catch(() => {
		// Si falla la escritura del context ignoramos — ya salimos con error.
	});

	process.exit(1);
});
