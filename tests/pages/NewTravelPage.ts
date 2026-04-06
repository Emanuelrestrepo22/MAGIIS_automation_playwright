/**
 * NewTravelPage — Carrier Portal
 * Page Object para el formulario de alta de viaje.
 *
 * NOTA: Selectores marcados con TODO deben validarse contra el DOM real
 * antes de remover los comentarios. No inferir sin evidencia.
 */

import type { Page, Locator } from '@playwright/test';

export class NewTravelPage {
  private readonly page: Page;

  // TODO: validar selector — puede ser getByLabel, getByRole o getByTestId
  private readonly passengerInput: Locator;
  private readonly originInput: Locator;
  private readonly destinationInput: Locator;
  private readonly paymentMethodSelector: Locator;
  private readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // TODO: confirmar con DOM real — getByLabel('Pasajero') o getByTestId('passenger-search')
    this.passengerInput = page.getByLabel('Pasajero');
    // TODO: confirmar con DOM real
    this.originInput = page.getByLabel('Origen');
    this.destinationInput = page.getByLabel('Destino');
    // TODO: confirmar selector del dropdown de forma de pago
    this.paymentMethodSelector = page.getByLabel('Forma de pago');
    // TODO: confirmar texto exacto del botón
    this.submitButton = page.getByRole('button', { name: 'Crear viaje' });
  }

  async goto(): Promise<void> {
    // TODO: verificar ruta exacta del carrier portal (/carrier/#/travels/new o similar)
    await this.page.goto('/carrier/#/travels/new');
  }

  async searchPassenger(name: string): Promise<void> {
    await this.passengerInput.fill(name);
    // TODO: confirmar si el autocomplete es un role='option' o usa testId
    await this.page.getByRole('option', { name }).click();
  }

  async setOrigin(address: string): Promise<void> {
    await this.originInput.fill(address);
    // TODO: confirmar comportamiento del autocompletado de dirección
    await this.page.getByRole('option').first().click();
  }

  async setDestination(address: string): Promise<void> {
    await this.destinationInput.fill(address);
    await this.page.getByRole('option').first().click();
  }

  /**
   * Selecciona una tarjeta guardada por sus últimos 4 dígitos.
   * @param last4 - últimos 4 dígitos de la tarjeta (ej: '9235')
   */
  async selectCard(last4: string): Promise<void> {
    await this.paymentMethodSelector.click();
    // TODO: confirmar formato del texto de la tarjeta en el dropdown (•••• XXXX o similar)
    await this.page.getByText(`•••• ${last4}`).click();
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
