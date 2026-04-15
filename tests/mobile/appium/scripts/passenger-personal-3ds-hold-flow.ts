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
const threeDsTimeoutMs = Number(process.env.PASSENGER_3DS_TIMEOUT_MS ?? '25000');

const log = (message: string): void => {
	console.log(`[passenger-personal-3ds-hold] ${message}`);
};

async function handleThreeDsPopup(driver: Browser, dumpState: (label: string) => Promise<string>, timeoutMs: number): Promise<'completed' | 'not-present' | 'failed'> {
	const approveTexts = ['Complete', 'Complete authentication', 'COMPLETE', 'Completar', 'Completar autenticación', 'Autorizar', 'Aprobar', 'Confirm', 'Submit'];

	const deadline = Date.now() + timeoutMs;
	let lastObservation: 'not-present' | 'failed' = 'not-present';

	while (Date.now() < deadline) {
		const contexts = (await driver.getContexts()) as string[];
		const externalCtx = contexts.find(context => context.startsWith('WEBVIEW') && !context.includes('com.magiis'));
		const mainCtx = contexts.find(context => context.includes('com.magiis'));

		if (externalCtx) {
			log(`3DS external context detected: ${externalCtx}`);
			await driver.switchContext(externalCtx);
			await dumpState('passenger-personal-3ds-external-context');

			const clicked = (await driver.execute((texts: string[]) => {
				const buttons = Array.from(document.querySelectorAll('button, [role="button"], a')) as HTMLElement[];
				for (const text of texts) {
					const button = buttons.find(item => (item.innerText ?? item.textContent ?? '').trim() === text && item.offsetParent !== null);
					if (button) {
						button.click();
						return true;
					}
				}

				return false;
			}, approveTexts)) as boolean;

			if (mainCtx) {
				await driver.switchContext(mainCtx);
			}

			return clicked ? 'completed' : 'failed';
		}

		if (mainCtx) {
			await driver.switchContext(mainCtx);
		}

		const inlineResult = (await driver.execute((texts: string[]) => {
			const iframes = Array.from(document.querySelectorAll('iframe')) as HTMLIFrameElement[];
			const threeDsFrame = iframes.find(frame => /stripe|hooks|acs|3ds|authenticate|verify/i.test(frame.src ?? frame.name ?? ''));
			if (!threeDsFrame) {
				return 'not-present';
			}

			try {
				const frameDoc = threeDsFrame.contentDocument ?? threeDsFrame.contentWindow?.document;
				if (!frameDoc) {
					return 'iframe-no-access';
				}

				const buttons = Array.from(frameDoc.querySelectorAll('button, [role="button"], a')) as HTMLElement[];
				for (const text of texts) {
					const button = buttons.find(item => (item.innerText ?? item.textContent ?? '').trim() === text && item.offsetParent !== null);
					if (button) {
						button.click();
						return 'completed';
					}
				}

				return 'iframe-btn-not-found';
			} catch {
				return 'iframe-cross-origin';
			}
		}, approveTexts)) as string;

		if (inlineResult === 'completed') {
			return 'completed';
		}

		if (inlineResult === 'not-present') {
			const modalResult = (await driver.execute((texts: string[]) => {
				const overlays = Array.from(document.querySelectorAll('ion-modal, [class*="3ds"], [class*="stripe"], app-confirm-modal')) as HTMLElement[];
				const visible = overlays.filter(element => element.offsetParent !== null);
				if (!visible.length) {
					return 'not-present';
				}

				for (const overlay of visible) {
					const buttons = Array.from(overlay.querySelectorAll('button, [role="button"]')) as HTMLElement[];
					for (const text of texts) {
						const button = buttons.find(item => (item.innerText ?? '').trim() === text && item.offsetParent !== null);
						if (button) {
							button.click();
							return 'completed';
						}
					}
				}

				return 'modal-btn-not-found';
			}, approveTexts)) as string;

			if (modalResult === 'completed') {
				return 'completed';
			}

			if (modalResult !== 'not-present') {
				lastObservation = 'failed';
				await dumpState('passenger-personal-3ds-modal-detected');
				return 'failed';
			}

			await driver.pause(500);
			continue;
		}

		lastObservation = 'failed';
		await dumpState('passenger-personal-3ds-inline-detected');
		return 'failed';
	}

	return lastObservation;
}

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

		const threeDsResult = await handleThreeDsPopup(driver, label => dumpAppiumState(driver, label), threeDsTimeoutMs);

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
