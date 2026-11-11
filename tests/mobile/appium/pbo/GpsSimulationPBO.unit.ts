// Unit de GpsSimulationPBO con feeder/driver fake (sin Appium). Run: npx tsx --test tests/mobile/appium/pbo/GpsSimulationPBO.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GpsSimulationPBO, type GpsDriveOptions, type GpsFeederLike } from './GpsSimulationPBO';

const ROUTE = [
	{ lat: 0, lng: 0 },
	{ lat: 0, lng: 0.001 }
];

function build(over: Partial<Awaited<ReturnType<GpsFeederLike['feed']>>> = {}) {
	const executed: Array<{ command: string; args: Record<string, unknown> }> = [];
	const created: GpsDriveOptions[] = [];
	let aborts = 0;
	let release: () => void = () => undefined;
	const pbo = new GpsSimulationPBO({
		execute: async (command, args) => {
			executed.push({ command, args });
		},
		createFeeder: options => {
			created.push(options);
			return {
				feed: async () => {
					await new Promise<void>(r => (release = r));
					return { theoreticalMeters: 111, fedMeters: 100, pointsFed: 4, pointsTotal: 5, aborted: false, ...over };
				},
				abort: () => {
					aborts++;
					release();
				}
			};
		}
	});
	return { pbo, executed, created, aborts: () => aborts, release: () => release() };
}

test('positionAt envía un solo mobile: setGeolocation con speed/bearing/accuracy', async () => {
	const { pbo, executed } = build();
	await pbo.positionAt({ lat: 25.76, lng: -80.19 });
	assert.equal(executed.length, 1);
	assert.equal(executed[0].command, 'mobile: setGeolocation');
	assert.deepEqual(executed[0].args, { latitude: 25.76, longitude: -80.19, altitude: 15, speed: 0, bearing: 0, accuracy: 5 });
	await pbo.positionAt({ lat: 1, lng: 2 }, { speed: 3, bearing: 90, accuracyMeters: 8, altitude: 2 });
	assert.deepEqual(executed[1].args, { latitude: 1, longitude: 2, altitude: 2, speed: 3, bearing: 90, accuracy: 8 });
});

test('driveRoute reenvía opciones al feeder y tipa el resultado (pointsSent)', async () => {
	const { pbo, created, release } = build();
	const p = pbo.driveRoute(ROUTE, { stepMeters: 30, intervalMs: 2000 });
	release();
	const r = await p;
	assert.deepEqual(created, [{ stepMeters: 30, intervalMs: 2000 }]);
	assert.deepEqual(r, { theoreticalMeters: 111, fedMeters: 100, pointsSent: 4, pointsTotal: 5, aborted: false });
});

test('abort corta el feeder activo y es no-op sin recorrido', async () => {
	const { pbo, aborts } = build({ aborted: true });
	pbo.abort();
	assert.equal(aborts(), 0);
	const p = pbo.driveRoute(ROUTE);
	await Promise.resolve();
	pbo.abort();
	const r = await p;
	assert.equal(aborts(), 1);
	assert.equal(r.aborted, true);
	pbo.abort();
	assert.equal(aborts(), 1);
});
