import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getPortalUrl } from '../../config/gatewayPortalRuntime';

export class TravelManagementPage {
	constructor(private readonly page: Page) {}

	async goto(): Promise<void> {
		await this.page.goto(`${getPortalUrl('carrier')}/travels`);
		await this.page.waitForLoadState('networkidle');
	}

	porAsignarColumn() {
		return this.page.getByTestId('column-por-asignar');
	}

	async expectPassengerInPorAsignar(passenger: string): Promise<void> {
		const column = this.porAsignarColumn();
		await expect(column).toBeVisible({ timeout: 10_000 });
		await expect(column.getByText(passenger)).toBeVisible({ timeout: 10_000 });
	}
}
