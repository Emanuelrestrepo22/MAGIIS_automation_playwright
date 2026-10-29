// Unit test del pre-flight (función pura, sin Appium).
// Run: npx tsx --test tests/mobile/appium/driver/DriverTripPreflight.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDriverPreflight, readFrPreflightExpectation } from './DriverTripPreflight';

const PKG = 'com.magiis.app.test.driver';
const expected = { appPackage: PKG, driverDisplayName: 'Chofer Prueba' };
const ok = { foregroundPackage: PKG, webUrl: 'http://localhost/#/navigator/home', headerTexts: ['CHÓFER prueba'], loggedOut: false };

test('OK: paquete, chofer y sin viaje', () => {
	assert.deepEqual(evaluateDriverPreflight(ok, expected), []);
});

test('paquete equivocado (UAT en vez de TEST)', () => {
	const v = evaluateDriverPreflight({ ...ok, foregroundPackage: 'com.magiis.app.uat.driver' }, expected);
	assert.equal(v.length, 1);
	assert.match(v[0], /primer plano/);
});

test('app deslogueada es violación (el login lo resuelve assertDriverPreflight)', () => {
	assert.match(evaluateDriverPreflight({ ...ok, loggedOut: true, headerTexts: [] }, expected).join(), /deslogueada/);
});

test('chofer distinto o header vacío', () => {
	assert.match(evaluateDriverPreflight({ ...ok, headerTexts: ['Otro Chofer'] }, expected).join(), /chofer FR/);
	assert.match(evaluateDriverPreflight({ ...ok, headerTexts: [] }, expected).join(), /chofer FR/);
});

test('viaje en curso en cualquier stage no-cerrado', () => {
	for (const token of ['TravelConfirmPage', 'TravelInProgressPage', 'TravelResumePage']) {
		const v = evaluateDriverPreflight({ ...ok, webUrl: `http://x/#/${token}` }, expected);
		assert.match(v.join(), /viaje en curso/);
	}
});

test('readFrPreflightExpectation: nombra todas las claves faltantes, sin valores', () => {
	for (const k of ['DRIVER_EMAIL_FR', 'DRIVER_PASSWORD_FR', 'DRIVER_DISPLAY_NAME_FR']) delete process.env[k];
	assert.throws(
		() => readFrPreflightExpectation(PKG),
		e =>
			e instanceof Error &&
			/DRIVER_EMAIL_FR, DRIVER_PASSWORD_FR, DRIVER_DISPLAY_NAME_FR/.test(e.message)
	);
	process.env.DRIVER_EMAIL_FR = 'x@example.invalid';
	process.env.DRIVER_PASSWORD_FR = 'SECRETO-NO-LOGUEAR';
	assert.throws(
		() => readFrPreflightExpectation(PKG),
		e => e instanceof Error && /DRIVER_DISPLAY_NAME_FR/.test(e.message) && !e.message.includes('SECRETO')
	);
	process.env.DRIVER_DISPLAY_NAME_FR = 'Chofer Prueba';
	assert.equal(readFrPreflightExpectation(PKG).driverDisplayName, 'Chofer Prueba');
});

test('oferta del viaje esperado: no cuenta como viaje en curso', () => {
	const url = 'https://localhost/navigator/TravelConfirmPage;data=' + encodeURIComponent('{"travelId":71510,"simulatedPrice":2828}');
	const offer = { ...ok, webUrl: url, headerTexts: [] };
	assert.deepEqual(evaluateDriverPreflight(offer, { ...expected, expectedTravelId: 71510 }), []);
});

test('oferta de OTRO viaje: sigue abortando', () => {
	const url = 'https://localhost/navigator/TravelConfirmPage;data=' + encodeURIComponent('{"travelId":71502}');
	const v = evaluateDriverPreflight({ ...ok, webUrl: url }, { ...expected, expectedTravelId: 71510 });
	assert.ok(v.some(x => /viaje en curso/.test(x)));
});
