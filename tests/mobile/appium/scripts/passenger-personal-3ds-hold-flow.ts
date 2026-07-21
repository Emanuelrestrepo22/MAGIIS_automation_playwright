/**
 * Passenger personal 3DS + hold smoke.
 *
 * Flow:
 * 1. Start from the Passenger home shell.
 * 2. Validate personal mode from the label under the profile toggle.
 * 3. Clean the wallet so the linked-card journey starts from a controlled state.
 * 4. Add / reuse a 3DS-capable wallet card.
 * 5. Select that wallet card as the active card.
 * 6. Create a trip and capture the 3DS challenge if the hold precondition is active.
 *
 * Usage from repo root:
 *   $env:ANDROID_UDID="R92XB0B8F3J"
 *   pnpm mobile:passenger:personal-3ds-hold-flow
 */

import { STRIPE_TEST_CARDS } from '../../../features/gateway-pg/data/stripe-cards';
import { TEST_DATA } from '../../../features/gateway-pg/data/stripeTestData';
import { getPassengerAppConfig } from '../config/appiumRuntime';
import { dumpAppiumState } from '../helpers/appiumDebug';
import { handleThreeDsPopup } from '../helpers/threeDsChallenge';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';
import type { CardInput } from '../passenger/PassengerWalletScreen';

const waitForDriverAssigned = process.env.PASSENGER_WAIT_FOR_DRIVER_ASSIGNED === 'true';
const waitForTripCompleted = process.env.PASSENGER_WAIT_FOR_TRIP_COMPLETED === 'true';
const verifyPaymentProcessed = process.env.PASSENGER_VERIFY_PAYMENT_PROCESSED === 'true';
const threeDsTimeoutMs = Number(process.env.PASSENGER_3DS_TIMEOUT_MS ?? '25000');

const log = (message: string): void => {
	console.log(`[passenger-personal-3ds-hold] ${message}`);
};

async function run(): Promise<void> {
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, {
		profileMode: 'personal'
	});

	const card = STRIPE_TEST_CARDS.visa_3ds_success;
	const walletCard: CardInput = {
		number: card.number,
		expiry: card.exp,
		cvc: card.cvc,
		holderName: card.holderName
	};
	const origin = TEST_DATA.origin;
	const destination = TEST_DATA.destination;
	const cardLast4 = card.last4;

	try {
		await harness.ensurePassengerShell();
		const driver = harness.getDriver();

		await dumpAppiumState(driver, 'passenger-personal-home-start');
		await harness.cleanWallet();
		await dumpAppiumState(driver, 'passenger-personal-wallet-cleaned');
		await harness.ensureWalletCard(walletCard);
		await dumpAppiumState(driver, 'passenger-personal-wallet-after-save');
		await harness.selectExistingCard(cardLast4);
		await dumpAppiumState(driver, 'passenger-personal-wallet-selected');

		const tripId = await harness.createTrip(origin, destination, cardLast4);
		if (tripId) {
			log(`Trip created: ${tripId}`);
		} else {
			log('Trip created but no stable trip id was exposed by the current build.');
		}

		await dumpAppiumState(driver, 'passenger-personal-trip-before-3ds');

		const threeDsResult = await handleThreeDsPopup(driver, label => dumpAppiumState(driver, label), threeDsTimeoutMs, 'passenger-personal');

		log(`3DS result: ${threeDsResult}`);
		if (threeDsResult !== 'completed') {
			throw new Error(`Passenger 3DS challenge was not completed: ${threeDsResult}`);
		}

		await dumpAppiumState(driver, 'passenger-personal-trip-after-3ds');

		if (waitForDriverAssigned) {
			await harness.waitForDriverAssigned();
			await dumpAppiumState(driver, 'passenger-personal-trip-assigned');
		}

		if (waitForTripCompleted) {
			await harness.waitForTripCompleted();
			await dumpAppiumState(driver, 'passenger-personal-trip-completed');
		}

		if (verifyPaymentProcessed) {
			await harness.verifyPaymentProcessed();
			await dumpAppiumState(driver, 'passenger-personal-payment-processed');
		}

		log(`Final trip status: ${await harness.getTripStatus()}`);
	} finally {
		await harness.endSession();
	}
}

run().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[passenger-personal-3ds-hold] ${message}`);
	process.exit(1);
});
