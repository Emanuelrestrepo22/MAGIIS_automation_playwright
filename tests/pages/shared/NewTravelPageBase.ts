import type { Locator, Page } from '@playwright/test';
import { getPortalUrl } from '../../config/gatewayPortalRuntime';

export type NewTravelFormInput = {
	passenger: string;
	origin: string;
	destination: string;
	cardLast4: string;
};

/**
 * Base compartida para el formulario de alta de viaje del carrier.
 * Centraliza locators y acciones para evitar duplicación entre páginas
 * con distintos puntos de entrada.
 */
export abstract class NewTravelPageBase {
	protected readonly page: Page;
	protected readonly passengerInput: Locator;
	protected readonly originInput: Locator;
	protected readonly destinationInput: Locator;
	protected readonly paymentMethodSelector: Locator;
	protected readonly submitButton: Locator;

	constructor(page: Page) {
		this.page = page;
		// Selectores validados contra magiis-fe source (Angular formcontrolname = atributo DOM estable)
		this.passengerInput = page.locator('#passenger');
		this.originInput    = page.locator('input[formcontrolname="origin"]');
		this.destinationInput = page.locator('input[formcontrolname="destination"]');
		this.paymentMethodSelector = page.locator('#add_travel_payment_methods');
		// "Registrar" confirmado en add-travel.component.html
		this.submitButton = page.getByRole('button', { name: 'Registrar' });
	}

	async goto(): Promise<void> {
		// Ruta confirmada en router magiis-fe: /home/carrier/travel/create
		await this.page.goto(`${getPortalUrl('carrier')}/#/home/carrier/travel/create`);
		await this.ensureLoaded();
	}

	async ensureLoaded(): Promise<void> {
		await this.passengerInput.waitFor({ state: 'visible', timeout: 15_000 });
	}

	async searchPassenger(name: string): Promise<void> {
		// #passenger es un <select> con opciones de pasajeros
		await this.passengerInput.selectOption({ label: name });
	}

	async setOrigin(address: string): Promise<void> {
		// El formulario pre-carga la dirección "home" del pasajero como origen por defecto.
		// Si hay una dirección pre-cargada, se limpia con el botón X antes de ingresar la nueva.
		const clearBtn = this.page.locator('input[formcontrolname="origin"]')
			.locator('..')
			.locator('button[aria-label="Clear"], button.clear-btn, i.fa-times, span.ng-clear-wrapper')
			.first();

		if (await clearBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
			await clearBtn.click();
		} else {
			await this.originInput.clear();
		}

		await this.originInput.fill(address);
		await this.page.getByRole('option').filter({ hasText: address }).first().click();
	}

	async setDestination(address: string): Promise<void> {
		await this.destinationInput.fill(address);
		await this.page.getByRole('option').filter({ hasText: address }).first().click();
	}

	async selectCardByLast4(last4: string): Promise<void> {
		// Seleccionar CREDIT_CARD activa la lista de tarjetas guardadas
		await this.paymentMethodSelector.selectOption('CREDIT_CARD');
		await this.page.getByText(`•••• ${last4}`).click();
	}

	async submit(): Promise<void> {
		await this.submitButton.click();
	}

	async fillMinimum(opts: NewTravelFormInput): Promise<void> {
		await this.searchPassenger(opts.passenger);
		await this.setOrigin(opts.origin);
		await this.setDestination(opts.destination);
		await this.selectCardByLast4(opts.cardLast4);
	}
}
