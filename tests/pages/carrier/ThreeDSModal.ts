import type { Frame, FrameLocator, Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

const THREE_DS_MODAL_SELECTOR = 'iframe[src*="three-ds-2-challenge"]';
const THREE_DS_CHALLENGE_FRAME_SELECTOR = 'iframe[name="stripe-challenge-frame"]';
const THREE_DS_TIMEOUT = 60_000;
const THREE_DS_STABILIZATION_DELAY = 10_000;

export class ThreeDSModal {
  protected readonly page: Page;
  readonly overlay: Locator;

  constructor(page: Page) {
    this.page = page;
    this.overlay = page.locator(THREE_DS_MODAL_SELECTOR);
  }

  protected getBankFrame(): FrameLocator {
    return this.page
      .frameLocator(THREE_DS_MODAL_SELECTOR)
      .frameLocator(THREE_DS_CHALLENGE_FRAME_SELECTOR);
  }

  private async waitForChallengeFrame(timeout = THREE_DS_TIMEOUT): Promise<Frame> {
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const frame = this.page.frames().find(
        (candidate) =>
          candidate.name() === 'stripe-challenge-frame' ||
          candidate.url().includes('testmode-acs.stripe.com/3d_secure_2_test')
      );

      if (frame) {
        await frame.waitForLoadState('load', { timeout }).catch(() => undefined);
        return frame;
      }

      await this.page.waitForTimeout(250);
    }

    throw new Error('Stripe challenge frame not found');
  }

  async waitForVisible(timeout = THREE_DS_TIMEOUT): Promise<void> {
    const challengeFrame = await this.waitForChallengeFrame(timeout);
    const completeButton = challengeFrame.getByRole('button', { name: /^COMPLETE$/i });

    await expect(this.overlay).toBeVisible({ timeout });
    await expect(completeButton).toBeVisible({ timeout });
  }

  async waitForOptionalVisible(timeout = THREE_DS_TIMEOUT): Promise<boolean> {
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      if (await this.overlay.isVisible().catch(() => false)) {
        return true;
      }

      await this.page.waitForTimeout(500);
    }

    return false;
  }

  async waitForHidden(timeout = 45_000): Promise<void> {
    const deadline = Date.now() + timeout;
    const challengeFrame = await this.waitForChallengeFrame(timeout);
    const completeButton = challengeFrame.getByRole('button', { name: /^COMPLETE$/i });
    const vehicleButton = this.page.locator('button:visible').filter({ hasText: /Seleccionar Veh[Ã­i]culo/i }).first();

    while (Date.now() < deadline) {
      const completeVisible = await completeButton.isVisible().catch(() => false);
      const vehicleVisible = await vehicleButton.isVisible().catch(() => false);
      const vehicleEnabled = vehicleVisible ? await vehicleButton.isEnabled().catch(() => false) : false;

      if (!completeVisible && (!vehicleVisible || vehicleEnabled)) {
        return;
      }

      await this.page.waitForTimeout(500);
    }

    throw new Error('Stripe 3DS modal still visible after timeout');
  }

  async completeSuccess(): Promise<void> {
    const challengeFrame = await this.waitForChallengeFrame();
    const completeButton = challengeFrame.getByRole('button', { name: /^COMPLETE$/i });

    await expect(completeButton).toBeVisible({ timeout: THREE_DS_TIMEOUT });
    await this.page.waitForTimeout(THREE_DS_STABILIZATION_DELAY);
    await completeButton.click();
  }

  async completeFail(): Promise<void> {
    const challengeFrame = await this.waitForChallengeFrame();
    const failButton = challengeFrame.getByRole('button', { name: /^FAIL$/i });

    await expect(failButton).toBeVisible({ timeout: THREE_DS_TIMEOUT });
    await this.page.waitForTimeout(THREE_DS_STABILIZATION_DELAY);
    await failButton.click();
  }
}
