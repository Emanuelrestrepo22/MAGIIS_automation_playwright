// Unit test de la aritmética y el control del GpsRouteFeeder (node:test, sin Appium).
// Run: npx tsx --test tests/mobile/appium/gps/GpsRouteFeeder.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	GpsRouteFeeder,
	bearingDegrees,
	haversineMeters,
	interpolateRoute,
	readGpsRouteFromEnv,
	routeDistanceMeters,
	type LatLng
} from './GpsRouteFeeder';

const CANNES: LatLng = { lat: 43.5528, lng: 7.0174 };
const NICE: LatLng = { lat: 43.6961, lng: 7.2716 };

test('haversine: 1 grado de latitud ~ 111.2 km', () => {
	const d = haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
	assert.ok(Math.abs(d - 111_195) < 100, `d=${d}`);
});

test('haversine: simétrica y cero para el mismo punto', () => {
	assert.equal(haversineMeters(CANNES, CANNES), 0);
	assert.ok(Math.abs(haversineMeters(CANNES, NICE) - haversineMeters(NICE, CANNES)) < 1e-6);
});

test('bearing: norte=0, este=90, sur=180, oeste=270', () => {
	const o = { lat: 0, lng: 0 };
	assert.ok(Math.abs(bearingDegrees(o, { lat: 1, lng: 0 }) - 0) < 1e-6);
	assert.ok(Math.abs(bearingDegrees(o, { lat: 0, lng: 1 }) - 90) < 1e-6);
	assert.ok(Math.abs(bearingDegrees(o, { lat: -1, lng: 0 }) - 180) < 1e-6);
	assert.ok(Math.abs(bearingDegrees(o, { lat: 0, lng: -1 }) - 270) < 1e-6);
});

test('interpolateRoute: conserva extremos, ningún tramo > step, distancia preservada', () => {
	const pts = interpolateRoute([CANNES, NICE], 30);
	assert.deepEqual(pts[0], CANNES);
	assert.deepEqual(pts[pts.length - 1], NICE);
	for (let i = 1; i < pts.length; i++) assert.ok(haversineMeters(pts[i - 1], pts[i]) <= 30.5);
	const direct = haversineMeters(CANNES, NICE);
	assert.ok(Math.abs(routeDistanceMeters(pts) - direct) / direct < 0.001);
});

test('interpolateRoute: respeta waypoints intermedios (distancia = suma de tramos)', () => {
	const mid: LatLng = { lat: 43.62, lng: 7.05 };
	const pts = interpolateRoute([CANNES, mid, NICE], 40);
	assert.ok(pts.some(p => p.lat === mid.lat && p.lng === mid.lng));
	const expected = haversineMeters(CANNES, mid) + haversineMeters(mid, NICE);
	assert.ok(Math.abs(routeDistanceMeters(pts) - expected) / expected < 0.001);
});

test('interpolateRoute: tramo corto = un solo salto; step inválido lanza', () => {
	const near: LatLng = { lat: CANNES.lat + 0.0001, lng: CANNES.lng };
	assert.equal(interpolateRoute([CANNES, near], 30).length, 2);
	assert.throws(() => interpolateRoute([CANNES, NICE], 0));
	assert.deepEqual(interpolateRoute([], 30), []);
});

test('readGpsRouteFromEnv: parsea, y falla nombrando la clave', () => {
	delete process.env.T_ORIGIN;
	assert.throws(() => readGpsRouteFromEnv('T'), /T_ORIGIN/);
	process.env.T_ORIGIN = '43.55,7.01';
	process.env.T_DESTINATION = '43.69,7.27';
	process.env.T_WAYPOINTS = '43.6,7.1; 43.65,7.2';
	const r = readGpsRouteFromEnv('T');
	assert.equal(r.length, 4);
	assert.deepEqual(r[1], { lat: 43.6, lng: 7.1 });
	process.env.T_DESTINATION = 'abc';
	assert.throws(() => readGpsRouteFromEnv('T'), /T_DESTINATION/);
});

test('feeder: emite mobile: setGeolocation con speed/bearing/accuracy y devuelve distancia teórica', async () => {
	const calls: Array<{ script: string; args: Record<string, number> }> = [];
	const driver = {
		execute: async (script: string, args: Record<string, number>) => {
			calls.push({ script, args });
			return null;
		}
	};
	const a: LatLng = { lat: 43.5528, lng: 7.0174 };
	const b: LatLng = { lat: 43.5528, lng: 7.0174 + 0.0009 }; // ~73 m -> 3 tramos
	const feeder = new GpsRouteFeeder(driver as never, { stepMeters: 30, intervalMs: 1_000 });
	const res = await feeder.feed([a, b]);
	assert.equal(res.aborted, false);
	assert.equal(res.pointsFed, res.pointsTotal);
	assert.equal(res.pointsTotal, calls.length);
	assert.ok(Math.abs(res.theoreticalMeters - haversineMeters(a, b)) < 0.5);
	assert.ok(Math.abs(res.fedMeters - res.theoreticalMeters) < 1e-6);
	for (const c of calls) {
		assert.equal(c.script, 'mobile: setGeolocation');
		assert.equal(c.args.speed, 30);
		assert.ok(c.args.speed > 0 && c.args.accuracy <= 10);
		assert.ok(Math.abs(c.args.bearing - 90) < 1);
	}
});

test('feeder: abort() corta la alimentación', async () => {
	let n = 0;
	const feeder: GpsRouteFeeder = new GpsRouteFeeder(
		{
			execute: async () => {
				n++;
				if (n === 2) feeder.abort();
				return null;
			}
		} as never,
		{ stepMeters: 30, intervalMs: 1_000 }
	);
	const res = await feeder.feed([CANNES, NICE]);
	assert.equal(res.aborted, true);
	assert.equal(res.pointsFed, 2);
	assert.ok(res.pointsTotal > 100);
});

test('feeder: rechaza cadencia/step fuera del mínimo que la app tolera', () => {
	assert.throws(() => new GpsRouteFeeder({ execute: async () => null } as never, { stepMeters: 10 }), /stepMeters/);
	assert.throws(() => new GpsRouteFeeder({ execute: async () => null } as never, { intervalMs: 500 }), /intervalMs/);
});
