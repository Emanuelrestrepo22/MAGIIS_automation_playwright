import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getPortalUrl } from '../../config/gatewayPortalRuntime';

export class TravelDetailPage {
	constructor(private readonly page: Page) {}

	async goto(travelId: string): Promise<void> {
		await this.page.goto(`${getPortalUrl('carrier')}/travels/${travelId}`);
		await this.page.waitForLoadState('networkidle');
	}

	statusBadge() {
		return this.page.getByTestId('travel-status-badge');
	}

	paymentStatusSection() {
		return this.page.getByTestId('payment-status');
	}

	threeDSPendingFlag() {
		return this.page.getByTestId('3ds-pending-flag');
	}

	retryButton() {
		return this.page.getByRole('button', { name: 'Reintentar autenticacion' });
	}

	changeCardButton() {
		return this.page.getByRole('button', { name: 'Cambiar tarjeta' });
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
