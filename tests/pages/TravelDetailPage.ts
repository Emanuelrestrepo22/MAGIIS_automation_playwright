/**
 * TravelDetailPage — Carrier Portal
 * Page Object para la pantalla de detalle de un viaje.
 *
 * NOTA: Selectores con TODO deben validarse contra el DOM real.
 */

import type { Page, Locator } from '@playwright/test';

export class TravelDetailPage {
  private readonly page: Page;

  // Sección estado del viaje
  readonly travelStatusBadge: Locator;

  // Sección forma de pago — 3DS
  readonly threeDSRedFlag: Locator;
  readonly retryAuthButton: Locator;
  readonly paymentStatus: Locator;

  constructor(page: Page) {
    this.page = page;
    // TODO: confirmar data-testid con equipo de desarrollo
    this.travelStatusBadge = page.getByTestId('travel-status-badge');
    this.threeDSRedFlag    = page.getByTestId('3ds-pending-flag');
    this.retryAuthButton   = page.getByRole('button', { name: 'Reintentar autenticación' });
    this.paymentStatus     = page.getByTestId('payment-status');
  }

  async goto(travelId: string): Promise<void> {
    // TODO: confirmar ruta exacta del detalle de viaje en carrier portal
    await this.page.goto(`/carrier/#/travels/${travelId}`);
  }

  async getTravelStatus(): Promise<Locator> {
    return this.travelStatusBadge;
  }

  async get3DSRedFlag(): Promise<Locator> {
    return this.threeDSRedFlag;
  }

  async getRetryButton(): Promise<Locator> {
    return this.retryAuthButton;
  }

  async clickRetry(): Promise<void> {
    await this.retryAuthButton.click();
  }
}
