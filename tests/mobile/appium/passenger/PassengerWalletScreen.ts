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
	private async findVisibleElement(selector: string): Promise<any | null> {
		const driver = this.getDriver();
		const candidates = await driver.$$(selector);

		for (const candidate of candidates) {
			if (await candidate.isDisplayed().catch(() => false)) {
				return candidate;
			}
		}

		return null;
	}

	private async waitForVisibleElement(selector: string, timeout = 10_000): Promise<any | null> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			const element = await this.findVisibleElement(selector);
			if (element) {
				return element;
			}

			await driver.pause(250);
		}

		return null;
	}

	private async findAnyElement(selector: string): Promise<any | null> {
		const driver = this.getDriver();
		const candidates = await driver.$$(selector);
		return candidates[0] ?? null;
	}

	private async setDomValue(element: any, value: string): Promise<boolean> {
		const driver = this.getDriver();
		return (await driver.execute(
			(target: HTMLElement, nextValue: string) => {
				const host = target as HTMLElement & {
					shadowRoot?: ShadowRoot | null;
					querySelector?: (selectors: string) => Element | null;
				};

				const input = (host.shadowRoot?.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null) ?? (host.matches?.('input, textarea') ? (host as HTMLInputElement | HTMLTextAreaElement) : null) ?? (host.querySelector?.('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null);

				if (!input) {
					return false;
				}

				const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set ?? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

				if (!setter) {
					return false;
				}

				input.focus?.();
				setter.call(input, nextValue);
				input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
				input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

				try {
					input.setSelectionRange?.(nextValue.length, nextValue.length);
				} catch {
					// Ignore selection errors on Stripe iframes.
				}

				return true;
			},
			element as never,
			value
		)) as boolean;
	}

	private async tapPrimaryWebButtonByText(text: string): Promise<boolean> {
		return this.executeInWebView((target: string) => {
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

			const findClickableAncestor = (element: HTMLElement): HTMLElement => {
				let current: HTMLElement | null = element;
				while (current) {
					const tag = current.tagName.toUpperCase();
					const role = normalize(current.getAttribute('role'));
					if (tag === 'BUTTON' || tag === 'ION-BUTTON' || tag === 'A' || tag === 'ION-ITEM' || tag === 'ION-COL' || role === 'button' || current.classList.contains('btn')) {
						return current;
					}

					current = current.parentElement;
				}

				return element;
			};

			const targetText = normalize(target);
			const candidates = Array.from(document.querySelectorAll('button, ion-button, a, [role="button"], span, div')) as HTMLElement[];

			const match = candidates.find(element => {
				if (!isVisible(element)) {
					return false;
				}

				const values = [normalize(element.innerText || element.textContent), normalize(element.getAttribute('aria-label')), normalize(element.getAttribute('content-desc')), normalize(element.getAttribute('title'))];

				return values.some(value => value === targetText);
			});

			if (!match) {
				return false;
			}

			findClickableAncestor(match).click();
			return true;
		}, text).catch(() => false);
	}

	private async waitForStripeCardNumber(timeout = 20_000): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			if (await this.findAnyElement('input[name="cardnumber"]')) {
				return true;
			}

			const frameIndex = await this.findFirstFrameWithSelector('input[name="cardnumber"]', 1_000);
			if (frameIndex >= 0) {
				return true;
			}

			await driver.pause(250);
		}

		return false;
	}

	private async listIframeMetadata(): Promise<Array<{ index: number; name: string; src: string }>> {
		const driver = this.getDriver();
		const frames = await driver.$$('iframe');
		const frameCount = await frames.length;
		const metadata: Array<{ index: number; name: string; src: string }> = [];

		for (let index = 0; index < frameCount; index += 1) {
			const frame = frames[index];
			const name = await frame.getAttribute('name').catch(() => '');
			const src = await frame.getAttribute('src').catch(() => '');
			metadata.push({ index, name: name ?? '', src: src ?? '' });
		}

		return metadata;
	}

	private async findFirstFrameWithSelector(selector: string, timeout = 10_000): Promise<number> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			const frames = await this.listIframeMetadata().catch(() => []);
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

			const orderedCandidates = [...candidates, ...frames.map(frame => frame.index).filter(index => !candidates.includes(index))];

			for (const index of orderedCandidates) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				await (driver as any).switchToFrame(index).catch(() => {});

				const exists = (await this.findAnyElement(selector)) !== null;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				await (driver as any).switchToFrame(null).catch(() => {});

				if (exists) {
					return index;
				}
			}

			await driver.pause(250);
		}

		return -1;
	}

	private async fillFieldInAnyStripeFrame(selector: string, value: string, label: string): Promise<void> {
		const driver = this.getDriver();
		await this.switchToWebView();

		const rootInput = await this.findAnyElement(selector);
		if (rootInput) {
			if (await this.setDomValue(rootInput, value)) {
				return;
			}
		}

		const frameIndex = await this.findFirstFrameWithSelector(selector, 20_000);

		if (frameIndex < 0) {
			throw new Error(`PassengerWalletScreen.fillCardForm() - ${label} not found in any Stripe iframe`);
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		await (driver as any).switchToFrame(frameIndex);

		try {
			const input = await this.findAnyElement(selector);
			if (!input) {
				throw new Error(`${selector} not found`);
			}

			if (!(await this.setDomValue(input, value))) {
				throw new Error(`${selector} could not be filled`);
			}
		} finally {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			await (driver as any).switchToFrame(null).catch(() => {});
		}
	}

	private async fillStripeFrameByHint(frameHint: RegExp, selectors: string[], value: string, label: string): Promise<void> {
		const driver = this.getDriver();
		const deadline = Date.now() + 20_000;

		while (Date.now() < deadline) {
			const frames = await this.listIframeMetadata().catch(() => []);
			const candidates = frames
				.filter(frame => {
					const signature = `${frame.name ?? ''} ${frame.src ?? ''}`;
					return frameHint.test(signature) && !/controller|metrics|hcaptcha/i.test(signature);
				})
				.map(frame => frame.index);

			for (const index of candidates) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				await (driver as any).switchToFrame(index).catch(() => {});

				try {
					for (const selector of selectors) {
						const input = await this.findAnyElement(selector);
						if (!input) {
							continue;
						}

						if (!(await this.setDomValue(input, value))) {
							continue;
						}

						return;
					}
				} catch {
					// Try next candidate frame.
				} finally {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					await (driver as any).switchToFrame(null).catch(() => {});
				}
			}

			await driver.pause(250);
		}

		const metadata = await this.listIframeMetadata().catch(() => []);
		throw new Error(`PassengerWalletScreen.fillCardForm() - ${label} not found in Stripe frames. Iframes: ${JSON.stringify(metadata)}`);
	}

	private async fillWebInputField(selectors: string[], value: string): Promise<boolean> {
		for (const selector of selectors) {
			const element = await this.findAnyElement(selector);
			if (!element) {
				continue;
			}

			try {
				if (await this.setDomValue(element, value)) {
					return true;
				}
			} catch {
				// Fallback below.
			}
		}

		return this.executeInWebView(
			(candidateSelectors: string[], targetValue: string) => {
				const setNativeValue = (input: HTMLInputElement | HTMLTextAreaElement, nextValue: string): boolean => {
					const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set ?? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

					if (!setter) {
						return false;
					}

					input.focus();
					setter.call(input, nextValue);
					input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
					input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
					return true;
				};

				for (const selector of candidateSelectors) {
					const nodes = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
					for (const node of nodes) {
						const input = node.matches('input, textarea') ? (node as HTMLInputElement | HTMLTextAreaElement) : (node.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null);

						if (!input) {
							continue;
						}

						if (setNativeValue(input, targetValue)) {
							return true;
						}
					}
				}

				return false;
			},
			selectors,
			value
		).catch(() => false);
	}

	private async findStripeCardFrameIndex(timeout = 10_000): Promise<number> {
		const rootInput = await this.findAnyElement('input[name="cardnumber"]');
		if (rootInput) {
			return 0;
		}

		return this.findFirstFrameWithSelector('input[name="cardnumber"]', timeout);
	}

	private parseExpiry(expiry: string): { month: string; year: string } {
		const normalized = expiry.trim().replace(/\s+/g, '');
		const match = normalized.match(/^(\d{1,2})\/(\d{2}|\d{4})$/);
		if (!match) {
			throw new Error(`Invalid card expiry "${expiry}". Expected MM/YY or MM/YYYY.`);
		}

		return {
			month: match[1].padStart(2, '0'),
			year: match[2].slice(-2)
		};
	}

	private cardCandidates(last4: string): string[] {
		const digits = last4.replace(/\D/g, '').slice(-4);
		return Array.from(new Set([`VISA ****${digits}`, `VISA ${digits}`, `**** ${digits}`, `...${digits}`, digits])).filter(Boolean);
	}

	/**
	 * Opens the wallet page from the main menu.
	 */
	async openWallet(): Promise<void> {
		if ((await this.waitForWebUrlContains('/cards', 2_000)) || (await this.waitForWebText('AGREGAR', 2_000, true))) {
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

		const onWalletPage = (await this.waitForWebUrlContains('/cards', 10_000)) || (await this.waitForWebText('AGREGAR', 10_000));

		if (!onWalletPage) {
			throw new Error('PassengerWalletScreen.openWallet() - wallet page did not load');
		}
	}

	/**
	 * Taps the add card button.
	 */
	async tapAddCard(): Promise<void> {
		const tapped = (await this.tapPrimaryWebButtonByText('AGREGAR')) || (await this.tapWebText('AGREGAR', 10_000));
		if (!tapped) {
			throw new Error('PassengerWalletScreen.tapAddCard() - "AGREGAR" not found');
		}

		const formReady = await this.waitForStripeCardNumber(20_000);
		if (!formReady) {
			const metadata = await this.listIframeMetadata().catch(() => []);
			throw new Error(`PassengerWalletScreen.tapAddCard() - Stripe card form did not render after "AGREGAR". Iframes: ${JSON.stringify(metadata)}`);
		}

		await this.pause(500);
	}

	/**
	 * Completes the new card form using the embedded Stripe iframe.
	 */
	async fillCardForm(card: CardInput): Promise<void> {
		const sanitizedNumber = card.number.replace(/\s+/g, '');
		const frameIndex = await this.findStripeCardFrameIndex(20_000);
		if (frameIndex < 0) {
			const metadata = await this.listIframeMetadata().catch(() => []);
			throw new Error(`PassengerWalletScreen.fillCardForm() - Stripe card iframe not found. Iframes: ${JSON.stringify(metadata)}`);
		}

		// Stripe habilita el resto del formulario luego de un numero valido.
		await this.fillFieldInAnyStripeFrame('input[name="cardnumber"]', sanitizedNumber, 'card number');
		await this.getDriver().pause(1_000);

		const holderName = card.holderName?.trim();
		if (holderName) {
			const filledHolder = await this.fillWebInputField(['ion-input[formcontrolname="cardholderName"] input', 'ion-input[formcontrolname="cardholderName"] .native-input', 'ion-input[formcontrolname="cardholderName"]', 'input[placeholder*="Nombre del T"]'], holderName);

			if (!filledHolder) {
				throw new Error('PassengerWalletScreen.fillCardForm() - holder name field not found');
			}
		}

		// Stripe en esta app expone expiry como un solo campo exp-date y CVC como campo independiente.
		const { month, year } = this.parseExpiry(card.expiry);
		const formattedExpiry = `${month} / ${year}`;
		await this.fillStripeFrameByHint(/componentName=cardExpiry/i, ['#root > form > span:nth-child(4) > div > span > input', 'input[name="exp-date"]', 'input[name="exp"]', 'input[autocomplete="cc-exp"]', 'input[placeholder*="MM"]', 'input[placeholder*="AA"]', 'input[placeholder*="YY"]'], formattedExpiry, 'expiry');
		await this.fillStripeFrameByHint(/componentName=cardCvc/i, ['#root > form > span:nth-child(4) > div > span > input', 'input[name="cvc"]', 'input[name="cc-csc"]', 'input[autocomplete="cc-csc"]', 'input[placeholder*="CVC"]', 'input[placeholder*="CVV"]'], card.cvc.replace(/\s+/g, ''), 'cvc');
	}

	/**
	 * Confirms the card save action.
	 */
	async saveCard(): Promise<void> {
		const tapped = await this.executeInWebView((target: string) => {
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

			const findClickableAncestor = (element: HTMLElement): HTMLElement => {
				let current: HTMLElement | null = element;
				while (current) {
					const tag = current.tagName.toUpperCase();
					const role = normalize(current.getAttribute('role'));
					if (tag === 'BUTTON' || tag === 'ION-BUTTON' || tag === 'A' || tag === 'ION-ITEM' || tag === 'ION-COL' || role === 'button' || current.classList.contains('btn')) {
						return current;
					}

					current = current.parentElement;
				}

				return element;
			};

			const targetText = normalize(target);
			const candidates = Array.from(document.querySelectorAll('button, ion-button, a, [role="button"], span, div')) as HTMLElement[];
			const match = candidates.find(element => {
				if (!isVisible(element)) {
					return false;
				}

				const values = [normalize(element.innerText || element.textContent), normalize(element.getAttribute('aria-label')), normalize(element.getAttribute('content-desc')), normalize(element.getAttribute('title'))];

				return values.some(value => value === targetText);
			});

			if (!match) {
				return 'not-found';
			}

			const clickable = findClickableAncestor(match);
			const disabled = Boolean(
				clickable.getAttribute('disabled') !== null ||
					clickable.getAttribute('aria-disabled') === 'true' ||
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(clickable as any).disabled === true
			);
			if (disabled) {
				return 'disabled';
			}

			clickable.scrollIntoView({ block: 'center', inline: 'center' });
			clickable.click();
			return 'clicked';
		}, 'GUARDAR').catch(() => 'not-found');

		if (tapped === 'disabled') {
			throw new Error('PassengerWalletScreen.saveCard() - "GUARDAR" is disabled; holder name or required fields are missing');
		}

		if (tapped !== 'clicked') {
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

	private async countVisibleCards(): Promise<number> {
		return this.executeInWebView((rowSelector: string) => {
			const isVisible = (element: Element): boolean => {
				const html = element as HTMLElement;
				const rect = html.getBoundingClientRect();
				const style = window.getComputedStyle(html);
				return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
			};

			return Array.from(document.querySelectorAll(rowSelector)).filter(isVisible).length;
		}, 'ion-item-sliding, ion-item.card-item');
	}

	private async clickCardRowAction(targetDigits: string | null, actionIcon: 'star' | 'trash'): Promise<{ status: string; label: string }> {
		const rowSelector = 'ion-item-sliding, ion-item.card-item';

		return this.executeInWebView(
			async (selector: string, digits: string | null, iconName: string) => {
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

				const rows = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
				const match = digits
					? rows.find(row => {
							if (!isVisible(row)) {
								return false;
							}

							const label = row.querySelector('span.card-item-label') as HTMLElement | null;
							const labelText = normalize(label?.innerText || label?.textContent || row.textContent);
							return labelText.includes(normalize(digits));
						})
					: rows.find(isVisible);

				if (!match) {
					return { status: digits ? 'not-found' : 'empty', label: '' };
				}

				const label = normalize(match.querySelector('span.card-item-label')?.textContent || match.textContent || '');
				const slidingItem = (match.tagName.toUpperCase() === 'ION-ITEM-SLIDING' ? match : match.closest('ion-item-sliding')) as
					| (HTMLElement & {
							open?: (side?: string) => Promise<unknown> | unknown;
					  })
					| null;
				const isPrincipalRow = (row: HTMLElement): boolean => Boolean(row.querySelector('.card-data .type > ion-icon[name="star"], .card-data .type > ion-icon[aria-label="star"], .card-data .type > ion-icon.icono_isFavorite, .card-data .type > ion-icon.ion-color-secondary'));
				const openSlidingRow = async (row: HTMLElement | null): Promise<void> => {
					if (!row) {
						return;
					}

					const sliding = (row.tagName.toUpperCase() === 'ION-ITEM-SLIDING' ? row : row.closest('ion-item-sliding')) as
						| (HTMLElement & {
								open?: (side?: string) => Promise<unknown> | unknown;
						  })
						| null;

					if (sliding && typeof sliding.open === 'function') {
						try {
							await Promise.resolve(sliding.open('end'));
							await new Promise(resolve => setTimeout(resolve, 150));
						} catch {
							// Ignore and continue with the action button lookup below.
						}
					}
				};
				const findRowActionButton = (row: HTMLElement, iconName: string): HTMLElement | null => {
					const actionButtons = Array.from(row.querySelectorAll('ion-item-options button, button')) as HTMLElement[];
					return (
						actionButtons.find(button => {
							const values = [normalize(button.getAttribute('aria-label')), normalize(button.getAttribute('title')), normalize(button.innerText || button.textContent)];
							const icon = button.querySelector(`ion-icon[name="${iconName}"], ion-icon[aria-label="${iconName}"]`);

							return Boolean(icon) || values.some(value => value.includes(iconName));
						}) ?? null
					);
				};

				if (iconName === 'trash' && rows.length > 1 && isPrincipalRow(match)) {
					const fallbackRow = rows.find(row => row !== match && !isPrincipalRow(row)) ?? rows.find(row => row !== match) ?? null;
					if (fallbackRow) {
						await openSlidingRow(fallbackRow);
						const fallbackStar = findRowActionButton(fallbackRow, 'star');
						if (fallbackStar) {
							fallbackStar.click();
							await new Promise(resolve => setTimeout(resolve, 250));
						}
					}
				}

				await openSlidingRow(match);

				if (iconName === 'star') {
					if (isPrincipalRow(match)) {
						return { status: 'already-default', label };
					}
				}

				const directButton = findRowActionButton(match, iconName);

				if (directButton) {
					directButton.click();
					return { status: 'clicked-direct', label };
				}

				const optionsButton = match.querySelector('button.card-item-opts') as HTMLElement | null;
				if (optionsButton) {
					optionsButton.click();
					return { status: 'opened-options', label };
				}

				return { status: 'missing-action', label };
			},
			rowSelector,
			targetDigits,
			actionIcon
		).catch(() => ({ status: 'error', label: '' }));
	}

	private async clickWalletAction(actionTexts: string[], scopeSelectors: string[]): Promise<boolean> {
		return this.executeInWebView(
			(texts: string[], selectors: string[]) => {
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

				const findClickableAncestor = (element: HTMLElement): HTMLElement => {
					let current: HTMLElement | null = element;
					while (current) {
						const tag = current.tagName.toUpperCase();
						const role = normalize(current.getAttribute('role'));
						if (tag === 'BUTTON' || tag === 'ION-BUTTON' || tag === 'ION-ITEM' || tag === 'ION-TAB-BUTTON' || tag === 'ION-MENU-TOGGLE' || tag === 'ION-COL' || tag === 'A' || role === 'button') {
							return current;
						}
						current = current.parentElement;
					}

					return element;
				};

				const targets = texts.map(normalize);
				const candidateScopes = selectors.length > 0 ? (Array.from(document.querySelectorAll(selectors.join(','))) as HTMLElement[]) : [];
				const visibleScopes = candidateScopes.filter(isVisible);
				const searchScopes: (HTMLElement | Document)[] = visibleScopes.length > 0 ? visibleScopes : [document];

				for (const scope of searchScopes) {
					const candidates = Array.from(scope.querySelectorAll('button, ion-button, [role="button"], a, span, div')) as HTMLElement[];

					for (const target of targets) {
						const match = candidates.find(element => {
							if (!isVisible(element)) {
								return false;
							}

							const values = [normalize(element.innerText || element.textContent), normalize(element.getAttribute('aria-label')), normalize(element.getAttribute('content-desc')), normalize(element.getAttribute('title'))];

							return values.some(value => value === target || value.includes(target));
						});

						if (match) {
							findClickableAncestor(match).click();
							return true;
						}
					}
				}

				return false;
			},
			actionTexts,
			scopeSelectors
		).catch(() => false);
	}

	private async confirmDeleteDialogIfPresent(timeout = 5_000): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;
		const confirmTexts = ['Eliminar', 'Aceptar', 'Confirmar', 'Sí', 'Si', 'OK', 'Borrar', 'Continuar'];

		while (Date.now() < deadline) {
			const confirmed = await this.executeInWebView((texts: string[]) => {
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

				const findClickableAncestor = (element: HTMLElement): HTMLElement => {
					let current: HTMLElement | null = element;
					while (current) {
						const tag = current.tagName.toUpperCase();
						const role = normalize(current.getAttribute('role'));
						if (tag === 'BUTTON' || tag === 'ION-BUTTON' || tag === 'ION-ITEM' || tag === 'ION-TAB-BUTTON' || tag === 'ION-MENU-TOGGLE' || tag === 'ION-COL' || tag === 'A' || role === 'button') {
							return current;
						}
						current = current.parentElement;
					}

					return element;
				};

				const containers = Array.from(document.querySelectorAll('ion-modal, ion-alert, app-confirm-modal, .alert-wrapper, .modal-wrapper')) as HTMLElement[];
				const visibleContainers = containers.filter(isVisible);
				if (!visibleContainers.length) {
					return 'not-present';
				}

				for (const container of visibleContainers) {
					const candidates = Array.from(container.querySelectorAll('button, ion-button, [role="button"], a')) as HTMLElement[];
					for (const text of texts) {
						const target = normalize(text);
						const match = candidates.find(element => {
							if (!isVisible(element)) {
								return false;
							}

							const values = [normalize(element.innerText || element.textContent), normalize(element.getAttribute('aria-label')), normalize(element.getAttribute('content-desc')), normalize(element.getAttribute('title'))];

							return values.some(value => value === target || value.includes(target));
						});

						if (match) {
							findClickableAncestor(match).click();
							return 'clicked';
						}
					}
				}

				return 'present-no-button';
			}, confirmTexts).catch(() => 'not-present');

			if (confirmed === 'clicked') {
				return true;
			}

			if (confirmed === 'not-present') {
				return false;
			}

			await driver.pause(250);
		}

		return false;
	}

	private async waitForCardCountToDrop(previousCount: number, timeout = 10_000): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			const currentCount = await this.countVisibleCards().catch(() => previousCount);
			if (currentCount < previousCount) {
				return true;
			}

			await driver.pause(250);
		}

		return false;
	}

	/**
	 * Removes the first visible saved card from the wallet.
	 * Returns the visible label that was targeted, or null when the list is empty.
	 */
	async deleteFirstVisibleCard(): Promise<string | null> {
		const beforeCount = await this.countVisibleCards();
		if (beforeCount <= 0) {
			return null;
		}

		const openedResult = await this.clickCardRowAction(null, 'trash');

		if (openedResult.status === 'empty') {
			return null;
		}

		if (openedResult.status === 'error') {
			throw new Error('PassengerWalletScreen.deleteFirstVisibleCard() - failed to inspect wallet rows');
		}

		if (openedResult.status === 'missing-action') {
			throw new Error(`PassengerWalletScreen.deleteFirstVisibleCard() - wallet row options could not be opened (${openedResult.status})`);
		}

		if (openedResult.status === 'opened-options') {
			const clickedDelete = await this.clickWalletAction(['Eliminar', 'Eliminar tarjeta', 'Borrar', 'Delete', 'Remove'], ['ion-popover', 'app-credit-card-dialog', '.popover-content']);
			if (!clickedDelete) {
				throw new Error('PassengerWalletScreen.deleteFirstVisibleCard() - delete action not found');
			}
		}

		await this.confirmDeleteDialogIfPresent();

		const removed = await this.waitForCardCountToDrop(beforeCount, 10_000);
		if (!removed) {
			const currentCount = await this.countVisibleCards();
			if (currentCount >= beforeCount) {
				throw new Error(`PassengerWalletScreen.deleteFirstVisibleCard() - wallet count did not decrease after deleting "${openedResult.label}"`);
			}
		}

		return openedResult.label || null;
	}

	/**
	 * Removes a card by its last 4 digits from the wallet.
	 */
	async deleteCard(last4: string): Promise<void> {
		const digits = last4.replace(/\D/g, '').slice(-4);
		const beforeCount = await this.countVisibleCards();

		const openedResult = await this.clickCardRowAction(digits, 'trash');

		if (openedResult.status === 'not-found') {
			throw new Error(`PassengerWalletScreen.deleteCard() - card ending ${digits} not found`);
		}

		if (openedResult.status === 'error') {
			throw new Error(`PassengerWalletScreen.deleteCard() - failed to inspect wallet rows for card ending ${digits}`);
		}

		if (openedResult.status === 'missing-action') {
			throw new Error('PassengerWalletScreen.deleteCard() - delete action not found');
		}

		if (openedResult.status === 'opened-options') {
			const clickedDelete = await this.clickWalletAction(['Eliminar', 'Eliminar tarjeta', 'Borrar', 'Delete', 'Remove'], ['ion-popover', 'app-credit-card-dialog', '.popover-content']);
			if (!clickedDelete) {
				throw new Error(`PassengerWalletScreen.deleteCard() - delete action not found for card ending ${digits}`);
			}
		}

		await this.confirmDeleteDialogIfPresent();

		const removed = await this.waitForCardCountToDrop(beforeCount, 10_000);
		if (!removed) {
			const currentCount = await this.countVisibleCards();
			if (currentCount >= beforeCount) {
				throw new Error(`PassengerWalletScreen.deleteCard() - wallet count did not decrease after deleting "${openedResult.label}"`);
			}
		}

		const currentCount = await this.countVisibleCards();
		if (currentCount >= beforeCount) {
			throw new Error(`PassengerWalletScreen.deleteCard() - wallet count did not decrease after deleting card ending ${digits}`);
		}
	}

	/**
	 * Removes all visible cards from the wallet.
	 * Returns how many cards were removed during this session.
	 */
	async deleteAllVisibleCards(maxIterations = 50): Promise<number> {
		let removed = 0;

		while (removed < maxIterations) {
			const countBefore = await this.countVisibleCards();
			if (countBefore <= 0) {
				break;
			}

			const deletedLabel = await this.deleteFirstVisibleCard();
			if (deletedLabel === null) {
				break;
			}

			removed += 1;
		}

		return removed;
	}

	/**
	 * Selects a saved card as default payment method.
	 */
	async selectCard(last4: string): Promise<void> {
		const digits = last4.replace(/\D/g, '').slice(-4);

		const selectionResult = await this.clickCardRowAction(digits, 'star');

		if (selectionResult.status === 'not-found') {
			throw new Error(`PassengerWalletScreen.selectCard() - card ending ${digits} not found`);
		}

		if (selectionResult.status === 'error') {
			throw new Error(`PassengerWalletScreen.selectCard() - failed to inspect wallet rows for card ending ${digits}`);
		}

		if (selectionResult.status === 'already-default') {
			return;
		}

		if (selectionResult.status === 'opened-options') {
			const clickedPrincipal = await this.tapWebText('Principal', 10_000, true);
			if (!clickedPrincipal) {
				throw new Error(`PassengerWalletScreen.selectCard() - principal action not found for card ending ${digits}`);
			}
		} else if (selectionResult.status !== 'clicked-direct') {
			throw new Error(`PassengerWalletScreen.selectCard() - card ending ${digits} not found`);
		}

		const principalToast = await this.waitForWebText('Se cambió su tarjeta principal', 10_000, true);
		if (!principalToast) {
			await this.pause(500);
		}
	}
}
