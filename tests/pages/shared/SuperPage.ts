// tests/pages/shared/SuperPage.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export abstract class SuperPage {
	protected readonly page: Page;
	protected readonly newTravelLink: Locator;

	constructor(page: Page) {
		this.page = page;
		// La UI actual expone el acceso a crear viaje como link "Nuevo Viaje".
		this.newTravelLink = page.getByRole('banner').getByRole('link', { name: /Nuevo Viaje|New Trip/i });
	}

	async ensureNewTripVisible(): Promise<void> {
		// Mantenemos el nombre histórico del helper, pero la señal real hoy es el link.
		console.log('[SuperPage.ensureNewTripVisible][S00] Esperando link "Nuevo Viaje"...');
		await expect(this.newTravelLink).toBeVisible({ timeout: 10_000 });
		console.log('[SuperPage.ensureNewTripVisible][S01] Link "Nuevo Viaje" visible');
	}

	async ensureSidebarVisible(): Promise<void> {
		await this.ensureNewTripVisible();
	}

	async openNewTravel(): Promise<void> {
		console.log('[SuperPage.openNewTravel][S00] Abriendo formulario de nuevo viaje...');
		await this.newTravelLink.click();
		console.log('[SuperPage.openNewTravel][S01] Click en "Nuevo Viaje" realizado');
	}
}
