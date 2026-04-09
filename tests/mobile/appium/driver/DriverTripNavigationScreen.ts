/**
 * DriverTripNavigationScreen
 * Active trip navigation screen in the Android Driver App.
 */

import type { GeoPoint } from '../../../shared/contracts/gateway-pg';
import type { MobileActorConfig } from '../config/appiumRuntime';
import { AppiumSessionBase, type AppiumDriver } from '../base/AppiumSessionBase';
import { DriverTripCompletionScreen } from './DriverTripCompletionScreen';

export class DriverTripNavigationScreen extends AppiumSessionBase {
	constructor(config: MobileActorConfig, driver?: AppiumDriver) {
		super(config, driver);
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

	private async clickWebButton(selectors: string[], timeout = 10_000): Promise<boolean> {
		try {
			const webview = await this.switchToWebView(timeout);
			if (!webview) {
				return false;
			}

			return await this.getDriver().execute((candidateSelectors: string[]) => {
				const normalize = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
				const isVisible = (element: HTMLElement): boolean => {
					const rect = element.getBoundingClientRect();
					const style = window.getComputedStyle(element);
					return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
				};
				const candidates = Array.from(document.querySelectorAll('button, [role="button"], ion-button, a, [id], [class]')) as HTMLElement[];
				const matches = candidates.filter(element => {
					if (!isVisible(element)) {
						return false;
					}

					const values = [
						normalize(element.innerText || element.textContent),
						normalize(element.id),
						normalize(typeof element.className === 'string' ? element.className : ''),
						normalize(element.getAttribute('aria-label')),
						normalize(element.getAttribute('content-desc')),
					];

					return candidateSelectors.some(selector => {
						const normalizedSelector = normalize(selector)
							.replace(/\[\*?@text=/g, '')
							.replace(/["'\]]/g, '');
						return values.some(value => value.includes(normalizedSelector)) ||
							values.some(value => /iniciar|empezar|finalizar|cerrar|recoger|viaje|trip/.test(value) && /iniciar|empezar|finalizar|cerrar|recoger|viaje|trip/.test(normalizedSelector));
					});
				});

				const target = matches[0];
				if (target) {
					target.click();
					return true;
				}

				// Fallback por texto explícito
				const textMatches = candidates.find(element => {
					if (!isVisible(element)) {
						return false;
					}

					const text = normalize(element.innerText || element.textContent);
					const id = normalize(element.id);
					return /iniciar|empezar|recoger|finalizar|cerrar|viaje|trip/.test(text) ||
						/iniciar|empezar|recoger|finalizar|cerrar|viaje|trip/.test(id);
				});

				if (textMatches) {
					textMatches.click();
					return true;
				}

				return false;
			}, selectors);
		} catch (error) {
			console.warn('[DriverTripNavigationScreen] WebView click failed:', error instanceof Error ? error.message : error);
			return false;
		}
	}

	async startTrip(): Promise<void> {
		// TODO: reemplazar selectores heurísticos por el dump real de TravelConfirmPage.
		const clicked = await this.clickWebButton([
			'~start-trip-btn',
			'//*[@text="Empezar viaje"]',
			'//*[@text="Iniciar viaje"]',
			'//*[@text="Recoger pasajero"]',
			'id:com.magiis.app.test.driver:id/btnStartTrip',
		]);

		if (!clicked) {
			const nativeClicked = await this.clickFirstNative([
				'//*[@text="Empezar viaje"]',
				'//*[@text="Iniciar viaje"]',
				'//*[@text="Recoger pasajero"]',
				'//*[contains(@text, "Empezar")]',
				'//*[contains(@text, "Iniciar")]',
			]);

			if (!nativeClicked) {
				console.warn('[DriverTripNavigationScreen] startTrip button not found');
			}
		}
	}

	async simulateRoute(points: GeoPoint[], intervalMs = 2_000): Promise<void> {
		console.warn(`[DriverTripNavigationScreen] GPS mock disabled. Logging ${points.length} route points only.`);
		for (const point of points) {
			console.log(`  -> GPS: ${point.lat}, ${point.lng} ${point.label ?? ''}`);
		}

		await this.pause(intervalMs * points.length);
	}

	async endTrip(): Promise<void> {
		// TODO: reemplazar selectores heurísticos por el dump real de TravelConfirmPage.
		const clicked = await this.clickWebButton([
			'~end-trip-btn',
			'//*[@text="Finalizar viaje"]',
			'//*[@text="Cerrar viaje"]',
			'//*[@text="Terminar viaje"]',
			'id:com.magiis.app.test.driver:id/btnEndTrip',
		]);

		if (!clicked) {
			const nativeClicked = await this.clickFirstNative([
				'//*[@text="Finalizar viaje"]',
				'//*[@text="Cerrar viaje"]',
				'//*[@text="Terminar viaje"]',
				'//*[contains(@text, "Finalizar")]',
				'//*[contains(@text, "Cerrar")]',
			]);

			if (!nativeClicked) {
				console.warn('[DriverTripNavigationScreen] endTrip button not found');
			}
		}

		await this.pause(3_000);
	}

	async confirmEndTripPopup(): Promise<void> {
		// TODO: reemplazar selectores heurísticos por el dump real del popup de finalización.
		const clicked = await this.clickWebButton([
			'~confirm-end-trip-yes',
			'//*[@text="Sí"]',
			'//*[@text="Si"]',
			'//*[@text="Confirmar"]',
			'id:com.magiis.app.test.driver:id/btnConfirmEndTrip',
		], 15_000);

		if (!clicked) {
			const nativeClicked = await this.clickFirstNative([
				'//*[@text="Sí"]',
				'//*[@text="Si"]',
				'//*[@text="Confirmar"]',
				'//*[contains(@text, "Sí")]',
				'//*[contains(@text, "Si")]',
			], 15_000);

			if (!nativeClicked) {
				console.warn('[DriverTripNavigationScreen] end-trip confirmation button not found');
			}
		}
	}

	async verifyTripCompleted(timeout = 60_000): Promise<void> {
		const completionScreen = new DriverTripCompletionScreen(this.config, this.getDriver());
		await completionScreen.waitForCompletionScreen(timeout);
	}

	async closeTrip(): Promise<void> {
		const completionScreen = new DriverTripCompletionScreen(this.config, this.getDriver());
		await completionScreen.close();
	}
}
