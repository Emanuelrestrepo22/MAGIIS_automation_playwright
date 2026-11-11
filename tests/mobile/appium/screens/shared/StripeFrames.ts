/**
 * StripeFrames — descubrimiento de iframes de Stripe y llenado de un campo en el primer frame que lo exponga.
 * Componente compartido.
 */

import { sleep } from '../../core/Waits';
import type { WebViewKit } from './WebViewKit';
import type { CardFormModal } from './CardFormModal';

export class StripeFrames {
	constructor(
		private readonly kit: WebViewKit,
		private readonly modal: CardFormModal
	) {}

	async waitForStripeCardNumber(timeout = 20_000): Promise<boolean> {
		const driver = this.kit.driver;
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			// Reset al webview/top-document: tras "AGREGAR" el foco puede quedar en el iframe
			// de firebase-auth, y findAnyElement (driver.$$) no vería el form del doc principal.
			await this.kit.switchToWebView().catch(() => {});
			await this.kit.switchFrameTarget(null).catch(() => {});

			if (await this.kit.findAnyElement('input[name="cardnumber"]')) {
				return true;
			}

			// Form NATIVO Angular/Ionic (app-credit-card-payment-data): el campo de número.
			// eBizCharge/MercadoPago montan `ion-input[formcontrolname="cardNumber"]` (el id y el
			// formcontrolname viven en el HOST ion-input, no en el <input> interno `.native-input`)
			// → hay que detectar el host, no `input#cardNumber`. Se chequea vía JS en el webview
			// (document.querySelector, robusto a frame-focus) — no por WDIO $$ (context-frágil).
			const nativePresent = await this.kit
				.executeInWebView(
					() =>
						!!document.querySelector(
							'app-credit-card-payment-data ion-input[formcontrolname="cardNumber"], ion-input#cardNumber, app-credit-card-payment-data input#cardNumber, input[formcontrolname="cardNumber"], input[data-checkout="cardNumber"]'
						)
				)
				.catch(() => false);
			if (nativePresent) {
				return true;
			}

			const frameIndex = await this.findFirstFrameWithSelector('input[name="cardnumber"]', 1_000);
			if (frameIndex >= 0) {
				return true;
			}

			await sleep(250);
		}

		return false;
	}

	async listIframeEntries(scope?: any): Promise<Array<{ index: number; element: any; name: string; src: string }>> {
		const driver = this.kit.driver;
		let frames: any = [];

		try {
			if (scope) {
				frames = await scope.$$('iframe');
			} else {
				frames = await driver.$$('iframe');
			}
		} catch {
			frames = [];
		}

		const metadata: Array<{ index: number; element: any; name: string; src: string }> = [];

		for (const [index, frame] of frames.entries()) {
			const name = await frame.getAttribute('name').catch(() => '');
			const src = await frame.getAttribute('src').catch(() => '');
			metadata.push({ index, element: frame, name: name ?? '', src: src ?? '' });
		}

		return metadata;
	}

	async listIframeMetadata(): Promise<Array<{ index: number; name: string; src: string }>> {
		const frames = await this.listIframeEntries();
		return frames.map(({ index, name, src }) => ({ index, name, src }));
	}

	async findFirstFrameWithSelector(selector: string, timeout = 10_000, scope?: any): Promise<number> {
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			const frames = await this.listIframeEntries(scope).catch(() => []);
			const candidates = frames
				.filter(frame => {
					const name = frame.name ?? '';
					const src = frame.src ?? '';
					if (/__privateStripeFrame/i.test(name)) {
						return true;
					}

					if (/elements-inner-card/i.test(src)) {
						return true;
					}

					if (/stripe/i.test(name) && !/controller|metrics/i.test(name)) {
						return true;
					}

					if (/stripe/i.test(src) && !/controller|metrics|hcaptcha/i.test(src)) {
						return true;
					}

					return false;
				})
				.map(frame => frame.index);

			const candidateSet = new Set(candidates);
			const orderedCandidates = [
				...frames.filter(frame => candidateSet.has(frame.index)).reverse(),
				...frames.filter(frame => !candidateSet.has(frame.index)).reverse()
			];

			for (const frame of orderedCandidates) {
				await this.kit.switchFrameTarget(frame.element).catch(() => {});

				const exists = (await this.modal.findVisibleElement(selector)) !== null;
				await this.kit.switchFrameTarget(null).catch(() => {});

				if (exists) {
					return frame.index;
				}
			}

			await sleep(250);
		}

		return -1;
	}

	async fillFieldInAnyStripeFrame(selector: string, value: string, label: string, scope?: any): Promise<void> {
		await this.kit.switchToWebView();

		const rootInput =
			(await this.modal.findVisibleElement(selector, scope)) ?? (await this.kit.findAnyElement(selector, scope));
		if (rootInput) {
			console.log(
				`[PassengerWalletScreen] ${label} root selector ${selector} -> ${await this.modal.describeElement(rootInput)}`
			);
			if (await this.modal.typeValueIntoElement(rootInput, value)) {
				await this.modal.blurActiveElement();
				return;
			}
		}

		const frameIndex = await this.findFirstFrameWithSelector(selector, 20_000, scope);

		if (frameIndex < 0) {
			throw new Error(`PassengerWalletScreen.fillCardForm() - ${label} not found in any Stripe iframe`);
		}

		await this.kit.switchFrameTarget(frameIndex);

		try {
			let input = await this.modal.findVisibleElement(selector);
			if (!input) {
				await sleep(250);
				input = await this.modal.findVisibleElement(selector);
			}

			if (!input) {
				input = await this.kit.findAnyElement(selector);
			}

			if (!input) {
				throw new Error(`${selector} not found`);
			}

			console.log(
				`[PassengerWalletScreen] ${label} frame selector ${selector} -> ${await this.modal.describeElement(input)}`
			);

			if (!(await this.modal.typeValueIntoElement(input, value))) {
				throw new Error(`${selector} could not be filled`);
			}

			await this.modal.blurActiveElement();
		} finally {
			await this.kit.switchFrameTarget(null).catch(() => {});
		}
	}

	async fillStripeFieldBySelectors(selectors: string[], value: string, label: string, scope?: any): Promise<boolean> {
		for (const selector of selectors) {
			try {
				await this.fillFieldInAnyStripeFrame(selector, value, label, scope);
				return true;
			} catch {
				// Try the next selector.
			}
		}

		return false;
	}

	async findStripeCardFrameIndex(timeout = 10_000, scope?: any): Promise<number> {
		return this.findFirstFrameWithSelector('input[name="cardnumber"]', timeout, scope);
	}
}
