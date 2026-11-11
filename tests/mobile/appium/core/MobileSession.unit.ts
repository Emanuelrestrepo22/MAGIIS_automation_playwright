// Unit de MobileSession + Evidence con fakes (sin Appium). Run: npx tsx --test tests/mobile/appium/core/MobileSession.unit.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Browser } from 'webdriverio';
import type { MobileActorConfig } from '../config/appiumRuntime';
import { Evidence, type EvidenceCapturer } from './Evidence';
import { MobileSession } from './MobileSession';

const fakeDriver = (over: Partial<Record<string, unknown>> = {}) => ({ deleteSession: async () => undefined, ...over }) as unknown as Browser;
const quiet = () => undefined;
const CONFIG: MobileActorConfig = {
	actor: 'driver',
	environment: 'test',
	appiumServerUrl: 'http://127.0.0.1:4723',
	appiumBasePath: '/',
	appPath: null,
	appPackage: 'com.example.driver',
	appActivity: '.MainActivity',
	deviceName: 'emulator-5554',
	platformVersion: '14',
	udid: 'emulator-5554',
	newCommandTimeout: 60,
	noReset: true,
	fullReset: false,
	chromedriverAutodownload: false,
	chromedriverExecutable: null
};

test('start crea el driver una sola vez; end lo libera', async () => {
	let created = 0;
	const s = new MobileSession(CONFIG, {
		remoteFn: async () => (created++, fakeDriver()),
		log: quiet
	});
	assert.equal(s.hasDriver, false);
	assert.throws(() => s.driver, /not started/);
	await s.start();
	await s.start();
	assert.equal(created, 1);
	assert.equal(s.hasDriver, true);
	await s.end();
	assert.equal(s.hasDriver, false);
});

test('end no bloquea si deleteSession cuelga: timeout y driver liberado', async () => {
	const s = new MobileSession(CONFIG, {
		driver: fakeDriver({ deleteSession: () => new Promise(() => undefined) }),
		endTimeoutMs: 30,
		log: quiet
	});
	const t0 = Date.now();
	await s.end();
	assert.ok(Date.now() - t0 < 1000);
	assert.equal(s.hasDriver, false);
});

test('context distingue native de webview', async () => {
	const native = new MobileSession(CONFIG, { driver: fakeDriver({ getContext: async () => 'NATIVE_APP' }) });
	const web = new MobileSession(CONFIG, { driver: fakeDriver({ getContext: async () => 'WEBVIEW_x' }) });
	assert.equal(await native.context(), 'native');
	assert.equal(await web.context(), 'webview');
});

test('switchContext webview elige la primera WEBVIEW y falla si no hay', async () => {
	let switched = '';
	const ok = new MobileSession(CONFIG, {
		driver: fakeDriver({
			getContexts: async () => ['NATIVE_APP', 'WEBVIEW_a'],
			switchContext: async (c: string) => void (switched = c)
		})
	});
	assert.equal(await ok.switchContext('webview'), 'WEBVIEW_a');
	assert.equal(switched, 'WEBVIEW_a');
	const none = new MobileSession(CONFIG, { driver: fakeDriver({ getContexts: async () => ['NATIVE_APP'] }) });
	await assert.rejects(none.switchContext('webview'), /No hay WebView/);
});

test('Evidence es perezosa y numera checkpoints', async () => {
	let built = 0;
	const labels: string[] = [];
	const cap: EvidenceCapturer = {
		capture: async label => {
			labels.push(label);
			return { label, relPath: `evidence/${labels.length}.png`, takenAt: 't' };
		},
		all: () => [],
		manifest: () => labels.map(l => `x — ${l}`)
	};
	const ev = new Evidence(() => (built++, cap));
	assert.equal(built, 0);
	assert.deepEqual(ev.manifest(), []);
	await ev.checkpoint('confirm');
	await ev.capture('otra');
	assert.equal(built, 1);
	assert.deepEqual(labels, ['checkpoint-confirm', 'otra']);
});

test('open/remoteOptions: pasa las opciones de remote tal cual (capabilities de script idénticas, attach sin relanzar)', async () => {
	const opts = {
		protocol: 'http',
		hostname: 'localhost',
		port: 4723,
		path: '/',
		logLevel: 'warn',
		capabilities: { platformName: 'Android', 'appium:noReset': true, 'appium:forceAppLaunch': false, 'appium:autoLaunch': false }
	};
	let received: unknown;
	const drv = fakeDriver();
	const driver = await MobileSession.open(opts, {
		log: quiet,
		remoteFn: async o => {
			received = o;
			return drv;
		}
	});
	assert.strictEqual(received, opts);
	assert.strictEqual(driver, drv);
	const session = new MobileSession(CONFIG, { remoteOptions: opts, log: quiet, remoteFn: async () => drv });
	await session.start();
	assert.strictEqual(session.driver, drv);
	await session.end();
	assert.equal(session.hasDriver, false);
});
