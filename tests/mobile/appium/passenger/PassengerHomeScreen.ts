/**
 * PassengerHomeScreen
 * Home shell and profile mode switch in the Passenger App.
 */

import { AppiumSessionBase } from '../base/AppiumSessionBase';
import type { PassengerProfileMode } from '../../../features/gateway-pg/contracts/gateway-pg.types';

export class PassengerHomeScreen extends AppiumSessionBase {
	private readonly homeToggleSelector =
		'#main-content > app-navigator > ion-content > ion-tabs > div > ion-router-outlet > app-home > div.header-menu > div > ion-toggle';

	private readonly homeModeLabelSelector =
		'#main-content > app-navigator > ion-content > ion-tabs > div > ion-router-outlet > app-home > div.header-menu > div > span';

	private normalize(value: string): string {
		return value
			.replace(/\s+/g, ' ')
			.trim()
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '');
	}

	private async readModeLabel(): Promise<string> {
		return this.executeInWebView((primarySelector: string, fallbackSelector: string) => {
			const selectors = [primarySelector, fallbackSelector];

			for (const selector of selectors) {
				const label = document.querySelector(selector);
				const text = (label?.textContent ?? '').replace(/\s+/g, ' ').trim();
				if (text) {
					return text;
				}
			}

			return '';
		}, this.homeModeLabelSelector, '.toggle_label');
	}

	private async isToggleDisabled(): Promise<boolean> {
		return this.executeInWebView((selector: string) => {
			const toggle = document.querySelector(selector) as HTMLElement | null;
			if (!toggle) {
				return true;
			}

			return Boolean((toggle as any).disabled ?? toggle.getAttribute('disabled') !== null);
		}, this.homeToggleSelector);
	}

	/**
	 * Opens the home shell from any tab that still exposes the bottom navigation.
	 */
	async openHome(): Promise<void> {
		const ready =
			(await this.waitForWebUrlContains('HomePage', 5_000)) ||
			(await this.waitForWebText('Modo Personal', 5_000, true)) ||
			(await this.waitForWebText('Compañía', 5_000, true));

		if (ready) {
			return;
		}

		const currentUrl = await this.executeInWebView(() => window.location.href).catch(() => '');
		if (currentUrl.includes('/cards')) {
			const clickedBack = await this.executeInWebView((selectors: string[]) => {
				const isVisible = (element: Element): boolean => {
					const html = element as HTMLElement;
					const rect = html.getBoundingClientRect();
					const style = window.getComputedStyle(html);
					return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
				};

				for (const selector of selectors) {
					const element = document.querySelector(selector) as HTMLElement | null;
					if (element && isVisible(element)) {
						element.click();
						return true;
					}
				}

				return false;
			}, ['app-cards .arrow-back', 'app-cards ion-icon[aria-label="arrow back outline"]']);

			if (clickedBack) {
				const onHomeAfterBack =
					(await this.waitForWebUrlContains('HomePage', 10_000)) ||
					(await this.waitForWebText('Modo Personal', 10_000, true)) ||
					(await this.waitForWebText('Compañía', 10_000, true));

				if (onHomeAfterBack) {
					return;
				}
			}
		}

		const tapped = await this.tapWebText('Inicio', 5_000, true);
		if (!tapped) {
			throw new Error('PassengerHomeScreen.openHome() - "Inicio" tab not found');
		}

		const onHome =
			(await this.waitForWebUrlContains('HomePage', 10_000)) ||
			(await this.waitForWebText('Modo Personal', 10_000, true)) ||
			(await this.waitForWebText('Compañía', 10_000, true));

		if (!onHome) {
			throw new Error('PassengerHomeScreen.openHome() - home screen did not load');
		}
	}

	/**
	 * Reads the visible passenger profile mode from the home shell.
	 */
	async getProfileMode(): Promise<PassengerProfileMode | 'unknown'> {
		const label = await this.readModeLabel();
		const normalized = this.normalize(label);

		if (normalized.includes('modo personal')) {
			return 'personal';
		}

		if (normalized.includes('compania')) {
			return 'business';
		}

		return 'unknown';
	}

	/**
	 * Ensures the app is in the requested profile mode before continuing the flow.
	 */
	async ensureProfileMode(mode: PassengerProfileMode): Promise<void> {
		await this.openHome();

		const currentMode = await this.getProfileMode();
		if (currentMode === mode) {
			return;
		}

		if (await this.isToggleDisabled()) {
			throw new Error(`PassengerHomeScreen.ensureProfileMode() - profile toggle is disabled, cannot switch to ${mode}`);
		}

		const clicked = await this.executeInWebView((selector: string) => {
			const toggle = document.querySelector(selector) as HTMLElement | null;
			if (!toggle) {
				return false;
			}

			toggle.click();
			return true;
		}, this.homeToggleSelector);

		if (!clicked) {
			throw new Error(`PassengerHomeScreen.ensureProfileMode() - profile toggle not found for ${mode}`);
		}

		const expectedLabel = mode === 'personal' ? 'Modo Personal' : 'Compañía';
		const ready = await this.waitForWebText(expectedLabel, 10_000, true);
		if (!ready) {
			throw new Error(`PassengerHomeScreen.ensureProfileMode() - did not switch to ${mode}`);
		}
	}
}
