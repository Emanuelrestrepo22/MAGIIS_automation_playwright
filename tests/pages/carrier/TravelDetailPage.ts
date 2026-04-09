import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getPortalUrl } from '../../config/gatewayPortalRuntime';

export class TravelDetailPage {
	constructor(private readonly page: Page) {}

	async goto(travelId: string): Promise<void> {
		await this.page.goto(`${getPortalUrl('carrier')}/#/home/carrier/travels/${travelId}`);
		await this.page.waitForLoadState('domcontentloaded');
	}

	statusBadge() {
		// TODO: validar selector real con recorder — magiis-fe no expone data-testid
		// Candidatos: badge de estado dentro de travel-detail component
		return this.page.locator('app-travel-detail .travel-status, [class*="status-badge"], [class*="travel-state"]').first();
	}

	getTravelStatus() {
		return this.statusBadge();
	}

	paymentStatusSection() {
		// TODO: validar con recorder — sección de pago en detalle de viaje
		return this.page.locator('[class*="payment-status"], [class*="payment-section"]').first();
	}

	threeDSPendingFlag() {
		// TODO: validar con recorder — indicador visual de 3DS pendiente
		// magiis-fe no usa data-testid; el flag puede ser un ícono o badge de alerta
		return this.page.locator('[class*="3ds"], [class*="tds"], [class*="auth-pending"]').first();
	}

	get3DSRedFlag() {
		return this.threeDSPendingFlag();
	}

	retryButton() {
		// "Reintentar autenticación" — texto confirmado en magiis-fe source
		return this.page.getByRole('button', { name: /Reintentar autenticaci[oó]n/i });
	}

	getRetryButton() {
		return this.retryButton();
	}

	changeCardButton() {
		// "Cambiar tarjeta" — TODO: confirmar texto exacto con recorder
		return this.page.getByRole('button', { name: /Cambiar tarjeta/i });
	}

	async clickRetry(): Promise<void> {
		await this.retryButton().click();
	}

	async expectStatus(status: string, timeout = 15_000): Promise<void> {
		await expect(this.statusBadge()).toContainText(status, { timeout });
	}

	async expectRedFlagVisible(): Promise<void> {
		await expect(this.threeDSPendingFlag()).toBeVisible({ timeout: 10_000 });
	}

	async expectRedFlagHidden(): Promise<void> {
		await expect(this.threeDSPendingFlag()).toBeHidden({ timeout: 10_000 });
	}
}
