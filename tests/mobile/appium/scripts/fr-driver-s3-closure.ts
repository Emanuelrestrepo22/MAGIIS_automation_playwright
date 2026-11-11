/**
 * S3 FR: cierre de viaje desde el Driver app TEST (chofer 4965, carrier 1901) en emulator-5554.
 * Runner fino sobre `F5AppCloseFlow` (PBOs): preflight -> online -> aceptar viaje asignado -> iniciar ->
 * alimentar ruta GPS -> finalizar -> resumen -> cerrar.
 * El viaje debe estar ya asignado/ofrecido al chofer (se toma el que muestre la pantalla de confirmación;
 * EXPECTED_TRAVEL_ID, si se informa, ahora SÍ se exige: la oferta en pantalla debe ser de ese viaje).
 *
 * IRREVERSIBLE: cierra un viaje permanente en TEST. Gate: F5_APP_CLOSE=1 + --confirm (igual que W5b).
 *
 * Uso (desde la raíz del repo):
 *   F5_APP_CLOSE=1 ENV_FILE=.env.emulator-test-fr npx tsx tests/mobile/appium/scripts/fr-driver-s3-closure.ts --confirm
 * Opcional: GPS_STEP_METERS (default 30), GPS_INTERVAL_MS (default 2000), EXPECTED_TRAVEL_ID,
 *   FR_RESUME_TO_START=1 (reanuda un viaje ya aceptado en «Empezar viaje»),
 *   GPS_ROUTE_FILE | GPS_ROUTE_ORIGIN/DESTINATION/WAYPOINTS (override; default = ruta del carrier 1901).
 */

import { getDriverAppConfig } from '../config/appiumRuntime';
import { evaluateGates, irreversibleCloseGates } from '../core/Gates';
import { I18n } from '../core/I18n';
import { MobileSession } from '../core/MobileSession';
import { getCarrier, loadCarrierRoute } from '../data/carriers';
import { getDriverProfile, readDriverPreflightExpectation } from '../driver/DriverProfiles';
import { F5AppCloseFlow } from '../flows/F5AppCloseFlow';
import { readGpsRouteFromEnv } from '../gps/GpsRouteFeeder';

const log = (m: string): void => console.log(`[fr-s3] ${m}`);
const FR_CARRIER_ID = 1901;

async function run(): Promise<number> {
	const config = getDriverAppConfig();
	if (!config.appPackage) throw new Error('appPackage no resuelto.');
	if (config.udid !== 'emulator-5554') throw new Error(`UDID debe ser emulator-5554 (actual: ${config.udid ?? '<null>'}).`);
	const confirm = process.argv.slice(2).includes('--confirm');
	const gates = evaluateGates(irreversibleCloseGates({ confirm }, process.env));
	if (!gates.open) {
		log(`Cierre irreversible: faltan ${gates.missing.join(' y ')}. No se hizo nada.`);
		return 1;
	}

	const carrier = getCarrier(FR_CARRIER_ID);
	const profile = getDriverProfile('fr-1901');
	const routeEnv = process.env.GPS_ROUTE_FILE?.trim() || process.env.GPS_ROUTE_ORIGIN?.trim();
	const route = routeEnv ? readGpsRouteFromEnv() : loadCarrierRoute(carrier);
	const expectedRaw = process.env.EXPECTED_TRAVEL_ID?.trim();
	const travelId = expectedRaw && Number.isInteger(Number(expectedRaw)) && Number(expectedRaw) > 0 ? Number(expectedRaw) : null;
	log(`travel esperado: ${travelId ?? '<no informado>'}; ruta ${route.length} puntos (${routeEnv ? 'override env' : `carrier ${carrier.carrierId} -> ${carrier.routeId}`})`);

	const resume = process.env.FR_RESUME_TO_START === '1';
	const expectation = readDriverPreflightExpectation(profile, config.appPackage, travelId ?? undefined);
	const session = new MobileSession(config, { log });
	const evidence = session.evidence(`fr-s3-closure-${travelId ?? 'sin-travel'}`);
	try {
		// Las screens/PBOs toman `session.driver` al construirse: el flow se arma DESPUÉS de abrir la sesión.
		await session.start();
		const flow = F5AppCloseFlow.forSession(session, I18n.forProfile(profile.id), evidence, log);
		const result = await flow.run({
			carrier,
			travelId,
			expectation,
			route,
			gps: {
				stepMeters: Number(process.env.GPS_STEP_METERS ?? 30),
				intervalMs: Number(process.env.GPS_INTERVAL_MS ?? 2_000),
				onProgress: (fed, total) => {
					if (fed % 50 === 0 || fed === total) log(`gps ${fed}/${total}`);
				}
			},
			confirmed: confirm,
			resumeFromToStart: resume
		});
		if (result.status === 'closed') {
			const r = result.closure.result;
			log(`RESULT total=${r.totalAmountText} pago=${r.paymentMethod} km=${result.closure.measured.km}`);
			log(`checkpoints: ${r.checkpoints.map(c => `${c.stage}(${c.matchedBy})`).join(' -> ')}`);
			return 0;
		}
		if (result.status === 'failed') log(`FALLÓ en «${result.stage}»: ${result.message}`);
		return 1;
	} finally {
		await session.end();
		for (const l of evidence.manifest()) log(`evidencia: ${l}`);
		log('liberar mock GPS: adb -s emulator-5554 shell am stopservice io.appium.settings/.LocationService');
	}
}

run()
	.then(code => process.exit(code))
	.catch((e: unknown) => {
		console.error(`[fr-s3] ${e instanceof Error ? e.message : String(e)}`);
		process.exit(1);
	});
