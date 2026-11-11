/**
 * CardFormSubmit — accion GUARDAR del form de tarjeta: submit en cascada dentro de la WebView + click confiable
 * de WebDriver como respaldo. Componente compartido pasajero/chofer.
 */

import { sleep } from '../../core/Waits';
import { submitGuardarScript, type SubmitScriptResult } from './cardFormSubmitScript';
import type { WebViewKit } from './WebViewKit';
import type { CardFormModal } from './CardFormModal';
import type { Stripe3DS, SubmitOutcome } from './Stripe3DS';

export class CardFormSubmit {
	constructor(
		private readonly kit: WebViewKit,
		private readonly modal: CardFormModal,
		private readonly threeDs: Stripe3DS
	) {}

	/**
	 * Confirma el alta de la tarjeta (GUARDAR). Devuelve el resultado observado tras el submit.
	 */
	async saveCard(): Promise<SubmitOutcome> {
		const result = await this.kit
			.executeInWebView(submitGuardarScript, 'GUARDAR')
			.catch(
				() => ({ status: 'not-found', strategy: 'none', buttonRect: null, ngKeys: [] }) as SubmitScriptResult
			);
		const status = result.status;
		const strategy = result.strategy;
		const buttonRect = result.buttonRect;
		const ngKeys = result.ngKeys;

		console.log(
			`[PassengerWalletScreen] saveCard() strategy=${strategy} status=${status} rect=${JSON.stringify(buttonRect)} ngKeys=${JSON.stringify(ngKeys)}`
		);

		if (status === 'disabled') {
			throw new Error(
				'PassengerWalletScreen.saveCard() - "GUARDAR" is disabled; holder name or required fields are missing'
			);
		}

		if (status !== 'submitted') {
			throw new Error(`PassengerWalletScreen.saveCard() - "GUARDAR" not actioned (status=${status})`);
		}

		await sleep(500);

		// If the primary form.requestSubmit strategy did not move the modal within
		// a short window, fall back to a WebDriver-trusted click. `driver.$().click()`
		// sends a real WebDriver click (ElementClick command) which Angular/Stripe
		// trust more than in-page `.click()` or dispatched MouseEvents.
		const modalAfter = await this.modal.getVisibleCreditCardPaymentModal().catch(() => null);
		if (modalAfter) {
			const trustedClicked = await this.webDriverClickSaveButton().catch(() => false);
			if (trustedClicked) {
				console.log('[PassengerWalletScreen] saveCard() - WebDriver trusted click dispatched on GUARDAR');
			} else {
				console.warn(
					'[PassengerWalletScreen] saveCard() - WebDriver trusted click fallback could not target GUARDAR'
				);
			}
		}

		// buttonRect is captured for future native-tap fallbacks via Appium Actions.
		void buttonRect;
		void ngKeys;

		// After the submit, Stripe still needs to confirm the SetupIntent before
		// app-credit-card-payment-data unmounts. Wait passively — firing a second
		// submit races with the in-flight confirmCardSetup and kills the 3DS step.
		// We return as soon as any terminal signal shows up (modal gone, 3DS
		// challenge frame, or backend error text); otherwise the caller still has
		// the 3DS helper + verifyCardAdded to take over.
		return this.threeDs.waitForSubmitOutcome(20_000);
	}

	/**
	 * Sends a WebDriver-trusted click to the GUARDAR button inside the visible
	 * payment modal. This differs from a JS `.click()` in that it traverses the
	 * WebDriver ElementClick command, which Angular and Stripe treat as a real
	 * user interaction and is the most reliable way to trigger (ngSubmit).
	 */
	async webDriverClickSaveButton(): Promise<boolean> {
		const modal = await this.modal.getVisibleCreditCardPaymentModal().catch(() => null);
		if (!modal) {
			return false;
		}

		// The Angular template renders `<button class="btn primary"><span>GUARDAR</span></button>`.
		// WebDriver clicks on the button are rejected because elementFromPoint returns the child
		// span; clicking the span directly instead triggers a real user tap that bubbles to the
		// button and fires Angular's (click) → submit() → stripe.confirmCardSetup chain.
		const selectorPairs: Array<[string, string]> = [
			['button.btn.primary', 'button.btn.primary span'],
			['button[ion-button].btn.primary', 'button[ion-button].btn.primary span'],
			['form button.primary', 'form button.primary span'],
			['form button', 'form button span']
		];

		for (const [buttonSelector, spanSelector] of selectorPairs) {
			const spans = await modal.$$(spanSelector).catch(() => [] as any[]);
			for (const span of spans) {
				if (!(await span.isDisplayed().catch(() => false))) {
					continue;
				}

				const text = String(await span.getText().catch(() => ''))
					.trim()
					.toUpperCase();
				if (text && !text.includes('GUARDAR')) {
					continue;
				}

				try {
					await span.click();
					return true;
				} catch {
					// Span click also failed; try the button as fallback.
				}
			}

			const buttons = await modal.$$(buttonSelector).catch(() => [] as any[]);
			for (const button of buttons) {
				if (!(await button.isDisplayed().catch(() => false))) {
					continue;
				}

				try {
					await button.click();
					return true;
				} catch {
					// Move on to the next selector pair.
				}
			}
		}

		return false;
	}
}
