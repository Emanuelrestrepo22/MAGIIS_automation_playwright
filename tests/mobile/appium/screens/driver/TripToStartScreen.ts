/**
 * TripToStartScreen (POM) — TravelToStartPage de la app chofer: "Empezar Viaje" + modal Sí/No.
 * Solo locators + acciones atómicas + estado observable. Sin aserciones de negocio ni navegación.
 * Reemplaza (strangler) la parte start de `driver/DriverTripNavigationScreen`.
 * DOM dump 2026-04-09: `button.btn.primary.trip-pax-start`; modal `app-confirm-modal` con
 * `button.btn.primary` (Sí) y `button.btn-outlined-red` (No).
 */

import type { Browser } from 'webdriverio';
import { I18n, type Locale } from '../../core/I18n';
import { defineLocator, resolveWebSelectors, type Locator } from '../../core/Locator';
import type { MobileSession } from '../../core/MobileSession';
import { Waits } from '../../core/Waits';

export const TRIP_TO_START_URL_TOKEN = 'TravelToStartPage';

export const TRIP_TO_START_LOCATORS = {
	startButton: defineLocator({
		id: 'driver.toStart.startButton',
		web: 'button.btn.primary.trip-pax-start',
		textKey: 'driver.travelToStart.startTrip'
	}),
	confirmModal: defineLocator({ id: 'driver.toStart.confirmModal', web: 'app-confirm-modal' }),
	confirmYes: defineLocator({
		id: 'driver.toStart.confirmYes',
		web: ['app-confirm-modal button.btn.primary', 'ion-modal button.btn.primary'],
		textKey: 'driver.buttons.confirmYes'
	})
} as const;

export type TripToStartState = {
	shown: boolean;
	startVisible: boolean;
	confirmModalVisible: boolean;
};

/** Pura: ¿la URL corresponde a TravelToStartPage? (`/navigator/TravelToStartPage;showMapOnlyOnce=null`). */
export function isToStartUrl(url: string): boolean {
	return url.includes(TRIP_TO_START_URL_TOKEN);
}

export class TripToStartScreen {
	private readonly i18n: I18n;

	constructor(
		private readonly session: MobileSession,
		locale: Locale,
		i18n?: I18n
	) {
		this.i18n = i18n ?? new I18n(locale);
	}

	private async web(): Promise<Browser> {
		if ((await this.session.context()) !== 'webview') await this.session.switchContext('webview');
		return this.session.driver;
	}

	private async currentUrl(): Promise<string> {
		const driver = await this.web();
		return driver.execute(() => window.location.href).catch(() => '');
	}

	private async isCssVisible(locator: Locator): Promise<boolean> {
		const driver = await this.web();
		for (const css of resolveWebSelectors(locator)) {
			if (await driver.$(css).isDisplayed().catch(() => false)) return true;
		}
		return false;
	}

	private textMatches(text: string, key: string): boolean {
		try {
			return this.i18n.matches(text, key);
		} catch {
			return false; // key pendiente/faltante: el fallback por texto no aplica
		}
	}

	private async tryTap(locator: Locator): Promise<boolean> {
		const driver = await this.web();
		for (const css of resolveWebSelectors(locator)) {
			const el = driver.$(css);
			if (await el.isDisplayed().catch(() => false)) {
				await el.click();
				return true;
			}
		}
		if (!locator.textKey) return false;
		for (const button of await driver.$$('button')) {
			const text = await button.getText().catch(() => '');
			if (this.textMatches(text, locator.textKey) && (await button.isDisplayed().catch(() => false))) {
				await button.click();
				return true;
			}
		}
		return false;
	}

	async isShown(): Promise<boolean> {
		return isToStartUrl(await this.currentUrl()) || (await this.isCssVisible(TRIP_TO_START_LOCATORS.startButton));
	}

	async waitUntilShown(timeoutMs = 15_000): Promise<void> {
		await Waits.until(() => this.isShown(), { timeout: timeoutMs, label: 'TravelToStartPage visible' });
	}

	async isStartVisible(): Promise<boolean> {
		return this.isCssVisible(TRIP_TO_START_LOCATORS.startButton);
	}

	async isConfirmModalVisible(): Promise<boolean> {
		return this.isCssVisible(TRIP_TO_START_LOCATORS.confirmModal);
	}

	async readState(): Promise<TripToStartState> {
		const url = await this.currentUrl();
		const startVisible = await this.isStartVisible();
		return {
			shown: isToStartUrl(url) || startVisible,
			startVisible,
			confirmModalVisible: await this.isConfirmModalVisible()
		};
	}

	/** Tap en "Empezar Viaje"; abre el modal de confirmación. Lanza si el botón no aparece. */
	async tapStartTrip(timeoutMs = 10_000): Promise<void> {
		await Waits.until(() => this.tryTap(TRIP_TO_START_LOCATORS.startButton), {
			timeout: timeoutMs,
			label: `tap en ${TRIP_TO_START_LOCATORS.startButton.id}`
		});
	}

	async waitForConfirmModal(timeoutMs = 10_000): Promise<void> {
		await Waits.until(() => this.isConfirmModalVisible(), {
			timeout: timeoutMs,
			label: 'modal de confirmación de inicio visible'
		});
	}

	/** Tap en "Sí" del modal de confirmación de inicio. Lanza si el modal no aparece. */
	async confirmStart(timeoutMs = 10_000): Promise<void> {
		await Waits.until(() => this.tryTap(TRIP_TO_START_LOCATORS.confirmYes), {
			timeout: timeoutMs,
			label: `tap en ${TRIP_TO_START_LOCATORS.confirmYes.id}`
		});
	}

	/** Espera a que la pantalla ya no esté (viaje iniciado). No decide qué viene después. */
	async waitUntilLeft(timeoutMs = 20_000): Promise<void> {
		await Waits.until(async () => !(await this.isShown()), {
			timeout: timeoutMs,
			label: 'salir de TravelToStartPage'
		});
	}
}
