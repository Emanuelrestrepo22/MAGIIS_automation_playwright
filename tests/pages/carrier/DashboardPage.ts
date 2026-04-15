// tests/pages/carrier/DashboardPage.ts
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { SuperPage } from '../shared/SuperPage';

export class DashboardPage extends SuperPage {
	constructor(page: Page) {
		super(page);
	}

	// Validación mínima pero confiable del dashboard:
	// 1. confirmar que salimos del login por URL
	// 2. confirmar que el shell principal del portal ya es visible
	async ensureDashboardLoaded(): Promise<void> {
		const dashboardUrl = /#\/home\/(?:carrier|contractor)(?:\/dashboard)?(?:[?#].*)?$/;
		console.log('[DashboardPage.ensureDashboardLoaded][S00] Validando shell /home/carrier o /home/contractor...');
		await expect(this.page).toHaveURL(dashboardUrl, { timeout: 15_000 });
		console.log('[DashboardPage.ensureDashboardLoaded][S01] Shell portal OK');

		console.log('[DashboardPage.ensureDashboardLoaded][S02] Validando ancla básica (Nuevo Viaje)...');
		await this.ensureNewTripVisible();
		console.log('[DashboardPage.ensureDashboardLoaded][S03] Dashboard básico cargado');
	}

	async openNewTravel(): Promise<void> {
		console.log('[DashboardPage.openNewTravel][S00] Navegando al formulario de nuevo viaje...');
		// El portal contractor usa /home/contractor/travel/create; carrier usa /home/carrier/travel/create.
		// Ambos comparten el mismo SPA, por lo que el patrón cubre los dos portales.
		await Promise.all([
			this.page.waitForURL(/\/home\/(carrier|contractor)\/travel\/create/, { timeout: 15_000 }),
			super.openNewTravel()
		]);
		console.log('[DashboardPage.openNewTravel][S01] URL de nuevo viaje confirmada');
	}
}
