/**
 * ThreeDSModal — Componente compartido
 * Maneja el modal de autenticación 3D Secure de Stripe.
 *
 * El modal renderiza un iframe del banco. En Stripe Test Mode ese iframe
 * expone botones "Complete" y "Fail" para simular el resultado.
 *
 * Componente MAGIIS: ModalThreeDSComponent
 *
 * NOTA: El selector del iframe (data-testid="3ds-iframe") debe validarse
 * contra el DOM real. En Stripe Test Mode el selector puede variar.
 */

import type { Page, Locator, FrameLocator } from '@playwright/test';
import { expect } from '@playwright/test';

export class ThreeDSModal {
  private readonly page: Page;
  readonly overlay: Locator;

  constructor(page: Page) {
    this.page = page;
    // TODO: confirmar data-testid del overlay del modal 3DS
    this.overlay = page.getByTestId('3ds-modal-overlay');
  }

  /**
   * Frame del banco Stripe en test mode.
   * TODO: confirmar selector del iframe — puede ser un role='dialog' o data-testid.
   */
  private getBankFrame(): FrameLocator {
    // TODO: validar selector del iframe contra DOM real
    return this.page.frameLocator('[data-testid="3ds-iframe"]');
  }

  async waitForVisible(timeout = 15_000): Promise<void> {
    await expect(this.overlay).toBeVisible({ timeout });
  }

  async waitForHidden(timeout = 30_000): Promise<void> {
    await expect(this.overlay).toBeHidden({ timeout });
  }

  /**
   * Completa el challenge 3DS con resultado exitoso.
   * Solo disponible en Stripe Test Mode.
   */
  async completeSuccess(): Promise<void> {
    const frame = this.getBankFrame();
    // TODO: confirmar texto exacto del botón en el iframe de Stripe test
    await frame.getByRole('button', { name: 'Complete' }).click();
  }

  /**
   * Completa el challenge 3DS con resultado fallido.
   * Solo disponible en Stripe Test Mode.
   */
  async completeFail(): Promise<void> {
    const frame = this.getBankFrame();
    // TODO: confirmar texto exacto del botón en el iframe de Stripe test
    await frame.getByRole('button', { name: 'Fail' }).click();
  }
}
