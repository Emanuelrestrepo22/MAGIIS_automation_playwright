/**
 * Contrato de handoff W5a (Playwright, cv2-f5) <-> W5b (Appium, este repo) para el cierre de un
 * viaje desde la app Chofer y su posterior rendición.
 *
 * Archivo único por carrier y ambiente: `evidence/<env>/f5-app-handoff-<carrier>.json`.
 *  - W5a escribe la parte «alta + asignación» (`status: "prepared"`).
 *  - El runner Appium la valida, cierra el viaje en el emulador y ANEXA `closedAt`, `measured` y
 *    `result` (`status: "closed"`), o deja `status: "failed"` + `failure` si algo se cortó.
 *  - W5a (verify) relee el mismo archivo: lee `travelId`, espera DONE en backend y compara.
 *
 * Reglas de diseño:
 *  - Sin credenciales ni tokens: solo ids y datos del viaje.
 *  - El cierre por app RECALCULA total/tarifa con los km medidos y el costo queda en 0 hasta F7:
 *    por eso `quoted` es solo referencia y NUNCA se compara por igualdad con `result.totalAmount`.
 *  - `parseF5AppHandoff` es estricto con lo requerido y tolerante con campos extra (los preserva),
 *    para que W5a pueda agregar datos sin romper el runner.
 *  - Puro y sin dependencias de Appium: se testea sin dispositivo.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const F5_APP_HANDOFF_SCHEMA_VERSION = 1;

export type F5AppHandoffStatus = 'prepared' | 'closed' | 'failed';

export type F5AppMeasured = {
	/** Km medidos. Hoy proviene de la ruta GPS alimentada (`gps-fed`): la app no expone el km. */
	km: number;
	minutes: number;
	kmSource: 'gps-fed' | 'app-summary';
	/** Distancia teórica de la ruta completa, en km (para contrastar con el `finalKm` del backend). */
	routeKm: number;
};

export type F5AppResult = {
	/** Texto tal cual lo muestra la app en el resumen (p. ej. `$1,645.00`). */
	totalAmountText: string;
	/** Monto parseado; `null` si el formato no se pudo interpretar (no se inventa). */
	totalAmount: number | null;
	paymentMethod: string;
	/** Texto del botón de cierre (`Cerrar Viaje` / `Firmar y Cerrar viaje`). */
	closeButtonText: string;
	checkpoints: Array<{ stage: string; matchedBy: string; observedAt: string }>;
	startedAt: string;
	finishedAt: string;
};

export type F5AppHandoff = {
	schemaVersion: number;
	status: F5AppHandoffStatus;
	runId: string;
	carrierId: number;
	travelId: number;
	/** Código visible del viaje (el que muestra Carrier). */
	code: string;
	driverId: number;
	vehicleId: number;
	ownerId: number;
	/** Escenario de alta, p. ej. `EF-NC-COM`. */
	scenario: string;
	/** Moneda del carrier (ISO 4217), p. ej. `ARS`, `USD`, `EUR`. */
	currency?: string;
	/** Cotización de alta. Referencia: el cierre por app la recalcula. */
	quoted: { total: number; otherCosts: number };
	app: { package: string; version?: string; udid: string };
	/** ISO-8601 UTC del cierre en la app. Solo lo escribe el runner. */
	closedAt?: string;
	measured?: F5AppMeasured;
	result?: F5AppResult;
	failure?: { stage: string; message: string; at: string };
	/** Notas no bloqueantes (p. ej. `diferido-f7`). */
	observations?: string[];
};

const STATUSES: readonly F5AppHandoffStatus[] = ['prepared', 'closed', 'failed'];

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Valida y devuelve el handoff; lanza con TODAS las violaciones encontradas (sin valores sensibles). */
export function parseF5AppHandoff(raw: unknown): F5AppHandoff {
	if (!isRecord(raw)) throw new Error('Handoff inválido: se esperaba un objeto JSON.');
	const errors: string[] = [];

	const str = (from: Record<string, unknown>, key: string, label = key): string => {
		const v = from[key];
		if (typeof v !== 'string' || !v.trim()) errors.push(`${label}: texto requerido`);
		return typeof v === 'string' ? v : '';
	};
	const id = (key: string): number => {
		const v = raw[key];
		if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) errors.push(`${key}: entero positivo requerido`);
		return typeof v === 'number' ? v : 0;
	};
	const amount = (from: Record<string, unknown>, key: string, label: string): number => {
		const v = from[key];
		if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) errors.push(`${label}: número >= 0 requerido`);
		return typeof v === 'number' ? v : 0;
	};

	const schemaVersion = raw.schemaVersion ?? F5_APP_HANDOFF_SCHEMA_VERSION;
	if (schemaVersion !== F5_APP_HANDOFF_SCHEMA_VERSION) {
		errors.push(`schemaVersion: se soporta ${F5_APP_HANDOFF_SCHEMA_VERSION}, llegó ${String(schemaVersion)}`);
	}
	const status = (raw.status ?? 'prepared') as F5AppHandoffStatus;
	if (!STATUSES.includes(status)) errors.push(`status: debe ser ${STATUSES.join(' | ')}`);

	const runId = str(raw, 'runId');
	const carrierId = id('carrierId');
	const travelId = id('travelId');
	const code = str(raw, 'code');
	const driverId = id('driverId');
	const vehicleId = id('vehicleId');
	const ownerId = id('ownerId');
	const scenario = str(raw, 'scenario');

	let quoted = { total: 0, otherCosts: 0 };
	if (!isRecord(raw.quoted)) errors.push('quoted: objeto {total, otherCosts} requerido');
	else {
		quoted = {
			total: amount(raw.quoted, 'total', 'quoted.total'),
			otherCosts: amount(raw.quoted, 'otherCosts', 'quoted.otherCosts')
		};
	}

	let app: F5AppHandoff['app'] = { package: '', udid: '' };
	if (!isRecord(raw.app)) errors.push('app: objeto {package, udid} requerido');
	else {
		app = { package: str(raw.app, 'package', 'app.package'), udid: str(raw.app, 'udid', 'app.udid') };
		if (raw.app.version !== undefined) {
			if (typeof raw.app.version === 'string') app.version = raw.app.version;
			else errors.push('app.version: texto');
		}
	}

	if (raw.currency !== undefined && (typeof raw.currency !== 'string' || !/^[A-Z]{3}$/.test(raw.currency))) {
		errors.push('currency: código ISO de 3 letras mayúsculas');
	}
	if (raw.closedAt !== undefined && (typeof raw.closedAt !== 'string' || Number.isNaN(Date.parse(raw.closedAt)))) {
		errors.push('closedAt: fecha ISO-8601');
	}
	if (raw.measured !== undefined) {
		const m = raw.measured;
		if (!isRecord(m)) errors.push('measured: objeto');
		else {
			amount(m, 'km', 'measured.km');
			amount(m, 'minutes', 'measured.minutes');
			amount(m, 'routeKm', 'measured.routeKm');
			if (m.kmSource !== 'gps-fed' && m.kmSource !== 'app-summary') errors.push('measured.kmSource: gps-fed | app-summary');
		}
	}
	if (status === 'closed') {
		if (raw.closedAt === undefined) errors.push('closedAt: requerido cuando status="closed"');
		if (raw.measured === undefined) errors.push('measured: requerido cuando status="closed"');
		if (!isRecord(raw.result)) errors.push('result: requerido cuando status="closed"');
	}
	if (status === 'failed' && !isRecord(raw.failure)) errors.push('failure: requerido cuando status="failed"');
	if (
		raw.observations !== undefined &&
		!(Array.isArray(raw.observations) && raw.observations.every(o => typeof o === 'string'))
	) {
		errors.push('observations: lista de textos');
	}

	if (errors.length > 0) throw new Error(`Handoff inválido:\n- ${errors.join('\n- ')}`);

	return {
		...(raw as Record<string, unknown>),
		schemaVersion: F5_APP_HANDOFF_SCHEMA_VERSION,
		status,
		runId,
		carrierId,
		travelId,
		code,
		driverId,
		vehicleId,
		ownerId,
		scenario,
		quoted,
		app
	} as F5AppHandoff;
}

/** Ruta canónica: `evidence/<env>/f5-app-handoff-<carrier>.json` (carrier = id numérico o alias). */
export function f5AppHandoffPath(env: string, carrier: string | number, root = process.cwd()): string {
	const safe = String(carrier).replace(/[^A-Za-z0-9_-]/g, '');
	if (!safe) throw new Error('carrier inválido para el nombre del handoff.');
	return path.resolve(root, 'evidence', env, `f5-app-handoff-${safe}.json`);
}

export function readF5AppHandoff(file: string): F5AppHandoff {
	if (!existsSync(file)) throw new Error(`No existe el handoff: ${file}. Lo genera W5a (f5-app-prepare).`);
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(file, 'utf8'));
	} catch (e) {
		throw new Error(`Handoff ilegible (${file}): ${e instanceof Error ? e.message : String(e)}`);
	}
	return parseF5AppHandoff(raw);
}

/** Escritura atómica (tmp + rename): W5a puede leer en cualquier momento sin ver JSON a medias. */
export function writeF5AppHandoff(file: string, handoff: F5AppHandoff): void {
	parseF5AppHandoff(handoff);
	mkdirSync(path.dirname(file), { recursive: true });
	const tmp = `${file}.${process.pid}.tmp`;
	writeFileSync(tmp, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');
	renameSync(tmp, file);
}

/**
 * Guard de reejecución: un cierre es un viaje permanente. Si el handoff ya está cerrado o falló,
 * repetir la corrida no es idempotente.
 */
export function assertReadyToClose(handoff: F5AppHandoff): void {
	if (handoff.status === 'closed' || handoff.closedAt) {
		throw new Error(
			`El handoff del viaje ${handoff.travelId} ya está cerrado (closedAt=${handoff.closedAt ?? '?'}); no se reintenta.`
		);
	}
	if (handoff.status === 'failed') {
		throw new Error(
			`El handoff del viaje ${handoff.travelId} quedó en "failed" (${handoff.failure?.stage}); ` +
				'revisar el estado real del viaje en backend antes de decidir (no hay reintento automático).'
		);
	}
}

/** Devuelve una copia con el cierre anexado (no muta la entrada). */
export function withClosure(
	handoff: F5AppHandoff,
	closure: { closedAt: string; measured: F5AppMeasured; result: F5AppResult }
): F5AppHandoff {
	const observations = new Set(handoff.observations ?? []);
	// Regla QA lead 15/10: el cierre por app recalcula; el costo queda 0 hasta F7. Se anota, no se compara.
	observations.add('cierre-por-app-recalcula-total: no comparar con quoted.total (diferido-f7 para costo)');
	return {
		...handoff,
		status: 'closed',
		closedAt: closure.closedAt,
		measured: closure.measured,
		result: closure.result,
		observations: [...observations]
	};
}

export function withFailure(handoff: F5AppHandoff, stage: string, message: string, at: string): F5AppHandoff {
	return { ...handoff, status: 'failed', failure: { stage, message: message.slice(0, 500), at } };
}

/**
 * Interpreta un monto visible de la app. Admite `$1,645.00`, `1.645,00 €`, `1 645,00`, `€ 12,5`.
 * El separador decimal es el ÚLTIMO `.` o `,` seguido de 1-2 dígitos; el resto son miles.
 * Devuelve `null` si no hay un número claro.
 */
export function parseMoneyText(text: string): number | null {
	const m = text.replace(/[  ]/g, ' ').match(/-?\d[\d.,\s]*/);
	if (!m) return null;
	let s = m[0].trim().replace(/\s+/g, '');
	const lastSep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
	let decimals = '';
	if (lastSep >= 0 && /^\d{1,2}$/.test(s.slice(lastSep + 1))) {
		decimals = s.slice(lastSep + 1);
		s = s.slice(0, lastSep);
	}
	const intPart = s.replace(/[.,]/g, '');
	if (!/^-?\d+$/.test(intPart)) return null;
	const n = Number(decimals ? `${intPart}.${decimals}` : intPart);
	return Number.isFinite(n) ? n : null;
}
