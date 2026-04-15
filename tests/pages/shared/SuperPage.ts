// tests/pages/shared/SuperPage.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export abstract class SuperPage {
	protected readonly page: Page;
	private readonly bannerNewTravelLink: Locator;
	private readonly bannerNewTravelText: Locator;
	private readonly sidebarNewTravelLink: Locator;

	constructor(page: Page) {
		this.page = page;
		// Carrier: link en el banner.
		// Contractor: a veces se pinta como texto/cta en el banner.
		// Mantenemos candidatos separados para evitar strict mode con locators compuestos.
		this.bannerNewTravelLink = page
			.getByRole('banner')
			.getByRole('link', { name: /Nuevo Viaje|New Trip/i })
			.first();
		this.bannerNewTravelText = page
			.getByRole('banner')
			.getByText(/Nuevo Viaje|New Trip/i)
			.first();
		this.sidebarNewTravelLink = page
			.getByRole('navigation')
			.getByRole('link', { name: /Nuevo Viaje/i })
			.first();
	}

	private async resolveNewTravelLink(): Promise<Locator> {
		const candidates = [this.bannerNewTravelLink, this.bannerNewTravelText, this.sidebarNewTravelLink];

		for (const candidate of candidates) {
			if (await candidate.isVisible().catch(() => false)) {
				return candidate;
			}
		}

		return this.bannerNewTravelLink;
	}

	async ensureNewTripVisible(): Promise<void> {
		// Mantenemos el nombre histÃ³rico del helper, pero la seÃ±al real hoy es el link.
		console.log('[SuperPage.ensureNewTripVisible][S00] Esperando link "Nuevo Viaje"...');
		const newTravelLink = await this.resolveNewTravelLink();
		await expect(newTravelLink).toBeVisible({ timeout: 10_000 });
		console.log('[SuperPage.ensureNewTripVisible][S01] Link "Nuevo Viaje" visible');
	}

	async ensureSidebarVisible(): Promise<void> {
		await this.ensureNewTripVisible();
	}

	async openNewTravel(): Promise<void> {
		console.log('[SuperPage.openNewTravel][S00] Abriendo formulario de nuevo viaje...');
		const newTravelLink = await this.resolveNewTravelLink();
		await newTravelLink.click();
		console.log('[SuperPage.openNewTravel][S01] Click en "Nuevo Viaje" realizado');
	}
}
