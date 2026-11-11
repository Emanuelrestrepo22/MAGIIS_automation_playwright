/**
 * Retoma SOLO el cierre de un viaje F5 cuyo runner (`f5-driver-close-trip.ts`) quedó en `failed` en la etapa
 * «close»: el viaje ya está finalizado y la app muestra el resumen. No acepta, no inicia, no alimenta GPS.
 *
 * Irreversible (cierra el viaje real): exige F5_APP_CLOSE=1 + --confirm. El handoff debe estar `failed` con el
 * mensaje `[close] ...`; cualquier otro estado bloquea. `measured` se toma de la ruta del carrier (el GPS ya se
 * alimentó completo en la corrida que falló) y se anota la observación `cierre-retomado-desde-resumen`.
 *
 * Uso:
 *   F5_APP_CLOSE=1 ENV_FILE=<.env> APP_LOCALE=en npx tsx tests/mobile/appium/scripts/f5-driver-resume-close.ts \
 *     --handoff <archivo> --device <udid> --confirm
 */
import path from 'node:path';
import { getDriverAppConfig } from '../config/appiumRuntime';
import { readF5AppHandoff, withClosure, writeF5AppHandoff, parseMoneyText } from '../contracts/f5AppHandoff';
import { evaluateGates, irreversibleCloseGates } from '../core/Gates';
import { I18n, type Locale } from '../core/I18n';
import { MobileSession } from '../core/MobileSession';
import { getCarrier, loadCarrierRoute } from '../data/carriers';
import { analyzeRoutePlan } from '../gps/RoutePlan';
import { TripLifecyclePBO } from '../pbo/TripLifecyclePBO';

const log = (m: string): void => console.log(`[f5-resume-close] ${m}`);

function argValue(argv: string[], flag: string): string | undefined {
	const i = argv.indexOf(flag);
	return i >= 0 ? argv[i + 1] : undefined;
}

async function run(): Promise<number> {
	const argv = process.argv.slice(2);
	const handoffArg = argValue(argv, '--handoff');
	const device = argValue(argv, '--device');
	const confirm = argv.includes('--confirm');
	if (!handoffArg || !device) throw new Error('Faltan --handoff <archivo> y/o --device <udid>.');

	const handoffFile = path.resolve(handoffArg);
	const handoff = readF5AppHandoff(handoffFile);
	const blockers: string[] = [];
	if (handoff.status !== 'failed' || !handoff.failure?.message.startsWith('[close]')) {
		blockers.push(`el handoff debe estar "failed" en la etapa close (está "${handoff.status}").`);
	}
	if (device !== handoff.app.udid) blockers.push(`--device=${device} != handoff.app.udid (${handoff.app.udid}).`);
	const gates = evaluateGates(irreversibleCloseGates({ confirm }, process.env));
	if (!gates.open) blockers.push(`faltan ${gates.missing.join(' + ')}.`);
	log(`viaje ${handoff.travelId} (${handoff.code}) · carrier ${handoff.carrierId} · dispositivo ${device}`);
	if (blockers.length > 0) {
		for (const b of blockers) log(`BLOQUEO: ${b}`);
		return 2;
	}

	const locale = (process.env.APP_LOCALE?.trim() || 'es') as Locale;
	const route = loadCarrierRoute(getCarrier(handoff.carrierId));
	// Mismos defaults del runner (--step 30 · --interval 2000) con que se alimentó el GPS.
	const routePlan = analyzeRoutePlan(route, { stepMeters: 30, intervalMs: 2000 });
	const session = new MobileSession(getDriverAppConfig(), { log });
	const startedAt = new Date().toISOString();
	try {
		await session.start();
		const trip = TripLifecyclePBO.forSession(session, new I18n(locale), { log });
		const summary = await trip.readSummary();
		const close = await trip.closeTrip({ confirmed: true });
		const finishedAt = new Date().toISOString();
		const routeKm = Number((routePlan.theoreticalMeters / 1000).toFixed(3));
		const { failure: _previousFailure, ...base } = handoff;
		const closed = withClosure(base, {
			closedAt: finishedAt,
			measured: {
				km: routeKm,
				minutes: Number((routePlan.durationSeconds / 60).toFixed(2)),
				kmSource: 'gps-fed',
				routeKm
			},
			result: {
				totalAmountText: summary.totalText,
				totalAmount: parseMoneyText(summary.totalText),
				paymentMethod: close.paymentMethod || summary.paymentMethod,
				closeButtonText: close.closeLabel,
				checkpoints: [{ stage: 'closed', matchedBy: 'pbo:trip.closeTrip (retomado)', observedAt: finishedAt }],
				startedAt,
				finishedAt
			}
		});
		closed.observations = [...(closed.observations ?? []), 'cierre-retomado-desde-resumen'];
		writeF5AppHandoff(handoffFile, closed);
		log(`viaje cerrado · total ${summary.totalText} · medio ${closed.result?.paymentMethod} · handoff closed.`);
		return 0;
	} finally {
		await session.end().catch(() => undefined);
	}
}

run()
	.then(code => {
		process.exitCode = code;
	})
	.catch((e: unknown) => {
		log(`fatal: ${e instanceof Error ? e.message : String(e)}`);
		process.exitCode = 1;
	});
