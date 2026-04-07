// tests/pages/DashboardPage.ts
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { SuperPage } from './SuperPage';

export class DashboardPage extends SuperPage {
	constructor(page: Page) {
		super(page);
	}

	// Validación mínima pero confiable del dashboard:
	// 1. confirmar que salimos del login por URL
	// 2. confirmar que el shell principal del portal ya es visible
	async ensureDashboardLoaded(): Promise<void> {
		console.log('[DashboardPage.ensureDashboardLoaded][S00] Validando URL /dashboard...');
		await expect(this.page).toHaveURL(/.*dashboard/, { timeout: 15_000 });
		console.log('[DashboardPage.ensureDashboardLoaded][S01] URL /dashboard OK');

		console.log('[DashboardPage.ensureDashboardLoaded][S02] Validando ancla básica (Nuevo Viaje)...');
		await this.ensureNewTripVisible();
		console.log('[DashboardPage.ensureDashboardLoaded][S03] Dashboard básico cargado');
	}

	async openNewTravel(): Promise<void> {
		console.log('[DashboardPage.openNewTravel][S00] Navegando al formulario de nuevo viaje...');
		await Promise.all([
			this.page.waitForURL(/\/home\/carrier\/travel\/create/, { timeout: 15_000 }),
			super.openNewTravel()
		]);
		console.log('[DashboardPage.openNewTravel][S01] URL de nuevo viaje confirmada');
	}
}
