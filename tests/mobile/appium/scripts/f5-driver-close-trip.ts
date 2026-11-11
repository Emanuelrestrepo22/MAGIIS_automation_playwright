/**
 * W5b — Cierra desde la app Chofer REAL (emulador, TEST) un viaje ya asignado por cv2-f5 (W5a) y
 * anexa el resultado al handoff JSON que W5a lee para armar el lote de rendición.
 *
 * Flujo: preflight (app/chofer/sin viaje en curso) -> guard mock GPS ajeno -> aceptar la oferta del
 * viaje del handoff (exige que sea ESE travelId) -> iniciar -> alimentar ruta GPS (`mobile:
 * setGeolocation` con speed) -> finalizar -> resumen -> cerrar -> anexar `closedAt` / `measured` /
 * `result` al handoff + capturas por checkpoint.
 *
 * IRREVERSIBLE: cada corrida completa cierra UN viaje permanente en TEST. Sin reintentos: si algo
 * se corta tras aceptar, el handoff queda `failed` y se decide a mano mirando el viaje en backend.
 *
 * Uso (desde la raíz del repo; ENV_FILE puede ser una ruta absoluta fuera del repo):
 *   # 1) plan sin sesión Appium ni adb de escritura (siempre antes):
 *   ENV_FILE=.env.emulator-test npx tsx tests/mobile/appium/scripts/f5-driver-close-trip.ts \
 *     --profile fr-1901 --carrier 1901 --device emulator-5554 --dry-run
 *   # 2) corrida real (la ejecuta el orquestador, con Appium y emulador arriba):
 *   F5_APP_CLOSE=1 ENV_FILE=.env.emulator-test npx tsx tests/mobile/appium/scripts/f5-driver-close-trip.ts \
 *     --profile fr-1901 --carrier 1901 --device emulator-5554 --confirm
 *
 * Flags: --profile <fr-1901|test-default|test-mp> · --carrier <id> | --handoff <archivo> ·
 *   --device <udid> · --route <json con points[]> (override; default = ruta del carrier del handoff vía
 *   data/carriers.ts; GPS_ROUTE_FILE=<json> es override equivalente, leído solo en este script) ·
 *   --step <m> (30) · --interval <ms> (2000) · --dry-run · --confirm
 * Env: ENV=test, F5_APP_CLOSE=1 (gate), ADB_PATH (opcional), credenciales del perfil (nunca se imprimen).
 */

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { getDriverAppConfig } from '../config/appiumRuntime';
import { f5AppHandoffPath, readF5AppHandoff, writeF5AppHandoff } from '../contracts/f5AppHandoff';
import { assertNoForeignMockGps, evaluateGates, irreversibleCloseGates } from '../core/Gates';
import { I18n } from '../core/I18n';
import { MobileSession } from '../core/MobileSession';
import { getCarrier, loadCarrierRoute } from '../data/carriers';
import { getDriverProfile, readDriverPreflightExpectation } from '../driver/DriverProfiles';
import { F5AppCloseFlow, applyF5CloseResult, type F5AppCloseResult } from '../flows/F5AppCloseFlow';
import { loadRouteFile } from '../gps/GpsRouteFeeder';
import { buildF5ClosePlan, formatF5ClosePlan, parseF5CloseArgs } from '../harness/F5CloseTripPlan';

const log = (m: string): void => console.log(`[f5-close] ${m}`);
const execFileAsync = promisify(execFile);

function adb(udid: string, args: string[]): Promise<string> {
	return execFileAsync(process.env.ADB_PATH?.trim() || 'adb', ['-s', udid, ...args], { timeout: 15_000 }).then(r => r.stdout);
}

async function run(): Promise<number> {
	const args = parseF5CloseArgs(process.argv.slice(2));
	const profile = getDriverProfile(args.profile);
	const config = getDriverAppConfig();
	const env = config.environment;

	const handoffFile = args.handoff ? path.resolve(args.handoff) : f5AppHandoffPath(env, args.carrier!);
	const handoff = readF5AppHandoff(handoffFile);

	// Ruta GPS: override explícito (--route, o GPS_ROUTE_FILE leído SOLO aquí) o la del carrier del handoff.
	const routeOverride = args.route ?? process.env.GPS_ROUTE_FILE?.trim();
	const carrierProfile = getCarrier(handoff.carrierId);
	const route = routeOverride
		? loadRouteFile(path.resolve(routeOverride), 'ruta GPS (override)')
		: loadCarrierRoute(carrierProfile);
	log(`fuente de ruta GPS: ${routeOverride ? `override ${routeOverride}` : `carrier ${carrierProfile.carrierId} -> ${carrierProfile.routeId}`}`);

	const plan = buildF5ClosePlan({
		args,
		profile,
		handoff,
		route,
		runtime: { environment: env, appPackage: config.appPackage, udid: config.udid },
		env: process.env
	});
	log(`handoff: ${path.relative(process.cwd(), handoffFile).replace(/\\/g, '/')}`);
	for (const line of formatF5ClosePlan(plan)) log(line);

	if (args.dryRun) {
		log('--dry-run: no se creó sesión Appium ni se tocó el emulador.');
		return plan.blockers.length === 0 ? 0 : 2;
	}
	if (plan.blockers.length > 0) return 1;
	const gates = evaluateGates(irreversibleCloseGates(args, process.env));
	if (!gates.open) {
		log(`Cierre irreversible: faltan ${gates.missing.join(' y ')}. No se hizo nada.`);
		return 1;
	}

	// Guard: ningún mock GPS de otra sesión (un mock ajeno falsea el km y el chofer ONLINE ajeno mueve ofertas).
	const udid = plan.udid;
	await assertNoForeignMockGps(a => adb(udid, a));

	const expectation = readDriverPreflightExpectation(profile, plan.appPackage, handoff.travelId);
	const session = new MobileSession(config, { log });
	const evidence = session.evidence(`f5-app-close-${handoff.carrierId}-${handoff.travelId}`);
	const flow = F5AppCloseFlow.forSession(session, I18n.forProfile(profile.id), evidence, log);
	let result: F5AppCloseResult;
	try {
		await session.start();
		result = await flow.run({
			carrier: carrierProfile,
			travelId: handoff.travelId,
			expectation,
			route,
			gps: {
				stepMeters: args.stepMeters,
				intervalMs: args.intervalMs,
				onProgress: (fed, total) => {
					if (fed % 50 === 0 || fed === total) log(`gps ${fed}/${total}`);
				}
			},
			confirmed: args.confirm
		});
	} finally {
		await session.end().catch(() => undefined);
		// El mock lo inició esta corrida (el guard garantizó que no había otro): se libera.
		await adb(udid, ['shell', 'am', 'stopservice', 'io.appium.settings/.LocationService']).catch(() =>
			log('no se pudo liberar el mock GPS: adb -s <udid> shell am stopservice io.appium.settings/.LocationService')
		);
	}

	if (result.status === 'closed') {
		const r = result.closure.result;
		log(`cerrado: total=${r.totalAmountText} pago=${r.paymentMethod} km=${result.closure.measured.km.toFixed(2)}`);
	}
	const outcome = applyF5CloseResult(handoff, result, new Date().toISOString());
	if (outcome !== handoff) {
		writeF5AppHandoff(handoffFile, outcome);
		log(`handoff actualizado (status=${outcome.status}).`);
	}
	for (const l of evidence.manifest()) log(`evidencia: ${l}`);
	return result.status === 'closed' ? 0 : 1;
}

run()
	.then(code => process.exit(code))
	.catch((e: unknown) => {
		console.error(`[f5-close] ${e instanceof Error ? e.message : String(e)}`);
		process.exit(1);
	});
