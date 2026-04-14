/**
 * DriverHomeScreen
 * Home screen for the Android Driver App.
 */

import type { MobileActorConfig } from '../config/appiumRuntime';
import { AppiumSessionBase, type AppiumDriver } from '../base/AppiumSessionBase';
import { DRIVER_CHECKPOINT_SELECTORS } from './DriverFlowSelectors';

type HomeWebSnapshot = {
	url: string;
	ids: string[];
	texts: string[];
	buttons: string[];
	tripMatches: string[];
	availabilityText: string;
	hasAvailability: boolean;
	hasTripId: boolean;
};

export class DriverHomeScreen extends AppiumSessionBase {
	private activeTripId: string | null = null;

	constructor(config: MobileActorConfig, driver?: AppiumDriver) {
		super(config, driver);
	}

	private async collectWebSnapshot(expectedTripId?: string): Promise<HomeWebSnapshot | null> {
		try {
			const driver = this.getDriver();
			const webview = await this.switchToWebView();
			if (!webview) {
				return null;
			}

			return await driver.execute((tripId: string) => {
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

				const tripMatches = visibleElements.filter(item => {
					const haystacks = [item.id, item.accessibilityId, item.text, item.className, item.role]
						.map(value => value.toLowerCase());
					const hasTripId = tripId ? haystacks.some(value => value.includes(tripId.toLowerCase())) : false;
					const hasKeywords = haystacks.some(value => value.includes('trip') || value.includes('viaje'));
					return hasTripId || hasKeywords;
				});

				const availability = document.querySelector('#availability') as HTMLElement | null;
				const availabilityText = normalize(
					availability?.querySelector('.available-label')?.textContent ||
					availability?.querySelector('span')?.textContent ||
					availability?.textContent ||
					''
				);

				const buttons = Array.from(document.querySelectorAll('button, [role="button"], ion-button'))
					.map(textOf)
					.filter(Boolean);

				const ids = Array.from(new Set(visibleElements.map(item => item.id).filter(Boolean))).slice(0, 100);
				const texts = Array.from(new Set(visibleElements.map(item => item.text).filter(Boolean))).slice(0, 100);

				return {
					url: window.location.href,
					ids,
					texts,
					buttons,
					tripMatches: tripMatches.map(item =>
						`${item.tag} | id=${item.id} | aria=${item.accessibilityId} | text=${item.text} | class=${item.className} | role=${item.role}`
					),
					availabilityText,
					hasAvailability: !!availability,
					hasTripId: tripId
						? visibleElements.some(item => [item.id, item.accessibilityId, item.text, item.className, item.role]
							.some(value => value.toLowerCase().includes(tripId.toLowerCase())))
						: false,
				};
			}, expectedTripId ?? '');
		} catch (error) {
			console.warn('[DriverHomeScreen] WebView snapshot failed:', error instanceof Error ? error.message : error);
			return null;
		}
	}

	private async containsTextNative(text: string, timeout = 5_000): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;
		const selectors = [
			`//*[contains(@text, "${text}")]`,
			`//*[contains(@content-desc, "${text}")]`,
		];

		while (Date.now() < deadline) {
			for (const selector of selectors) {
				const element = driver.$(selector);
				if (await element.isDisplayed().catch(() => false)) {
					return true;
				}
			}

			await driver.pause(250);
		}

		return false;
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

	async waitForTripRequest(tripId: string, timeout = 30_000): Promise<void> {
		this.activeTripId = tripId;
		console.log(`[DriverHomeScreen] Waiting for trip request ${tripId}...`);

		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			if (await this.verifyTripId(tripId, 5_000)) {
				return;
			}

			await this.pause(1_000);
		}

		throw new Error(`Trip request ${tripId} did not appear within ${timeout}ms`);
	}

	async verifyTripId(tripId: string, timeout = 10_000): Promise<boolean> {
		this.activeTripId = tripId;
		const normalizedTripId = tripId.trim();
		if (!normalizedTripId) {
			throw new Error('Trip id is required');
		}

		const snapshot = await this.collectWebSnapshot(normalizedTripId);
		if (snapshot) {
			const found = snapshot.hasTripId || snapshot.tripMatches.some(item => item.includes(normalizedTripId));
			if (found) {
				return true;
			}
		}

		if (await this.containsTextNative(normalizedTripId, timeout)) {
			return true;
		}

		const pageSource = await this.getDriver().getPageSource().catch(() => '');
		return pageSource.includes(normalizedTripId);
	}

	/**
	 * Tap en el botón amarillo de "viaje calle" del home.
	 * Selector confirmado DOM dump 2026-04-13:
	 *   button.driver-home.home-icon-base  (clase completa: "driver-home home-icon-base general-position")
	 *   text="O X.X mi"  ← distancia al pasajero más cercano disponible
	 *
	 * Este botón existe SOLO en el home screen (URL: /navigator/home).
	 * Al taparlo navega a TravelConfirmPage con el viaje disponible más cercano.
	 * Precondición: driver en estado "Disponible" con al menos un viaje calle disponible.
	 */
	async tapViajeCalleButton(): Promise<boolean> {
		await this.switchToWebView();
		const driver = this.getDriver();
		const clicked = await driver.execute<boolean, []>(() => {
			// Buscar en la página activa (no ion-page-hidden)
			const activePage = document.querySelector('page-home:not(.ion-page-hidden), .ion-page:not(.ion-page-hidden)');
			const scope: Document | Element = activePage ?? document;
			const btn = scope.querySelector('button.driver-home.home-icon-base') as HTMLButtonElement | null;
			if (btn && btn.offsetParent !== null) {
				btn.click();
				return true;
			}
			return false;
		});
		if (clicked) {
			console.log('[DriverHomeScreen] ✓ Tap botón viaje calle (button.driver-home.home-icon-base)');
		} else {
			console.warn('[DriverHomeScreen] tapViajeCalleButton: botón no encontrado o no visible');
		}
		return clicked as boolean;
	}

	async openTripRequest(): Promise<void> {
		const tripId = this.activeTripId?.trim() ?? '';
		const driver = this.getDriver();

		try {
			// TODO: reemplazar heurística de card por selector confirmado del dump del home.
			const webview = await this.switchToWebView();
			if (webview) {
				const clicked = await driver.execute((expectedTripId: string) => {
					const normalize = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();
					const isVisible = (element: Element): boolean => {
						const html = element as HTMLElement;
						const rect = html.getBoundingClientRect();
						const style = window.getComputedStyle(html);
						return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
					};
					const textOf = (element: Element): string => normalize((element as HTMLElement).innerText || element.textContent);

					// Selector confirmado: button.driver-home.home-icon-base (DOM dump 2026-04-09)
					const candidates = Array.from(document.querySelectorAll(
						'button.driver-home.home-icon-base, [id*="trip"], [class*="trip-card"], [role="button"], button, ion-card, a, article, li'
					)) as HTMLElement[];

					const matching = candidates.filter(element => {
						if (!isVisible(element)) {
							return false;
						}

						const haystacks = [
							normalize(element.id),
							normalize(element.className),
							normalize(element.getAttribute('aria-label')),
							normalize(element.getAttribute('content-desc')),
							textOf(element),
						].map(value => value.toLowerCase());

						if (expectedTripId) {
							return haystacks.some(value => value.includes(expectedTripId.toLowerCase()));
						}

						return haystacks.some(value => value.includes('trip') || value.includes('viaje'));
					});

					const target = matching[0] ?? candidates.find(isVisible);
					if (target) {
						target.click();
						return true;
					}

					return false;
				}, tripId);

				if (clicked) {
					return;
				}
			}
		} catch (error) {
			console.warn('[DriverHomeScreen] WebView openTripRequest fallback:', error instanceof Error ? error.message : error);
		}

		const nativeSelectors = tripId
			? [
				`//*[contains(@text, "${tripId}")]`,
				`//*[contains(@content-desc, "${tripId}")]`,
				'//*[contains(@text, "Trip")]',
				'//*[contains(@text, "Viaje")]',
			]
			: [
				'//*[contains(@text, "Trip")]',
				'//*[contains(@text, "Viaje")]',
			];

		const clicked = await this.clickFirstNative(nativeSelectors, 5_000);
		if (!clicked) {
			console.warn(`[DriverHomeScreen] No trip card found to open${tripId ? ` for ${tripId}` : ''}`);
		}
	}

	async isDriverOnline(): Promise<boolean> {
		try {
			const snapshot = await this.collectWebSnapshot();
			if (snapshot) {
				const statusText = snapshot.availabilityText || snapshot.texts.join(' ') || snapshot.buttons.join(' ');
				if (/no disponible|offline|ocupado/i.test(statusText)) {
					return false;
				}
				if (/disponible|available|online/i.test(statusText)) {
					return true;
				}
			}
		} catch (error) {
			console.warn('[DriverHomeScreen] isDriverOnline web fallback:', error instanceof Error ? error.message : error);
		}

		const pageSource = await this.getDriver().getPageSource().catch(() => '');
		if (/no disponible|offline|ocupado/i.test(pageSource)) {
			return false;
		}
		if (/disponible|available|online/i.test(pageSource)) {
			return true;
		}

		return false;
	}

	/**
	 * Espera a que el driver vuelva al home después de cerrar un viaje.
	 * Selector confirmado del dump: button.driver-home.home-icon-base.
	 * URL confirmada: /navigator/home;FROM_TRAVEL_CLOSED=true
	 */
	async waitForReturnedHomeAfterTripClosed(timeout = 30_000): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			try {
				await this.switchToWebView(3_000);
			} catch {
				// Si el WebView todavía no está listo, seguir esperando.
			}

			const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
			const homeVisible = await driver.$('button.driver-home.home-icon-base').isDisplayed().catch(() => false);
			const isHomeUrl = /\/navigator\/home(?:[;?].*)?/i.test(url);
			const closedFlag = /FROM_TRAVEL_CLOSED=true/i.test(url);

			if (homeVisible && (isHomeUrl || closedFlag)) {
				return true;
			}

			await driver.pause(500);
		}

		console.warn('[DriverHomeScreen] Home after trip close did not appear within timeout');
		return false;
	}

	/** Espera el checkpoint closed: home normal o nuevo TravelConfirmPage entrante. */
	async waitForClosedCheckpoint(timeout = 30_000): Promise<boolean> {
		const driver = this.getDriver();
		const checkpoint = DRIVER_CHECKPOINT_SELECTORS.closed;
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			try {
				await this.switchToWebView(3_000);
			} catch {
				// Continuar hasta que WebView esté disponible.
			}

			const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
			if (checkpoint.urlTokens.some((token) => url.includes(token))) {
				return true;
			}

			for (const selector of checkpoint.webSelectors) {
				if (await driver.$(selector).isDisplayed().catch(() => false)) {
					return true;
				}
			}

			await driver.pause(500);
		}

		return false;
	}

	async goOnline(): Promise<void> {
		if (await this.isDriverOnline()) {
			return;
		}

		let clicked = false;
		try {
			// TODO: reemplazar heurística de availability por selector confirmado del dump del home.
			const webview = await this.switchToWebView();
			if (webview) {
				clicked = await this.getDriver().execute(() => {
					const availability = document.querySelector('#availability') as HTMLElement | null;
					if (availability) {
						availability.click();
						return true;
					}

					const candidates = Array.from(document.querySelectorAll('button, [role="button"], ion-button, [id*="availability"]')) as HTMLElement[];
					const match = candidates.find(element => {
						const text = ((element.innerText || element.textContent || '') as string).replace(/\s+/g, ' ').trim().toLowerCase();
						const id = (element.id || '').toLowerCase();
						const cls = typeof element.className === 'string' ? element.className.toLowerCase() : '';
						return text.includes('disponible') || text.includes('available') || text.includes('online') || id.includes('availability') || cls.includes('availability');
					});

					if (match) {
						match.click();
						return true;
					}

					return false;
				});
			}
		} catch (error) {
			console.warn('[DriverHomeScreen] goOnline web fallback:', error instanceof Error ? error.message : error);
		}

		if (!clicked) {
			clicked = await this.clickFirstNative([
				'//*[@text="Disponible"]',
				'//*[@text="No disponible"]',
				'//*[contains(@text, "Disponible")]',
				'//*[contains(@text, "No disponible")]',
			], 5_000);
		}

		await this.pause(2_500);

		if (!(await this.isDriverOnline())) {
			console.warn('[DriverHomeScreen] Driver did not switch to online after toggle attempt');
		}
	}
}
