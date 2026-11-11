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
 *   --device <udid> · --route <json con points[]> (default gps/routes/cannes-nice.json) ·
 *   --step <m> (30) · --interval <ms> (2000) · --dry-run · --confirm
 * Env: ENV=test, F5_APP_CLOSE=1 (gate), ADB_PATH (opcional), credenciales del perfil (nunca se imprimen).
 */

import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { getDriverAppConfig } from '../config/appiumRuntime';
import {
	f5AppHandoffPath,
	parseMoneyText,
	readF5AppHandoff,
	withClosure,
	withFailure,
	writeF5AppHandoff,
	type F5AppHandoff
} from '../contracts/f5AppHandoff';
import { getDriverProfile, readDriverPreflightExpectation } from '../driver/DriverProfiles';
import { GpsRouteFeeder, readGpsRouteFromEnv } from '../gps/GpsRouteFeeder';
import { DriverTripHappyPathHarness } from '../harness/DriverTripHappyPathHarness';
import {
	buildF5ClosePlan,
	formatF5ClosePlan,
	isMockLocationServiceRunning,
	missingCloseGates,
	parseF5CloseArgs
} from '../harness/F5CloseTripPlan';
import { ScreenEvidence } from '../helpers/screenEvidence';

const log = (m: string): void => console.log(`[f5-close] ${m}`);
const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROUTE = path.resolve(here, '../gps/routes/cannes-nice.json');

function adb(udid: string, args: string[]): Promise<string> {
	return execFileAsync(process.env.ADB_PATH?.trim() || 'adb', ['-s', udid, ...args], { timeout: 15_000 }).then(r => r.stdout);
}

async function run(): Promise<number> {
	const args = parseF5CloseArgs(process.argv.slice(2));
	const profile = getDriverProfile(args.profile);
	const config = getDriverAppConfig();
	const env = config.environment;

	const handoffFile = args.handoff
		? path.resolve(args.handoff)
		: f5AppHandoffPath(env, args.carrier!);
	const handoff = readF5AppHandoff(handoffFile);

	process.env.GPS_ROUTE_FILE = args.route ?? process.env.GPS_ROUTE_FILE ?? DEFAULT_ROUTE;
	const route = readGpsRouteFromEnv();

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
	const gates = missingCloseGates(args, process.env);
	if (gates.length > 0) {
		log(`Cierre irreversible: faltan ${gates.join(' y ')}. No se hizo nada.`);
		return 1;
	}

	// Guard: ningún mock GPS de otra sesión (un mock ajeno falsea el km y el chofer ONLINE ajeno mueve ofertas).
	const udid = plan.udid;
	let services: string;
	try {
		services = await adb(udid, ['shell', 'dumpsys', 'activity', 'services', 'io.appium.settings']);
	} catch (e) {
		throw new Error(`No se pudo verificar el mock GPS por adb (${e instanceof Error ? e.message : String(e)}); no se continúa.`);
	}
	if (isMockLocationServiceRunning(services)) {
		throw new Error('Hay un mock GPS activo (io.appium.settings/.LocationService) de otra sesión; liberalo antes de cerrar.');
	}

	const expectation = readDriverPreflightExpectation(profile, plan.appPackage, handoff.travelId);
	const harness = new DriverTripHappyPathHarness(config);
	let shots: ScreenEvidence | null = null;
	let irreversibleStarted = false;
	let feedStartedAt = 0;
	let feedEndedAt = 0;
	let fedMeters = 0;
	let theoreticalMeters = 0;
	const startedAt = new Date().toISOString();
	let outcome: F5AppHandoff = handoff;
	let exitCode = 0;

	try {
		const result = await harness.runHappyPath({
			ensureDriverOnline: true,
			preflight: expectation,
			expectedConfirmTravelId: handoff.travelId,
			onCheckpoint: async (stage, driver) => {
				shots ??= new ScreenEvidence(driver, `f5-app-close-${handoff.carrierId}-${handoff.travelId}`);
				await shots.capture(`checkpoint-${stage}`);
			},
			duringTrip: async driver => {
				irreversibleStarted = true;
				const gps = new GpsRouteFeeder(driver, {
					stepMeters: args.stepMeters,
					intervalMs: args.intervalMs,
					onProgress: (fed, total) => {
						if (fed % 50 === 0 || fed === total) log(`gps ${fed}/${total}`);
					}
				});
				feedStartedAt = Date.now();
				const r = await gps.feed(route);
				feedEndedAt = Date.now();
				fedMeters = r.fedMeters;
				theoreticalMeters = r.theoreticalMeters;
				log(`gps listo: teórico=${Math.round(r.theoreticalMeters)} m alimentado=${Math.round(r.fedMeters)} m abortado=${r.aborted}`);
				if (r.aborted) throw new Error('La alimentación GPS fue abortada; el viaje no se finaliza.');
			}
		});

		const finishedAt = new Date().toISOString();
		const totalAmount = parseMoneyText(result.totalAmount);
		outcome = withClosure(handoff, {
			closedAt: finishedAt,
			measured: {
				km: Number((fedMeters / 1000).toFixed(3)),
				minutes: Number((((feedEndedAt || Date.now()) - feedStartedAt) / 60_000).toFixed(2)),
				kmSource: 'gps-fed',
				routeKm: Number((theoreticalMeters / 1000).toFixed(3))
			},
			result: {
				totalAmountText: result.totalAmount,
				totalAmount,
				paymentMethod: result.paymentMethod,
				closeButtonText: result.closeButtonText,
				checkpoints: result.checkpoints.map(c => ({ stage: c.stage, matchedBy: c.matchedBy, observedAt: c.observedAt })),
				startedAt,
				finishedAt
			}
		});
		if (totalAmount === null) {
			outcome = { ...outcome, observations: [...(outcome.observations ?? []), `monto "${result.totalAmount}" no interpretable: revisar captura`] };
		}
		log(`cerrado: total=${result.totalAmount} pago=${result.paymentMethod} km=${(fedMeters / 1000).toFixed(2)}`);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		log(`ERROR: ${message}`);
		exitCode = 1;
		// Antes de aceptar no se tocó nada del viaje: el handoff queda intacto y se puede corregir y repetir.
		if (irreversibleStarted) outcome = withFailure(handoff, 'in-trip', message, new Date().toISOString());
	} finally {
		await harness.endSession().catch(() => undefined);
		// El mock lo inició esta corrida (el guard garantizó que no había otro): se libera.
		await adb(udid, ['shell', 'am', 'stopservice', 'io.appium.settings/.LocationService']).catch(() =>
			log('no se pudo liberar el mock GPS: adb -s <udid> shell am stopservice io.appium.settings/.LocationService')
		);
	}

	if (outcome !== handoff) {
		writeF5AppHandoff(handoffFile, outcome);
		log(`handoff actualizado (status=${outcome.status}).`);
	}
	const shotLines = (shots as ScreenEvidence | null)?.manifest() ?? [];
	for (const l of shotLines) log(`evidencia: ${l}`);
	return exitCode;
}

run()
	.then(code => process.exit(code))
	.catch((e: unknown) => {
		console.error(`[f5-close] ${e instanceof Error ? e.message : String(e)}`);
		process.exit(1);
	});
