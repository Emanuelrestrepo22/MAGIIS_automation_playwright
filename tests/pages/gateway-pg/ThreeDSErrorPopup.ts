import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export class ThreeDSErrorPopup {
	constructor(private readonly page: Page) {}

	private popup() {
		return this.page.getByTestId('3ds-error-popup');
	}

	private message() {
		return this.page.getByTestId('3ds-error-popup-message');
	}

	async waitForVisible(timeout = 10_000): Promise<void> {
		await expect(this.popup()).toBeVisible({ timeout });
	}

	async getMessage(): Promise<string | null> {
		return this.message().textContent();
	}

	async accept(): Promise<void> {
		await this.page.getByRole('button', { name: 'Aceptar' }).click();
		await expect(this.popup()).toBeHidden({ timeout: 5_000 });
	}
}
