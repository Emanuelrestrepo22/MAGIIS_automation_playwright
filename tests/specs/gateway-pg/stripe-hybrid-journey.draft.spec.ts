import { test, expect } from '../../TestBase';
import { getGatewayPgAdapter } from '../../shared/gateway-pg/adapters';
import { DriverTripCompletionDraft } from '../../mobile/appium/gateway-pg/DriverTripCompletionDraft';
import { GatewayPgJourneyOrchestrator } from '../../shared/orchestration/GatewayPgJourneyOrchestrator';

const orchestrator = new GatewayPgJourneyOrchestrator();
const stripeAdapter = getGatewayPgAdapter('stripe');

test.describe('gateway-pg stripe hybrid draft journey', () => {
	test.use({ role: 'web' });

	test('web creates context and mobile receives execution plan', async ({ role }) => {
		test.fixme(
			true,
			'Draft hybrid journey. Requires real web trip creation plus Appium runtime variables.'
		);

		let journey = orchestrator.createDraftJourney({
			testCaseId: 'GW-PG-STRIPE-HYBRID-01',
			gateway: 'stripe',
			role
		});

		journey = orchestrator.attachTripData(journey, {
			tripId: 'TODO-TRIP-ID',
			driverId: 'TODO-DRIVER-ID',
			paymentReference: 'TODO-STRIPE-PAYMENT-REFERENCE'
		});
		journey = orchestrator.prepareMobileHandoff(
			journey,
			'Draft Stripe web phase prepared for Android handoff'
		);

		const mobileDraft = new DriverTripCompletionDraft();
		const executionPlan = await mobileDraft.executeDraft(journey);

		expect(executionPlan.gateway).toBe('stripe');
		expect(executionPlan.platform).toBe('android');
		expect(journey.requires3ds).toBe(true);
		expect(journey.tags).toEqual(expect.arrayContaining(stripeAdapter.tags));
	});
});
