/**
 * DriverTripCompletionScreen
 * Post-completion summary screen for the Android Driver App.
 */

import type { MobileActorConfig } from '../config/appiumRuntime';
import { AppiumSessionBase, type AppiumDriver } from '../base/AppiumSessionBase';

type CompletionSnapshot = {
	url: string;
	texts: string[];
	ids: string[];
	buttons: string[];
	matches: string[];
	chargedAmount: string;
};

export class DriverTripCompletionScreen extends AppiumSessionBase {
	constructor(config: MobileActorConfig, driver?: AppiumDriver) {
		super(config, driver);
	}

	private async collectSnapshot(): Promise<CompletionSnapshot | null> {
		try {
			const driver = this.getDriver();
			const webview = await this.switchToWebView();
			if (!webview) {
				return null;
			}

			return await driver.execute(() => {
				const normalize = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();
				const isVisible = (element: Element): boolean => {
					const html = element as HTMLElement;
					const rect = html.getBoundingClientRect();
					const style = window.getComputedStyle(html);
					return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
				};
				const textOf = (element: Element): string => normalize((element as HTMLElement).innerText || element.textContent);
				const attrOf = (element: Element, name: string): string => normalize(element.getAttribute(name));

				const visibleElements = Array.from(document.querySelectorAll('*'))
					.filter(isVisible)
					.map(element => {
						const html = element as HTMLElement;
						return {
							tag: html.tagName.toLowerCase(),
							id: normalize(html.id),
							accessibilityId: attrOf(html, 'aria-label') || attrOf(html, 'content-desc') || attrOf(html, 'data-testid'),
							text: textOf(html),
							className: normalize(typeof html.className === 'string' ? html.className : ''),
							role: attrOf(html, 'role'),
						};
					})
					.filter(item => item.id || item.accessibilityId || item.text || item.className || item.role);

				const matchingTexts = visibleElements.filter(item => {
					const haystacks = [item.id, item.accessibilityId, item.text, item.className, item.role]
						.map(value => value.toLowerCase());
					return haystacks.some(value =>
						value.includes('finalizado') ||
						value.includes('completado') ||
						value.includes('confirmado') ||
						value.includes('pago') ||
						value.includes('charged') ||
						value.includes('amount') ||
						value.includes('resume')
					);
				});

				const buttons = Array.from(document.querySelectorAll('button, [role="button"], ion-button'))
					.map(textOf)
					.filter(Boolean);

				const ids = Array.from(new Set(visibleElements.map(item => item.id).filter(Boolean))).slice(0, 100);
				const texts = Array.from(new Set(visibleElements.map(item => item.text).filter(Boolean))).slice(0, 100);
				const chargedAmountMatch = visibleElements.find(item =>
					/\$|\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?/.test(item.text) ||
					/(charged|amount|monto|total)/i.test(item.id) ||
					/(charged|amount|monto|total)/i.test(item.className)
				);

				return {
					url: window.location.href,
					texts,
					ids,
					buttons,
					matches: matchingTexts.map(item =>
						`${item.tag} | id=${item.id} | aria=${item.accessibilityId} | text=${item.text} | class=${item.className} | role=${item.role}`
					),
					chargedAmount: chargedAmountMatch?.text ?? '',
				};
			});
		} catch (error) {
			console.warn('[DriverTripCompletionScreen] WebView snapshot failed:', error instanceof Error ? error.message : error);
			return null;
		}
	}

	private async clickFirstNative(selectors: string[], timeout = 5_000): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			for (const selector of selectors) {
				const element = driver.$(selector);
				if (await element.isDisplayed().catch(() => false)) {
					await element.click();
					return true;
				}
			}

			await driver.pause(250);
		}

		return false;
	}

	async waitForCompletionScreen(timeout = 60_000): Promise<void> {
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			const snapshot = await this.collectSnapshot();
			if (snapshot) {
				const joined = `${snapshot.url} ${snapshot.texts.join(' ')} ${snapshot.matches.join(' ')} ${snapshot.buttons.join(' ')}`;
				if (/finalizado|completado|confirmado|pago|charged|amount|summary|resumen/i.test(joined)) {
					return;
				}
			}

			const source = await this.getDriver().getPageSource().catch(() => '');
			if (/finalizado|completado|confirmado|pago|charged|amount|summary|resumen/i.test(source)) {
				return;
			}

			await this.pause(1_000);
		}

		console.warn('[DriverTripCompletionScreen] Completion screen did not appear within timeout');
	}

	async getChargedAmount(timeout = 10_000): Promise<string> {
		const snapshot = await this.collectSnapshot();
		if (snapshot?.chargedAmount) {
			return snapshot.chargedAmount;
		}

		const source = await this.getDriver().getPageSource().catch(() => '');
		const match = source.match(/\$[0-9.,]+/);
		if (match) {
			return match[0];
		}

		console.warn('[DriverTripCompletionScreen] Charged amount not found in DOM or page source');
		return '';
	}

	async close(): Promise<void> {
		let clicked = false;
		try {
			// TODO: reemplazar heurística del cierre por selector confirmado del dump.
			const webview = await this.switchToWebView();
			if (webview) {
				clicked = await this.getDriver().execute(() => {
					const normalize = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
					const isVisible = (element: HTMLElement): boolean => {
						const rect = element.getBoundingClientRect();
						const style = window.getComputedStyle(element);
						return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
					};
					const buttons = Array.from(document.querySelectorAll('button, [role="button"], ion-button, a')) as HTMLElement[];
					const match = buttons.find(element => {
						if (!isVisible(element)) {
							return false;
						}

						const text = normalize(element.innerText || element.textContent);
						const id = normalize(element.id);
						return text.includes('cerrar') || text.includes('close') || id.includes('close') || id.includes('cerrar');
					});

					if (match) {
						match.click();
						return true;
					}

					return false;
				});
			}
		} catch (error) {
			console.warn('[DriverTripCompletionScreen] close web fallback:', error instanceof Error ? error.message : error);
		}

		if (!clicked) {
			clicked = await this.clickFirstNative([
				'//*[@text="Cerrar"]',
				'//*[@text="Cerrar viaje"]',
				'//*[contains(@text, "Cerrar")]',
				'//*[contains(@text, "Close")]',
			], 5_000);
		}

		if (!clicked) {
			console.warn('[DriverTripCompletionScreen] Close button not found');
			return;
		}

		await this.pause(1_000);
	}
}
