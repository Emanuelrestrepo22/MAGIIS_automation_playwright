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
		// Detectamos el portal activo desde la URL actual para que este POM funcione
		// tanto en sesiones carrier como contractor sin cambiar el API existente.
		// Si no hay URL cargada aún (about:blank) caemos a carrier como default.
		const currentUrl = this.page.url();
		const portal = currentUrl.includes('/contractor') ? 'contractor' : 'carrier';
		const baseUrl = getPortalUrl('carrier'); // ambos portales comparten el mismo origen
		await this.page.goto(`${baseUrl}/#/home/${portal}/travel/dashboard`);
		await this.page.waitForLoadState('domcontentloaded');
	}

	/** Abre la pestaña de viajes programados dentro de gestion de viajes. */
	async openScheduledTrips(): Promise<void> {
		// Acepta "Programados (N)" o "Programados" sin contador.
		const scheduledTripsLink = this.page.getByRole('link', { name: /Programados/i }).first();
		await expect(scheduledTripsLink).toBeVisible({ timeout: 10_000 });
		await scheduledTripsLink.click();
	}

	/** Abre el primer viaje programado visible en la lista. */
	async openFirstScheduledTripDetail(): Promise<void> {
		// Intenta navegar desde la primera fila de datos (tbody tr).
		// Precondición: haber llamado openScheduledTrips() y que exista al menos 1 viaje programado.
		const firstRow = this.page.locator('tbody tr').first();
		await expect(firstRow).toBeVisible({ timeout: 10_000 });

		// Buscar link de detalle primero (href con travelId).
		const detailLink = firstRow.locator('a[href*="travelId"], a[href*="/travels/"]').first();
		if (await detailLink.count()) {
			await detailLink.click();
			return;
		}

		// Último recurso: último botón de la primera fila (patrón de openDetailForPassenger).
		const actionBtn = firstRow.getByRole('button').last();
		await expect(actionBtn).toBeVisible({ timeout: 10_000 });
		await actionBtn.click();
	}

	private async tripRow(passenger: string, destination?: string) {
		const rows = this.page.locator('tr');
		const deadline = Date.now() + 30_000;

		while (Date.now() < deadline) {
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

			await this.page.waitForTimeout(500);
		}

		throw new Error(`No travel row found for passenger "${passenger}"${destination ? ` and destination "${destination}"` : ''}`);
	}

	porAsignarColumn() {
		return this.page.getByTestId('column-por-asignar');
	}

	async expectPassengerInPorAsignar(passenger: string, destination?: string, status?: string): Promise<void> {
		const row = await this.tripRow(passenger, destination);
		await expect(row).toBeVisible({ timeout: 10_000 });
		await expect.poll(
			async () => {
				const text = normalizeText(await row.textContent().catch(() => ''));
				return matchesSearchText(text, passenger) && (!destination || matchesSearchText(text, destination));
			},
			{ timeout: 10_000 }
		).toBe(true);

		if (status) {
			await expect(row).toContainText(status, { timeout: 10_000 });
		}
	}

	async openDetailForPassenger(passenger: string, destination?: string): Promise<void> {
		const row = await this.tripRow(passenger, destination);
		await expect(row).toBeVisible({ timeout: 10_000 });
		const detailLink = row.locator('a[href*="/travels/"]').first();

		if (await detailLink.count()) {
			await expect(detailLink).toBeVisible({ timeout: 10_000 });
			await detailLink.click();
			return;
		}

		const actionButtons = row.getByRole('button');

		if (await actionButtons.count()) {
			const target = actionButtons.last();
			await expect(target).toBeVisible({ timeout: 10_000 });
			await target.click();
			return;
		}

		await row.locator('.action-btn.color-gray').first().click();
	}
}
