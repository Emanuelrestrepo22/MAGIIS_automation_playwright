/**
 * RoutePlan — análisis puro (sin Appium) de lo que `GpsRouteFeeder` va a emitir al emulador.
 *
 * POR QUÉ EXISTE. La app Chofer mide el km con sus propios fixes GPS y descarta los que no pasan
 * sus filtros (separación mínima, cadencia mínima, aceleración máxima). Un cierre es un viaje
 * permanente: conviene saber ANTES de emitir si la ruta elegida va a producir un km medido
 * razonable, y cuánto va a tardar. El runner imprime este plan en `--dry-run` y aborta si hay
 * violaciones duras.
 *
 * Replica la densificación del feeder (`interpolateRoute`) para que el plan y la emisión coincidan.
 */

import { interpolateRoute, haversineMeters, routeDistanceMeters, type LatLng } from './GpsRouteFeeder';

/** Filtros observados de la app (plan W5b): separación, cadencia y aceleración. */
export const APP_GPS_FILTERS = {
	minSeparationMeters: 15,
	minIntervalMs: 1_000,
	maxAccelMps2: 3,
	/** Techo de plausibilidad (~200 km/h): por encima la app lo trata como salto de GPS. */
	maxSpeedMps: 55
} as const;

export type RoutePlanOptions = {
	stepMeters: number;
	intervalMs: number;
};

export type RoutePlan = {
	pointsTotal: number;
	/** Distancia teórica de la polilínea densificada, en metros. */
	theoreticalMeters: number;
	/** Duración de la alimentación (puntos - 1 cadencias), en segundos. */
	durationSeconds: number;
	/** Velocidad reportada al emulador (m/s) = step / cadencia. */
	speedMps: number;
	minSegmentMeters: number;
	maxSegmentMeters: number;
	/** Tramos más cortos que el mínimo de la app (esos fixes se descartan). */
	shortSegments: number;
	/** Metros que la app NO contaría por tramos cortos (cota inferior del km perdido). */
	shortSegmentMeters: number;
	/** Máximo |Δv|/Δt entre tramos consecutivos, con velocidad implícita = largo/cadencia. */
	maxImpliedAccelMps2: number;
	/** Problemas que invalidan la ruta (el runner aborta). */
	violations: string[];
	/** Avisos no bloqueantes (km medido podría quedar por debajo del teórico). */
	warnings: string[];
};

export function analyzeRoutePlan(route: LatLng[], options: RoutePlanOptions): RoutePlan {
	const { stepMeters, intervalMs } = options;
	const violations: string[] = [];
	const warnings: string[] = [];

	if (route.length < 2) throw new Error('La ruta necesita al menos origen y destino.');
	if (!(stepMeters > 0)) throw new Error(`stepMeters debe ser > 0 (recibido ${stepMeters}).`);
	if (!(intervalMs > 0)) throw new Error(`intervalMs debe ser > 0 (recibido ${intervalMs}).`);

	if (stepMeters < APP_GPS_FILTERS.minSeparationMeters) {
		violations.push(`stepMeters=${stepMeters} < ${APP_GPS_FILTERS.minSeparationMeters} m: la app descarta puntos tan cercanos`);
	}
	if (intervalMs < APP_GPS_FILTERS.minIntervalMs) {
		violations.push(`intervalMs=${intervalMs} < ${APP_GPS_FILTERS.minIntervalMs} ms: la app descarta fixes tan frecuentes`);
	}
	const speedMps = stepMeters / (intervalMs / 1_000);
	if (speedMps > APP_GPS_FILTERS.maxSpeedMps) {
		violations.push(`velocidad ${speedMps.toFixed(1)} m/s > ${APP_GPS_FILTERS.maxSpeedMps} m/s: se interpreta como salto de GPS`);
	}

	const points = interpolateRoute(route, stepMeters);
	const segments: number[] = [];
	for (let i = 1; i < points.length; i++) segments.push(haversineMeters(points[i - 1], points[i]));

	const minSegmentMeters = segments.length ? Math.min(...segments) : 0;
	const maxSegmentMeters = segments.length ? Math.max(...segments) : 0;
	const short = segments.filter(s => s < APP_GPS_FILTERS.minSeparationMeters);
	const shortSegmentMeters = short.reduce((a, b) => a + b, 0);

	const dt = intervalMs / 1_000;
	let maxImpliedAccelMps2 = 0;
	for (let i = 1; i < segments.length; i++) {
		maxImpliedAccelMps2 = Math.max(maxImpliedAccelMps2, Math.abs(segments[i] - segments[i - 1]) / dt / dt);
	}

	const theoreticalMeters = routeDistanceMeters(points);
	if (theoreticalMeters <= 0) violations.push('la ruta tiene distancia 0');
	if (short.length > 0) {
		warnings.push(
			`${short.length} tramos < ${APP_GPS_FILTERS.minSeparationMeters} m (${Math.round(shortSegmentMeters)} m) que la app puede descartar`
		);
	}
	if (maxImpliedAccelMps2 > APP_GPS_FILTERS.maxAccelMps2) {
		warnings.push(
			`aceleración implícita máx ${maxImpliedAccelMps2.toFixed(2)} m/s² > ${APP_GPS_FILTERS.maxAccelMps2} (tramos de largo desigual); ` +
				'si el km medido queda corto, remuestrear la ruta a paso constante'
		);
	}

	return {
		pointsTotal: points.length,
		theoreticalMeters,
		durationSeconds: Math.max(0, points.length - 1) * dt,
		speedMps,
		minSegmentMeters,
		maxSegmentMeters,
		shortSegments: short.length,
		shortSegmentMeters,
		maxImpliedAccelMps2,
		violations,
		warnings
	};
}
