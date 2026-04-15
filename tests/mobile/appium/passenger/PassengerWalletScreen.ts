/**
 * PassengerWalletScreen
 * Wallet / card management screen in the Passenger App.
 */

import { AppiumSessionBase } from '../base/AppiumSessionBase';

export interface CardInput {
	number: string;
	expiry: string;
	cvc: string;
	holderName?: string;
}

export class PassengerWalletScreen extends AppiumSessionBase {
	private async findStripeCardFrameIndex(timeout = 10_000): Promise<number> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			const frames = await driver.$$('iframe');
			const frameCount = await frames.length;
			for (let index = 0; index < frameCount; index += 1) {
				const frame = frames[index];
				const name = await frame.getAttribute('name').catch(() => '');
				const src = await frame.getAttribute('src').catch(() => '');
				if (
					/stripe/i.test(name ?? '') ||
					/stripe/i.test(src ?? '') ||
					/elements-inner-card/i.test(src ?? '') ||
					/__privateStripeFrame/i.test(name ?? '')
				) {
					return index;
				}
			}

			await driver.pause(250);
		}

		return -1;
	}

	private parseExpiry(expiry: string): { month: string; year: string } {
		const normalized = expiry.trim().replace(/\s+/g, '');
		const match = normalized.match(/^(\d{1,2})\/(\d{2}|\d{4})$/);
		if (!match) {
			throw new Error(`Invalid card expiry "${expiry}". Expected MM/YY or MM/YYYY.`);
		}

		return {
			month: match[1].padStart(2, '0'),
			year: match[2].slice(-2),
		};
	}

	private cardCandidates(last4: string): string[] {
		const digits = last4.replace(/\D/g, '').slice(-4);
		return Array.from(new Set([
			`VISA ****${digits}`,
			`VISA ${digits}`,
			`**** ${digits}`,
			`...${digits}`,
			digits,
		])).filter(Boolean);
	}

	/**
	 * Opens the wallet page from the main menu.
	 */
	async openWallet(): Promise<void> {
		if (
			(await this.waitForWebUrlContains('/cards', 2_000)) ||
			(await this.waitForWebText('AGREGAR', 2_000, true))
		) {
			return;
		}

		const openedAccount = await this.tapWebText('Mi cuenta', 10_000);
		if (!openedAccount) {
			throw new Error('PassengerWalletScreen.openWallet() - "Mi cuenta" not found');
		}

		await this.pause(300);

		if (!(await this.waitForWebText('Billetera', 2_000, true))) {
			const openedMenu = await this.executeInWebView((selector: string) => {
				const menuToggle = document.querySelector(selector) as HTMLElement | null;
				if (!menuToggle) {
					return false;
				}

				menuToggle.click();
				return true;
			}, '#app-tab-bar ion-menu-toggle');

			if (!openedMenu) {
				throw new Error('PassengerWalletScreen.openWallet() - account menu toggle not found');
			}
		}

		const openedWallet = await this.tapWebText('Billetera', 10_000, true);
		if (!openedWallet) {
			throw new Error('PassengerWalletScreen.openWallet() - "Billetera" not found');
		}

		const onWalletPage =
			await this.waitForWebUrlContains('/cards', 10_000) ||
			await this.waitForWebText('AGREGAR', 10_000);

		if (!onWalletPage) {
			throw new Error('PassengerWalletScreen.openWallet() - wallet page did not load');
		}
	}

	/**
	 * Taps the add card button.
	 */
	async tapAddCard(): Promise<void> {
		const tapped = await this.tapWebText('AGREGAR', 10_000);
		if (!tapped) {
			throw new Error('PassengerWalletScreen.tapAddCard() - "AGREGAR" not found');
		}

		await this.pause(500);
	}

	/**
	 * Completes the new card form using the embedded Stripe iframe.
	 */
	async fillCardForm(card: CardInput): Promise<void> {
		const frameIndex = await this.findStripeCardFrameIndex();
		if (frameIndex < 0) {
			throw new Error('PassengerWalletScreen.fillCardForm() - Stripe card iframe not found');
		}

		const driver = this.getDriver();
		const { month, year } = this.parseExpiry(card.expiry);
		const sanitizedNumber = card.number.replace(/\s+/g, '');

		// Stripe UI is rendered inside a private iframe. Fill each field by name.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await (driver as any).switchToFrame(frameIndex);

		try {
			const numberInput = await driver.$('input[name="cardnumber"]');
			if (!(await numberInput.isExisting())) {
				throw new Error('input[name="cardnumber"] not found');
			}
			await numberInput.click().catch(() => {});
			await numberInput.addValue(sanitizedNumber);

			const monthInput = await driver.$('input[name="cc-exp-month"]');
			if (await monthInput.isExisting()) {
				await monthInput.addValue(month);
			}

			const yearInput = await driver.$('input[name="cc-exp-year"]');
			if (await yearInput.isExisting()) {
				await yearInput.addValue(year);
			}

			const cvcInput = await driver.$('input[name="cc-csc"]');
			if (await cvcInput.isExisting()) {
				await cvcInput.addValue(card.cvc.replace(/\s+/g, ''));
			}
		} finally {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await (driver as any).switchToFrame(null).catch(() => {});
		}
	}

	/**
	 * Confirms the card save action.
	 */
	async saveCard(): Promise<void> {
		const tapped = await this.tapWebText('GUARDAR', 10_000);
		if (!tapped) {
			throw new Error('PassengerWalletScreen.saveCard() - "GUARDAR" not found');
		}

		await this.pause(500);
	}

	/**
	 * Verifies that the added card appears in the wallet list.
	 */
	async verifyCardAdded(last4: string): Promise<void> {
		const digits = last4.replace(/\D/g, '').slice(-4);
		const found = await this.waitForWebText(digits, 10_000, true);
		if (!found) {
			throw new Error(`PassengerWalletScreen.verifyCardAdded() - card ending ${digits} not found`);
		}
	}

	/**
	 * Checks whether a saved card ending is already visible in the wallet.
	 */
	async hasCard(last4: string, timeout = 3_000): Promise<boolean> {
		const digits = last4.replace(/\D/g, '').slice(-4);
		return this.waitForWebText(digits, timeout, true);
	}

	/**
	 * Selects a saved card as default payment method.
	 */
	async selectCard(last4: string): Promise<void> {
		const digits = last4.replace(/\D/g, '').slice(-4);

		const selectionResult = await this.executeInWebView((targetDigits: string) => {
			const normalize = (value: unknown): string =>
				String(value ?? '')
					.replace(/\s+/g, ' ')
					.trim()
					.toLowerCase()
					.normalize('NFD')
					.replace(/[\u0300-\u036f]/g, '');

			const isVisible = (element: Element): boolean => {
				const html = element as HTMLElement;
				const rect = html.getBoundingClientRect();
				const style = window.getComputedStyle(html);
				return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
			};

			const rows = Array.from(document.querySelectorAll('ion-item-sliding, ion-item.card-item')) as HTMLElement[];
			const match = rows.find(row => {
				if (!isVisible(row)) {
					return false;
				}

				const label = row.querySelector('span.card-item-label') as HTMLElement | null;
				const labelText = normalize(label?.innerText || label?.textContent);
				return labelText.includes(normalize(targetDigits));
			});

			if (!match) {
				return 'not-found';
			}

			const defaultIcon = match.querySelector('.card-data .type > ion-icon[name="star"], .card-data .type > ion-icon[aria-label="star"]');
			if (defaultIcon) {
				return 'already-default';
			}

			const optionsButton = match.querySelector('button.card-item-opts') as HTMLElement | null;
			if (!optionsButton) {
				return 'missing-options';
			}

			optionsButton.click();
			return 'opened-options';
		}, digits).catch(() => 'not-found');

		if (selectionResult === 'already-default') {
			return;
		}

		if (selectionResult !== 'opened-options') {
			throw new Error(`PassengerWalletScreen.selectCard() - card ending ${digits} not found`);
		}

		const clickedPrincipal = await this.tapWebText('Principal', 10_000, true);
		if (!clickedPrincipal) {
			throw new Error(`PassengerWalletScreen.selectCard() - principal action not found for card ending ${digits}`);
		}

		const principalToast = await this.waitForWebText('Se cambió su tarjeta principal', 10_000, true);
		if (!principalToast) {
			await this.pause(500);
		}
	}
}

