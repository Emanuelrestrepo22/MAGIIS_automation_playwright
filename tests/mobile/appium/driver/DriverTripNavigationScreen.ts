/**
 * DriverTripNavigationScreen
 * Active trip navigation screen in the Android Driver App.
 */

import type { GeoPoint } from '../../../features/gateway-pg/contracts/gateway-pg.types';
import type { MobileActorConfig } from '../config/appiumRuntime';
import { AppiumSessionBase, type AppiumDriver } from '../base/AppiumSessionBase';
import { DRIVER_ACTION_SELECTORS } from './DriverFlowSelectors';
import { DriverTripCompletionScreen } from './DriverTripCompletionScreen';

const TRIP_IN_PROGRESS_CONTAINER_SELECTOR = 'app-page-travel-in-progress';
const TRIP_IN_PROGRESS_FINISH_SELECTOR = DRIVER_ACTION_SELECTORS.endTripPrimaryButton;

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

	/**
	 * Verifica que estamos en TravelToStartPage antes de continuar.
	 * URL confirmada: /navigator/TravelToStartPage;showMapOnlyOnce=null
	 */
	async waitForTravelToStartPage(timeout = 15_000): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			await this.switchToWebView(3_000);
			const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
			if (url.includes('TravelToStartPage')) return true;
			await driver.pause(500);
		}
		return false;
	}

	/**
	 * Verifica que la pantalla activa sea el viaje en progreso.
	 * Selector confirmado del dump: app-page-travel-in-progress + button.btn.finish.
	 */
	async waitForTravelInProgressPage(timeout = 15_000): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			await this.switchToWebView(3_000);

			const containerVisible = await driver.$(TRIP_IN_PROGRESS_CONTAINER_SELECTOR).isDisplayed().catch(() => false);
			const finishVisible = await driver.$(TRIP_IN_PROGRESS_FINISH_SELECTOR).isDisplayed().catch(() => false);
			const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');

			if ((containerVisible && finishVisible) || /travel-in-progress|travelnavigation/i.test(url)) {
				return true;
			}

			await driver.pause(500);
		}

		return false;
	}

	/**
	 * Tap en "Empezar Viaje" en TravelToStartPage.
	 * Selector confirmado DOM dump 2026-04-09:
	 *   [BTN] class="btn primary trip-pax-start" text="Empezar Viaje"
	 *   CONTAINER: button.btn.primary.trip-pax-start  ← selector estable, único en el DOM
	 */
	async startTrip(): Promise<void> {
		const onPage = await this.waitForTravelToStartPage();
		if (!onPage) {
			console.warn('[DriverTripNavigationScreen] startTrip: no estamos en TravelToStartPage');
		}

		const webview = await this.switchToWebView();
		if (!webview) {
			console.warn('[DriverTripNavigationScreen] startTrip: sin WebView');
			return;
		}

		const driver = this.getDriver();
		let clicked = false;

		try {
			// Selector estable confirmado: button.btn.primary.trip-pax-start (único en el DOM)
			const specific = await driver.$(DRIVER_ACTION_SELECTORS.startTripPrimaryButton);
			if (await specific.isDisplayed().catch(() => false)) {
				await specific.click();
				clicked = true;
			}

			// Fallback: iterar btn.primary filtrando por texto
			if (!clicked) {
				const allBtns = await driver.$$('button.btn.primary') as unknown as any[];
				for (const btn of allBtns) {
					const text    = (await btn.getText().catch(() => '')).trim();
					const visible = await btn.isDisplayed().catch(() => false);
					if (text === 'Empezar Viaje' && visible) {
						await btn.click();
						clicked = true;
						break;
					}
				}
			}
		} catch (e) {
			console.warn('[DriverTripNavigationScreen] startTrip web click error:', e);
		}

		if (!clicked) {
			console.warn('[DriverTripNavigationScreen] startTrip: botón "Empezar Viaje" no encontrado');
			return;
		}

		// El sistema muestra modal de confirmación "¿Desea empezar el Viaje?"
		await driver.pause(1_500);
		await this.confirmStartTripModal();
	}

	/**
	 * Confirma el modal "¿Desea empezar el Viaje?" con el botón "Si".
	 * Selector confirmado DOM dump 2026-04-09:
	 *   [id="ion-overlay-14"] tag=ion-modal text="¿Desea empezar el Viaje? Si No"
	 *   [BTN] class="btn primary" text="Si"
	 *   [BTN] class="btn-outlined-red" text="No"
	 * Contenedor: app-confirm-modal
	 */
	async confirmStartTripModal(): Promise<void> {
		const driver = this.getDriver();
		await this.switchToWebView();

		let clicked = false;
		try {
			// Buscar dentro del modal de confirmación primero
			const allBtns = await driver.$$('app-confirm-modal button.btn.primary, ion-modal button.btn.primary');
			for (const btn of allBtns) {
				const text    = (await btn.getText().catch(() => '')).trim();
				const visible = await btn.isDisplayed().catch(() => false);
				if (text === 'Si' && visible) {
					await btn.click();
					clicked = true;
					break;
				}
			}

			// Fallback: cualquier btn.primary visible con texto "Si"
			if (!clicked) {
				const fallbackBtns = await driver.$$('button.btn.primary');
				for (const btn of fallbackBtns) {
					const text    = (await btn.getText().catch(() => '')).trim();
					const visible = await btn.isDisplayed().catch(() => false);
					if (text === 'Si' && visible) {
						await btn.click();
						clicked = true;
						break;
					}
				}
			}
		} catch (e) {
			console.warn('[DriverTripNavigationScreen] confirmStartTripModal error:', e);
		}

		if (!clicked) {
			console.warn('[DriverTripNavigationScreen] confirmStartTripModal: botón "Si" no encontrado');
		} else {
			await driver.pause(3_000);
		}
	}

	async simulateRoute(points: GeoPoint[], intervalMs = 2_000): Promise<void> {
		console.warn(`[DriverTripNavigationScreen] GPS mock disabled. Logging ${points.length} route points only.`);
		for (const point of points) {
			console.log(`  -> GPS: ${point.lat}, ${point.lng} ${point.label ?? ''}`);
		}

		await this.pause(intervalMs * points.length);
	}

	/**
	 * Finaliza el viaje en TravelNavigationPage (app-page-travel-in-progress).
	 * Selector confirmado DOM dump 2026-04-09:
	 *   [BTN] class="btn finish" text="Finalizar Viaje"
	 * Contenedor: app-page-travel-in-progress
	 */
	async endTrip(): Promise<void> {
		const onPage = await this.waitForTravelInProgressPage();
		if (!onPage) {
			console.warn('[DriverTripNavigationScreen] endTrip: no estamos en app-page-travel-in-progress');
		}

		const webview = await this.switchToWebView();
		if (!webview) {
			console.warn('[DriverTripNavigationScreen] endTrip: sin WebView');
			return;
		}

		const driver = this.getDriver();
		let clicked = false;

		try {
			// Selector estable confirmado: app-page-travel-in-progress button.btn.finish
			const btn = await driver.$(TRIP_IN_PROGRESS_FINISH_SELECTOR);
			if (await btn.isDisplayed().catch(() => false)) {
				const text = (await btn.getText().catch(() => '')).trim();
				if (text === 'Finalizar Viaje') {
					await btn.click();
					clicked = true;
				}
			}

			// Fallback: buscar por texto en todos los botones
			if (!clicked) {
				const allBtns = await driver.$$('button') as unknown as any[];
				for (const b of allBtns) {
					const text    = (await b.getText().catch(() => '')).trim();
					const visible = await b.isDisplayed().catch(() => false);
					if (text === 'Finalizar Viaje' && visible) {
						await b.click();
						clicked = true;
						break;
					}
				}
			}
		} catch (e) {
			console.warn('[DriverTripNavigationScreen] endTrip error:', e);
		}

		if (!clicked) {
			console.warn('[DriverTripNavigationScreen] endTrip: botón "Finalizar Viaje" no encontrado');
			return;
		}

		await this.pause(3_000);
	}

	/**
	 * Confirma el modal "¿Finalizar Viaje?" con el botón "Si".
	 * Selector confirmado DOM dump 2026-04-09:
	 *   [id="ion-overlay-70"] tag=ion-modal text="¿Finalizar Viaje? Si No"
	 *   [BTN] class="btn primary" text="Si"
	 *   [BTN] class="btn-outlined-red" text="No"
	 *   Contenedor: app-confirm-modal
	 * Mismo patrón que confirmStartTripModal — filtrar btn.primary por texto "Si".
	 */
	async confirmEndTripPopup(): Promise<void> {
		const driver = this.getDriver();
		await this.switchToWebView();

		let clicked = false;
		try {
			// Buscar dentro del modal de confirmación
			const modalBtns = await driver.$$('app-confirm-modal button, ion-modal button') as unknown as any[];
			for (const btn of modalBtns) {
				const text    = (await btn.getText().catch(() => '')).trim();
				const visible = await btn.isDisplayed().catch(() => false);
				if (text === 'Si' && visible) {
					await btn.click();
					clicked = true;
					break;
				}
			}

			// Fallback: cualquier btn.primary con texto "Si"
			if (!clicked) {
				const allBtns = await driver.$$('button.btn.primary') as unknown as any[];
				for (const btn of allBtns) {
					const text    = (await btn.getText().catch(() => '')).trim();
					const visible = await btn.isDisplayed().catch(() => false);
					if (text === 'Si' && visible) {
						await btn.click();
						clicked = true;
						break;
					}
				}
			}
		} catch (e) {
			console.warn('[DriverTripNavigationScreen] confirmEndTripPopup error:', e);
		}

		if (!clicked) {
			console.warn('[DriverTripNavigationScreen] confirmEndTripPopup: botón "Si" no encontrado');
			return;
		}

		await driver.pause(4_000);
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
