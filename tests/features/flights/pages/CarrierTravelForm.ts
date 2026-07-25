import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { BasePage } from '../../../pages/shared/BasePage';

/**
 * CarrierTravelForm — helper de "Crear Viaje" PROPIO de la feature `flights`.
 *
 * Existe porque el POM compartido `NewTravelPageBase.selectAutocompleteOption` usa `fill()`,
 * que NO dispara el autocomplete Angular V1 en UAT (el widget escucha keystrokes reales, no un
 * único evento `input`) — verificado contra UAT v1.72.6 el 2026-07-15. Este helper reproduce el
 * flujo que SÍ funciona en vivo: abrir el dropdown por su placeholder, teclear char-a-char
 * (`pressSequentially`) para activar el debounce, y clickear la opción por texto.
 *
 * Alcance mínimo para vuelos: cliente + destino=aeropuerto. El ORIGEN auto-completa desde la
 * dirección guardada del cliente (no requiere método). Extiende `BasePage` (sustrato Fase A).
 */
export class CarrierTravelForm extends BasePage {
	private readonly clientSelect: Locator;
	private readonly clientSearchInput: Locator;
	private readonly destinationPlaceholder: Locator;
	private readonly addressInput: Locator;

	constructor(page: Page) {
		super(page);
		this.clientSelect = page.locator('#clientSelect');
		this.clientSearchInput = page.getByRole('textbox', { name: 'Usuario a Buscar' });
		this.destinationPlaceholder = page.locator('.multiple-destination-container .placeholder');
		this.addressInput = page.getByRole('textbox', { name: 'Ingrese una dirección' });
	}

	/**
	 * Selecciona el cliente por typeahead. `searchTerm` = término parcial que dispara la búsqueda
	 * (ej. "eman"); `optionText` = etiqueta completa de la opción a clickear (ej.
	 * "Restrepo, Emanuel (+549112404884)"). El origen queda auto-completado por el cliente.
	 */
	async selectClient(searchTerm: string, optionText: string | RegExp): Promise<void> {
		await this.clientSelect.getByText('Seleccione Usuario').first().click();
		await this.clientSearchInput.click();
		await this.clientSearchInput.pressSequentially(searchTerm, { delay: 120 });
		const option = this.page.getByText(optionText).first();
		await expect(option).toBeVisible({ timeout: 10_000 });
		await option.click();
	}

	/**
	 * Setea el destino = aeropuerto (habilita el botón de vuelo). `searchTerm` dispara el typeahead
	 * Google-backed (ej. "ezeiza"); `optionLabel` = opción de aeropuerto (ej. /Aeropuerto Internacional/).
	 */
	async setAirportDestination(searchTerm: string, optionLabel: string | RegExp): Promise<void> {
		await this.destinationPlaceholder.first().click();
		await this.addressInput.click();
		await this.addressInput.pressSequentially(searchTerm, { delay: 130 });
		const option = this.page.getByText(optionLabel).first();
		await expect(option).toBeVisible({ timeout: 12_000 });
		await option.click();
		// El botón de vuelo aparece cuando el destino es aeropuerto.
		await expect(this.page.locator('.btn.btn-primary.rounded-btn.btn-flight-round')).toBeVisible({
			timeout: 10_000
		});
	}
}
