/**
 * NewTravelPage - Carrier Portal
 * Thin wrapper over NewTravelPageBase.
 */

import type { Page } from '@playwright/test';
import { NewTravelPageBase } from './NewTravelPageBase';

export type { NewTravelFormInput } from './NewTravelPageBase';

export class NewTravelPage extends NewTravelPageBase {
	constructor(page: Page) {
		super(page);
	}

	async selectCard(last4: string): Promise<void> {
		await this.selectCardByLast4(last4);
	}
}
