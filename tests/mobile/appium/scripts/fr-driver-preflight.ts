/**
 * Pre-flight SOLO LECTURA del Driver app TEST (chofer FR, carrier 1901) en el emulador.
 * Abre una sesión Appium, lee app/chofer/estado de viaje y evalúa. NO hace login, NO acepta ni inicia viajes.
 * Si la app está deslogueada o con otro chofer, reporta las violaciones y sale con código 1.
 *
 * Uso (desde la raíz del repo):
 *   ENV_FILE=.env.emulator-test-fr pnpm exec ts-node --esm tests/mobile/appium/scripts/fr-driver-preflight.ts
 */

import { getDriverAppConfig } from '../config/appiumRuntime';
import { DriverHomeScreen } from '../driver/DriverHomeScreen';
import {
	captureDriverPreflightSnapshot,
	evaluateDriverPreflight,
	readFrPreflightExpectation
} from '../driver/DriverTripPreflight';

const log = (m: string): void => console.log(`[fr-preflight] ${m}`);

async function run(): Promise<void> {
	const config = getDriverAppConfig();
	if (!config.appPackage) throw new Error('appPackage no resuelto (ENV/ANDROID_DRIVER_APP_PACKAGE).');
	if (config.udid !== 'emulator-5554') throw new Error(`UDID debe ser emulator-5554 (actual: ${config.udid ?? '<null>'}).`);
	const expected = readFrPreflightExpectation(config.appPackage);
	const home = new DriverHomeScreen(config);
	await home.startSession();
	try {
		let snapshot = await captureDriverPreflightSnapshot(home.getDriver());
		let violations = evaluateDriverPreflight(snapshot, expected);
		let dismissed = false;
		// El overlay /pre-home oculta el header del chofer: se cierra solo si el nombre no se ve y se re-lee.
		if (violations.some(v => v.includes('no coincide'))) {
			dismissed = await home.dismissPreHomeOverlayIfPresent().catch(() => false);
			snapshot = await captureDriverPreflightSnapshot(home.getDriver());
			violations = evaluateDriverPreflight(snapshot, expected);
		}
		log(`foregroundPackage=${snapshot.foregroundPackage} expected=${expected.appPackage}`);
		log(`webUrl=${snapshot.webUrl} loggedOut=${snapshot.loggedOut} preHomeDismissed=${dismissed}`);
		log(`driverNameMatches=${!violations.some(v => v.includes('no coincide'))}`);
		log(`tripInProgress=${violations.some(v => v.includes('viaje en curso'))}`);
		if (violations.length > 0) {
			log(`PREFLIGHT FAIL: ${violations.join('; ')}`);
			process.exitCode = 1;
		} else {
			log('PREFLIGHT OK');
		}
	} finally {
		await home.endSession();
	}
}

run().catch((e: unknown) => {
	console.error(`[fr-preflight] ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
