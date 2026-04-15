/**
 * Passenger wallet 3DS link + delete runner.
 *
 * Flow:
 * 1. Start from the Passenger personal shell.
 * 2. Clean the wallet to remove any previous cards.
 * 3. Link a 3DS-required test card.
 * 4. Capture request / response payloads for the add-card phase.
 * 5. Delete the same card from the wallet.
 * 6. Capture request / response payloads for the delete phase.
 *
 * Usage from repo root:
 *   $env:ANDROID_UDID="R92XB0B8F3J"
 *   pnpm mobile:passenger:wallet-3ds-delete
 */

import { STRIPE_TEST_CARDS } from '../../../features/gateway-pg/data/stripe-cards';
import { getPassengerAppConfig } from '../config/appiumRuntime';
import { dumpAppiumState } from '../helpers/appiumDebug';
import { handleThreeDsPopup } from '../helpers/threeDsChallenge';
import { clearWebViewNetworkCapture, dumpWebViewNetworkCapture, installWebViewNetworkCapture } from '../helpers/webViewNetworkCapture';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';
import type { CardInput } from '../passenger/PassengerWalletScreen';

const threeDsTimeoutMs = Number(process.env.PASSENGER_3DS_TIMEOUT_MS ?? '25000');

const log = (message: string): void => {
	console.log(`[passenger-wallet-3ds-delete] ${message}`);
};

async function run(): Promise<void> {
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, {
		profileMode: 'personal'
	});

	const card = STRIPE_TEST_CARDS.always_authenticate;
	const walletCard: CardInput = {
		number: card.number,
		expiry: card.exp,
		cvc: card.cvc,
		holderName: card.holderName
	};

	try {
		await harness.ensurePassengerShell();
		const driver = harness.getDriver();
		const wallet = harness.getWalletScreen();

		await dumpAppiumState(driver, 'passenger-personal-wallet-3ds-delete-home');
		await harness.cleanWallet();
		await dumpAppiumState(driver, 'passenger-personal-wallet-3ds-delete-cleaned');

		await installWebViewNetworkCapture(driver);
		await clearWebViewNetworkCapture(driver);

		await wallet.openWallet();
		await dumpAppiumState(driver, 'passenger-personal-wallet-3ds-delete-before-save');

		await wallet.tapAddCard();
		await wallet.fillCardForm(walletCard);
		await wallet.saveCard();

		const threeDsResult = await handleThreeDsPopup(driver, label => dumpAppiumState(driver, label), threeDsTimeoutMs, 'passenger-personal-wallet-3ds-delete');

		log(`3DS result after save: ${threeDsResult}`);
		if (threeDsResult !== 'completed') {
			throw new Error(`Passenger wallet 3DS challenge was not completed: ${threeDsResult}`);
		}

		await wallet.verifyCardAdded(card.last4);
		await dumpAppiumState(driver, 'passenger-personal-wallet-3ds-delete-after-save');
		const addNetworkPath = await dumpWebViewNetworkCapture(driver, 'passenger-personal-wallet-3ds-add-network');
		log(`Add network capture saved: ${addNetworkPath}`);

		await clearWebViewNetworkCapture(driver);
		await wallet.deleteCard(card.last4);
		await dumpAppiumState(driver, 'passenger-personal-wallet-3ds-delete-after-delete');
		const deleteNetworkPath = await dumpWebViewNetworkCapture(driver, 'passenger-personal-wallet-3ds-delete-network');
		log(`Delete network capture saved: ${deleteNetworkPath}`);
	} finally {
		await harness.endSession();
	}
}

run().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[passenger-wallet-3ds-delete] ${message}`);
	process.exit(1);
});
