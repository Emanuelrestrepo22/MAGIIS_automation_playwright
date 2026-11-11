// Unit del contrato W5a <-> W5b contra los fixtures REALES de cv2-f5 (sin Appium, sin ambientes).
// Run: npx tsx --test tests/mobile/appium/contracts/f5AppHandoffFixtures.unit.ts
// Se pone ROJO si el schema cambia de un solo lado: subir F5_APP_HANDOFF_SCHEMA_VERSION y re-copiar los fixtures en ambos repos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { F5_APP_HANDOFF_SCHEMA_VERSION, parseF5AppHandoff } from './f5AppHandoff';

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (name: string): Record<string, unknown> =>
	JSON.parse(readFileSync(path.join(here, 'fixtures', name), 'utf8')) as Record<string, unknown>;

// Claves de primer nivel que el contrato conoce (tipo F5AppHandoff + `route`, campo extra de W5a que el runner preserva).
const KNOWN_KEYS = new Set([
	'schemaVersion', 'status', 'runId', 'carrierId', 'travelId', 'code', 'driverId', 'vehicleId', 'ownerId',
	'scenario', 'currency', 'quoted', 'app', 'closedAt', 'measured', 'result', 'failure', 'observations', 'route'
]);

for (const [name, status] of [
	['f5-app-handoff.prepared.json', 'prepared'],
	['f5-app-handoff.closed.json', 'closed']
] as const) {
	test(`fixture ${name}: schemaVersion explícito == constante compartida`, () => {
		assert.equal(load(name).schemaVersion, F5_APP_HANDOFF_SCHEMA_VERSION);
	});

	test(`fixture ${name}: parseF5AppHandoff lo acepta con status=${status}`, () => {
		const h = parseF5AppHandoff(load(name));
		assert.equal(h.status, status);
		assert.equal(h.schemaVersion, F5_APP_HANDOFF_SCHEMA_VERSION);
		assert.ok(h.travelId > 0 && h.carrierId > 0);
	});

	test(`fixture ${name}: sin claves de primer nivel desconocidas para el runner`, () => {
		const unknown = Object.keys(load(name)).filter(k => !KNOWN_KEYS.has(k));
		assert.deepEqual(unknown, [], `Claves nuevas en el fixture (¿cambió el contrato en cv2-f5?): ${unknown.join(', ')}`);
	});
}

test('fixture closed: trae el cierre completo que W5a lee', () => {
	const h = parseF5AppHandoff(load('f5-app-handoff.closed.json'));
	assert.ok(h.closedAt && h.measured && h.result);
	assert.equal(h.measured.kmSource, 'gps-fed');
	assert.equal(typeof h.result.totalAmount, 'number');
});

test('fixture prepared y closed describen el mismo viaje', () => {
	const p = parseF5AppHandoff(load('f5-app-handoff.prepared.json'));
	const c = parseF5AppHandoff(load('f5-app-handoff.closed.json'));
	assert.deepEqual([c.runId, c.travelId, c.carrierId, c.driverId], [p.runId, p.travelId, p.carrierId, p.driverId]);
});
