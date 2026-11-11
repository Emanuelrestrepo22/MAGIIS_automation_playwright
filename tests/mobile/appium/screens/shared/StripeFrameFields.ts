/**
 * StripeFrameFields — llenado de un frame concreto de Stripe (por hint) y del vencimiento (combinado o MM/AA
 * separados). Componente compartido.
 */

import { sleep } from '../../core/Waits';
import type { WebViewKit } from './WebViewKit';
import type { CardFormModal } from './CardFormModal';
import type { StripeFrameTyping } from './StripeFrameTyping';
import type { StripeFrames } from './StripeFrames';

export class StripeFrameFields {
	constructor(
		private readonly kit: WebViewKit,
		private readonly modal: CardFormModal,
		private readonly typing: StripeFrameTyping,
		private readonly frames: StripeFrames
	) {}

	async fillStripeFrameByHint(
		frameHint: RegExp,
		selectors: string[],
		value: string,
		label: string,
		allowGenericFallback = true,
		scope?: any
	): Promise<void> {
		const driver = this.kit.driver;
		const deadline = Date.now() + 20_000;
		const completionMatcher = frameHint.source;
		let lastCandidateFrames: Array<{ index: number; element: any; name: string; src: string }> = [];

		while (Date.now() < deadline) {
			const frames = await this.frames.listIframeEntries(scope).catch(() => []);
			lastCandidateFrames = frames
				.filter(frame => {
					const signature = `${frame.name ?? ''} ${frame.src ?? ''}`;
					const looksLikeCardFrame =
						/componentName=card(Number|Expiry|Cvc)/i.test(signature) ||
						/elements-inner-card/i.test(signature);
					const isNoiseFrame =
						/metrics|hcaptcha/i.test(signature) ||
						(/__privateStripeController/i.test(signature) && !looksLikeCardFrame);

					return frameHint.test(signature) && !isNoiseFrame;
				})
				.map(frame => frame);

			for (const frame of [...lastCandidateFrames].reverse()) {
				await frame.element.scrollIntoView().catch(() => {});
				await sleep(150);

				await this.kit.switchFrameTarget(frame.element).catch(() => {});

				try {
					for (const selector of selectors) {
						const input =
							(await this.modal.findVisibleElement(selector)) ??
							(await this.kit.findAnyElement(selector));
						if (!input) {
							continue;
						}

						console.log(
							`[PassengerWalletScreen] ${label} selector ${selector} -> ${await this.modal.describeElement(input)}`
						);

						if (await this.modal.typeValueIntoElement(input, value)) {
							if (
								await this.typing.waitForStripeFrameCompletion(frame.element, 2_000, completionMatcher)
							) {
								await this.modal.blurActiveElement();
								return;
							}
						}

						if (await this.typing.waitForStripeFrameCompletion(frame.element, 2_000, completionMatcher)) {
							await this.modal.blurActiveElement();
							return;
						}
					}

					if (await this.typing.fillSelectorsInCurrentFrame(selectors, value)) {
						if (await this.typing.waitForStripeFrameCompletion(frame.element, 2_000, completionMatcher)) {
							await this.modal.blurActiveElement();
							return;
						}
					}

					if (await this.typing.waitForStripeFrameCompletion(frame.element, 2_000, completionMatcher)) {
						await this.modal.blurActiveElement();
						return;
					}

					if (await this.typing.typeValueViaStripeProxyInput(frame.element, value, completionMatcher)) {
						await this.modal.blurActiveElement();
						return;
					}

					if (await this.typing.typeValueViaStripeFrameFocus(frame.element, value, completionMatcher)) {
						await this.modal.blurActiveElement();
						return;
					}

					if (await this.typing.typeValueViaStripeContainerClick(frame.element, value, completionMatcher)) {
						await this.modal.blurActiveElement();
						return;
					}

					if (allowGenericFallback) {
						// Stripe sometimes re-renders the field with a different internal structure;
						// inside the dedicated expiry/CVC frame there is usually a single visible input.
						if (
							await this.typing.fillSelectorsInCurrentFrame(
								['input:not([type="hidden"])', 'textarea'],
								value
							)
						) {
							if (
								await this.typing.waitForStripeFrameCompletion(frame.element, 2_000, completionMatcher)
							) {
								await this.modal.blurActiveElement();
								return;
							}
						}

						if (await this.typing.waitForStripeFrameCompletion(frame.element, 2_000, completionMatcher)) {
							await this.modal.blurActiveElement();
							return;
						}
					}

					if (await this.typing.typeValueIntoFocusedFrame(frame.element, value, completionMatcher)) {
						if (await this.typing.waitForStripeFrameCompletion(frame.element, 2_000, completionMatcher)) {
							await this.modal.blurActiveElement();
							return;
						}
					}

					if (await this.typing.waitForStripeFrameCompletion(frame.element, 2_000, completionMatcher)) {
						await this.modal.blurActiveElement();
						return;
					}
				} catch {
					// Try next candidate frame.
				} finally {
					await this.kit.switchFrameTarget(null).catch(() => {});
				}
			}

			await sleep(250);
		}

		const metadata = await this.frames.listIframeMetadata().catch(() => []);
		const debugFields: Array<{ index: number; fields: string[] }> = [];

		for (const frame of lastCandidateFrames) {
			await this.kit.switchFrameTarget(frame.element).catch(() => {});

			try {
				const snapshot = (await driver.execute(() => {
					const describe = (element: Element): string => {
						const html = element as HTMLElement;
						const attributes = [
							`tag=${html.tagName.toLowerCase()}`,
							`id=${html.id || ''}`,
							`name=${html.getAttribute('name') || ''}`,
							`type=${html.getAttribute('type') || ''}`,
							`placeholder=${html.getAttribute('placeholder') || ''}`,
							`aria-label=${html.getAttribute('aria-label') || ''}`,
							`role=${html.getAttribute('role') || ''}`,
							`class=${html.className || ''}`,
							`text=${(html.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)}`
						];

						return attributes.join(' ');
					};

					const inputs = Array.from(
						document.querySelectorAll('input, textarea, [role="textbox"], [contenteditable="true"]')
					)
						.map(describe)
						.slice(0, 20);
					const frames = Array.from(document.querySelectorAll('iframe, frame')).map(describe).slice(0, 20);
					const activeElement = document.activeElement ? describe(document.activeElement) : '<none>';
					const bodyText = document.body
						? (document.body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200)
						: '';
					const bodyHtml = document.body
						? document.body.innerHTML.replace(/\s+/g, ' ').trim().slice(0, 500)
						: '';

					return { inputs, frames, activeElement, bodyText, bodyHtml };
				})) as {
					inputs: string[];
					frames: string[];
					activeElement: string;
					bodyText: string;
					bodyHtml: string;
				};

				debugFields.push({
					index: frame.index,
					fields: [
						...snapshot.inputs,
						...snapshot.frames,
						`active=${snapshot.activeElement}`,
						`bodyText=${snapshot.bodyText}`,
						`bodyHtml=${snapshot.bodyHtml}`
					]
				});
			} catch {
				debugFields.push({ index: frame.index, fields: ['<unavailable>'] });
			} finally {
				await this.kit.switchFrameTarget(null).catch(() => {});
			}
		}

		throw new Error(
			`PassengerWalletScreen.fillCardForm() - ${label} not found in Stripe frames. Iframes: ${JSON.stringify(metadata)} Fields: ${JSON.stringify(debugFields)}`
		);
	}

	async fillStripeExpiryFrame(expiry: string, scope?: any): Promise<void> {
		const { month, year, combined } = this.kit.parseExpiryParts(expiry);
		const combinedSelectors = [
			'input[name="exp-date"]',
			'input[name="exp"]',
			'input[autocomplete="cc-exp"]',
			'input[placeholder="MM/AA"]',
			'input[placeholder*="MM/AA"]',
			'input[placeholder*="MM / AA"]',
			'input[placeholder*="MM/YY"]',
			'input.__PrivateStripeElement-input',
			'#root > form > span:nth-child(4) > div > span > input'
		];
		const monthSelectors = [
			'input[name="cc-exp-month"]',
			'input[name="exp-month"]',
			'input[autocomplete="cc-exp-month"]',
			'input[placeholder*="MM"]',
			'input.__PrivateStripeElement-input'
		];
		const yearSelectors = [
			'input[name="cc-exp-year"]',
			'input[name="exp-year"]',
			'input[autocomplete="cc-exp-year"]',
			'input[placeholder*="AA"]',
			'input[placeholder*="YY"]',
			'input.__PrivateStripeElement-input'
		];

		if (await this.frames.fillStripeFieldBySelectors(combinedSelectors, combined, 'expiry', scope)) {
			return;
		}

		try {
			await this.fillStripeFrameByHint(
				/componentName=cardExpiry/i,
				combinedSelectors,
				combined,
				'expiry',
				true,
				scope
			);
			return;
		} catch {
			// Fall back to separate month/year fields below.
		}

		try {
			await this.frames.fillStripeFieldBySelectors(monthSelectors, month, 'expiry month', scope);
			await this.frames.fillStripeFieldBySelectors(yearSelectors, year, 'expiry year', scope);
			return;
		} catch {
			// Fall through to the final error below.
		}

		const metadata = await this.frames.listIframeMetadata().catch(() => []);
		throw new Error(
			`PassengerWalletScreen.fillCardForm() - expiry not found in Stripe frames. Iframes: ${JSON.stringify(metadata)}`
		);
	}
}
