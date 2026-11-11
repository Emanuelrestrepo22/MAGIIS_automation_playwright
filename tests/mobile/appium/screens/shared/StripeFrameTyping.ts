/**
 * StripeFrameTyping — estrategias de tipeo dentro de los iframes de Stripe Elements y espera de
 * `StripeElement--complete`. Componente compartido.
 */

import { sleep } from '../../core/Waits';
import type { WebViewKit } from './WebViewKit';

export class StripeFrameTyping {
	constructor(private readonly kit: WebViewKit) {}

	async fillSelectorsInCurrentFrame(selectors: string[], value: string): Promise<boolean> {
		const driver = this.kit.driver;
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
							const frameDocument =
								(frame as HTMLIFrameElement).contentDocument ??
								(frame as HTMLFrameElement).contentDocument;
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
					const setter =
						Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set ??
						Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

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
						return (
							style.display !== 'none' &&
							style.visibility !== 'hidden' &&
							rect.width > 0 &&
							rect.height > 0
						);
					});

					for (const node of visibleNodes.length ? visibleNodes : nodes) {
						const input = node.matches('input, textarea')
							? (node as HTMLInputElement | HTMLTextAreaElement)
							: (node.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null);

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

	async typeValueIntoFocusedFrame(frameElement: any, value: string, completionMatcher?: string): Promise<boolean> {
		const driver = this.kit.driver;

		try {
			for (const char of Array.from(value)) {
				await driver.keys([char]);
				await sleep(35);
			}

			await this.kit.switchFrameTarget(null).catch(() => {});
			return this.waitForStripeFrameCompletion(frameElement, 2_000, completionMatcher);
		} catch {
			await this.kit.switchFrameTarget(null).catch(() => {});
			return false;
		}
	}

	async typeValueViaStripeFrameFocus(frameElement: any, value: string, completionMatcher?: string): Promise<boolean> {
		const driver = this.kit.driver;

		try {
			await frameElement.scrollIntoView().catch(() => {});
			await frameElement.click().catch(() => {});
			await sleep(200);

			for (const char of Array.from(value)) {
				await driver.keys([char]);
				await sleep(35);
			}

			return this.waitForStripeFrameCompletion(frameElement, 2_000, completionMatcher);
		} catch {
			return false;
		}
	}

	async typeValueViaStripeContainerClick(
		frameElement: any,
		value: string,
		completionMatcher?: string
	): Promise<boolean> {
		const driver = this.kit.driver;

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

			await sleep(150);

			for (const char of Array.from(value)) {
				await driver.keys([char]);
				await sleep(35);
			}

			return this.waitForStripeFrameCompletion(frameElement, 2_000, completionMatcher);
		} catch {
			return false;
		}
	}

	async waitForStripeFrameCompletion(
		frameElement: any,
		timeout = 2_000,
		completionMatcher?: string
	): Promise<boolean> {
		const driver = this.kit.driver;
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

						const signature =
							`${iframe.getAttribute('name') ?? ''} ${iframe.getAttribute('src') ?? ''} ${iframe.getAttribute('title') ?? ''}`.toLowerCase();
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

			await sleep(150);
		}

		return false;
	}

	async typeValueViaStripeProxyInput(frameElement: any, value: string, completionMatcher?: string): Promise<boolean> {
		const driver = this.kit.driver;

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
			await sleep(100);

			for (const char of Array.from(value)) {
				await driver.keys([char]);
				await sleep(35);
			}

			return this.waitForStripeFrameCompletion(frameElement, 2_000, completionMatcher);
		} catch {
			return false;
		}
	}
}
