/**
 * GpsRouteFeeder — alimenta una ruta GPS al emulador Android vía `mobile: setGeolocation`.
 *
 * POR QUÉ EXISTE. El Driver app calcula los KM del viaje desde puntos GPS propios (el backend
 * solo persiste el `finalKm` que reporta la app). Con `driver.setGeoLocation()` plano (sin speed)
 * los puntos se descartan; hace falta `mobile: setGeolocation` con `speed`, `bearing` y
 * `accuracy`, a cadencia estable. Si el KM medido queda muy por debajo del presupuestado, la app
 * conserva el presupuestado (guard de tolerancia) — por eso se devuelve la distancia teórica para
 * contrastarla con la que la app termine reportando.
 *
 * Aritmética pura (haversine / bearing / interpolación) exportada aparte para test unitario.
 *
 * NO libera el mock al terminar: eso lo hace el operador/spec con
 * `adb shell am stopservice io.appium.settings/.LocationService`.
 */

import type { AppiumDriver } from '../base/AppiumSessionBase';

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

export function haversineMeters(a: LatLng, b: LatLng): number {
	const dLat = toRad(b.lat - a.lat);
	const dLng = toRad(b.lng - a.lng);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumbo inicial de `a` a `b` en grados [0, 360). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
	const dLng = toRad(b.lng - a.lng);
	const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
	const x =
		Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
		Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
	return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Distancia total de la polilínea (suma de tramos), en metros. */
export function routeDistanceMeters(points: LatLng[]): number {
	let total = 0;
	for (let i = 1; i < points.length; i++) total += haversineMeters(points[i - 1], points[i]);
	return total;
}

/**
 * Densifica la polilínea: entre cada par de puntos inserta intermedios (interpolación lineal en
 * lat/lng, válida a esta escala) para que ningún tramo supere `stepMeters`. Conserva los puntos
 * originales y su orden.
 */
export function interpolateRoute(points: LatLng[], stepMeters: number): LatLng[] {
	if (!(stepMeters > 0)) throw new Error(`stepMeters debe ser > 0 (recibido ${stepMeters}).`);
	if (points.length === 0) return [];
	const out: LatLng[] = [points[0]];
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		const segments = Math.max(1, Math.ceil(haversineMeters(a, b) / stepMeters));
		for (let s = 1; s <= segments; s++) {
			const t = s / segments;
			out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
		}
	}
	return out;
}

function parseLatLng(raw: string, key: string): LatLng {
	const parts = raw.split(',').map(p => Number(p.trim()));
	if (parts.length !== 2 || parts.some(n => !Number.isFinite(n))) {
		throw new Error(`${key} inválida: se espera "lat,lng".`);
	}
	const [lat, lng] = parts;
	if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error(`${key} fuera de rango geográfico.`);
	return { lat, lng };
}

/**
 * Lee la ruta de env: `<PREFIX>_ORIGIN`, `<PREFIX>_DESTINATION` y opcional `<PREFIX>_WAYPOINTS`
 * (`lat,lng;lat,lng`, intermedios en orden — p. ej. derivados de OSRM). Falla nombrando la clave.
 */
export function readGpsRouteFromEnv(prefix = 'GPS_ROUTE'): LatLng[] {
	const need = (key: string): string => {
		const v = process.env[key]?.trim();
		if (!v) throw new Error(`Falta la variable ${key} (ruta GPS del emulador). Definila en el archivo de entorno.`);
		return v;
	};
	const waypoints = (process.env[`${prefix}_WAYPOINTS`] ?? '')
		.split(';')
		.map(s => s.trim())
		.filter(Boolean)
		.map(s => parseLatLng(s, `${prefix}_WAYPOINTS`));
	return [
		parseLatLng(need(`${prefix}_ORIGIN`), `${prefix}_ORIGIN`),
		...waypoints,
		parseLatLng(need(`${prefix}_DESTINATION`), `${prefix}_DESTINATION`)
	];
}

export type GpsFeederOptions = {
	/** Separación máxima entre puntos. Default 30 m (mínimo 15). */
	stepMeters?: number;
	/** Cadencia FIJA entre puntos. Default 2000 ms (mínimo 1000). */
	intervalMs?: number;
	/** Precisión reportada en metros (<= 10 recomendado). Default 5. */
	accuracyMeters?: number;
	altitude?: number;
	onProgress?: (fed: number, total: number, point: LatLng) => void;
};

export type GpsFeedResult = {
	/** Distancia teórica de la ruta interpolada completa, en metros. */
	theoreticalMeters: number;
	/** Distancia teórica recorrida hasta el último punto emitido. */
	fedMeters: number;
	pointsFed: number;
	pointsTotal: number;
	aborted: boolean;
};

export class GpsRouteFeeder {
	private abortRequested = false;
	private wake: (() => void) | null = null;
	private readonly stepMeters: number;
	private readonly intervalMs: number;
	private readonly accuracyMeters: number;
	private readonly altitude: number;

	constructor(
		private readonly driver: AppiumDriver,
		private readonly options: GpsFeederOptions = {}
	) {
		this.stepMeters = options.stepMeters ?? 30;
		this.intervalMs = options.intervalMs ?? 2_000;
		this.accuracyMeters = options.accuracyMeters ?? 5;
		this.altitude = options.altitude ?? 15;
		if (this.stepMeters < 15) throw new Error('stepMeters < 15: la app descarta puntos demasiado cercanos.');
		if (this.intervalMs < 1_000) throw new Error('intervalMs < 1000: la app descarta puntos demasiado frecuentes.');
	}

	/** Corta la alimentación; `feed()` resuelve con `aborted: true`. Idempotente. */
	abort(): void {
		this.abortRequested = true;
		this.wake?.();
	}

	async feed(route: LatLng[]): Promise<GpsFeedResult> {
		if (route.length < 2) throw new Error('La ruta necesita al menos origen y destino.');
		this.abortRequested = false;
		const points = interpolateRoute(route, this.stepMeters);
		const theoreticalMeters = routeDistanceMeters(points);
		// Velocidad coherente con la separación y la cadencia configuradas (m/s).
		const speed = this.stepMeters / (this.intervalMs / 1_000);
		let fedMeters = 0;
		let pointsFed = 0;

		for (let i = 0; i < points.length; i++) {
			if (this.abortRequested) break;
			const point = points[i];
			const prev = points[i - 1];
			const bearing = i < points.length - 1 ? bearingDegrees(point, points[i + 1]) : bearingDegrees(prev, point);
			await this.driver.execute('mobile: setGeolocation', {
				latitude: point.lat,
				longitude: point.lng,
				altitude: this.altitude,
				speed,
				bearing,
				accuracy: this.accuracyMeters
			});
			if (prev) fedMeters += haversineMeters(prev, point);
			pointsFed++;
			this.options.onProgress?.(pointsFed, points.length, point);
			if (i < points.length - 1) await this.sleepInterruptible();
		}

		return { theoreticalMeters, fedMeters, pointsFed, pointsTotal: points.length, aborted: this.abortRequested };
	}

	/**
	 * Espera de cadencia FIJA entre puntos (no es una espera por estado: la app mide el KM con
	 * el reloj de los fixes GPS, así que el ritmo constante ES el contrato). Se corta con abort().
	 */
	private sleepInterruptible(): Promise<void> {
		return new Promise(resolve => {
			const timer = setTimeout(() => {
				this.wake = null;
				resolve();
			}, this.intervalMs);
			this.wake = () => {
				clearTimeout(timer);
				this.wake = null;
				resolve();
			};
		});
	}
}
