/**
 * Gates — guards de irreversibilidad reutilizables (D10), extraídos del runner F5
 * (`f5-driver-close-trip.ts` + `F5CloseTripPlan`). Puros e inyectables: sin Appium ni adb propio.
 */

export type GateCheck = { label: string; passed: boolean };

export type GateResult = { open: boolean; missing: string[] };

export class GateClosedError extends Error {
	constructor(
		readonly action: string,
		readonly missing: string[]
	) {
		super(`${action}: faltan ${missing.join(' y ')}. No se hizo nada.`);
		this.name = 'GateClosedError';
	}
}

/** Gate de variable de entorno: abre solo con el valor EXACTO esperado (default `1`). */
export function envFlagGate(name: string, env: NodeJS.ProcessEnv, expected = '1'): GateCheck {
	return { label: `${name}=${expected}`, passed: env[name] === expected };
}

/** Gate de flag CLI (p. ej. `--confirm`). */
export function cliFlagGate(flag: string, present: boolean): GateCheck {
	return { label: flag, passed: present === true };
}

/** Evalúa todos los gates y devuelve los que faltan. */
export function evaluateGates(checks: readonly GateCheck[]): GateResult {
	const missing = checks.filter(c => !c.passed).map(c => c.label);
	return { open: missing.length === 0, missing };
}

/** Lanza `GateClosedError` si algún gate está cerrado. */
export function requireGatesOpen(action: string, checks: readonly GateCheck[]): void {
	const r = evaluateGates(checks);
	if (!r.open) throw new GateClosedError(action, r.missing);
}

/** Los dos gates del cierre irreversible por app: `F5_APP_CLOSE=1` + `--confirm`. */
export function irreversibleCloseGates(args: { confirm: boolean }, env: NodeJS.ProcessEnv): GateCheck[] {
	return [envFlagGate('F5_APP_CLOSE', env), cliFlagGate('--confirm', args.confirm)];
}

/** Detecta si el servicio de mock GPS de Appium Settings corre (salida de `dumpsys activity services`). */
export function isMockLocationServiceRunning(dumpsysOutput: string): boolean {
	return /ServiceRecord\{[^}]*io\.appium\.settings\/\.LocationService/.test(dumpsysOutput);
}

/** Ejecutor adb inyectado: recibe los args posteriores a `-s <udid>` y devuelve stdout. */
export type AdbRunner = (args: string[]) => Promise<string>;

/**
 * Guard: ningún mock GPS de otra sesión (falsea el km y mueve ofertas del chofer ONLINE ajeno).
 * Falla si no puede verificarlo (no se continúa a ciegas) o si hay un mock activo.
 */
export async function assertNoForeignMockGps(adb: AdbRunner): Promise<void> {
	let services: string;
	try {
		services = await adb(['shell', 'dumpsys', 'activity', 'services', 'io.appium.settings']);
	} catch (e) {
		throw new Error(`No se pudo verificar el mock GPS por adb (${e instanceof Error ? e.message : String(e)}); no se continúa.`);
	}
	if (isMockLocationServiceRunning(services)) {
		throw new Error('Hay un mock GPS activo (io.appium.settings/.LocationService) de otra sesión; liberalo antes de cerrar.');
	}
}

export const Gates = {
	envFlagGate,
	cliFlagGate,
	evaluateGates,
	requireGatesOpen,
	irreversibleCloseGates,
	isMockLocationServiceRunning,
	assertNoForeignMockGps
} as const;
