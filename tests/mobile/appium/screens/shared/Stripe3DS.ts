/**
 * Stripe3DS — observa el resultado del submit del form de tarjeta SIN disparar otro submit: modal cerrado,
 * challenge 3DS visible o error del form. El manejo del popup 3DS en si vive en `helpers/threeDsChallenge`.
 * Componente compartido pasajero/chofer.
 */

import { sleep } from '../../core/Waits';
import type { WebViewKit } from './WebViewKit';
import type { CardFormModal } from './CardFormModal';

export type SubmitOutcome = 'modal-closed' | '3ds-visible' | 'modal-error' | 'timeout';

export class Stripe3DS {
	constructor(
		private readonly kit: WebViewKit,
		private readonly modal: CardFormModal
	) {}

	/**
	 * Observes what happens after the GUARDAR submit without firing any extra
	 * submit, so the in-flight stripe.confirmCardSetup() call can reach the 3DS
	 * challenge. Returns when the modal closes, a 3DS frame appears, or a form
	 * error becomes visible inside the modal.
	 */
	async waitForSubmitOutcome(timeout = 20_000): Promise<SubmitOutcome> {
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			const modal = await this.modal.getVisibleCreditCardPaymentModal().catch(() => null);
			if (!modal) {
				console.log('[PassengerWalletScreen] saveCard() - payment modal dismissed');
				return 'modal-closed';
			}

			const outcome = await this.kit
				.executeInWebView(() => {
					const challengeFrames = Array.from(document.querySelectorAll('iframe')).filter(frame => {
						const signature = `${(frame as HTMLIFrameElement).name ?? ''} ${(frame as HTMLIFrameElement).src ?? ''}`;
						return (
							/three-ds-2-challenge|stripe-challenge-frame|3d_secure_2|acs|authenticate|verify|challenge/i.test(
								signature
							) &&
							!/elements-inner-card|cardnumber|cardexpiry|cardcvc|controller|metrics|hcaptcha/i.test(
								signature
							)
						);
					});

					if (challengeFrames.length) {
						return '3ds-visible';
					}

					const host = document.querySelector('app-credit-card-payment-data') as HTMLElement | null;
					const errorBlock = host?.querySelector(
						'.error, .form-error, [class*="error"]:not([class*="invalid"])'
					) as HTMLElement | null;
					const errorText = errorBlock?.innerText?.trim() ?? '';
					if (errorText && errorText.length > 0) {
						return `modal-error:${errorText.slice(0, 160)}`;
					}

					return '';
				})
				.catch(() => '');

			if (outcome === '3ds-visible') {
				console.log('[PassengerWalletScreen] saveCard() - 3DS challenge frame detected, handing off');
				return '3ds-visible';
			}

			if (typeof outcome === 'string' && outcome.startsWith('modal-error:')) {
				console.warn(`[PassengerWalletScreen] saveCard() - ${outcome}`);
				return 'modal-error';
			}

			await sleep(300);
		}

		console.warn(
			'[PassengerWalletScreen] saveCard() - payment modal still visible after submit; caller will validate 3DS / wallet list'
		);
		return 'timeout';
	}
}
