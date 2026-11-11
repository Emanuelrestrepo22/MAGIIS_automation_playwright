/**
 * WebText — espera y tap por TEXTO visible en la WebView (normalizado sin tildes ni mayusculas).
 * Ultimo recurso de locator (D3): se usa donde la app no expone clase/aria-label estable.
 */

import { sleep } from '../../core/Waits';
import type { WebViewKit } from './WebViewKit';

export class WebText {
	constructor(private readonly kit: WebViewKit) {}

	async waitForWebText(text: string, timeout = 10_000, partial = false): Promise<boolean> {
		const driver = this.kit.driver;
		const webview = await this.kit.switchToWebView(timeout);
		if (!webview) {
			return false;
		}

		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			const matched = (await driver.execute(
				(target: string, allowPartial: boolean) => {
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
						return (
							style.display !== 'none' &&
							style.visibility !== 'hidden' &&
							rect.width > 0 &&
							rect.height > 0
						);
					};

					const targetText = normalize(target);
					const candidates = Array.from(
						document.querySelectorAll(
							'button, [role="button"], ion-button, ion-item, ion-label, ion-tab-button, ion-col, span, div, a, p'
						)
					) as HTMLElement[];

					return candidates.some(element => {
						if (!isVisible(element)) {
							return false;
						}

						const values = [
							normalize(element.innerText || element.textContent),
							normalize(element.getAttribute('aria-label')),
							normalize(element.getAttribute('content-desc')),
							normalize(element.getAttribute('title'))
						];

						return values.some(value => (allowPartial ? value.includes(targetText) : value === targetText));
					});
				},
				text,
				partial
			)) as boolean;

			if (matched) {
				return true;
			}

			await sleep(250);
		}

		return false;
	}

	async tapWebText(text: string, timeout = 10_000, partial = false): Promise<boolean> {
		const driver = this.kit.driver;
		const webview = await this.kit.switchToWebView(timeout);
		if (!webview) {
			return false;
		}

		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			const clicked = (await driver.execute(
				(target: string, allowPartial: boolean) => {
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
						return (
							style.display !== 'none' &&
							style.visibility !== 'hidden' &&
							rect.width > 0 &&
							rect.height > 0
						);
					};

					const findClickableAncestor = (element: HTMLElement): HTMLElement => {
						let current: HTMLElement | null = element;
						while (current) {
							const tag = current.tagName.toUpperCase();
							const role = normalize(current.getAttribute('role'));
							if (
								tag === 'BUTTON' ||
								tag === 'ION-BUTTON' ||
								tag === 'ION-ITEM' ||
								tag === 'ION-TAB-BUTTON' ||
								tag === 'ION-MENU-TOGGLE' ||
								tag === 'ION-COL' ||
								tag === 'A' ||
								role === 'button'
							) {
								return current;
							}
							current = current.parentElement;
						}

						return element;
					};

					const targetText = normalize(target);
					const candidates = Array.from(
						document.querySelectorAll(
							'button, [role="button"], ion-button, ion-item, ion-label, ion-tab-button, ion-col, span, div, a, p'
						)
					) as HTMLElement[];

					const match = candidates.find(element => {
						if (!isVisible(element)) {
							return false;
						}

						const values = [
							normalize(element.innerText || element.textContent),
							normalize(element.getAttribute('aria-label')),
							normalize(element.getAttribute('content-desc')),
							normalize(element.getAttribute('title'))
						];

						return values.some(value => (allowPartial ? value.includes(targetText) : value === targetText));
					});

					if (!match) {
						return false;
					}

					findClickableAncestor(match).click();
					return true;
				},
				text,
				partial
			)) as boolean;

			if (clicked) {
				return true;
			}

			await sleep(250);
		}

		return false;
	}
}
