import type { Page } from '@playwright/test';
import { getPortalUrl } from '../../config/gatewayPortalRuntime';

export type NewTravelFormInput = {
	passenger: string;
	origin: string;
	destination: string;
	cardLast4: string;
};

export class NewTravelPage {
	constructor(private readonly page: Page) {}

	async goto(): Promise<void> {
		await this.page.goto(`${getPortalUrl('carrier')}/travels/new`);
		await this.page.waitForLoadState('networkidle');
	}

	async searchPassenger(name: string): Promise<void> {
		await this.page.getByLabel('Pasajero').fill(name);
		await this.page.getByRole('option', { name }).first().click();
	}

	async setOrigin(address: string): Promise<void> {
		await this.page.getByLabel('Origen').fill(address);
		await this.page.getByRole('option').first().click();
	}

	async setDestination(address: string): Promise<void> {
		await this.page.getByLabel('Destino').fill(address);
		await this.page.getByRole('option').first().click();
	}

	async selectCardByLast4(last4: string): Promise<void> {
		await this.page.getByLabel('Forma de pago').click();
		await this.page.getByText(`•••• ${last4}`).click();
	}

	async submit(): Promise<void> {
		await this.page.getByRole('button', { name: 'Crear viaje' }).click();
	}

	async fillMinimum(opts: NewTravelFormInput): Promise<void> {
		await this.searchPassenger(opts.passenger);
		await this.setOrigin(opts.origin);
		await this.setDestination(opts.destination);
		await this.selectCardByLast4(opts.cardLast4);
	}
}
