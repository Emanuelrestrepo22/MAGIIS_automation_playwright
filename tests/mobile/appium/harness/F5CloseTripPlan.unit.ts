// Unit test de las puertas previas al cierre por app (sin Appium ni adb).
// Run: npx tsx --test tests/mobile/appium/harness/F5CloseTripPlan.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseF5AppHandoff, withClosure } from '../contracts/f5AppHandoff';
import { DRIVER_PROFILES, readDriverPreflightExpectation } from '../driver/DriverProfiles';
import { confirmUrlMatchesTravel } from '../driver/DriverTripPreflight';
import type { LatLng } from '../gps/GpsRouteFeeder';
import {
	F5_TEST_DRIVER_PACKAGE,
	buildF5ClosePlan,
	formatF5ClosePlan,
	isMockLocationServiceRunning,
	missingCloseGates,
	parseF5CloseArgs,
	type F5CloseArgs
} from './F5CloseTripPlan';

const ROUTE: LatLng[] = [
	{ lat: 43.55, lng: 7.01 },
	{ lat: 43.56, lng: 7.02 }
];
const handoff = () =>
	parseF5AppHandoff({
		runId: 'r',
		carrierId: 1901,
		travelId: 70001,
		code: 'T-1',
		driverId: 4965,
		vehicleId: 1,
		ownerId: 2,
		scenario: 'EF-NC-COM',
		quoted: { total: 100, otherCosts: 0 },
		app: { package: F5_TEST_DRIVER_PACKAGE, udid: 'emulator-5554' }
	});
const FR_ENV = { DRIVER_EMAIL_FR: 'a@b.c', DRIVER_PASSWORD_FR: 'x', DRIVER_DISPLAY_NAME_FR: 'Chofer FR' };
const args = (over: Partial<F5CloseArgs> = {}): F5CloseArgs => ({
	profile: 'fr-1901',
	carrier: '1901',
	device: 'emulator-5554',
	dryRun: true,
	confirm: false,
	stepMeters: 30,
	intervalMs: 2_000,
	...over
});
const runtime = { environment: 'test', appPackage: F5_TEST_DRIVER_PACKAGE as string | null, udid: 'emulator-5554' as string | null };
const plan = (over: Partial<Parameters<typeof buildF5ClosePlan>[0]> = {}) =>
	buildF5ClosePlan({ args: args(), profile: DRIVER_PROFILES['fr-1901'], handoff: handoff(), route: ROUTE, runtime, env: FR_ENV, ...over });

test('parseF5CloseArgs: flags válidas, defaults y forma --k=v', () => {
	const a = parseF5CloseArgs(['--profile', 'fr-1901', '--carrier=1901', '--device', 'emulator-5554', '--dry-run']);
	assert.deepEqual([a.profile, a.carrier, a.dryRun, a.confirm, a.stepMeters, a.intervalMs], ['fr-1901', '1901', true, false, 30, 2_000]);
});

test('parseF5CloseArgs: typo, flag sin valor y faltantes son error (no degradan un gate)', () => {
	assert.throws(() => parseF5CloseArgs(['--profile', 'x', '--carrier', '1', '--confirmm']), /desconocida/);
	assert.throws(() => parseF5CloseArgs(['--profile', '--carrier', '1']), /requiere un valor/);
	assert.throws(() => parseF5CloseArgs(['--carrier', '1']), /--profile/);
	assert.throws(() => parseF5CloseArgs(['--profile', 'p']), /--handoff|--carrier/);
	assert.throws(() => parseF5CloseArgs(['--profile', 'p', '--carrier', '1', '--step', 'abc']), /--step/);
	assert.throws(() => parseF5CloseArgs(['--profile', 'p', '--carrier', '1', 'suelto']), /inesperado/);
});

test('plan feliz: sin bloqueos', () => {
	const p = plan();
	assert.deepEqual(p.blockers, []);
	assert.deepEqual(p.missingEnvKeys, []);
	assert.match(formatF5ClosePlan(p).join('\n'), /LISTO para cerrar/);
});

test('bloquea ENV distinto de test y paquete UAT', () => {
	const b = plan({ runtime: { environment: 'uat', appPackage: 'com.magiis.app.uat.driver', udid: 'emulator-5554' } }).blockers.join('\n');
	assert.match(b, /solo en TEST/);
	assert.match(b, /appPackage/);
});

test('bloquea dispositivo faltante o discordante (--device, env)', () => {
	assert.match(plan({ args: args({ device: undefined }) }).blockers.join(), /--device/);
	assert.match(plan({ args: args({ device: 'R92XB0B8F3J' }) }).blockers.join(), /no coincide con el UDID del entorno/);
	assert.match(plan({ runtime: { ...runtime, udid: null } }).blockers.join(), /ANDROID_DRIVER_UDID/);
});

test('bloquea carrier distinto al del perfil y handoff ya cerrado', () => {
	assert.match(plan({ profile: { ...DRIVER_PROFILES['fr-1901'], carrierId: 1521 } }).blockers.join(), /carrier 1521/);
	const closed = withClosure(handoff(), {
		closedAt: '2026-11-12T10:00:00.000Z',
		measured: { km: 1, minutes: 1, kmSource: 'gps-fed', routeKm: 1 },
		result: {
			totalAmountText: '1',
			totalAmount: 1,
			paymentMethod: 'x',
			closeButtonText: 'x',
			checkpoints: [],
			startedAt: 'a',
			finishedAt: 'b'
		}
	});
	assert.match(plan({ handoff: closed }).blockers.join(), /ya está cerrado/);
});

test('bloquea credenciales faltantes nombrando solo claves y ruta con step ilegal', () => {
	const p = plan({ env: { DRIVER_EMAIL_FR: 'a@b.c' } });
	assert.deepEqual(p.missingEnvKeys, ['DRIVER_PASSWORD_FR', 'DRIVER_DISPLAY_NAME_FR']);
	assert.ok(!p.blockers.join().includes('a@b.c'));
	assert.match(plan({ args: args({ stepMeters: 10 }) }).blockers.join(), /Ruta GPS/);
});

test('perfil sin carrier fijo deja nota y usa el handoff', () => {
	const p = plan({
		profile: DRIVER_PROFILES['test-default'],
		env: { DRIVER_EMAIL: 'a', DRIVER_PASSWORD: 'b', DRIVER_DISPLAY_NAME: 'c' }
	});
	assert.deepEqual(p.blockers, []);
	assert.match(p.notes.join(), /no fija carrier/);
});

test('missingCloseGates exige F5_APP_CLOSE=1 y --confirm', () => {
	assert.deepEqual(missingCloseGates({ confirm: false }, {}), ['F5_APP_CLOSE=1', '--confirm']);
	assert.deepEqual(missingCloseGates({ confirm: true }, { F5_APP_CLOSE: '1' }), []);
	assert.deepEqual(missingCloseGates({ confirm: true }, { F5_APP_CLOSE: 'true' }), ['F5_APP_CLOSE=1']);
});

test('readDriverPreflightExpectation: fail-fast sin valores y con credenciales del perfil', () => {
	assert.throws(
		() => readDriverPreflightExpectation(DRIVER_PROFILES['fr-1901'], F5_TEST_DRIVER_PACKAGE, 1, {}),
		/DRIVER_EMAIL_FR, DRIVER_PASSWORD_FR, DRIVER_DISPLAY_NAME_FR/
	);
	const e = readDriverPreflightExpectation(DRIVER_PROFILES['fr-1901'], F5_TEST_DRIVER_PACKAGE, 70001, FR_ENV);
	assert.equal(e.expectedTravelId, 70001);
	assert.equal(e.driverDisplayName, 'Chofer FR');
	assert.equal(e.credentials?.email, 'a@b.c');
});

test('confirmUrlMatchesTravel: coincide solo con el travelId exacto (URL-encoded)', () => {
	const url = `http://localhost/#/TripConfirmPage?data=${encodeURIComponent('{"travelId":70001,"x":1}')}`;
	assert.equal(confirmUrlMatchesTravel(url, 70001), true);
	assert.equal(confirmUrlMatchesTravel(url, 7000), false);
	assert.equal(confirmUrlMatchesTravel(url, 70002), false);
});

test('isMockLocationServiceRunning detecta el ServiceRecord del LocationService', () => {
	const on = '  * ServiceRecord{1a2b io.appium.settings/.LocationService}\n    intent={...}';
	assert.equal(isMockLocationServiceRunning(on), true);
	assert.equal(isMockLocationServiceRunning('(nothing)'), false);
	assert.equal(isMockLocationServiceRunning('ServiceRecord{1 io.appium.settings/.Other}'), false);
});
