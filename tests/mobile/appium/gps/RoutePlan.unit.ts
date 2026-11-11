// Unit test del análisis de plan de ruta GPS (sin Appium).
// Run: npx tsx --test tests/mobile/appium/gps/RoutePlan.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeRoutePlan, APP_GPS_FILTERS } from './RoutePlan';
import { haversineMeters, type LatLng } from './GpsRouteFeeder';

// ~1 km hacia el norte desde el origen: 0.009 grados de latitud ~ 1000.7 m.
const LINE: LatLng[] = [
	{ lat: 0, lng: 0 },
	{ lat: 0.009, lng: 0 }
];

test('ruta recta de ~1 km: distancia, velocidad y duración coherentes', () => {
	const p = analyzeRoutePlan(LINE, { stepMeters: 30, intervalMs: 2_000 });
	assert.ok(Math.abs(p.theoreticalMeters - haversineMeters(LINE[0], LINE[1])) < 1);
	assert.equal(p.speedMps, 15);
	assert.equal(p.durationSeconds, (p.pointsTotal - 1) * 2);
	assert.deepEqual(p.violations, []);
	assert.ok(p.minSegmentMeters >= APP_GPS_FILTERS.minSeparationMeters, `min=${p.minSegmentMeters}`);
	assert.ok(p.maxSegmentMeters <= 30 + 1e-6);
	assert.equal(p.shortSegments, 0);
});

test('step < 15 m, cadencia < 1 s y velocidad > techo son violaciones duras', () => {
	assert.match(analyzeRoutePlan(LINE, { stepMeters: 10, intervalMs: 2_000 }).violations.join(), /stepMeters=10/);
	assert.match(analyzeRoutePlan(LINE, { stepMeters: 30, intervalMs: 500 }).violations.join(), /intervalMs=500/);
	assert.match(analyzeRoutePlan(LINE, { stepMeters: 200, intervalMs: 2_000 }).violations.join(), /velocidad/);
});

test('tramos cortos originales se reportan como aviso con metros no contables', () => {
	// ~10 m entre los dos primeros puntos originales: la densificación no los alarga.
	const near: LatLng[] = [
		{ lat: 0, lng: 0 },
		{ lat: 0.00009, lng: 0 },
		{ lat: 0.009, lng: 0 }
	];
	const p = analyzeRoutePlan(near, { stepMeters: 30, intervalMs: 2_000 });
	assert.equal(p.shortSegments, 1);
	assert.ok(p.shortSegmentMeters > 5 && p.shortSegmentMeters < 15);
	assert.match(p.warnings.join(), /tramos < 15 m/);
	assert.deepEqual(p.violations, []);
});

test('aceleración implícita alta (largos desiguales) es aviso, no violación', () => {
	const uneven: LatLng[] = [
		{ lat: 0, lng: 0 },
		{ lat: 0.00016, lng: 0 }, // ~17.8 m
		{ lat: 0.00016 + 0.00027, lng: 0 } // ~30 m
	];
	const p = analyzeRoutePlan(uneven, { stepMeters: 30, intervalMs: 2_000 });
	assert.ok(p.maxImpliedAccelMps2 > 0);
	assert.deepEqual(p.violations, []);
});

test('entradas inválidas fallan rápido', () => {
	assert.throws(() => analyzeRoutePlan([LINE[0]], { stepMeters: 30, intervalMs: 2_000 }), /al menos origen y destino/);
	assert.throws(() => analyzeRoutePlan(LINE, { stepMeters: 0, intervalMs: 2_000 }), /stepMeters/);
	assert.throws(() => analyzeRoutePlan(LINE, { stepMeters: 30, intervalMs: 0 }), /intervalMs/);
});

test('ruta real cannes-nice: sin violaciones y km cercano al resampleado del JSON', () => {
	const json = JSON.parse(readFileSync(new URL('./routes/cannes-nice.json', import.meta.url), 'utf8')) as {
		points: LatLng[];
		resampledDistanceMeters: number;
	};
	const p = analyzeRoutePlan(json.points, { stepMeters: 30, intervalMs: 2_000 });
	assert.deepEqual(p.violations, []);
	assert.ok(Math.abs(p.theoreticalMeters - json.resampledDistanceMeters) / json.resampledDistanceMeters < 0.02);
	assert.ok(p.durationSeconds > 0);
});
