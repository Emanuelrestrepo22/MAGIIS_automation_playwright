import type { Page } from '@playwright/test';
import { ThreeDSModal as SharedThreeDSModal } from '../ThreeDSModal';

const THREE_DS_MODAL_SELECTOR = 'iframe[src*="three-ds-2-challenge"]';
const THREE_DS_CANCEL_BUTTON = /^CANCELAR$/i;

export class ThreeDSModal extends SharedThreeDSModal {
  constructor(page: Page) {
    super(page);
  }

  async dismiss(): Promise<void> {
    await this.page
      .frameLocator(THREE_DS_MODAL_SELECTOR)
      .getByRole('button', { name: THREE_DS_CANCEL_BUTTON })
      .click();

    await this.waitForHidden();
  }
}
