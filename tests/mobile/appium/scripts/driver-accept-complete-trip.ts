/**
 * Cierra el E2E Flow 2 desde la APP DRIVER: el conductor va online, acepta el viaje difundido
 * (SEARCHING_DRIVER, p.ej. TRAVEL 67970 creado por la pax app), simula la ruta y finaliza →
 * el hold eBiz pasa de HOLD a CAPTURE. Usa DriverTripHappyPathHarness (infra existente).
 *
 * Uso: APPIUM_SERVER_URL=http://localhost:4723 ENV=test \
 *   node --loader ts-node/esm -r dotenv/config tests/mobile/appium/scripts/driver-accept-complete-trip.ts
 */

import { getDriverAppConfig } from '../config/appiumRuntime';
import { DriverTripHappyPathHarness } from '../harness/DriverTripHappyPathHarness';

const log = (m: string): void => console.log(`[driver-flow] ${m}`);

async function run(): Promise<void> {
	const harness = new DriverTripHappyPathHarness(getDriverAppConfig());
	try {
		log('driver happy path: online → aceptar → ruta → finalizar → summary → cerrar…');
		const result = await harness.runHappyPath({ ensureDriverOnline: true });
		log(`RESULT total=${result.totalAmount} pago=${result.paymentMethod}`);
		log(`checkpoints: ${result.checkpoints.map(c => `${c.stage}(${c.matchedBy})`).join(' → ')}`);
	} finally {
		await harness.endSession();
	}
}

run().catch((e: unknown) => { console.error(`[driver-flow] ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
