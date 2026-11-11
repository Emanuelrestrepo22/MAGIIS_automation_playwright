/**
 * TripConfirmScreen (POM) — TravelConfirmPage de la app chofer: oferta de viaje con CTA "Aceptar".
 * Solo locators + acciones atómicas + estado observable. Sin aserciones de negocio ni navegación.
 * Reemplaza (strangler) a `driver/DriverTripRequestScreen` en lo que toca a la oferta.
 * Selectores: `driver/DriverFlowSelectors` (DRIVER_CHECKPOINT_SELECTORS.confirm / DRIVER_ACTION_SELECTORS),
 * DOM dump 2026-10-20: `<app-page-travel-confirm> ... <button class="btn primary">Accept</button>`.
 */

import type { Browser } from 'webdriverio';
import { I18n, type Locale } from '../../core/I18n';
import { defineLocator, resolveWebSelectors, type Locator } from '../../core/Locator';
import type { MobileSession } from '../../core/MobileSession';
import { Waits } from '../../core/Waits';

export const TRIP_CONFIRM_URL_TOKEN = 'TravelConfirmPage';

export const TRIP_CONFIRM_LOCATORS = {
	page: defineLocator({ id: 'driver.confirm.page', web: 'app-page-travel-confirm' }),
	/** Único CTA del footer; independiente de idioma. El texto i18n es último recurso. */
	acceptButton: defineLocator({
		id: 'driver.confirm.acceptButton',
		web: 'app-page-travel-confirm button.btn.primary',
		textKey: 'driver.buttons.accept'
	})
} as const;

/** Estado observable de la pantalla (sin interpretación de negocio). */
export type TripConfirmState = {
	shown: boolean;
	acceptVisible: boolean;
	/** `travelId` embebido en la URL (`;data={"travelId":61545,...}`), si hay. */
	travelId: string | null;
};

/** Pura: extrae `"travelId":<n>` de la URL de TravelConfirmPage. */
export function parseTravelIdFromUrl(url: string): string | null {
	const match = /"travelId":(\d+)/.exec(url);
	return match ? match[1]! : null;
}

/** Pura: ¿la URL corresponde a esta pantalla? */
export function isConfirmUrl(url: string): boolean {
	return url.includes(TRIP_CONFIRM_URL_TOKEN);
}

export class TripConfirmScreen {
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
		return isConfirmUrl(await this.currentUrl()) || (await this.isCssVisible(TRIP_CONFIRM_LOCATORS.page));
	}

	async waitUntilShown(timeoutMs = 15_000): Promise<void> {
		await Waits.until(() => this.isShown(), { timeout: timeoutMs, label: 'TravelConfirmPage visible' });
	}

	async isAcceptVisible(): Promise<boolean> {
		return this.isCssVisible(TRIP_CONFIRM_LOCATORS.acceptButton);
	}

	async readTravelId(): Promise<string | null> {
		return parseTravelIdFromUrl(await this.currentUrl());
	}

	/** Texto visible de la oferta (incluye el código `<n>-<canal>` del encabezado, p. ej. «5282-W»). */
	async readVisibleText(): Promise<string> {
		const driver = await this.web();
		return driver.execute(() => document.body?.innerText ?? '').catch(() => '');
	}

	async readState(): Promise<TripConfirmState> {
		const url = await this.currentUrl();
		const acceptVisible = await this.isAcceptVisible();
		const shown = isConfirmUrl(url) || (await this.isCssVisible(TRIP_CONFIRM_LOCATORS.page));
		return { shown, acceptVisible, travelId: parseTravelIdFromUrl(url) };
	}

	/** Tap real en "Aceptar" (Angular no responde a click por `execute`). Lanza si no aparece. */
	async acceptOffer(timeoutMs = 5_000): Promise<void> {
		await Waits.until(() => this.tryTap(TRIP_CONFIRM_LOCATORS.acceptButton), {
			timeout: timeoutMs,
			label: `tap en ${TRIP_CONFIRM_LOCATORS.acceptButton.id}`
		});
	}

	/** Espera a que la pantalla ya no esté (p. ej. tras aceptar). No decide qué viene después. */
	async waitUntilLeft(timeoutMs = 15_000): Promise<void> {
		await Waits.until(async () => !(await this.isShown()), { timeout: timeoutMs, label: 'salir de TravelConfirmPage' });
	}
}
