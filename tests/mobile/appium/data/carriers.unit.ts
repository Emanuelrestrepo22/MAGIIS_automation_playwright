// Unit test de los datos por carrier y su resolución (sin Appium, sin env).
// Run: npx tsx --test tests/mobile/appium/data/carriers.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { CARRIERS, GPS_ROUTES_DIR, getCarrier, loadCarrierRoute, resolveDriverProfileId, type CarrierRegistry } from './carriers';
import { DRIVER_PROFILES } from '../driver/DriverProfiles';
import { analyzeRoutePlan } from '../gps/RoutePlan';
import { haversineMeters } from '../gps/GpsRouteFeeder';

test('cada carrier declara datos completos y apunta a perfil y ruta existentes', () => {
	for (const c of Object.values(CARRIERS)) {
		assert.ok(c.region && c.locale && c.currency.length === 3, `carrier ${c.carrierId}`);
		for (const id of Object.values(c.driverProfiles)) assert.ok(id! in DRIVER_PROFILES, `perfil ${id}`);
		assert.ok(loadCarrierRoute(c).length >= 2, `ruta ${c.routeId}`);
	}
});

test('1521 = EE. UU. / USD / en-US y chofer test-default en TEST; 1901 = FR / EUR', () => {
	const us = getCarrier(1521);
	assert.deepEqual([us.region, us.locale, us.currency], ['us', 'en-US', 'USD']);
	assert.equal(resolveDriverProfileId(us, 'test'), 'test-default');
	const fr = getCarrier(1901);
	assert.deepEqual([fr.region, fr.currency], ['fr', 'EUR']);
	assert.equal(resolveDriverProfileId(fr, 'test'), 'fr-1901');
});

test('carrier o perfil inexistente falla nombrando el problema', () => {
	assert.throws(() => getCarrier(9999), /Carrier 9999 sin datos/);
	assert.throws(() => resolveDriverProfileId(getCarrier(1901), 'uat'), /1901.*"uat"/);
	assert.throws(() => loadCarrierRoute(getCarrier(1901), '../../package.json'), /fuera de gps\/routes/);
});

test('segundo carrier = 1 entrada de datos, 0 cambios de código', () => {
	const registry: CarrierRegistry = {
		...CARRIERS,
		7777: {
			carrierId: 7777,
			name: 'Simulado',
			region: 'xx',
			locale: 'pt-BR',
			currency: 'BRL',
			routeId: 'us/miami-brickell.json',
			driverProfiles: { test: 'test-mp' }
		}
	};
	const c = getCarrier(7777, registry);
	assert.equal(resolveDriverProfileId(c, 'test'), 'test-mp');
	assert.ok(loadCarrierRoute(c).length > 2);
});

test('la resolución de ruta no muta process.env', () => {
	const before = process.env.GPS_ROUTE_FILE;
	loadCarrierRoute(getCarrier(1521));
	assert.equal(process.env.GPS_ROUTE_FILE, before);
});

function listRoutes(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
		e.isDirectory() ? listRoutes(path.join(dir, e.name)) : e.name.endsWith('.json') ? [path.join(dir, e.name)] : []
	);
}

test('ruta US del 1521: paso constante, sin violaciones duras y 1.5-2.5 km en 90-300 s a 30 m / 2 s', () => {
	const route = loadCarrierRoute(getCarrier(1521));
	const plan = analyzeRoutePlan(route, { stepMeters: 30, intervalMs: 2_000 });
	assert.deepEqual(plan.violations, []);
	assert.equal(plan.shortSegments, 0);
	assert.ok(plan.theoreticalMeters > 1_000 && plan.theoreticalMeters < 2_500, `m=${plan.theoreticalMeters}`);
	assert.ok(plan.durationSeconds >= 90 && plan.durationSeconds <= 300, `s=${plan.durationSeconds}`);
	// Origen en el sur de Florida (guarda gruesa contra coordenadas invertidas).
	assert.ok(haversineMeters(route[0], { lat: 25.76, lng: -80.19 }) < 2_000);
});

test('todas las rutas del repo pasan RoutePlan sin violaciones duras', () => {
	const files = listRoutes(GPS_ROUTES_DIR);
	assert.ok(files.length >= 3);
	for (const f of files) {
		const rel = path.relative(GPS_ROUTES_DIR, f);
		const plan = analyzeRoutePlan(loadCarrierRoute(getCarrier(1901), rel), { stepMeters: 30, intervalMs: 2_000 });
		assert.deepEqual(plan.violations, [], rel);
	}
});
