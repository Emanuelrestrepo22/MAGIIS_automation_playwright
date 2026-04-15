/**
 * Passenger home mode smoke.
 * Validates the profile label under the home toggle and ensures the requested lane is active.
 *
 * Usage from repo root:
 *   $env:ANDROID_UDID="R92XB0B8F3J"
 *   $env:TARGET_PROFILE_MODE="personal"
 *   pnpm mobile:passenger:profile-mode-smoke
 */

import { getPassengerAppConfig } from '../config/appiumRuntime';
import { PassengerHomeScreen } from '../passenger/PassengerHomeScreen';
import type { PassengerProfileMode } from '../../../features/gateway-pg/contracts/gateway-pg.types';

process.env.APPIUM_SERVER_URL = process.env.APPIUM_SERVER_URL ?? 'http://localhost:4723';
process.env.ENV = process.env.ENV ?? 'test';
process.env.ANDROID_PASSENGER_APP_PACKAGE = process.env.ANDROID_PASSENGER_APP_PACKAGE ?? 'com.magiis.app.test.passenger';
process.env.ANDROID_UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';

const targetMode = (process.env.TARGET_PROFILE_MODE ?? 'personal') as PassengerProfileMode;

function isPassengerProfileMode(value: string): value is PassengerProfileMode {
	return value === 'personal' || value === 'business';
}

if (!isPassengerProfileMode(targetMode)) {
	console.error(`[passenger-home-mode] Invalid TARGET_PROFILE_MODE="${targetMode}". Use "personal" or "business".`);
	process.exit(1);
}

async function run(): Promise<void> {
	const home = new PassengerHomeScreen(getPassengerAppConfig());

	await home.startSession();
	try {
		await home.ensureProfileMode(targetMode);
		const mode = await home.getProfileMode();

		console.log(`[passenger-home-mode] detected=${mode} expected=${targetMode}`);

		if (mode !== targetMode) {
			throw new Error(`Passenger home mode mismatch: expected ${targetMode}, got ${mode}`);
		}
	} finally {
		await home.endSession();
	}
}

run().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[passenger-home-mode] ${message}`);
	process.exit(1);
});
