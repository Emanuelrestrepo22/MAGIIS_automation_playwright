/**
 * Passenger App Flow 2 - Wallet + New Trip Draft
 *
 * Business / collaborator lane without active 3DS driver completion.
 * Active coverage today:
 *   - wallet add card
 *   - select existing card
 *   - create trip and persist handoff context
 *
 * Draft coverage still pending passenger post-trip evidence / driver handoff:
 *   - assigned driver
 */

import { expect, test } from '../../../../../TestBase';
import { GatewayPgJourneyOrchestrator } from '../../../helpers/GatewayPgJourneyOrchestrator';
import { PASSENGER_BUSINESS_NO3DS_SCENARIOS } from '../../../data/passenger-business-scenarios';
import { getPassengerAppConfig } from '../../../../../mobile/appium/config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../../../../../mobile/appium/harness/PassengerTripHappyPathHarness';
import { resolveCard } from '../../../../../fixtures/stripe/card-resolver';

const orchestrator = new GatewayPgJourneyOrchestrator();

function createJourney(testCaseId: string) {
	return orchestrator.createDraftJourney({
		testCaseId,
		gateway: 'stripe',
		portal: 'pax',
		role: 'passenger',
		flowType: 'passenger-app-driver-app',
		passengerProfileMode: 'business',
	});
}

test.describe.serial('Gateway PG · E2E Mobile · App Pax Business / Collaborator No 3DS', () => {
	for (const scenario of PASSENGER_BUSINESS_NO3DS_SCENARIOS) {
		test(
			`[${scenario.testCaseId}] ${scenario.title} (${scenario.sourceCaseIds.join(' / ')})`,
			async () => {
				if (!scenario.active) {
					test.fixme(
						true,
						scenario.requiresDriverPhase
							? 'Passenger wallet and trip setup are ready, but driver handoff/post-trip evidence is still pending.'
							: 'Passenger negative evidence is still pending validation.'
					);
					return;
				}

				const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, {
					profileMode: 'business',
				});
				let journey = createJourney(scenario.testCaseId);
				const resolvedCard = resolveCard(scenario.cardId);
				const card = {
					number: resolvedCard.number,
					expiry: resolvedCard.exp,
					cvc: resolvedCard.cvc,
					holderName: resolvedCard.holderName,
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
								journey = orchestrator.updatePhase(
									journey,
									'passenger_wallet_setup',
									'draft',
									`Passenger business wallet card ${walletState}`
								);
								await orchestrator.persist(journey);
							});
							break;

						case 'wallet-select-card':
							await test.step(`[${scenario.testCaseId}] select existing wallet card`, async () => {
								await harness.ensureWalletCard(card);
								await harness.selectExistingCard(cardLast4);
								journey = orchestrator.updatePhase(
									journey,
									'passenger_wallet_setup',
									'draft',
									'Passenger business selected an existing wallet card'
								);
								await orchestrator.persist(journey);
							});
							break;

						case 'trip-create':
							await test.step(`[${scenario.testCaseId}] create passenger trip`, async () => {
								await harness.ensureWalletCard(card);
								const tripId = await harness.createTrip(scenario.origin, scenario.destination, cardLast4);
								expect(tripId).toBeTruthy();

								journey = orchestrator.attachTripData(journey, {
									tripId: tripId ?? 'TODO',
								});
								journey = orchestrator.prepareMobileHandoff(
									journey,
									'Passenger created the business trip and handed it to the driver lane'
								);
								await orchestrator.persist(journey);
							});
							break;

						default:
							test.fixme(true, 'Unhandled passenger business flow step. Update the scenario mapping first.');
					}
				} catch (error) {
					journey = orchestrator.fail(
						journey,
						error instanceof Error ? error.message : 'Passenger business flow failed'
					);
					await orchestrator.persist(journey);
					throw error;
				} finally {
					await harness.endSession();
				}
			}
		);
	}
});
