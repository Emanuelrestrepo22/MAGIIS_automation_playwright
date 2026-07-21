/**
 * Passenger App Flow 2 - Wallet + New Trip Draft
 *
 * This suite is the passenger-side entrypoint for the hybrid passenger -> driver lane.
 * Active coverage today:
 *   - wallet add card
 *   - select existing card
 *   - delete linked 3DS card
 *   - create trip and persist handoff context
 *
 * Draft coverage still pending passenger post-trip evidence / driver handoff:
 *   - assigned driver
 *   - trip completed
 *   - negative wallet validation
 *
 * KATA conformance: DEFERRED a Fase 4 (capa mobile KATA). Runner = shell Playwright,
 * device automation = Appium/WebdriverIO (PassengerTripHappyPathHarness · tests/mobile/appium/*).
 * @TestFixture sólo expone Page/API/DB de Playwright — no existe tests/components/ui/mobile +
 * fixture Appium; forzarlo inventaría arquitectura, así que se preserva TestBase + fixme.
 * Normalizado no-destructivo: imports por alias (@TestBase/@features/@fixtures); los de
 * tests/mobile/appium quedan relativos (no hay alias @mobile — Fase 4).
 * @atc idmap: wallet pax -> área H (MG-172..174, MG-495-496); 3DS -> área D (MG-152..157).
 *   mapeo por área aceptado (idmap API-level, sin 1:1 con e2e-mobile UI).
 */

import { expect, test } from '@TestBase';
import { GatewayPgJourneyOrchestrator } from '@features/gateway-pg/helpers/GatewayPgJourneyOrchestrator';
import { PASSENGER_FLOW2_SCENARIOS } from '@features/gateway-pg/data/passenger-flow2-scenarios';
import { getPassengerAppConfig } from '../../../../../mobile/appium/config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../../../../../mobile/appium/harness/PassengerTripHappyPathHarness';
import { resolveCard } from '@fixtures/stripe/card-resolver';

const orchestrator = new GatewayPgJourneyOrchestrator();

function createJourney(testCaseId: string) {
	return orchestrator.createDraftJourney({
		testCaseId,
		gateway: 'stripe',
		portal: 'pax',
		role: 'passenger',
		flowType: 'passenger-app-driver-app',
		passengerProfileMode: 'personal'
	});
}

test.describe.serial('Gateway PG · E2E Mobile · App Pax Personal @gateway @stripe @e2e-hybrid @3ds @wallet @regression', () => {
	for (const scenario of PASSENGER_FLOW2_SCENARIOS) {
		test(`[${scenario.testCaseId}] ${scenario.title} (${scenario.sourceCaseIds.join(' / ')})`, async () => {
			if (!scenario.active) {
				test.fixme(true, scenario.requiresDriverPhase ? 'Passenger wallet and trip setup are ready, but driver handoff/post-trip evidence is still pending.' : 'Passenger negative evidence is still pending validation.');
				return;
			}

			const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, {
				profileMode: 'personal'
			});
			let journey = createJourney(scenario.testCaseId);
			const resolvedCard = resolveCard(scenario.cardId);
			const card = {
				number: resolvedCard.number,
				expiry: resolvedCard.exp,
				cvc: resolvedCard.cvc,
				holderName: resolvedCard.holderName
			};

			try {
				await test.step(`[${scenario.testCaseId}] start passenger session`, async () => {
					await harness.startSession();
				});

				const cardLast4 = card.number.replace(/\D/g, '').slice(-4);

				switch (scenario.step) {
					case 'wallet-add-card':
						await test.step(`[${scenario.testCaseId}] add card to wallet`, async () => {
							const walletState = await harness.ensureWalletCard(card);
							expect(walletState).toMatch(/added|already-present/);
							journey = orchestrator.updatePhase(journey, 'passenger_wallet_setup', 'draft', `Passenger wallet card ${walletState}`);
							await orchestrator.persist(journey);
						});
						break;

					case 'wallet-delete-linked-card':
						await test.step(`[${scenario.testCaseId}] delete linked 3DS wallet card`, async () => {
							await harness.cleanWallet();
							await harness.ensureWalletCard(card);
							await harness.deleteWalletCard(cardLast4);
							journey = orchestrator.updatePhase(journey, 'passenger_wallet_setup', 'draft', 'Passenger deleted a linked 3DS wallet card');
							await orchestrator.persist(journey);
						});
						break;

					case 'wallet-select-card':
						await test.step(`[${scenario.testCaseId}] select existing wallet card`, async () => {
							await harness.ensureWalletCard(card);
							await harness.selectExistingCard(cardLast4);
							journey = orchestrator.updatePhase(journey, 'passenger_wallet_setup', 'draft', 'Passenger selected an existing wallet card');
							await orchestrator.persist(journey);
						});
						break;

					case 'trip-create':
						await test.step(`[${scenario.testCaseId}] create passenger trip`, async () => {
							await harness.ensureWalletCard(card);
							const tripId = await harness.createTrip(scenario.origin, scenario.destination, cardLast4);
							expect(tripId).toBeTruthy();

							journey = orchestrator.attachTripData(journey, {
								tripId: tripId ?? 'TODO'
							});
							journey = orchestrator.prepareMobileHandoff(journey, 'Passenger created the trip and handed it to the driver lane');
							await orchestrator.persist(journey);
						});
						break;

					default:
						test.fixme(true, 'Unhandled passenger flow step. Update the scenario mapping first.');
				}
			} catch (error) {
				journey = orchestrator.fail(journey, error instanceof Error ? error.message : 'Passenger flow failed');
				await orchestrator.persist(journey);
				throw error;
			} finally {
				await harness.endSession();
			}
		});
	}
});
