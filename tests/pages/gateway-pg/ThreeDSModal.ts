import { expect } from '@playwright/test';
import type { FrameLocator, Page } from '@playwright/test';

export class ThreeDSModal {
	constructor(private readonly page: Page) {}

	private overlay() {
		return this.page.getByTestId('3ds-modal-overlay');
	}

	private bankFrame(): FrameLocator {
		return this.page.frameLocator('[data-testid="3ds-iframe"]');
	}

	async waitForVisible(timeout = 20_000): Promise<void> {
		await expect(this.overlay()).toBeVisible({ timeout });
	}

	async waitForHidden(timeout = 30_000): Promise<void> {
		await expect(this.overlay()).toBeHidden({ timeout });
	}

	async completeSuccess(): Promise<void> {
		await this.bankFrame().getByRole('button', { name: 'Complete' }).click();
	}

	async completeFail(): Promise<void> {
		await this.bankFrame().getByRole('button', { name: 'Fail' }).click();
	}

	async dismiss(): Promise<void> {
		await this.page.getByTestId('3ds-modal-close').click();
	}
}
