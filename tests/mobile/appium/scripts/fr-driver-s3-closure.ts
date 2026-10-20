/**
 * S3 FR: cierre de viaje desde el Driver app TEST (chofer 4965, carrier 1901) en emulator-5554.
 * Flujo: preflight -> online -> aceptar viaje asignado -> iniciar -> alimentar ruta GPS -> finalizar -> resumen -> confirmar.
 * El viaje debe estar ya asignado/ofrecido al chofer (el harness toma el que muestre la pantalla de confirmación).
 *
 * Uso (desde la raíz del repo):
 *   ENV_FILE=.env.emulator-test-fr pnpm exec ts-node --esm tests/mobile/appium/scripts/fr-driver-s3-closure.ts
 * Opcional: GPS_STEP_METERS (default 30), GPS_INTERVAL_MS (default 2000), EXPECTED_TRAVEL_ID (solo se loguea).
 */

import { getDriverAppConfig } from '../config/appiumRuntime';
import { readFrPreflightExpectation } from '../driver/DriverTripPreflight';
import { GpsRouteFeeder, readGpsRouteFromEnv } from '../gps/GpsRouteFeeder';
import { DriverTripHappyPathHarness } from '../harness/DriverTripHappyPathHarness';

const log = (m: string): void => console.log(`[fr-s3] ${m}`);

async function run(): Promise<void> {
	const config = getDriverAppConfig();
	if (!config.appPackage) throw new Error('appPackage no resuelto.');
	if (config.udid !== 'emulator-5554') throw new Error(`UDID debe ser emulator-5554 (actual: ${config.udid ?? '<null>'}).`);
	const route = readGpsRouteFromEnv();
	log(`travel esperado: ${process.env.EXPECTED_TRAVEL_ID ?? '<no informado>'}; ruta ${route.length} puntos`);
	const harness = new DriverTripHappyPathHarness(config);
	try {
		const result = await harness.runHappyPath({
			ensureDriverOnline: true,
			preflight: readFrPreflightExpectation(config.appPackage),
			duringTrip: async driver => {
				const gps = new GpsRouteFeeder(driver, {
					stepMeters: Number(process.env.GPS_STEP_METERS ?? 30),
					intervalMs: Number(process.env.GPS_INTERVAL_MS ?? 2_000),
					onProgress: (fed, total) => {
						if (fed % 50 === 0 || fed === total) log(`gps ${fed}/${total}`);
					}
				});
				const r = await gps.feed(route);
				log(`gps done teorico=${Math.round(r.theoreticalMeters)}m alimentado=${Math.round(r.fedMeters)}m aborted=${r.aborted}`);
			}
		});
		log(`RESULT total=${result.totalAmount} pago=${result.paymentMethod}`);
		log(`checkpoints: ${result.checkpoints.map(c => `${c.stage}(${c.matchedBy})`).join(' -> ')}`);
	} finally {
		await harness.endSession();
		log('liberar mock GPS: adb -s emulator-5554 shell am stopservice io.appium.settings/.LocationService');
	}
}

run().catch((e: unknown) => {
	console.error(`[fr-s3] ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
