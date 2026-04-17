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

const log = (message: string): void => {
	console.log(`[passenger-wallet-3ds-delete] ${message}`);
};

async function removeStaleThreeDsOverlay(driver: ReturnType<PassengerTripHappyPathHarness['getDriver']>): Promise<void> {
	try {
		await driver.execute(() => {
			const overlays = Array.from(document.querySelectorAll('div[data-react-aria-top-layer], ion-modal, [class*="3ds"], [class*="stripe-challenge"]')) as HTMLElement[];
			for (const overlay of overlays) {
				const challengeFrame = overlay.querySelector('iframe[src*="three-ds-2-challenge"], iframe[src*="stripe-challenge-frame"], iframe[src*="3d_secure_2"], iframe[src*="challenge"]');
				if (challengeFrame) {
					overlay.remove();
				}
			}
			return true;
		});
	} catch {
		// Best-effort cleanup only.
	}

	await driver.pause(1_000);
}

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

	let driver: ReturnType<PassengerTripHappyPathHarness['getDriver']> | null = null;

	try {
		await harness.ensurePassengerShell();
		const activeDriver = harness.getDriver();
		driver = activeDriver;
		const wallet = harness.getWalletScreen();

		await dumpAppiumState(activeDriver, 'passenger-personal-wallet-3ds-delete-home');
		await harness.cleanWallet();
		await dumpAppiumState(activeDriver, 'passenger-personal-wallet-3ds-delete-cleaned');
		await harness.ensurePassengerShell();

		await installWebViewNetworkCapture(activeDriver);
		await clearWebViewNetworkCapture(activeDriver);
		await wallet.openWallet();

		await dumpAppiumState(activeDriver, 'passenger-personal-wallet-3ds-delete-before-save');

		log('Preflighting 3DS overlay');
		const preflightThreeDsResult = await handleThreeDsPopup(activeDriver, label => dumpAppiumState(activeDriver, label), 5_000, 'passenger-personal-wallet-3ds-delete-preflight');
		log(`Preflight 3DS result: ${preflightThreeDsResult}`);
		if (preflightThreeDsResult === 'failed') {
			log('Preflight 3DS overlay was not cleared; continuing because the flow may still proceed once the add form is open');
			await removeStaleThreeDsOverlay(activeDriver);
		}

		log('Ensuring wallet card');
		await harness.ensureWalletCard(walletCard);
		await dumpAppiumState(activeDriver, 'passenger-personal-wallet-3ds-delete-after-save');

		const addNetworkPath = await dumpWebViewNetworkCapture(activeDriver, 'passenger-personal-wallet-3ds-add-network');
		log(`Add network capture saved: ${addNetworkPath}`);

		await clearWebViewNetworkCapture(activeDriver);
		log('Deleting card');
		await wallet.deleteCard(card.last4);
		await dumpAppiumState(activeDriver, 'passenger-personal-wallet-3ds-delete-after-delete');
		const deleteNetworkPath = await dumpWebViewNetworkCapture(activeDriver, 'passenger-personal-wallet-3ds-delete-network');
		log(`Delete network capture saved: ${deleteNetworkPath}`);
	} catch (error) {
		if (driver !== null) {
			const activeDriver = driver;
			try {
				const failureNetworkPath = await dumpWebViewNetworkCapture(activeDriver, 'passenger-personal-wallet-3ds-delete-failure-network');
				log(`Failure network capture saved: ${failureNetworkPath}`);
			} catch (captureError) {
				log(`Failure network capture could not be saved: ${captureError instanceof Error ? captureError.message : String(captureError)}`);
			}
		}

		throw error;
	} finally {
		await harness.endSession();
	}
}

run().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[passenger-wallet-3ds-delete] ${message}`);
	process.exit(1);
});
