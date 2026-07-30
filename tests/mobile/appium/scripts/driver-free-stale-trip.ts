/**
 * Libera al conductor de un viaje stale y lo deja de vuelta en /navigator/home, para que la
 * corrida siguiente reciba viajes nuevos (un driver "ocupado" no recibe offers).
 *
 * Runner delgado: la lógica vive en `recoverDriverToHome()`
 * (`../helpers/driverStaleTripRecovery`), la MISMA función que consume
 * `DriverCargoDeclineHarness.freeStaleTrip()`. Este script sólo abre/cierra la sesión Appium
 * (attach con noReset) y traduce el resultado a exit code. Cubre las cuatro rutas de
 * "driver ocupado" (TravelConfirm / TravelToStart / TravelInProgress / TravelResume) + los
 * overlays (alerta bloqueante, firma, pre-home); ver el docstring del helper para el
 * mecanismo de cada rama.
 *
 * El import relativo sin extensión funciona igual que en el resto de scripts de esta carpeta
 * (`driver-go-online.ts`, `driver-charge-from-resume.ts`): el loader ts-node/esm los resuelve
 * con `--experimental-specifier-resolution=node`, así que no hace falta duplicar el helper.
 *
 * Uso:
 *   APPIUM_SERVER_URL=http://localhost:4723 ANDROID_UDID=R92XB0B8F3J \
 *   node --loader ts-node/esm --experimental-specifier-resolution=node \
 *   tests/mobile/appium/scripts/driver-free-stale-trip.ts
 */
import { remote } from 'webdriverio';
import { describeStaleTripRecovery, recoverDriverToHome, shortRoute } from '../helpers/driverStaleTripRecovery';

const APPIUM_URL = process.env.APPIUM_SERVER_URL ?? 'http://localhost:4723';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const APP_PACKAGE = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const log = (m: string) => console.log(`[free] ${m}`);

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
			'appium:newCommandTimeout': 120,
			'appium:chromedriverAutodownload': true
		} as Record<string, unknown>
	});

	try {
		await driver.pause(1500);
		const result = await recoverDriverToHome(driver, { appPackage: APP_PACKAGE, log });
		if (result.freed) {
			log(
				`OK — driver libre en ${shortRoute(result.finalUrl)} (reinicio de app: ${result.usedAppRestart ? 'sí' : 'no'})`
			);
			return;
		}
		throw new Error(describeStaleTripRecovery(result, APP_PACKAGE));
	} finally {
		await driver.deleteSession();
		log('Sesión cerrada');
	}
}
run().catch(e => {
	console.error('[free] fatal:', e instanceof Error ? e.message : e);
	process.exit(1);
});
