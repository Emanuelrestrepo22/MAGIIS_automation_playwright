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
	private async getVisibleCreditCardPaymentModal(): Promise<any | null> {
		const driver = this.getDriver();
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

				if (await hasVisible('input[name="cc-exp-month"], input[name="cc-exp-year"], input[name="exp-date"], input[name="exp"], input[autocomplete="cc-exp"]')) {
					score += 30;
				}

				if (await hasVisible('input[name="cc-csc"], input[name="cvc"], input[autocomplete="cc-csc"]')) {
					score += 25;
				}

				if (await hasVisible('ion-input[formcontrolname="cardholderName"] input, ion-input[formcontrolname="cardholderName"] .native-input, ion-input[formcontrolname="cardholderName"], input[placeholder*="Nombre del T"]')) {
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

	private async findVisibleElement(selector: string, scope?: any): Promise<any | null> {
		const driver = this.getDriver();
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

	private async findAnyElement(selector: string, scope?: any): Promise<any | null> {
		const driver = this.getDriver();
		if (scope) {
			let candidates: any = [];

			try {
				candidates = await scope.$$(selector);
			} catch {
				candidates = [];
			}

			if (candidates.length > 0) {
				return candidates[0];
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

				if (candidates.length > 0) {
					return candidates[0];
				}
			}
		}

		let candidates: any = [];

		try {
			candidates = await driver.$$(selector);
		} catch {
			candidates = [];
		}

		return candidates[0] ?? null;
	}

	private async switchFrameTarget(target: any): Promise<void> {
		const driver = this.getDriver() as any;

		if (typeof driver.switchFrame === 'function') {
			await driver.switchFrame(target);
			return;
		}

		if (typeof driver.switchToFrame === 'function') {
			await driver.switchToFrame(target);
			return;
		}

		throw new Error('Driver does not support frame switching');
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

	private async typeValueIntoElement(element: any, value: string): Promise<boolean> {
		try {
			if (await this.setDomValue(element, value)) {
				return true;
			}
		} catch {
			// Fall back to the remaining strategies.
		}

		if (typeof element.addValue === 'function' && value.length > 0) {
			try {
				for (const char of value) {
					await element.addValue(char);
					await this.getDriver().pause(25);
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

	private async blurActiveElement(): Promise<void> {
		const driver = this.getDriver();
		await driver
			.execute(() => {
				const active = document.activeElement as HTMLElement | null;
				active?.blur?.();
			})
			.catch(() => {});
		await driver.pause(250);
	}

	private async fillSelectorsInCurrentFrame(selectors: string[], value: string): Promise<boolean> {
		const driver = this.getDriver();
		return (await driver.execute(
			(candidateSelectors: string[], targetValue: string) => {
				const queryDeepAll = (root: Document | ShadowRoot, selector: string): Element[] => {
					const matches = Array.from(root.querySelectorAll(selector));

					for (const host of Array.from(root.querySelectorAll('*'))) {
						const shadowRoot = (host as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
						if (shadowRoot) {
							matches.push(...queryDeepAll(shadowRoot, selector));
						}
					}

					for (const frame of Array.from(root.querySelectorAll('iframe, frame'))) {
						try {
							const frameDocument = (frame as HTMLIFrameElement).contentDocument ?? (frame as HTMLFrameElement).contentDocument;
							if (frameDocument) {
								matches.push(...queryDeepAll(frameDocument, selector));
							}
						} catch {
							// Ignore cross-origin frames and keep searching the rest of the tree.
						}
					}

					return matches;
				};

				const setNativeValue = (input: HTMLInputElement | HTMLTextAreaElement, nextValue: string): boolean => {
					const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set ?? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

					if (!setter) {
						return false;
					}

					input.focus?.();
					setter.call(input, nextValue);
					input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
					input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
					return true;
				};

				for (const selector of candidateSelectors) {
					const nodes = queryDeepAll(document, selector) as HTMLElement[];
					const visibleNodes = nodes.filter(node => {
						const html = node as HTMLElement;
						const rect = html.getBoundingClientRect();
						const style = window.getComputedStyle(html);
						return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
					});

					for (const node of visibleNodes.length ? visibleNodes : nodes) {
						const input = node.matches('input, textarea') ? (node as HTMLInputElement | HTMLTextAreaElement) : (node.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null);

						if (!input) {
							continue;
						}

						input.click?.();

						if (setNativeValue(input, targetValue)) {
							return true;
						}
					}
				}

				return false;
			},
			selectors,
			value
		)) as boolean;
	}

	private async typeValueIntoFocusedFrame(frameElement: any, value: string, completionMatcher?: string): Promise<boolean> {
		const driver = this.getDriver();

		try {
			for (const char of Array.from(value)) {
				await driver.keys([char]);
				await driver.pause(35);
			}

			await this.switchFrameTarget(null).catch(() => {});
			return this.waitForStripeFrameCompletion(frameElement, 2_000, completionMatcher);
		} catch {
			await this.switchFrameTarget(null).catch(() => {});
			return false;
		}
	}

	private async typeValueViaStripeFrameFocus(frameElement: any, value: string, completionMatcher?: string): Promise<boolean> {
		const driver = this.getDriver();

		try {
			await frameElement.scrollIntoView().catch(() => {});
			await frameElement.click().catch(() => {});
			await driver.pause(200);

			for (const char of Array.from(value)) {
				await driver.keys([char]);
				await driver.pause(35);
			}

			return this.waitForStripeFrameCompletion(frameElement, 2_000, completionMatcher);
		} catch {
			return false;
		}
	}

	private async typeValueViaStripeContainerClick(frameElement: any, value: string, completionMatcher?: string): Promise<boolean> {
		const driver = this.getDriver();

		try {
			const clicked = (await driver.execute((iframe: HTMLElement) => {
				const wrapper = iframe.closest('.stripe-element-wrapper') as HTMLElement | null;
				const item = iframe.closest('ion-item') as HTMLElement | null;
				const target = wrapper ?? item ?? iframe;

				target.scrollIntoView?.({ block: 'center', inline: 'center' });
				target.click?.();
				return true;
			}, frameElement as never)) as boolean;

			if (!clicked) {
				return false;
			}

			await driver.pause(150);

			for (const char of Array.from(value)) {
				await driver.keys([char]);
				await driver.pause(35);
			}

			return this.waitForStripeFrameCompletion(frameElement, 2_000, completionMatcher);
		} catch {
			return false;
		}
	}

	private async waitForStripeFrameCompletion(frameElement: any, timeout = 2_000, completionMatcher?: string): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;
		const matcher = completionMatcher?.trim().toLowerCase() ?? '';

		while (Date.now() < deadline) {
			const complete = (await driver
				.execute(
					(iframe: HTMLElement, matcherText: string) => {
						const isComplete = (frame: HTMLIFrameElement | HTMLFrameElement): boolean => {
							const host = frame.closest('.__PrivateStripeElement') as HTMLElement | null;
							const wrapper = host?.closest('.stripe-element-wrapper') as HTMLElement | null;
							const element = host?.closest('.stripe-element') as HTMLElement | null;
							const classes = `${wrapper?.className ?? ''} ${element?.className ?? ''} ${host?.className ?? ''}`;

							return /StripeElement--complete/.test(classes) && !/StripeElement--invalid/.test(classes);
						};

						const signature = `${iframe.getAttribute('name') ?? ''} ${iframe.getAttribute('src') ?? ''} ${iframe.getAttribute('title') ?? ''}`.toLowerCase();
						if (matcherText && !signature.includes(matcherText)) {
							return false;
						}

						return isComplete(iframe as HTMLIFrameElement);
					},
					frameElement as never,
					matcher
				)
				.catch(() => false)) as boolean;

			if (complete) {
				return true;
			}

			await driver.pause(150);
		}

		return false;
	}

	private async typeValueViaStripeProxyInput(frameElement: any, value: string, completionMatcher?: string): Promise<boolean> {
		const driver = this.getDriver();

		try {
			const proxyInput = (await driver.execute((iframe: HTMLElement) => {
				const host = iframe.closest('.__PrivateStripeElement') as HTMLElement | null;
				return host?.querySelector('input.__PrivateStripeElement-input') ?? null;
			}, frameElement as never)) as any | null;

			if (!proxyInput) {
				return false;
			}

			await proxyInput.scrollIntoView().catch(() => {});
			await driver
				.execute((input: HTMLElement) => {
					const target = input as HTMLInputElement;
					target.focus();
					target.click();
				}, proxyInput as never)
				.catch(() => {});
			await driver.pause(100);

			for (const char of Array.from(value)) {
				await driver.keys([char]);
				await driver.pause(35);
			}

			return this.waitForStripeFrameCompletion(frameElement, 2_000, completionMatcher);
		} catch {
			return false;
		}
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

	private async listIframeEntries(scope?: any): Promise<Array<{ index: number; element: any; name: string; src: string }>> {
		const driver = this.getDriver();
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

	private async listIframeMetadata(): Promise<Array<{ index: number; name: string; src: string }>> {
		const frames = await this.listIframeEntries();
		return frames.map(({ index, name, src }) => ({ index, name, src }));
	}

	private async findFirstFrameWithSelector(selector: string, timeout = 10_000, scope?: any): Promise<number> {
		const driver = this.getDriver();
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
			const orderedCandidates = [...frames.filter(frame => candidateSet.has(frame.index)).reverse(), ...frames.filter(frame => !candidateSet.has(frame.index)).reverse()];

			for (const frame of orderedCandidates) {
				await this.switchFrameTarget(frame.element).catch(() => {});

				const exists = (await this.findVisibleElement(selector)) !== null;
				await this.switchFrameTarget(null).catch(() => {});

				if (exists) {
					return frame.index;
				}
			}

			await driver.pause(250);
		}

		return -1;
	}

	private async fillFieldInAnyStripeFrame(selector: string, value: string, label: string, scope?: any): Promise<void> {
		const driver = this.getDriver();
		await this.switchToWebView();

		const rootInput = (await this.findVisibleElement(selector, scope)) ?? (await this.findAnyElement(selector, scope));
		if (rootInput) {
			console.log(`[PassengerWalletScreen] ${label} root selector ${selector} -> ${await this.describeElement(rootInput)}`);
			if (await this.typeValueIntoElement(rootInput, value)) {
				await this.blurActiveElement();
				return;
			}
		}

		const frameIndex = await this.findFirstFrameWithSelector(selector, 20_000, scope);

		if (frameIndex < 0) {
			throw new Error(`PassengerWalletScreen.fillCardForm() - ${label} not found in any Stripe iframe`);
		}

		await this.switchFrameTarget(frameIndex);

		try {
			let input = await this.findVisibleElement(selector);
			if (!input) {
				await driver.pause(250);
				input = await this.findVisibleElement(selector);
			}

			if (!input) {
				input = await this.findAnyElement(selector);
			}

			if (!input) {
				throw new Error(`${selector} not found`);
			}

			console.log(`[PassengerWalletScreen] ${label} frame selector ${selector} -> ${await this.describeElement(input)}`);

			if (!(await this.typeValueIntoElement(input, value))) {
				throw new Error(`${selector} could not be filled`);
			}

			await this.blurActiveElement();
		} finally {
			await this.switchFrameTarget(null).catch(() => {});
		}
	}

	private async fillStripeFieldBySelectors(selectors: string[], value: string, label: string, scope?: any): Promise<boolean> {
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

	private async describeElement(element: any): Promise<string> {
		try {
			const tagName = await element.getTagName().catch(() => '');
			const name = await element.getAttribute('name').catch(() => '');
			const placeholder = await element.getAttribute('placeholder').catch(() => '');
			return `${tagName || 'unknown'} name=${name ?? ''} placeholder=${placeholder ?? ''}`;
		} catch {
			return 'unavailable';
		}
	}

	private async fillStripeFrameByHint(frameHint: RegExp, selectors: string[], value: string, label: string, allowGenericFallback = true, scope?: any): Promise<void> {
		const driver = this.getDriver();
		const deadline = Date.now() + 20_000;
		const completionMatcher = frameHint.source;
		let lastCandidateFrames: Array<{ index: number; element: any; name: string; src: string }> = [];

		while (Date.now() < deadline) {
			const frames = await this.listIframeEntries(scope).catch(() => []);
			lastCandidateFrames = frames
				.filter(frame => {
					const signature = `${frame.name ?? ''} ${frame.src ?? ''}`;
					const looksLikeCardFrame = /componentName=card(Number|Expiry|Cvc)/i.test(signature) || /elements-inner-card/i.test(signature);
					const isNoiseFrame = /metrics|hcaptcha/i.test(signature) || (/__privateStripeController/i.test(signature) && !looksLikeCardFrame);

					return frameHint.test(signature) && !isNoiseFrame;
				})
				.map(frame => frame);

			for (const frame of [...lastCandidateFrames].reverse()) {
				await frame.element.scrollIntoView().catch(() => {});
				await driver.pause(150);

				await this.switchFrameTarget(frame.element).catch(() => {});

				try {
					for (const selector of selectors) {
						const input = (await this.findVisibleElement(selector)) ?? (await this.findAnyElement(selector));
						if (!input) {
							continue;
						}

						console.log(`[PassengerWalletScreen] ${label} selector ${selector} -> ${await this.describeElement(input)}`);

						if (await this.typeValueIntoElement(input, value)) {
							if (await this.waitForStripeFrameCompletion(frame.element, 2_000, completionMatcher)) {
								await this.blurActiveElement();
								return;
							}
						}

						if (await this.waitForStripeFrameCompletion(frame.element, 2_000, completionMatcher)) {
							await this.blurActiveElement();
							return;
						}
					}

					if (await this.fillSelectorsInCurrentFrame(selectors, value)) {
						if (await this.waitForStripeFrameCompletion(frame.element, 2_000, completionMatcher)) {
							await this.blurActiveElement();
							return;
						}
					}

					if (await this.waitForStripeFrameCompletion(frame.element, 2_000, completionMatcher)) {
						await this.blurActiveElement();
						return;
					}

					if (await this.typeValueViaStripeProxyInput(frame.element, value, completionMatcher)) {
						await this.blurActiveElement();
						return;
					}

					if (await this.typeValueViaStripeFrameFocus(frame.element, value, completionMatcher)) {
						await this.blurActiveElement();
						return;
					}

					if (await this.typeValueViaStripeContainerClick(frame.element, value, completionMatcher)) {
						await this.blurActiveElement();
						return;
					}

					if (allowGenericFallback) {
						// Stripe sometimes re-renders the field with a different internal structure;
						// inside the dedicated expiry/CVC frame there is usually a single visible input.
						if (await this.fillSelectorsInCurrentFrame(['input:not([type="hidden"])', 'textarea'], value)) {
							if (await this.waitForStripeFrameCompletion(frame.element, 2_000, completionMatcher)) {
								await this.blurActiveElement();
								return;
							}
						}

						if (await this.waitForStripeFrameCompletion(frame.element, 2_000, completionMatcher)) {
							await this.blurActiveElement();
							return;
						}
					}

					if (await this.typeValueIntoFocusedFrame(frame.element, value, completionMatcher)) {
						if (await this.waitForStripeFrameCompletion(frame.element, 2_000, completionMatcher)) {
							await this.blurActiveElement();
							return;
						}
					}

					if (await this.waitForStripeFrameCompletion(frame.element, 2_000, completionMatcher)) {
						await this.blurActiveElement();
						return;
					}
				} catch {
					// Try next candidate frame.
				} finally {
					await this.switchFrameTarget(null).catch(() => {});
				}
			}

			await driver.pause(250);
		}

		const metadata = await this.listIframeMetadata().catch(() => []);
		const debugFields: Array<{ index: number; fields: string[] }> = [];

		for (const frame of lastCandidateFrames) {
			await this.switchFrameTarget(frame.element).catch(() => {});

			try {
				const snapshot = (await driver.execute(() => {
					const describe = (element: Element): string => {
						const html = element as HTMLElement;
						const attributes = [`tag=${html.tagName.toLowerCase()}`, `id=${html.id || ''}`, `name=${html.getAttribute('name') || ''}`, `type=${html.getAttribute('type') || ''}`, `placeholder=${html.getAttribute('placeholder') || ''}`, `aria-label=${html.getAttribute('aria-label') || ''}`, `role=${html.getAttribute('role') || ''}`, `class=${html.className || ''}`, `text=${(html.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)}`];

						return attributes.join(' ');
					};

					const inputs = Array.from(document.querySelectorAll('input, textarea, [role="textbox"], [contenteditable="true"]')).map(describe).slice(0, 20);
					const frames = Array.from(document.querySelectorAll('iframe, frame')).map(describe).slice(0, 20);
					const activeElement = document.activeElement ? describe(document.activeElement) : '<none>';
					const bodyText = document.body ? (document.body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200) : '';
					const bodyHtml = document.body ? document.body.innerHTML.replace(/\s+/g, ' ').trim().slice(0, 500) : '';

					return { inputs, frames, activeElement, bodyText, bodyHtml };
				})) as { inputs: string[]; frames: string[]; activeElement: string; bodyText: string; bodyHtml: string };

				debugFields.push({
					index: frame.index,
					fields: [...snapshot.inputs, ...snapshot.frames, `active=${snapshot.activeElement}`, `bodyText=${snapshot.bodyText}`, `bodyHtml=${snapshot.bodyHtml}`]
				});
			} catch {
				debugFields.push({ index: frame.index, fields: ['<unavailable>'] });
			} finally {
				await this.switchFrameTarget(null).catch(() => {});
			}
		}

		throw new Error(`PassengerWalletScreen.fillCardForm() - ${label} not found in Stripe frames. Iframes: ${JSON.stringify(metadata)} Fields: ${JSON.stringify(debugFields)}`);
	}

	private async fillWebInputField(selectors: string[], value: string, scope?: any): Promise<boolean> {
		const modal = scope ?? (await this.getVisibleCreditCardPaymentModal().catch(() => null));

		for (const selector of selectors) {
			const element = modal ? ((await modal.$(selector).catch(() => null)) ?? (await this.findAnyElement(selector, scope))) : await this.findAnyElement(selector, scope);
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

	private async fillStripeExpiryFrame(expiry: string, scope?: any): Promise<void> {
		const { month, year, combined } = this.parseExpiryParts(expiry);
		const combinedSelectors = ['input[name="exp-date"]', 'input[name="exp"]', 'input[autocomplete="cc-exp"]', 'input[placeholder="MM/AA"]', 'input[placeholder*="MM/AA"]', 'input[placeholder*="MM / AA"]', 'input[placeholder*="MM/YY"]', 'input.__PrivateStripeElement-input', '#root > form > span:nth-child(4) > div > span > input'];
		const monthSelectors = ['input[name="cc-exp-month"]', 'input[name="exp-month"]', 'input[autocomplete="cc-exp-month"]', 'input[placeholder*="MM"]', 'input.__PrivateStripeElement-input'];
		const yearSelectors = ['input[name="cc-exp-year"]', 'input[name="exp-year"]', 'input[autocomplete="cc-exp-year"]', 'input[placeholder*="AA"]', 'input[placeholder*="YY"]', 'input.__PrivateStripeElement-input'];

		if (await this.fillStripeFieldBySelectors(combinedSelectors, combined, 'expiry', scope)) {
			return;
		}

		try {
			await this.fillStripeFrameByHint(/componentName=cardExpiry/i, combinedSelectors, combined, 'expiry', true, scope);
			return;
		} catch {
			// Fall back to separate month/year fields below.
		}

		try {
			await this.fillStripeFieldBySelectors(monthSelectors, month, 'expiry month', scope);
			await this.fillStripeFieldBySelectors(yearSelectors, year, 'expiry year', scope);
			return;
		} catch {
			// Fall through to the final error below.
		}

		const metadata = await this.listIframeMetadata().catch(() => []);
		throw new Error(`PassengerWalletScreen.fillCardForm() - expiry not found in Stripe frames. Iframes: ${JSON.stringify(metadata)}`);
	}

	private async findStripeCardFrameIndex(timeout = 10_000, scope?: any): Promise<number> {
		return this.findFirstFrameWithSelector('input[name="cardnumber"]', timeout, scope);
	}

	private parseExpiryParts(expiry: string): { month: string; year: string; combined: string; compact: string } {
		const normalized = expiry.trim().replace(/\s+/g, '');
		const match = normalized.match(/^(\d{1,2})\/(\d{2}|\d{4})$/);
		if (!match) {
			throw new Error(`Invalid card expiry "${expiry}". Expected MM/YY or MM/YYYY.`);
		}

		const month = match[1].padStart(2, '0');
		const year = match[2].slice(-2);
		return { month, year, combined: `${month}/${year}`, compact: `${month}${year}` };
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

		const accountEntryLabels = ['Mi cuenta', 'Mis Direcciones', 'Billetera'];
		let openedAccount = false;
		let selectedLabel = '';

		for (const label of accountEntryLabels) {
			// Some builds expose the wallet entry directly, others route through an account submenu.
			if (await this.tapWebText(label, 10_000, true)) {
				openedAccount = true;
				selectedLabel = label;
				break;
			}
		}

		if (!openedAccount) {
			throw new Error(`PassengerWalletScreen.openWallet() - none of the account entry labels were found (${accountEntryLabels.join(', ')})`);
		}

		await this.pause(300);

		if (selectedLabel !== 'Billetera' && !(await this.waitForWebText('Billetera', 2_000, true))) {
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

		const openedWallet = selectedLabel === 'Billetera' ? true : await this.tapWebText('Billetera', 10_000, true);
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
		const dismissedBlockingModal = await this.confirmDeleteDialogIfPresent();
		if (dismissedBlockingModal) {
			console.log('[PassengerWalletScreen] Blocking confirm modal dismissed before AGREGAR');
		}

		console.log('[PassengerWalletScreen] Tapping AGREGAR');
		const driver = this.getDriver();
		let tapped = false;
		let candidates: any = [];

		try {
			candidates = await driver.$$('button.btn.primary, ion-button.btn.primary, button.primary, .btn.primary');
		} catch {
			candidates = [];
		}

		console.log(`[PassengerWalletScreen] AGREGAR candidates: ${candidates.length}`);

		for (const candidate of candidates) {
			if (!(await candidate.isDisplayed().catch(() => false))) {
				continue;
			}

			const text = await candidate.getText().catch(() => '');
			const ariaLabel = await candidate.getAttribute('aria-label').catch(() => '');
			const title = await candidate.getAttribute('title').catch(() => '');
			if (!/agregar/i.test(`${text} ${ariaLabel} ${title}`)) {
				continue;
			}

			// Use JS click to bypass coordinate-based hit-testing that causes
			// "element click intercepted" when ion-item.card-number overlaps the button.
			await candidate.scrollIntoView().catch(() => {});
			await driver.pause(300);
			const clicked = await driver
				.execute((el: HTMLElement) => {
					el.scrollIntoView({ block: 'center', inline: 'center' });
					el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, view: window }));
					el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true, view: window }));
					el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true, view: window }));
					el.click();
					return true;
				}, candidate)
				.catch(() => false);

			if (clicked) {
				tapped = true;
				break;
			}
		}

		if (!tapped) {
			tapped = await this.tapWebText('AGREGAR', 10_000, true);
		}
		if (!tapped) {
			throw new Error('PassengerWalletScreen.tapAddCard() - "AGREGAR" not found');
		}

		console.log('[PassengerWalletScreen] AGREGAR tapped, waiting for Stripe card form');
		const formReady = await this.waitForStripeCardNumber(20_000);
		if (!formReady) {
			const metadata = await this.listIframeMetadata().catch(() => []);
			throw new Error(`PassengerWalletScreen.tapAddCard() - Stripe card form did not render after "AGREGAR". Iframes: ${JSON.stringify(metadata)}`);
		}

		console.log('[PassengerWalletScreen] Stripe card form rendered after AGREGAR');
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
		await this.getDriver()
			.keys(['Tab'])
			.catch(() => {});
		await this.getDriver().pause(1_500);
		await this.switchFrameTarget(null).catch(() => {});
		console.log('[PassengerWalletScreen] after card number:', JSON.stringify(await this.listIframeMetadata().catch(() => [])));

		const paymentModal = await this.getVisibleCreditCardPaymentModal().catch(() => null);
		if (!paymentModal) {
			const metadata = await this.listIframeMetadata().catch(() => []);
			throw new Error(`PassengerWalletScreen.fillCardForm() - Stripe card modal not found. Iframes: ${JSON.stringify(metadata)}`);
		}

		await this.fillStripeExpiryFrame(card.expiry, paymentModal);
		await this.getDriver().pause(300);
		await this.switchFrameTarget(null).catch(() => {});
		console.log('[PassengerWalletScreen] after expiry:', JSON.stringify(await this.listIframeMetadata().catch(() => [])));
		const cvcSelectors = ['#root > form > span:nth-child(4) > div > span > input', 'input[name="cc-csc"]', 'input[name="cvc"]', 'input[autocomplete="cc-csc"]', 'input[placeholder="CVC"]', 'input[placeholder*="CVC"]', 'input[placeholder*="CVV"]'];

		if (!(await this.fillStripeFieldBySelectors(cvcSelectors, card.cvc.replace(/\s+/g, ''), 'cvc', paymentModal))) {
			await this.fillStripeFrameByHint(/componentName=cardCvc/i, cvcSelectors, card.cvc.replace(/\s+/g, ''), 'cvc', true, paymentModal);
		}

		const holderName = card.holderName?.trim();
		if (holderName) {
			const filledHolder = await this.fillWebInputField(['ion-input[formcontrolname="cardholderName"] input', 'ion-input[formcontrolname="cardholderName"] .native-input', 'ion-input[formcontrolname="cardholderName"]', 'input[placeholder*="Nombre del T"]'], holderName, paymentModal);

			if (!filledHolder) {
				throw new Error('PassengerWalletScreen.fillCardForm() - holder name field not found');
			}

			await this.switchFrameTarget(null).catch(() => {});
			await this.getDriver()
				.execute(() => {
					const active = document.activeElement as HTMLElement | null;
					active?.blur();
				})
				.catch(() => {});
			await this.getDriver()
				.execute(() => {
					const scope = document.querySelector('app-credit-card-payment-data') as HTMLElement | null;
					const targets = Array.from(scope?.querySelectorAll('.stripe-element, .stripe-element-wrapper, .stripe-element-small, .__PrivateStripeElement, iframe[name^="__privateStripeFrame"]') ?? []) as HTMLElement[];

					for (const element of targets) {
						element.style.pointerEvents = 'none';
					}
				})
				.catch(() => {});
			await this.getDriver().pause(250);
		}
	}

	/**
	 * Confirms the card save action.
	 */
	async saveCard(): Promise<void> {
		const tapped = await this.executeInWebView(async (target: string) => {
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

			const ng = (window as any).ng;
			if (typeof ng?.getComponent === 'function') {
				const host = document.querySelector('app-credit-card-payment-data');
				if (host instanceof HTMLElement) {
					const component = ng.getComponent(host);
					if (component && typeof component.submit === 'function') {
						try {
							const result = component.submit();
							if (result && typeof result.then === 'function') {
								await result;
							}
							return 'submitted';
						} catch (error) {
							const message = error instanceof Error ? error.message : String(error);
							if (message.includes('in-flight confirmCardSetup')) {
								return 'submitted';
							}

							throw error;
						}
					}
				}
			}

			try {
				clickable.scrollIntoView({ block: 'center', inline: 'center' });
				clickable.click();
				return 'submitted';
			} catch {
				// Fall through to the synthetic click path below.
			}

			try {
				clickable.click();
				return 'submitted';
			} catch {
				// Fall through to the synthetic click path below.
			}

			try {
				clickable.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, composed: true, view: window }));
				clickable.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true, view: window }));
				clickable.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true, view: window }));
				clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window }));
			} catch {
				// Ignore and keep the action as a one-shot submit attempt.
			}

			return 'submitted';
		}, 'GUARDAR').catch(() => 'not-found');

		console.log(`[PassengerWalletScreen] saveCard() submit strategy=${tapped}`);

		if (tapped === 'disabled') {
			throw new Error('PassengerWalletScreen.saveCard() - "GUARDAR" is disabled; holder name or required fields are missing');
		}

		if (tapped !== 'clicked' && tapped !== 'submitted') {
			throw new Error('PassengerWalletScreen.saveCard() - "GUARDAR" not found');
		}

		await this.pause(500);
	}

	/**
	 * Verifies that the added card appears in the wallet list.
	 */
	async verifyCardAdded(last4: string, timeout = 10_000): Promise<void> {
		const digits = last4.replace(/\D/g, '').slice(-4);
		const deadline = Date.now() + timeout;
		let modalVisible = false;

		while (Date.now() < deadline) {
			modalVisible = Boolean(await this.getVisibleCreditCardPaymentModal().catch(() => null));

			if (await this.waitForWebText(digits, 1_000, true)) {
				return;
			}

			await this.pause(modalVisible ? 500 : 250);
		}

		const currentCount = await this.countVisibleCards().catch(() => -1);
		const metadata = await this.listIframeMetadata().catch(() => []);
		throw new Error(`PassengerWalletScreen.verifyCardAdded() - card ending ${digits} not found after ${timeout}ms; modalVisible=${modalVisible}; cardCount=${currentCount}; Iframes: ${JSON.stringify(metadata)}`);
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

	private async waitForCardLabelToDisappear(label: string, timeout = 10_000): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;
		const target = label.trim();

		while (Date.now() < deadline) {
			const stillVisible = await this.executeInWebView((targetLabel: string) => {
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

				const targetText = normalize(targetLabel);
				const candidates = Array.from(document.querySelectorAll('span.card-item-label, ion-item-sliding, ion-item.card-item')) as HTMLElement[];

				return candidates.some(element => {
					if (!isVisible(element)) {
						return false;
					}

					const values = [normalize(element.innerText || element.textContent), normalize(element.getAttribute('aria-label')), normalize(element.getAttribute('content-desc')), normalize(element.getAttribute('title'))];

					return values.some(value => value.includes(targetText));
				});
			}, target).catch(() => true);

			if (!stillVisible) {
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

		// Use count-based confirmation — label-based fails when duplicate cards share the same last-4.
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

		// Use count-based confirmation — label-based fails when duplicate cards share the same last-4.
		const removed = await this.waitForCardCountToDrop(beforeCount, 10_000);
		if (!removed) {
			const currentCount = await this.countVisibleCards();
			if (currentCount >= beforeCount) {
				throw new Error(`PassengerWalletScreen.deleteCard() - wallet count did not decrease after deleting "${openedResult.label}"`);
			}
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
