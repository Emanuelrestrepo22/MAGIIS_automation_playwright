/**
 * CardFormModal — localiza el modal `app-credit-card-payment-data` visible (hay varias instancias montadas)
 * y busca/escribe elementos dentro de el. Componente compartido pasajero/chofer (form de tarjeta).
 */

import { sleep } from '../../core/Waits';
import type { WebViewKit } from './WebViewKit';

export class CardFormModal {
	constructor(private readonly kit: WebViewKit) {}

	async getVisibleCreditCardPaymentModal(): Promise<any | null> {
		const driver = this.kit.driver;
		let modals: any = [];

		try {
			modals = await driver.$$('app-credit-card-payment-data');
		} catch {
			modals = [];
		}

		let best: { modal: any; score: number; index: number } | null = null;

		for (const [index, modal] of modals.entries()) {
			if (!(await modal.isDisplayed().catch(() => false))) {
				continue;
			}

			let score = 0;

			try {
				const hasVisible = async (selector: string): Promise<boolean> => {
					const nodes = await modal.$$(selector).catch(() => []);
					for (const node of nodes) {
						if (await node.isDisplayed().catch(() => false)) {
							return true;
						}
					}

					return false;
				};

				const completeCount = (await modal.$$('.StripeElement--complete').catch(() => [])).length;
				score += completeCount * 2;

				if (await hasVisible('input[name="cardnumber"]')) {
					score += 10;
				}

				if (await hasVisible('.second-segment')) {
					score += 50;
				}

				if (
					await hasVisible(
						'input[name="cc-exp-month"], input[name="cc-exp-year"], input[name="exp-date"], input[name="exp"], input[autocomplete="cc-exp"]'
					)
				) {
					score += 30;
				}

				if (await hasVisible('input[name="cc-csc"], input[name="cvc"], input[autocomplete="cc-csc"]')) {
					score += 25;
				}

				if (
					await hasVisible(
						'ion-input[formcontrolname="cardholderName"] input, ion-input[formcontrolname="cardholderName"] .native-input, ion-input[formcontrolname="cardholderName"], input[placeholder*="Nombre del T"]'
					)
				) {
					score += 40;
				}

				if (await hasVisible('button.btn.primary:not([disabled])')) {
					score += 5;
				}
			} catch {
				// Ignore scoring errors and fall back to display order.
			}

			if (!best || score > best.score || (score === best.score && index > best.index)) {
				best = { modal, score, index };
			}
		}

		if (best) {
			return best.modal;
		}

		for (const modal of [...modals].reverse()) {
			if (await modal.isDisplayed().catch(() => false)) {
				return modal;
			}
		}

		return null;
	}

	async findVisibleElement(selector: string, scope?: any): Promise<any | null> {
		const driver = this.kit.driver;
		if (scope) {
			let candidates: any = [];

			try {
				candidates = await scope.$$(selector);
			} catch {
				candidates = [];
			}

			for (const candidate of candidates) {
				if (await candidate.isDisplayed().catch(() => false)) {
					return candidate;
				}
			}
		} else {
			const modal = await this.getVisibleCreditCardPaymentModal().catch(() => null);
			if (modal) {
				let candidates: any = [];

				try {
					candidates = await modal.$$(selector);
				} catch {
					candidates = [];
				}

				for (const candidate of candidates) {
					if (await candidate.isDisplayed().catch(() => false)) {
						return candidate;
					}
				}
			}
		}

		let candidates: any = [];

		try {
			candidates = await driver.$$(selector);
		} catch {
			candidates = [];
		}

		for (const candidate of candidates) {
			if (await candidate.isDisplayed().catch(() => false)) {
				return candidate;
			}
		}

		return null;
	}

	async typeValueIntoElement(element: any, value: string): Promise<boolean> {
		try {
			if (await this.kit.setDomValue(element, value)) {
				return true;
			}
		} catch {
			// Fall back to the remaining strategies.
		}

		if (typeof element.addValue === 'function' && value.length > 0) {
			try {
				for (const char of value) {
					await element.addValue(char);
					await sleep(25);
				}

				return true;
			} catch {
				// Fall back to setValue below.
			}
		}

		for (const method of ['setValue'] as const) {
			if (typeof element[method] !== 'function') {
				continue;
			}

			try {
				await element[method](value);
				return true;
			} catch {
				// Try the next strategy.
			}
		}

		return false;
	}

	async blurActiveElement(): Promise<void> {
		const driver = this.kit.driver;
		await driver
			.execute(() => {
				const active = document.activeElement as HTMLElement | null;
				active?.blur?.();
			})
			.catch(() => {});
		await sleep(250);
	}

	async describeElement(element: any): Promise<string> {
		try {
			const tagName = await element.getTagName().catch(() => '');
			const name = await element.getAttribute('name').catch(() => '');
			const placeholder = await element.getAttribute('placeholder').catch(() => '');
			return `${tagName || 'unknown'} name=${name ?? ''} placeholder=${placeholder ?? ''}`;
		} catch {
			return 'unavailable';
		}
	}
}
