import { test, expect } from '../../TestBase';
import { GatewayPgCardLinkingPage } from '../../pages/gateway-pg/GatewayPgCardLinkingPage';
import { listGatewayPgAdapters } from '../../shared/gateway-pg/adapters';
import { GatewayPgJourneyOrchestrator } from '../../shared/orchestration/GatewayPgJourneyOrchestrator';

const orchestrator = new GatewayPgJourneyOrchestrator();
const gatewayAdapters = listGatewayPgAdapters();

test.describe('gateway-pg web draft journeys', () => {
	test.use({ role: 'web' });

	for (const adapter of gatewayAdapters) {
		test(`${adapter.gateway} - draft web setup for card linking and trip creation`, async ({ page, role }) => {
			test.fixme(
				true,
				`Draft flow for ${adapter.gateway}. Requires confirmed selectors, business data, and real web navigation.`
			);

			const cardLinkingPage = new GatewayPgCardLinkingPage(page);
			let journey = orchestrator.createDraftJourney({
				testCaseId: `GW-PG-${adapter.gateway.toUpperCase()}`,
				gateway: adapter.gateway,
				role
			});

			await cardLinkingPage.openCardLinkingForm();
			await cardLinkingPage.submitGatewayDraft({ gateway: adapter.gateway });

			journey = orchestrator.attachTripData(journey, {
				tripId: 'TODO-TRIP-ID',
				driverId: 'TODO-DRIVER-ID',
				paymentReference: `TODO-${adapter.gateway}-PAYMENT-REFERENCE`,
				cardReference: `TODO-${adapter.gateway}-CARD-REFERENCE`
			});
			journey = orchestrator.prepareMobileHandoff(
				journey,
				`Draft web phase completed for ${adapter.displayName}`
			);

			const contextPath = await orchestrator.persist(journey);
			expect(contextPath).toContain('journey-context');
			expect(journey.tags).toEqual(expect.arrayContaining(adapter.tags));
			await expect(page).toHaveURL(/.*/);
		});
	}
});
