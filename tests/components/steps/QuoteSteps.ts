/**
 * KATA Steps (orquestador) — Carrier · Cotización (Quote).
 *
 * SCAFFOLDING MG-178 (área QUOTE). Orquesta el flujo de cotización a colaborador reutilizando
 * `CarrierQuotePage` (@ui/carrier). Ancla TS-STRIPE-P2-TC011; los TC012-018 encadenan variantes
 * (mail/teléfono, con/sin hold, con/sin 3DS). El hold+cobro end-to-end queda TODO(MG-178) pendiente
 * de validación live en TEST — ver CarrierQuotePage.completeQuoteWithHold. NO se promete verde.
 */

import type { TestContextOptions } from '@TestContext';

import { test } from '@TestFixture';
import { UiBase } from '@ui/UiBase';
import { CarrierQuotePage, type QuoteContact } from '@ui/carrier';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';

export class QuoteSteps extends UiBase {
	readonly quote: CarrierQuotePage;

	constructor(options: TestContextOptions) {
		super(options);
		this.quote = new CarrierQuotePage({ page: this.page });
	}

	/** Ancla TS-STRIPE-P2-TC011: cotización colaborador con hold+cobro (scaffolding). */
	async runColaboradorQuoteWithHold(contact: QuoteContact): Promise<void> {
		await test.step('Login carrier', async () => {
			await loginAsDispatcher(this.page);
		});
		await test.step('Abrir formulario de cotización', async () => {
			await this.quote.goto();
		});
		await test.step('Completar datos de contacto del colaborador', async () => {
			await this.quote.fillContact(contact);
		});
		await test.step('Completar cotización con hold+cobro', async () => {
			await this.quote.completeQuoteWithHold();
		});
	}
}
