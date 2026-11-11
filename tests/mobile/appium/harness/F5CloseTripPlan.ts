/**
 * F5CloseTripPlan — validación pura (sin Appium, sin adb) previa al cierre de un viaje por la app.
 *
 * El cierre es un viaje permanente en TEST (una corrida = un viaje). Este módulo concentra TODAS las
 * puertas previas para que `--dry-run` y la corrida real evalúen exactamente lo mismo, y para que
 * se puedan cubrir con unitarios sin dispositivo:
 *
 *  - ambiente: solo TEST con la app `com.magiis.app.test.driver` (decisión del usuario: la app real
 *    corre solo en TEST; UAT no usa app).
 *  - dispositivo: `--device` debe coincidir con el UDID de la config y el del handoff.
 *  - handoff: válido, `prepared` y sin cierre previo (no hay reintento).
 *  - perfil: credenciales del chofer presentes (por nombre de clave) y carrier compatible.
 *  - ruta GPS: sin violaciones duras de los filtros de la app.
 *  - gates de irreversibilidad: `F5_APP_CLOSE=1` + `--confirm` (solo la corrida real).
 */

import { analyzeRoutePlan, type RoutePlan } from '../gps/RoutePlan';
import type { LatLng } from '../gps/GpsRouteFeeder';
import { assertReadyToClose, type F5AppHandoff } from '../contracts/f5AppHandoff';
import { checkDriverProfileEnv, type DriverProfile } from '../driver/DriverProfiles';

export const F5_TEST_DRIVER_PACKAGE = 'com.magiis.app.test.driver';

export type F5CloseArgs = {
	profile: string;
	/** Carrier del nombre de archivo del handoff (o `--handoff` explícito). */
	carrier?: string;
	handoff?: string;
	route?: string;
	device?: string;
	dryRun: boolean;
	confirm: boolean;
	stepMeters: number;
	intervalMs: number;
};

const FLAGS_WITH_VALUE = new Set(['profile', 'carrier', 'handoff', 'route', 'device', 'step', 'interval']);
const FLAGS_BOOLEAN = new Set(['dry-run', 'confirm']);

/** Parser de argv estricto: flag desconocida o sin valor = error (un typo no debe degradar un gate). */
export function parseF5CloseArgs(argv: string[]): F5CloseArgs {
	const values: Record<string, string> = {};
	const bools = new Set<string>();
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith('--')) throw new Error(`Argumento inesperado "${a}".`);
		const eq = a.indexOf('=');
		const name = a.slice(2, eq === -1 ? undefined : eq);
		if (FLAGS_BOOLEAN.has(name)) {
			bools.add(name);
		} else if (FLAGS_WITH_VALUE.has(name)) {
			const value = eq === -1 ? argv[++i] : a.slice(eq + 1);
			if (!value || value.startsWith('--')) throw new Error(`--${name} requiere un valor.`);
			values[name] = value;
		} else {
			throw new Error(`Flag desconocida --${name}.`);
		}
	}
	if (!values.profile) throw new Error('--profile es obligatorio (fr-1901 | test-default | test-mp).');
	if (!values.handoff && !values.carrier) throw new Error('Indicar --handoff <archivo> o --carrier <id> (ruta canónica en evidence/<env>/).');
	const num = (key: string, def: number): number => {
		if (values[key] === undefined) return def;
		const n = Number(values[key]);
		if (!Number.isFinite(n) || n <= 0) throw new Error(`--${key} debe ser un número > 0.`);
		return n;
	};
	return {
		profile: values.profile,
		carrier: values.carrier,
		handoff: values.handoff,
		route: values.route,
		device: values.device,
		dryRun: bools.has('dry-run'),
		confirm: bools.has('confirm'),
		stepMeters: num('step', 30),
		intervalMs: num('interval', 2_000)
	};
}

export type F5ClosePlanInput = {
	args: F5CloseArgs;
	profile: DriverProfile;
	handoff: F5AppHandoff;
	route: LatLng[];
	/** Config resuelta del runtime Appium (solo lo necesario, para poder simularla en tests). */
	runtime: { environment: string; appPackage: string | null; udid: string | null };
	env: NodeJS.ProcessEnv;
};

export type F5ClosePlan = {
	travelId: number;
	carrierId: number;
	profileId: string;
	appPackage: string;
	udid: string;
	route: RoutePlan;
	/** Claves de entorno faltantes del perfil (nombres, nunca valores). */
	missingEnvKeys: string[];
	/** Motivos por los que NO se puede cerrar. Vacío = lista para cerrar. */
	blockers: string[];
	/** Notas informativas del plan. */
	notes: string[];
};

export function buildF5ClosePlan(input: F5ClosePlanInput): F5ClosePlan {
	const { args, profile, handoff, route, runtime, env } = input;
	const blockers: string[] = [];
	const notes: string[] = [];

	if (runtime.environment !== 'test') {
		blockers.push(`ENV="${runtime.environment}": la app Chofer real corre solo en TEST (UAT no usa app).`);
	}
	if (runtime.appPackage !== F5_TEST_DRIVER_PACKAGE) {
		blockers.push(`appPackage="${runtime.appPackage ?? '<sin resolver>'}" != ${F5_TEST_DRIVER_PACKAGE}.`);
	}
	if (handoff.app.package !== F5_TEST_DRIVER_PACKAGE) {
		blockers.push(`handoff.app.package="${handoff.app.package}" != ${F5_TEST_DRIVER_PACKAGE}.`);
	}
	if (!runtime.udid) blockers.push('Falta ANDROID_DRIVER_UDID (o ANDROID_UDID) en el entorno.');
	if (!args.device) blockers.push('Falta --device <udid> (guard explícito del dispositivo).');
	if (args.device && runtime.udid && args.device !== runtime.udid) {
		blockers.push(`--device=${args.device} no coincide con el UDID del entorno (${runtime.udid}).`);
	}
	if (args.device && args.device !== handoff.app.udid) {
		blockers.push(`--device=${args.device} no coincide con handoff.app.udid (${handoff.app.udid}).`);
	}
	if (profile.carrierId !== null && profile.carrierId !== handoff.carrierId) {
		blockers.push(`El perfil ${profile.id} es del carrier ${profile.carrierId} pero el handoff es del ${handoff.carrierId}.`);
	}
	if (profile.carrierId === null) {
		notes.push(
			`Perfil ${profile.id} no fija carrier: se confía en handoff.driverId=${handoff.driverId} (la asignación ya fue hecha por W5a).`
		);
	}
	try {
		assertReadyToClose(handoff);
	} catch (e) {
		blockers.push(e instanceof Error ? e.message : String(e));
	}

	const { missing } = checkDriverProfileEnv(profile, env);
	if (missing.length > 0) {
		blockers.push(`Faltan variables del perfil ${profile.id}: ${missing.join(', ')}.`);
	}

	const routePlan = analyzeRoutePlan(route, { stepMeters: args.stepMeters, intervalMs: args.intervalMs });
	for (const v of routePlan.violations) blockers.push(`Ruta GPS: ${v}.`);
	for (const w of routePlan.warnings) notes.push(`Ruta GPS: ${w}.`);

	return {
		travelId: handoff.travelId,
		carrierId: handoff.carrierId,
		profileId: profile.id,
		appPackage: handoff.app.package,
		udid: handoff.app.udid,
		route: routePlan,
		missingEnvKeys: missing,
		blockers,
		notes
	};
}

/** Gates de irreversibilidad de la corrida REAL. Devuelve los que faltan. */
export function missingCloseGates(args: Pick<F5CloseArgs, 'confirm'>, env: NodeJS.ProcessEnv): string[] {
	const missing: string[] = [];
	if (env.F5_APP_CLOSE !== '1') missing.push('F5_APP_CLOSE=1');
	if (!args.confirm) missing.push('--confirm');
	return missing;
}

/** Texto legible del plan (sin credenciales ni tokens). */
export function formatF5ClosePlan(plan: F5ClosePlan): string[] {
	const r = plan.route;
	const lines = [
		`viaje ${plan.travelId} · carrier ${plan.carrierId} · perfil ${plan.profileId}`,
		`app ${plan.appPackage} · dispositivo ${plan.udid}`,
		`ruta GPS: ${r.pointsTotal} puntos · ${(r.theoreticalMeters / 1000).toFixed(2)} km · ${Math.round(r.durationSeconds / 60)} min · ${r.speedMps.toFixed(1)} m/s`,
		`tramos: min ${r.minSegmentMeters.toFixed(1)} m · max ${r.maxSegmentMeters.toFixed(1)} m · cortos(<15 m) ${r.shortSegments}`
	];
	for (const n of plan.notes) lines.push(`nota: ${n}`);
	if (plan.blockers.length === 0) lines.push('estado: LISTO para cerrar (falta F5_APP_CLOSE=1 + --confirm en la corrida real)');
	else for (const b of plan.blockers) lines.push(`BLOQUEO: ${b}`);
	return lines;
}

/** Detecta si el servicio de mock GPS de Appium Settings está corriendo (salida de `dumpsys activity services`). */
export function isMockLocationServiceRunning(dumpsysOutput: string): boolean {
	return /ServiceRecord\{[^}]*io\.appium\.settings\/\.LocationService/.test(dumpsysOutput);
}
