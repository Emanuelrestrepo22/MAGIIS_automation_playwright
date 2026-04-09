import type { Page } from '@playwright/test';
import type { PaymentGateway } from '../../shared/contracts/gateway-pg';

export type GatewayPgCardLinkingDraftInput = {
	gateway: PaymentGateway;
	cardAlias?: string;
};

export class GatewayPgCardLinkingPage {
	constructor(private readonly page: Page) {}

	async openCardLinkingForm(): Promise<void> {
		void this.page;

		/*
			TODO: navigate to the shared card-linking form in web portal.
			TODO: confirm stable selectors before implementing this action.
		*/
	}

	async submitGatewayDraft(input: GatewayPgCardLinkingDraftInput): Promise<void> {
		void input;

		/*
			TODO: fill the common card-linking form.
			TODO: branch only where gateway-specific behavior diverges.
			TODO: capture card or payment references after submission.
		*/
	}
}
