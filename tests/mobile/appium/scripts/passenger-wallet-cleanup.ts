/**
 * Passenger wallet cleanup runner.
 *
 * Removes all visible saved cards from the current Passenger profile lane.
 *
 * Usage from repo root:
 *   $env:ANDROID_UDID="R92XB0B8F3J"
 *   $env:TARGET_PROFILE_MODE="personal"
 *   pnpm mobile:passenger:wallet-cleanup
 */

import { getPassengerAppConfig } from '../config/appiumRuntime';
import { dumpAppiumState } from '../helpers/appiumDebug';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';
import type { PassengerProfileMode } from '../../../features/gateway-pg/contracts/gateway-pg.types';

process.env.APPIUM_SERVER_URL = process.env.APPIUM_SERVER_URL ?? 'http://localhost:4723';
process.env.ENV = process.env.ENV ?? 'test';
process.env.ANDROID_PASSENGER_APP_PACKAGE = process.env.ANDROID_PASSENGER_APP_PACKAGE ?? 'com.magiis.app.test.passenger';
process.env.ANDROID_UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';

const targetMode = (process.env.TARGET_PROFILE_MODE ?? 'personal') as PassengerProfileMode;
const maxIterations = Number.parseInt(process.env.PASSENGER_WALLET_CLEANUP_LIMIT ?? '50', 10);

function isPassengerProfileMode(value: string): value is PassengerProfileMode {
	return value === 'personal' || value === 'business';
}

if (!isPassengerProfileMode(targetMode)) {
	console.error(`[passenger-wallet-cleanup] Invalid TARGET_PROFILE_MODE="${targetMode}". Use "personal" or "business".`);
	process.exit(1);
}

if (!Number.isFinite(maxIterations) || maxIterations <= 0) {
	console.error(`[passenger-wallet-cleanup] Invalid PASSENGER_WALLET_CLEANUP_LIMIT="${process.env.PASSENGER_WALLET_CLEANUP_LIMIT ?? ''}".`);
	process.exit(1);
}

async function run(): Promise<void> {
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, {
		profileMode: targetMode
	});

	try {
		await harness.ensurePassengerShell();
		const driver = harness.getDriver();

		await dumpAppiumState(driver, `passenger-${targetMode}-wallet-cleanup-before`);
		const removed = await harness.cleanWallet(maxIterations);
		await dumpAppiumState(driver, `passenger-${targetMode}-wallet-cleanup-after`);

		console.log(`[passenger-wallet-cleanup] removed=${removed} profile=${targetMode}`);
	} finally {
		await harness.endSession();
	}
}

run().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[passenger-wallet-cleanup] ${message}`);
	process.exit(1);
});
