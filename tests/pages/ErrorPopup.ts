/**
 * ErrorPopup — Componente compartido
 * Pop-up de error que aparece tras un fallo de autenticación 3DS u otros errores de pago.
 *
 * NOTA: Selectores con TODO deben validarse contra el DOM real.
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class ErrorPopup {
  private readonly page: Page;
  readonly container: Locator;
  private readonly messageText: Locator;
  private readonly acceptButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // TODO: confirmar data-testid del contenedor del pop-up
    this.container    = page.getByTestId('3ds-error-popup');
    this.messageText  = page.getByTestId('3ds-error-popup-message');
    // TODO: confirmar texto del botón de aceptar (puede ser "Cerrar", "Aceptar", "OK")
    this.acceptButton = page.getByRole('button', { name: 'Aceptar' });
  }

  async waitForVisible(timeout = 10_000): Promise<void> {
    await expect(this.container).toBeVisible({ timeout });
  }

  async getMessage(): Promise<string | null> {
    return this.messageText.textContent();
  }

  async accept(): Promise<void> {
    await this.acceptButton.click();
  }
}
