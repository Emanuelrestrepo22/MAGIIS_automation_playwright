/**
 * WebViewKit — primitivas de WebView/Ionic por COMPOSICION sobre `MobileSession` (equivale a los helpers de
 * `AppiumSessionBase`, que siguen intactos para los scripts viejos): contexto, frames, busqueda de
 * elementos y llenado de inputs con el setter nativo. Sin aserciones ni locators de negocio.
 */

import type { Browser } from 'webdriverio';
import type { MobileSession } from '../../core/MobileSession';
import { sleep } from '../../core/Waits';
import { parseExpiryParts, type ExpiryParts } from './CardInput';
import { WebText } from './WebText';

export class WebViewKit {
	/** Hook de SCOPE del form web: default `null` = documento entero (overlay unico). */
	scopeProvider: (() => Promise<any | null>) | null = null;
	private readonly text = new WebText(this);

	constructor(private readonly session: MobileSession) {}

	get driver(): Browser {
		return this.session.driver;
	}

	async getWebFormScope(): Promise<any | null> {
		return this.scopeProvider ? this.scopeProvider() : null;
	}

	waitForWebText(text: string, timeout = 10_000, partial = false): Promise<boolean> {
		return this.text.waitForWebText(text, timeout, partial);
	}

	tapWebText(text: string, timeout = 10_000, partial = false): Promise<boolean> {
		return this.text.tapWebText(text, timeout, partial);
	}

	/** Parte un vencimiento `MM/YY` o `MM/YYYY`. Fail-fast si no matchea. */
	parseExpiryParts(expiry: string): ExpiryParts {
		return parseExpiryParts(expiry);
	}

	async waitForWebUrlContains(fragment: string, timeout = 10_000): Promise<boolean> {
		const driver = this.driver;
		const webview = await this.switchToWebView(timeout);
		if (!webview) {
			return false;
		}

		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
			if (url.includes(fragment)) {
				return true;
			}

			await sleep(250);
		}

		return false;
	}

	async switchToWebView(timeout = 10_000): Promise<string | null> {
		const driver = this.driver;
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			const contexts = (await driver.getContexts()) as string[];
			const webview = contexts.find(context => context.startsWith('WEBVIEW'));
			if (webview) {
				await driver.switchContext(webview);
				return webview;
			}

			await sleep(250);
		}

		return null;
	}

	async switchToNative(): Promise<void> {
		await this.driver.switchContext('NATIVE_APP');
	}

	async executeInWebView<T>(fn: (...args: any[]) => T, ...args: any[]): Promise<T> {
		const webview = await this.switchToWebView();
		if (!webview) {
			throw new Error('No WEBVIEW context available');
		}

		return (await this.driver.execute(fn as never, ...(args as never[]))) as T;
	}

	async switchFrameTarget(target: any): Promise<void> {
		const driver = this.driver as any;

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

	async findAnyElement(selector: string, scope?: any): Promise<any | null> {
		const driver = this.driver;
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
			const formScope = await this.getWebFormScope().catch(() => null);
			if (formScope) {
				let candidates: any = [];

				try {
					candidates = await formScope.$$(selector);
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

	async setDomValue(element: any, value: string): Promise<boolean> {
		const driver = this.driver;
		return (await driver.execute(
			(target: HTMLElement, nextValue: string) => {
				const host = target as HTMLElement & {
					shadowRoot?: ShadowRoot | null;
					querySelector?: (selectors: string) => Element | null;
				};

				const input =
					(host.shadowRoot?.querySelector('input, textarea') as
						| HTMLInputElement
						| HTMLTextAreaElement
						| null) ??
					(host.matches?.('input, textarea') ? (host as HTMLInputElement | HTMLTextAreaElement) : null) ??
					(host.querySelector?.('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null);

				if (!input) {
					return false;
				}

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

	async fillWebInputField(selectors: readonly string[], value: string, scope?: any): Promise<boolean> {
		const modal = scope ?? (await this.getWebFormScope().catch(() => null));

		for (const selector of selectors) {
			const element = modal
				? ((await modal.$(selector).catch(() => null)) ?? (await this.findAnyElement(selector, scope)))
				: await this.findAnyElement(selector, scope);
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
					const setter =
						Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set ??
						Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;

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
						const input = node.matches('input, textarea')
							? (node as HTMLInputElement | HTMLTextAreaElement)
							: (node.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null);

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
}
