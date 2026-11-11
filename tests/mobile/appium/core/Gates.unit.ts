// Unit de Gates (sin Appium ni adb). Run: npx tsx --test tests/mobile/appium/core/Gates.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	GateClosedError,
	assertNoForeignMockGps,
	envFlagGate,
	evaluateGates,
	irreversibleCloseGates,
	isMockLocationServiceRunning,
	requireGatesOpen
} from './Gates';
import { missingCloseGates } from '../harness/F5CloseTripPlan';

test('gate cerrado: sin F5_APP_CLOSE ni --confirm faltan ambos', () => {
	const r = evaluateGates(irreversibleCloseGates({ confirm: false }, {}));
	assert.equal(r.open, false);
	assert.deepEqual(r.missing, ['F5_APP_CLOSE=1', '--confirm']);
});

test('gate abierto: F5_APP_CLOSE=1 y --confirm', () => {
	const r = evaluateGates(irreversibleCloseGates({ confirm: true }, { F5_APP_CLOSE: '1' }));
	assert.deepEqual(r, { open: true, missing: [] });
});

test('valor exacto: "true", "0" y "" no abren el gate de entorno', () => {
	for (const v of ['true', '0', '', ' 1', 'yes']) {
		assert.equal(envFlagGate('F5_APP_CLOSE', { F5_APP_CLOSE: v }).passed, false, `valor "${v}"`);
	}
	assert.equal(envFlagGate('F5_APP_CLOSE', { F5_APP_CLOSE: '1' }).passed, true);
});

test('abre parcial: solo env sin --confirm falta --confirm', () => {
	assert.deepEqual(evaluateGates(irreversibleCloseGates({ confirm: false }, { F5_APP_CLOSE: '1' })).missing, ['--confirm']);
});

test('requireGatesOpen lanza GateClosedError con lo que falta', () => {
	assert.throws(
		() => requireGatesOpen('Cierre irreversible', irreversibleCloseGates({ confirm: true }, {})),
		(e: unknown) => e instanceof GateClosedError && e.missing[0] === 'F5_APP_CLOSE=1' && /No se hizo nada/.test(e.message)
	);
	assert.doesNotThrow(() => requireGatesOpen('x', irreversibleCloseGates({ confirm: true }, { F5_APP_CLOSE: '1' })));
});

test('paridad con missingCloseGates del runner F5', () => {
	for (const confirm of [true, false]) {
		for (const env of [{}, { F5_APP_CLOSE: '1' }, { F5_APP_CLOSE: 'true' }]) {
			assert.deepEqual(evaluateGates(irreversibleCloseGates({ confirm }, env)).missing, missingCloseGates({ confirm }, env));
		}
	}
});

test('mock GPS: detecta el servicio de Appium Settings activo', () => {
	assert.equal(isMockLocationServiceRunning('* ServiceRecord{abc u0 io.appium.settings/.LocationService}'), true);
	assert.equal(isMockLocationServiceRunning('(nothing)'), false);
});

test('assertNoForeignMockGps: ok sin mock, falla con mock activo o si adb falla', async () => {
	await assert.doesNotReject(assertNoForeignMockGps(async () => 'nada'));
	await assert.rejects(
		assertNoForeignMockGps(async () => 'ServiceRecord{1 u0 io.appium.settings/.LocationService}'),
		/mock GPS activo/
	);
	await assert.rejects(
		assertNoForeignMockGps(async () => {
			throw new Error('device offline');
		}),
		/No se pudo verificar el mock GPS por adb \(device offline\)/
	);
});
