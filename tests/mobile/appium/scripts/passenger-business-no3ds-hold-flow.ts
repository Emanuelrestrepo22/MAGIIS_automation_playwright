/**
 * Passenger business no-3DS hold smoke.
 *
 * Flow:
 * 1. Start from the Passenger home shell.
 * 2. Validate business mode from the label under the profile toggle.
 * 3. Add / reuse a wallet card.
 * 4. Select the card as principal in wallet.
 * 5. Create a trip and capture the passenger handoff state.
 *
 * Usage from repo root:
 *   $env:ANDROID_UDID="R92XB0B8F3J"
 *   pnpm mobile:passenger:business-no3ds-hold-flow
 */

import type { Browser } from 'webdriverio';
import { STRIPE_TEST_CARDS } from '../../../features/gateway-pg/data/stripe-cards';
import { TEST_DATA } from '../../../features/gateway-pg/data/stripeTestData';
import { getPassengerAppConfig } from '../config/appiumRuntime';
import { dumpAppiumState } from '../helpers/appiumDebug';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';
import type { CardInput } from '../passenger/PassengerWalletScreen';

const waitForDriverAssigned = process.env.PASSENGER_WAIT_FOR_DRIVER_ASSIGNED === 'true';
const waitForTripCompleted = process.env.PASSENGER_WAIT_FOR_TRIP_COMPLETED === 'true';
const verifyPaymentProcessed = process.env.PASSENGER_VERIFY_PAYMENT_PROCESSED === 'true';

const log = (message: string): void => {
	console.log(`[passenger-business-no3ds-hold] ${message}`);
};

async function run(): Promise<void> {
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, {
		profileMode: 'business',
	});

	const card = STRIPE_TEST_CARDS.visa_success;
	const walletCard: CardInput = {
		number: card.number,
		expiry: card.exp,
		cvc: card.cvc,
		holderName: card.holderName,
	};
	const origin = TEST_DATA.origin;
	const destination = TEST_DATA.destination;
	const cardLast4 = card.last4;

	try {
		await harness.ensurePassengerShell();
		const driver = harness.getDriver();

		await dumpAppiumState(driver, 'passenger-business-home-start');
		await harness.ensureWalletCard(walletCard);
		await dumpAppiumState(driver, 'passenger-business-wallet-after-save');

		await harness.selectExistingCard(cardLast4);
		await dumpAppiumState(driver, 'passenger-business-wallet-selected');

		const tripId = await harness.createTrip(origin, destination, cardLast4);
		if (tripId) {
			log(`Trip created: ${tripId}`);
		} else {
			log('Trip created but no stable trip id was exposed by the current build.');
		}

		await dumpAppiumState(driver, 'passenger-business-trip-after-create');

		if (waitForDriverAssigned) {
			await harness.waitForDriverAssigned();
			await dumpAppiumState(driver, 'passenger-business-trip-assigned');
		}

		if (waitForTripCompleted) {
			await harness.waitForTripCompleted();
			await dumpAppiumState(driver, 'passenger-business-trip-completed');
		}

		if (verifyPaymentProcessed) {
			await harness.verifyPaymentProcessed();
			await dumpAppiumState(driver, 'passenger-business-payment-processed');
		}

		log(`Final trip status: ${await harness.getTripStatus()}`);
	} finally {
		await harness.endSession();
	}
}

run().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[passenger-business-no3ds-hold] ${message}`);
	process.exit(1);
});
