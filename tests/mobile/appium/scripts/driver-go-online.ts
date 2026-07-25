/**
 * Bootstrap driver-ready (app reinstalada 2026-07): attach → dismiss /pre-home overlay →
 * #availability = Disponible → reportar URL/estado y si hay viaje entrante (TravelConfirmPage).
 * Precondición: driver YA logueado (correr driver-login-smoke antes; noReset conserva sesión).
 *
 * Uso:
 *   APPIUM_SERVER_URL=http://localhost:4723 ANDROID_UDID=R92XB0B8F3J ENV=test \
 *   node --loader ts-node/esm --experimental-specifier-resolution=node \
 *   tests/mobile/appium/scripts/driver-go-online.ts
 */

import { remote } from 'webdriverio';
import type { MobileActorConfig } from '../config/appiumRuntime';
import { DriverHomeScreen } from '../driver/DriverHomeScreen';

const APPIUM_URL = process.env.APPIUM_SERVER_URL ?? 'http://localhost:4723';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const APP_PACKAGE = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const log = (m: string) => console.log(`[go-online] ${m}`);

async function run(): Promise<void> {
	const url = new URL(APPIUM_URL);
	const driver = await remote({
		protocol: url.protocol.replace(':', '') as 'http' | 'https',
		hostname: url.hostname,
		port: Number(url.port) || 4723,
		path: '/',
		logLevel: 'warn',
		connectionRetryTimeout: 60_000,
		connectionRetryCount: 2,
		capabilities: {
			platformName: 'Android',
			'appium:automationName': 'UiAutomator2',
			'appium:deviceName': 'SM-A055M',
			'appium:platformVersion': '15.0',
			'appium:udid': UDID,
			'appium:appPackage': APP_PACKAGE,
			'appium:appActivity': '.MainActivity',
			'appium:noReset': true,
			'appium:forceAppLaunch': false,
			'appium:autoLaunch': false,
			'appium:newCommandTimeout': 180,
			'appium:chromedriverAutodownload': true
		} as Record<string, unknown>
	});

	const config = { actor: 'driver', environment: 'test' } as unknown as MobileActorConfig;
	const home = new DriverHomeScreen(config, driver);

	try {
		await driver.pause(2_000);
		const contexts = (await driver.getContexts().catch(() => [])) as string[];
		const wv = contexts.find(c => c.startsWith('WEBVIEW'));
		if (wv) await driver.switchContext(wv);
		const urlBefore = await driver.execute<string, []>(() => window.location.href).catch(() => '');
		log(`URL inicial: ${urlBefore}`);

		// Diagnóstico pre-home: ¿servicios cargados (continue-msg) o aún cargando?
		const preHome = await driver
			.execute<Record<string, unknown>, []>(() => {
				const norm = (v: unknown) =>
					String(v ?? '')
						.replace(/\s+/g, ' ')
						.trim();
				const overlay = document.querySelector('.carrier-overlay') as HTMLElement | null;
				const continueMsgs = Array.from(document.querySelectorAll('.continue-msg')).map(m =>
					norm((m as HTMLElement).innerText)
				);
				return {
					overlayFound: !!overlay,
					overlayVisible: overlay ? overlay.offsetParent !== null : false,
					continueMsgs,
					welcome: norm(document.querySelector('.welcome-msg')?.textContent ?? '')
				};
			})
			.catch(e => ({ error: String(e) }));
		log(`pre-home overlay: ${JSON.stringify(preHome)}`);

		const atHome = await home.dismissPreHomeOverlayIfPresent(30_000);
		log(`En /navigator/home tras dismiss pre-home: ${atHome}`);

		await home.goOnline();
		const online = await home.isDriverOnline();
		log(`Driver online: ${online}`);

		if (wv) await driver.switchContext(wv);
		const urlAfter = await driver.execute<string, []>(() => window.location.href).catch(() => '');
		log(`URL final: ${urlAfter}`);

		const state = await driver
			.execute<Record<string, unknown>, []>(() => {
				const norm = (v: unknown) =>
					String(v ?? '')
						.replace(/\s+/g, ' ')
						.trim();
				const avail = document.querySelector('#availability') as HTMLElement | null;
				const availText = norm(
					avail?.querySelector('.available-label')?.textContent ?? avail?.textContent ?? ''
				);
				const streetBtn = document.querySelector('button.driver-home.home-icon-base') as HTMLElement | null;
				return {
					url: window.location.href,
					availabilityFound: !!avail,
					availabilityText: availText,
					streetTripButton: streetBtn ? norm(streetBtn.innerText) : '(none)',
					onTravelConfirm: /TravelConfirmPage/i.test(window.location.href)
				};
			})
			.catch(e => ({ error: String(e) }));
		log(`Estado home: ${JSON.stringify(state, null, 1)}`);
	} catch (err) {
		log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
	} finally {
		await driver.deleteSession();
		log('Sesión cerrada');
	}
}

run().catch(e => {
	console.error('[go-online] fatal:', e);
	process.exit(1);
});
