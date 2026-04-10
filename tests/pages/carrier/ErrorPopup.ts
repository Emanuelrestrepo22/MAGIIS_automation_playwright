import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

const ERROR_MESSAGE_SELECTOR = '.error-text:visible';
const PAYMENT_AUTH_ERROR_SNIPPET = /No podemos autenticar tu|We are unable to authenticate/i;
const DISMISS_ERROR_BUTTON = /^(Aceptar|Cerrar|OK)$/i;

export class ErrorPopup {
  protected readonly page: Page;
  readonly container: Locator;
  private readonly messageText: Locator;

  constructor(page: Page) {
    this.page = page;
    this.container = page.locator(ERROR_MESSAGE_SELECTOR).filter({ hasText: PAYMENT_AUTH_ERROR_SNIPPET }).first();
    this.messageText = this.container;
  }

  async waitForVisible(timeout = 10_000): Promise<void> {
    await expect(this.container).toBeVisible({ timeout });
  }

  async getMessage(): Promise<string | null> {
    return this.messageText.textContent();
  }

	async accept(): Promise<void> {
		const buttons = this.page.getByRole('button', { name: DISMISS_ERROR_BUTTON });
		let dismissed = false;

		for (let index = 0; index < await buttons.count(); index += 1) {
			const button = buttons.nth(index);
			if (await button.isVisible().catch(() => false)) {
				await button.click();
				dismissed = true;
				break;
			}
		}

		if (!dismissed) {
			await this.container.dblclick().catch(() => undefined);
		}

		await this.page.waitForTimeout(250);
	}
}
