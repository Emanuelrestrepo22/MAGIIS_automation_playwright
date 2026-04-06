import { test, expect } from '../../TestBase';
import { GatewayPgJourneyOrchestrator } from '../../shared/orchestration/GatewayPgJourneyOrchestrator';

const orchestrator = new GatewayPgJourneyOrchestrator();

test.describe('gateway-pg validation draft', () => {
	test('validate payment after mobile completion', async () => {
		test.fixme(true, 'Draft validation phase. Requires mobile handoff and backend validation sources.');

		const journeyId = 'TODO-JOURNEY-ID';
		let journey = await orchestrator.load(journeyId);

		/*
			TODO: validate final trip state by API.
			TODO: validate payment result in web UI if applicable.
			TODO: validate Stripe, Mercado Pago, eBizCharge, or Authorize response as needed.
			TODO: add gateway dashboard or DB validation when required by the case.
		*/

		journey = orchestrator.registerValidationSource(journey, 'api');
		journey = orchestrator.completeValidation(
			journey,
			'Draft validation phase marked as completed'
		);

		const contextPath = await orchestrator.persist(journey);
		expect(contextPath).toContain(journeyId);
	});
});
