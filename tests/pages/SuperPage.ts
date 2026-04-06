import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export abstract class SuperPage {
	protected readonly page: Page;
	protected readonly sidebar: Locator;

	constructor(page: Page) {
		this.page = page;
		// "New Trip" funciona hoy como ancla mínima de que el shell principal del portal cargó.
		this.sidebar = page.locator('button[aria-label="New Trip"]');
	}

	async ensureSidebarVisible(): Promise<void> {
		// Método compartido por páginas que dependen del dashboard base del carrier portal.
		console.log('[SuperPage.ensureSidebarVisible][S00] Esperando boton "New Trip"...');
		await expect(this.sidebar).toBeVisible({ timeout: 10_000 });
		console.log('[SuperPage.ensureSidebarVisible][S01] Boton "New Trip" visible');
	}
}
