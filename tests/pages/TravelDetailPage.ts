/**
 * TravelDetailPage — Carrier Portal
 * Page Object para la pantalla de detalle de un viaje.
 *
 * El detalle del carrier usa Angular sin data-testid estables, así que
 * privilegiamos roles, clases semánticas y textos visibles confirmados.
 */

import type { Page, Locator } from '@playwright/test';
import { getPortalUrl } from '../config/gatewayPortalRuntime';

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
    this.travelStatusBadge = page.locator('app-travel-detail .travel-status, [class*="status-badge"], [class*="travel-state"]').first();
    this.threeDSRedFlag = page.locator('[class*="3ds"], [class*="tds"], [class*="auth-pending"]').first();
    this.retryAuthButton = page.getByRole('button', { name: /Reintentar autenticaci[oó]n/i });
    this.paymentStatus = page.locator('[class*="payment-status"], [class*="payment-section"]').first();
  }

  async goto(travelId: string): Promise<void> {
    // El carrier usa hash routing; el detalle vive bajo la ruta de travels.
    await this.page.goto(`${getPortalUrl('carrier')}/#/home/carrier/travels/${travelId}`);
    await this.page.waitForLoadState('networkidle');
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

  changeCardButton(): Locator {
    return this.page.getByRole('button', { name: /Cambiar tarjeta/i });
  }
}
