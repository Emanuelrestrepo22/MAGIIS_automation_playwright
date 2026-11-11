/**
 * CardForm — componente compartido del form de tarjeta (`app-credit-card-payment-data`), usado por la
 * billetera del pasajero y por el cobro de la Driver App. Compone los componentes de bajo nivel y expone
 * las acciones atomicas: esperar el form, llenarlo (Stripe iframes o form NATIVO), leer validez y GUARDAR.
 */

import { sleep } from '../../core/Waits';
import { sanitizeCardNumber, type CardInput } from './CardInput';
import { CardFormModal } from './CardFormModal';
import { StripeFrameTyping } from './StripeFrameTyping';
import { StripeFrames } from './StripeFrames';
import { StripeFrameFields } from './StripeFrameFields';
import { NativeCardForm } from './NativeCardForm';
import { Stripe3DS } from './Stripe3DS';
import { CardFormSubmit } from './CardFormSubmit';
import type { SubmitOutcome } from './Stripe3DS';
import type { WebViewKit } from './WebViewKit';

export class CardForm {
	readonly modal: CardFormModal;
	readonly typing: StripeFrameTyping;
	readonly frames: StripeFrames;
	readonly fields: StripeFrameFields;
	readonly native: NativeCardForm;
	readonly threeDs: Stripe3DS;
	readonly submit: CardFormSubmit;

	constructor(readonly kit: WebViewKit) {
		this.modal = new CardFormModal(kit);
		this.typing = new StripeFrameTyping(kit);
		this.frames = new StripeFrames(kit, this.modal);
		this.fields = new StripeFrameFields(kit, this.modal, this.typing, this.frames);
		this.native = new NativeCardForm(kit);
		this.threeDs = new Stripe3DS(kit, this.modal);
		this.submit = new CardFormSubmit(kit, this.modal, this.threeDs);
	}

	/** Espera a que el form de tarjeta (Stripe iframe o nativo) este renderizado. */
	waitForFormReady(timeout = 20_000): Promise<boolean> {
		return this.frames.waitForStripeCardNumber(timeout);
	}

	listIframeMetadata(): Promise<Array<{ index: number; name: string; src: string }>> {
		return this.frames.listIframeMetadata();
	}

	getVisibleModal(): Promise<any | null> {
		return this.modal.getVisibleCreditCardPaymentModal();
	}

	readFormValidity(): ReturnType<NativeCardForm['readFormValidity']> {
		return this.native.readFormValidity();
	}

	isSaveEnabled(): Promise<boolean> {
		return this.native.isSaveEnabled();
	}

	saveCard(): Promise<SubmitOutcome> {
		return this.submit.saveCard();
	}

	/**
	 * Completes the new card form using the embedded Stripe iframe.
	 */
	async fillCardForm(card: CardInput): Promise<void> {
		const sanitizedNumber = sanitizeCardNumber(card.number);

		// Rama NATIVA: el form del pasajero es `app-credit-card-payment-data` con inputs
		// nativos (formcontrolname/data-checkout), NO un iframe Stripe. Detectar y llenar nativo.
		// El guard por findAnyElement (frame-gated) es intencional: solo entra a la rama nativa cuando
		// el frame activo está ALINEADO con el documento del form → así el fill posterior también lo ve.
		// (No usar getPageSource aquí: detectaría el form aun con el frame desalineado y el fill fallaría.)
		await this.kit.switchFrameTarget(null).catch(() => {});
		const nativeCardNumber = await this.kit.findAnyElement(
			'app-credit-card-payment-data ion-input[formcontrolname="cardNumber"], ion-input#cardNumber, app-credit-card-payment-data input#cardNumber, input[formcontrolname="cardNumber"], input[data-checkout="cardNumber"]'
		);
		if (nativeCardNumber) {
			await this.native.fillNativeCardForm(card, sanitizedNumber);
			return;
		}

		const frameIndex = await this.frames.findStripeCardFrameIndex(20_000);
		if (frameIndex < 0) {
			const metadata = await this.frames.listIframeMetadata().catch(() => []);
			throw new Error(
				`PassengerWalletScreen.fillCardForm() - Stripe card iframe not found. Iframes: ${JSON.stringify(metadata)}`
			);
		}

		// Stripe habilita el resto del formulario luego de un numero valido.
		await this.frames.fillFieldInAnyStripeFrame('input[name="cardnumber"]', sanitizedNumber, 'card number');
		await this.kit.driver.keys(['Tab']).catch(() => {});
		await sleep(1_500);
		await this.kit.switchFrameTarget(null).catch(() => {});
		console.log(
			'[PassengerWalletScreen] after card number:',
			JSON.stringify(await this.frames.listIframeMetadata().catch(() => []))
		);

		const paymentModal = await this.modal.getVisibleCreditCardPaymentModal().catch(() => null);
		if (!paymentModal) {
			const metadata = await this.frames.listIframeMetadata().catch(() => []);
			throw new Error(
				`PassengerWalletScreen.fillCardForm() - Stripe card modal not found. Iframes: ${JSON.stringify(metadata)}`
			);
		}

		await this.fields.fillStripeExpiryFrame(card.expiry, paymentModal);
		await sleep(300);
		await this.kit.switchFrameTarget(null).catch(() => {});
		console.log(
			'[PassengerWalletScreen] after expiry:',
			JSON.stringify(await this.frames.listIframeMetadata().catch(() => []))
		);
		const cvcSelectors = [
			'#root > form > span:nth-child(4) > div > span > input',
			'input[name="cc-csc"]',
			'input[name="cvc"]',
			'input[autocomplete="cc-csc"]',
			'input[placeholder="CVC"]',
			'input[placeholder*="CVC"]',
			'input[placeholder*="CVV"]'
		];

		if (
			!(await this.frames.fillStripeFieldBySelectors(
				cvcSelectors,
				card.cvc.replace(/\s+/g, ''),
				'cvc',
				paymentModal
			))
		) {
			await this.fields.fillStripeFrameByHint(
				/componentName=cardCvc/i,
				cvcSelectors,
				card.cvc.replace(/\s+/g, ''),
				'cvc',
				true,
				paymentModal
			);
		}

		const holderName = card.holderName?.trim();
		if (holderName) {
			const filledHolder = await this.kit.fillWebInputField(
				[
					'ion-input[formcontrolname="cardholderName"] input',
					'ion-input[formcontrolname="cardholderName"] .native-input',
					'ion-input[formcontrolname="cardholderName"]',
					'input[placeholder*="Nombre del T"]'
				],
				holderName,
				paymentModal
			);

			if (!filledHolder) {
				throw new Error('PassengerWalletScreen.fillCardForm() - holder name field not found');
			}

			await this.kit.switchFrameTarget(null).catch(() => {});
			await this.kit.driver
				.execute(() => {
					const active = document.activeElement as HTMLElement | null;
					active?.blur();
				})
				.catch(() => {});
			await this.kit.driver
				.execute(() => {
					const scope = document.querySelector('app-credit-card-payment-data') as HTMLElement | null;
					const targets = Array.from(
						scope?.querySelectorAll(
							'.stripe-element, .stripe-element-wrapper, .stripe-element-small, .__PrivateStripeElement, iframe[name^="__privateStripeFrame"]'
						) ?? []
					) as HTMLElement[];

					for (const element of targets) {
						element.style.pointerEvents = 'none';
					}
				})
				.catch(() => {});
			await sleep(250);
		}
	}
}
