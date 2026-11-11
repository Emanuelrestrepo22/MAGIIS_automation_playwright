/**
 * TripInProgressScreen (POM) — TravelInProgressPage de la app chofer: "Finalizar Viaje" + modal Sí/No.
 * Solo locators + acciones atómicas + estado observable. Sin aserciones de negocio ni navegación.
 * Reemplaza (strangler) la parte end de `driver/DriverTripNavigationScreen`.
 * DOM dump 2026-04-09: contenedor `app-page-travel-in-progress`, botón `button.btn.finish`; modal
 * `app-confirm-modal` con `button.btn.primary` (Sí) y `button.btn-outlined-red` (No).
 */

import type { Browser } from 'webdriverio';
import { I18n, type Locale } from '../../core/I18n';
import { defineLocator, resolveWebSelectors, type Locator } from '../../core/Locator';
import type { MobileSession } from '../../core/MobileSession';
import { Waits } from '../../core/Waits';

export const TRIP_IN_PROGRESS_URL_TOKEN = 'TravelInProgressPage';
/** Variante de URL legado observada en el flujo de navegación (`travel-in-progress`, `travelnavigation`). */
const TRIP_IN_PROGRESS_URL_LEGACY = /travel-in-progress|travelnavigation/i;

export const TRIP_IN_PROGRESS_LOCATORS = {
	page: defineLocator({ id: 'driver.inProgress.page', web: 'app-page-travel-in-progress' }),
	endButton: defineLocator({
		id: 'driver.inProgress.endButton',
		web: 'app-page-travel-in-progress button.btn.finish',
		textKey: 'driver.travelInProgress.endTrip'
	}),
	confirmModal: defineLocator({ id: 'driver.inProgress.confirmModal', web: 'app-confirm-modal' }),
	confirmYes: defineLocator({
		id: 'driver.inProgress.confirmYes',
		web: ['app-confirm-modal button.btn.primary', 'ion-modal button.btn.primary'],
		textKey: 'driver.buttons.confirmYes'
	})
} as const;

export type TripInProgressState = {
	shown: boolean;
	endVisible: boolean;
	confirmModalVisible: boolean;
};

/** Pura: ¿la URL corresponde a la pantalla de viaje en progreso? */
export function isInProgressUrl(url: string): boolean {
	return url.includes(TRIP_IN_PROGRESS_URL_TOKEN) || TRIP_IN_PROGRESS_URL_LEGACY.test(url);
}

/** Pura: la pantalla está mostrada si el contenedor y el CTA son visibles, o la URL coincide. */
export function deriveInProgressShown(input: { url: string; pageVisible: boolean; endVisible: boolean }): boolean {
	return (input.pageVisible && input.endVisible) || isInProgressUrl(input.url);
}

export class TripInProgressScreen {
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

	async readState(): Promise<TripInProgressState> {
		const url = await this.currentUrl();
		const endVisible = await this.isCssVisible(TRIP_IN_PROGRESS_LOCATORS.endButton);
		const pageVisible = await this.isCssVisible(TRIP_IN_PROGRESS_LOCATORS.page);
		return {
			shown: deriveInProgressShown({ url, pageVisible, endVisible }),
			endVisible,
			confirmModalVisible: await this.isConfirmModalVisible()
		};
	}

	async isShown(): Promise<boolean> {
		return (await this.readState()).shown;
	}

	async waitUntilShown(timeoutMs = 15_000): Promise<void> {
		await Waits.until(() => this.isShown(), { timeout: timeoutMs, label: 'TravelInProgressPage visible' });
	}

	async isEndVisible(): Promise<boolean> {
		return this.isCssVisible(TRIP_IN_PROGRESS_LOCATORS.endButton);
	}

	async isConfirmModalVisible(): Promise<boolean> {
		return this.isCssVisible(TRIP_IN_PROGRESS_LOCATORS.confirmModal);
	}

	/** Tap en "Finalizar Viaje"; abre el modal de confirmación. Lanza si el botón no aparece. */
	async tapEndTrip(timeoutMs = 10_000): Promise<void> {
		await Waits.until(() => this.tryTap(TRIP_IN_PROGRESS_LOCATORS.endButton), {
			timeout: timeoutMs,
			label: `tap en ${TRIP_IN_PROGRESS_LOCATORS.endButton.id}`
		});
	}

	async waitForConfirmModal(timeoutMs = 10_000): Promise<void> {
		await Waits.until(() => this.isConfirmModalVisible(), {
			timeout: timeoutMs,
			label: 'modal de confirmación de fin visible'
		});
	}

	/** Tap en "Sí" del modal de confirmación de fin. IRREVERSIBLE: finaliza el viaje (lo gatea el PBO). */
	async confirmEnd(timeoutMs = 10_000): Promise<void> {
		await Waits.until(() => this.tryTap(TRIP_IN_PROGRESS_LOCATORS.confirmYes), {
			timeout: timeoutMs,
			label: `tap en ${TRIP_IN_PROGRESS_LOCATORS.confirmYes.id}`
		});
	}

	/** Espera a que la pantalla ya no esté (viaje finalizado). No decide qué viene después. */
	async waitUntilLeft(timeoutMs = 30_000): Promise<void> {
		await Waits.until(async () => !(await this.isShown()), {
			timeout: timeoutMs,
			label: 'salir de TravelInProgressPage'
		});
	}
}
