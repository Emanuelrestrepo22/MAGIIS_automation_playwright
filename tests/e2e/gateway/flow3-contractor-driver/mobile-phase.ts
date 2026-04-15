/**
 * mobile-phase.ts — Fase mobile del E2E Flow 3 (Driver App).
 * Proyecto: e2e
 *
 * Entry point ts-node: lanzado como child process desde el spec Playwright.
 * La fase mobile del Flow 3 es idéntica al Flow 1 desde la perspectiva
 * del driver — el driver recibe la misma push notification sin importar
 * si el viaje fue creado desde carrier o desde contractor.
 *
 * Reutiliza exactamente el mismo harness y lógica que flow1/mobile-phase.ts.
 * La única diferencia es el journeyId prefix (flow3-...) generado por
 * JourneyBridge al crear el contexto del Flow 3.
 *
 * Variables de entorno requeridas:
 *   E2E_JOURNEY_ID        — journeyId del context a leer/actualizar
 *   APPIUM_SERVER_URL     — URL del servidor Appium (ej: http://localhost:4723)
 *
 * Variables opcionales:
 *   E2E_MOBILE_TIMEOUT_MS — timeout total en ms (default: 180000)
 *   ANDROID_DEVICE_NAME   — nombre del dispositivo (default: Pixel_7)
 *   ANDROID_UDID          — UDID del dispositivo físico
 *   ENV                   — ambiente: test | uat | prod (default: test)
 *
 * Ejecutar de forma aislada (debugging):
 *   E2E_JOURNEY_ID=flow3-stripe-hold-abc123 \
 *   APPIUM_SERVER_URL=http://localhost:4723 \
 *   npx ts-node --esm tests/e2e/gateway/flow3-contractor-driver/mobile-phase.ts
 */

import { getDriverAppConfig } from '../../../mobile/appium/config/appiumRuntime';
import { DriverTripHappyPathHarness } from '../../../mobile/appium/harness/DriverTripHappyPathHarness';
import { markMobileCompleted, readFinalContext } from '../shared/JourneyBridge';
import type { MobilePhaseResult } from '../shared/e2eFlowConfig';

// ─── Config desde env ─────────────────────────────────────────────────────────

const JOURNEY_ID = process.env.E2E_JOURNEY_ID;
const TIMEOUT_MS = Number(process.env.E2E_MOBILE_TIMEOUT_MS ?? '180000');

if (!JOURNEY_ID) {
	console.error('[flow3/mobile-phase] ERROR: E2E_JOURNEY_ID no está definido.');
	console.error('  Uso: E2E_JOURNEY_ID=<journeyId> npx ts-node mobile-phase.ts');
	process.exit(1);
}

const log = (msg: string) => console.log(`[flow3/mobile-phase][${JOURNEY_ID}] ${msg}`);

// ─── Ejecución principal ──────────────────────────────────────────────────────

async function run(): Promise<void> {
	log('Iniciando fase mobile — Driver App (Flow 3 Contractor)');

	// ── 1. Leer contexto generado por la fase web ──────────────────────────────
	log('Leyendo JourneyContext...');
	const ctx = await readFinalContext(JOURNEY_ID!);

	if (ctx.status !== 'ready-for-driver') {
		throw new Error(
			`JourneyContext status inválido: "${ctx.status}". ` +
			`Se esperaba "ready-for-driver". ` +
			`Verificar que la fase web de Flow 3 completó exitosamente.`,
		);
	}

	log(`tripId: ${ctx.tripId ?? 'N/A'}`);
	log(`gateway: ${ctx.gateway}`);

	// ── 2. Construir config Appium ─────────────────────────────────────────────
	log('Construyendo config Appium driver...');
	const driverConfig = getDriverAppConfig();
	log(`  device: ${driverConfig.deviceName} | env: ${driverConfig.environment}`);

	// ── 3. Ejecutar happy path via harness ────────────────────────────────────
	log('Iniciando DriverTripHappyPathHarness...');
	const harness = new DriverTripHappyPathHarness(driverConfig);

	const harnessResult = await harness.runHappyPath({
		ensureDriverOnline: true,
		timeoutsMs: {
			confirm:       Math.min(TIMEOUT_MS, 90_000),
			'in-progress': 60_000,
			resume:        60_000,
			closed:        60_000,
		},
	});

	log(`✓ Harness completado — amount: ${harnessResult.totalAmount} | method: ${harnessResult.paymentMethod}`);
	log(`  Checkpoints: ${harnessResult.checkpoints.map(c => c.stage).join(' → ')}`);

	// ── 4. Serializar resultado ────────────────────────────────────────────────
	const result: MobilePhaseResult = {
		journeyId:     JOURNEY_ID!,
		status:        'driver-completed',
		totalAmount:   harnessResult.totalAmount,
		paymentMethod: harnessResult.paymentMethod,
		checkpoints:   harnessResult.checkpoints.map(c => c.stage),
	};

	// ── 5. Actualizar JourneyContext → driver-completed ────────────────────────
	log('Actualizando JourneyContext → driver-completed...');
	await markMobileCompleted(result);

	// ── 6. Escribir resultado en stdout para que el spec lo lea ───────────────
	const OUTPUT_MARKER = 'E2E_MOBILE_RESULT:';
	console.log(`${OUTPUT_MARKER}${JSON.stringify(result)}`);

	log('✓ Fase mobile Flow 3 completada exitosamente.');
}

// ─── Entry point ─────────────────────────────────────────────────────────────

run().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[flow3/mobile-phase] ERROR: ${message}`);

	markMobileCompleted({
		journeyId:     JOURNEY_ID!,
		status:        'failed',
		totalAmount:   '',
		paymentMethod: '',
		checkpoints:   [],
		errorMessage:  message,
	}).catch(() => {});

	process.exit(1);
});
