// tests/pages/DashboardPage.ts
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { SuperPage } from './SuperPage.bak';

export class DashboardPage extends SuperPage {
	constructor(page: Page) {
		super(page);
	}

	// Versión básica: URL + ancla "New Trip"
	async ensureDashboardLoaded(): Promise<void> {
		console.log('[DashboardPage.ensureDashboardLoaded][S00] Validando URL /dashboard...');
		await expect(this.page).toHaveURL(/.*dashboard/, { timeout: 15_000 });
		console.log('[DashboardPage.ensureDashboardLoaded][S01] URL /dashboard OK');

		console.log('[DashboardPage.ensureDashboardLoaded][S02] Validando ancla básica (New Trip)...');
		await this.ensureSidebarVisible();
		console.log('[DashboardPage.ensureDashboardLoaded][S03] Dashboard básico cargado');
	}
}
