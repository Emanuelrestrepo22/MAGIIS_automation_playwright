// Unit de DriverSessionPBO con deps fake (sin Appium). Run: npx tsx --test tests/mobile/appium/pbo/DriverSessionPBO.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DriverPreflightExpectation, DriverPreflightSnapshot } from '../driver/DriverTripPreflight';
import { DriverNotOnlineError, DriverSessionPBO } from './DriverSessionPBO';

const EXPECTED: DriverPreflightExpectation = { appPackage: 'com.test.driver', driverDisplayName: 'Chofer QA' };
const SNAP: DriverPreflightSnapshot = { foregroundPackage: 'com.test.driver', webUrl: '', headerTexts: [], loggedOut: false };

function build(opts: { online?: boolean; preflightFails?: boolean } = {}) {
	const calls: string[] = [];
	const pbo = new DriverSessionPBO(
		{
			preflight: async (_e, o) => {
				calls.push('preflight');
				if (opts.preflightFails) throw new Error('Pre-flight abortado');
				await o.afterLogin();
				return SNAP;
			},
			home: {
				dismissPreHomeOverlayIfPresent: async () => (calls.push('dismiss'), true),
				goOnline: async () => void calls.push('goOnline'),
				isDriverOnline: async () => (calls.push('isOnline'), opts.online ?? true)
			}
		},
		() => undefined
	);
	return { pbo, calls };
}

test('startSession: login -> overlay -> online y devuelve identidad online', async () => {
	const { pbo, calls } = build();
	const id = await pbo.startSession(EXPECTED);
	assert.deepEqual(calls, ['preflight', 'dismiss', 'dismiss', 'goOnline', 'isOnline']);
	assert.deepEqual(id, { driverDisplayName: 'Chofer QA', appPackage: 'com.test.driver', online: true });
});

test('ensureLoggedIn: el afterLogin del preflight cierra el overlay pre-home', async () => {
	const { pbo, calls } = build();
	const id = await pbo.ensureLoggedIn(EXPECTED);
	assert.deepEqual(calls, ['preflight', 'dismiss']);
	assert.equal(id.online, false);
});

test('ensureOnline: lanza DriverNotOnlineError si no queda disponible', async () => {
	const { pbo } = build({ online: false });
	await assert.rejects(() => pbo.ensureOnline(), DriverNotOnlineError);
});

test('startSession: error del preflight corta antes de tocar home', async () => {
	const { pbo, calls } = build({ preflightFails: true });
	await assert.rejects(() => pbo.startSession(EXPECTED), /Pre-flight abortado/);
	assert.deepEqual(calls, ['preflight']);
});
