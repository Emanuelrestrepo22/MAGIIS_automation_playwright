/**
 * DriverTripRequestScreen
 * Trip request detail screen in the Android Driver App.
 */

import type { MobileActorConfig } from '../config/appiumRuntime';
import { AppiumSessionBase, type AppiumDriver } from '../base/AppiumSessionBase';

type TripRequestSnapshot = {
	url: string;
	texts: string[];
	ids: string[];
	buttons: string[];
	matches: string[];
};

export class DriverTripRequestScreen extends AppiumSessionBase {
	constructor(config: MobileActorConfig, driver?: AppiumDriver) {
		super(config, driver);
	}

	private async collectSnapshot(): Promise<TripRequestSnapshot | null> {
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

				const tripKeywords = ['trip', 'viaje', 'request', 'solicitud', 'driver'];
				const matches = visibleElements.filter(item => {
					const haystacks = [item.id, item.accessibilityId, item.text, item.className, item.role]
						.map(value => value.toLowerCase());
					return haystacks.some(value => tripKeywords.some(keyword => value.includes(keyword)));
				});

				const buttons = Array.from(document.querySelectorAll('button, [role="button"], ion-button'))
					.map(textOf)
					.filter(Boolean);

				return {
					url: window.location.href,
					texts: Array.from(new Set(visibleElements.map(item => item.text).filter(Boolean))).slice(0, 100),
					ids: Array.from(new Set(visibleElements.map(item => item.id).filter(Boolean))).slice(0, 100),
					buttons,
					matches: matches.map(item =>
						`${item.tag} | id=${item.id} | aria=${item.accessibilityId} | text=${item.text} | class=${item.className} | role=${item.role}`
					),
				};
			});
		} catch (error) {
			console.warn('[DriverTripRequestScreen] WebView snapshot failed:', error instanceof Error ? error.message : error);
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

	private async extractTextFromNative(selectors: string[], timeout = 5_000): Promise<string> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			for (const selector of selectors) {
				const element = driver.$(selector);
				if (await element.isDisplayed().catch(() => false)) {
					return (await element.getText()).trim();
				}
			}

			await driver.pause(250);
		}

		return '';
	}

	/**
	 * Extrae el travelId de la URL del TravelConfirmPage.
	 * URL format: /navigator/TravelConfirmPage;data={"travelId":61545,...}
	 */
	async getTravelIdFromUrl(): Promise<string | null> {
		try {
			const webview = await this.switchToWebView();
			if (!webview) return null;
			const url = await this.getDriver().execute<string, []>(() => window.location.href);
			const match = url.match(/"travelId":(\d+)/);
			return match ? match[1] : null;
		} catch {
			return null;
		}
	}

	async acceptTrip(): Promise<void> {
		let clicked = false;
		try {
			// Selector confirmado DOM dump + devtools 2026-04-09:
			//   <button _ngcontent-etf-c182 class="btn primary">Aceptar</button>
			// _ngcontent-* cambia por build → NO usar. Selector estable: button.btn.primary
			// Angular requiere tap real (WebdriverIO .click()) — no funciona con execute().
			// Hay dos button.btn.primary en el DOM: "Entrar" (login oculto) y "Aceptar"
			// Usar $$ para iterar y filtrar por texto visible.
			const webview = await this.switchToWebView();
			if (webview) {
				const driver = this.getDriver();
				const allBtns = await driver.$$('button.btn.primary');
				for (const btn of allBtns) {
					const text     = (await btn.getText().catch(() => '')).trim();
					const visible  = await btn.isDisplayed().catch(() => false);
					if (text === 'Aceptar' && visible) {
						await btn.click();
						clicked = true;
						break;
					}
				}
			}
		} catch (error) {
			console.warn('[DriverTripRequestScreen] acceptTrip web fallback:', error instanceof Error ? error.message : error);
		}

		if (!clicked) {
			clicked = await this.clickFirstNative([
				'//*[@text="Aceptar"]',
				'//*[@text="Tomar viaje"]',
				'//*[contains(@text, "Aceptar")]',
				'//*[contains(@text, "Tomar viaje")]',
			], 5_000);
		}

		if (!clicked) {
			console.warn('[DriverTripRequestScreen] Accept button not found');
			return;
		}

		await this.pause(3_000);
	}

	async getTripId(timeout = 10_000): Promise<string> {
		// Prioridad: extraer desde URL (más confiable — formato confirmado)
		const fromUrl = await this.getTravelIdFromUrl();
		if (fromUrl) return fromUrl;

		const snapshot = await this.collectSnapshot();
		if (snapshot) {
			// travelCode visible en pantalla: ej "952-W"
			const codeCandidate = snapshot.texts.find(text => /^\d{3,}-[A-Z]/.test(text));
			if (codeCandidate) return codeCandidate;

			const textCandidate = snapshot.texts.find(text => /\d{4,}/.test(text));
			if (textCandidate) return textCandidate;
		}

		return this.extractTextFromNative([
			'//*[contains(@text, "Trip")]',
			'//*[contains(@text, "Viaje")]',
			'//*[contains(@text, "ID")]',
			'//*[contains(@text, "travel")]',
		], timeout);
	}

	async getTripOrigin(timeout = 10_000): Promise<string> {
		const snapshot = await this.collectSnapshot();
		if (snapshot) {
			const candidate = snapshot.texts.find(text => /origin|from|origen/i.test(text));
			if (candidate) {
				return candidate;
			}
		}

		return this.extractTextFromNative([
			'//*[contains(@text, "Origen")]',
			'//*[contains(@text, "Origin")]',
			'//*[contains(@text, "From")]',
		], timeout);
	}

	async getTripDestination(timeout = 10_000): Promise<string> {
		const snapshot = await this.collectSnapshot();
		if (snapshot) {
			const candidate = snapshot.texts.find(text => /destination|to|destino/i.test(text));
			if (candidate) {
				return candidate;
			}
		}

		return this.extractTextFromNative([
			'//*[contains(@text, "Destino")]',
			'//*[contains(@text, "Destination")]',
			'//*[contains(@text, "To")]',
		], timeout);
	}

	async verifyTripDetails(expected: { origin: string; destination: string }): Promise<void> {
		const origin = await this.getTripOrigin();
		const destination = await this.getTripDestination();

		if (!origin.includes(expected.origin)) {
			throw new Error(`Expected origin "${expected.origin}", got "${origin}"`);
		}

		if (!destination.includes(expected.destination)) {
			throw new Error(`Expected destination "${expected.destination}", got "${destination}"`);
		}
	}
}
