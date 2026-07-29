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
	//
	// `timeout` configurable vía LOGIN_DASHBOARD_TIMEOUT (default 20s). Existe porque
	// LOGIN_GOTO_TIMEOUT cubre SOLO la fase `goto` de LoginPage, y en `apps-test` degradado el
	// cuello de botella real es esta espera: la campaña Authorize del 2026-07-29 falló en masa
	// con `[login:dashboard] Timeout 20000ms exceeded` AUNQUE se corrió con
	// LOGIN_GOTO_TIMEOUT=60000 — subir esa variable no tenía efecto acá.
	async ensureDashboardLoaded(timeout = Number(process.env.LOGIN_DASHBOARD_TIMEOUT) || 20_000): Promise<void> {
		const dashboardUrl = /#\/home\/(?:carrier|contractor)(?:\/dashboard)?(?:[?#].*)?$/;
		console.log('[DashboardPage.ensureDashboardLoaded][S00] Validando shell /home/carrier o /home/contractor...');
		// Hash-routed SPA: `expect(page).toHaveURL` a veces NO dispara aunque la URL ya matchee
		// (el navigation event no se emite en cambios de hash). Se poll-ea `page.url()` en vivo
		// (mismo patrón que global-setup.multi-role.ts) para no flakear en el login.
		await expect
			.poll(() => this.page.url(), { timeout, message: `dashboard URL no alcanzada (patrón ${dashboardUrl})` })
			.toMatch(dashboardUrl);
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
