import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { getPortalUrl } from '../../config/gatewayPortalRuntime';

function normalizeText(value: string | null | undefined): string {
	return (value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function matchesSearchText(candidate: string, searchText: string): boolean {
	const candidateText = normalizeText(candidate);
	const searchTokens = normalizeText(searchText)
		.split(' ')
		.map((token) => token.trim())
		.filter(Boolean);

	return searchTokens.every((token) => candidateText.includes(token));
}

export class TravelManagementPage {
	constructor(private readonly page: Page) {}

	async goto(): Promise<void> {
		await this.page.goto(`${getPortalUrl('carrier')}/#/home/carrier/travel/dashboard`);
		await this.page.waitForLoadState('domcontentloaded');
	}

	/** Abre la pestaña de viajes programados dentro de gestion de viajes. */
	async openScheduledTrips(): Promise<void> {
		const scheduledTripsLink = this.page.getByRole('link', { name: /^Programados \(\d+\)$/i });
		await expect(scheduledTripsLink).toBeVisible({ timeout: 10_000 });
		await scheduledTripsLink.click();
	}

	/** Abre el primer viaje programado visible en la lista. */
	async openFirstScheduledTripDetail(): Promise<void> {
		// TODO: el recorder usa nth(3) sobre buttons; reemplazar por un selector estable cuando exista.
		const openButton = this.page.locator('button').nth(3);
		await expect(openButton).toBeVisible({ timeout: 10_000 });
		await openButton.click();
	}

	private async tripRow(passenger: string, destination?: string) {
		const rows = this.page.locator('tr');
		const count = await rows.count();

		for (let index = 0; index < count; index += 1) {
			const row = rows.nth(index);
			const text = normalizeText(await row.textContent().catch(() => ''));

			if (!matchesSearchText(text, passenger)) {
				continue;
			}

			if (destination && !matchesSearchText(text, destination)) {
				continue;
			}

			return row;
		}

		return rows.first();
	}

	porAsignarColumn() {
		return this.page.getByTestId('column-por-asignar');
	}

	async expectPassengerInPorAsignar(passenger: string, destination?: string): Promise<void> {
		const row = await this.tripRow(passenger, destination);
		await expect(row).toBeVisible({ timeout: 10_000 });

		for (const token of normalizeText(passenger).split(' ').filter(Boolean)) {
			await expect(row).toContainText(token, { timeout: 10_000 });
		}
	}

	async openDetailForPassenger(passenger: string, destination?: string): Promise<void> {
		const row = await this.tripRow(passenger, destination);
		await expect(row).toBeVisible({ timeout: 10_000 });
		await row.locator('.action-btn.color-gray').first().click();
	}
}
