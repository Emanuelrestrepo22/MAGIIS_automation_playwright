// tests/pages/SuperPage.ts
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export abstract class SuperPage {
	protected readonly page: Page;
	protected readonly sidebar: Locator;

	constructor(page: Page) {
		this.page = page;
		// Ancla básica del dashboard: botón "New Trip" del header
		// HTML: <button ... aria-label="New Trip" ...>
		this.sidebar = page.locator('button[aria-label="New Trip"]');
	}

	async ensureSidebarVisible(): Promise<void> {
		console.log('[SuperPage.ensureSidebarVisible][S00] Esperando botón "New Trip"...');
		await expect(this.sidebar).toBeVisible({ timeout: 10_000 });
		console.log('[SuperPage.ensureSidebarVisible][S01] Botón "New Trip" visible');
	}
}
