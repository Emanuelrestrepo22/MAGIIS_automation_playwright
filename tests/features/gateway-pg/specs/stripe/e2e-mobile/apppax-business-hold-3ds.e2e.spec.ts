/**
 * TCs: TS-STRIPE-TC1021–TC1024
 * Feature: Alta de Viaje desde App Pax — Usuario App Pax modo Business / Colaborador
 *          — Tarjeta Preautorizada (Hold ON/OFF) CON validacion 3DS — Cobro desde App Driver
 * Tags: @stripe @gateway-pg @hold @3ds @app-pax @app-driver @business
 * Portal: app-pax (mobile Android)
 * Ambiente: TEST
 * Fuente: docs/gateway-pg/stripe/normalized-test-cases.json (TS-STRIPE-TC1021..TC1024)
 * See also:
 *   - tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-3ds.e2e.spec.ts
 *     (cubre los mismos sourceCaseIds via PASSENGER_BUSINESS_3DS_SCENARIOS — sin describes con TC canonico)
 *
 * DRAFT — Fase 5 desambiguacion matriz Stripe.
 * Todos los tests arrancan con `test.fixme()` hasta que QA valide manualmente:
 *   1. Toggle hold ON/OFF desde Admin / Carrier parameters para el cliente business
 *      al que pertenece PASSENGERS.colaborador ('smith, Emanuel').
 *   2. Flujo 3DS desde app-pax mobile (handleThreeDsPopup) — hoy se cubre en
 *      apppax-business-3ds.e2e.spec.ts pero sin separar hold ON / hold OFF.
 *   3. Precondicion "card-new" (wallet sin la tarjeta) vs "card-existing"
 *      (wallet con la tarjeta 3DS ya vinculada).
 */
import { expect, test } from '../../../../../TestBase';
import { GatewayPgJourneyOrchestrator } from '../../../helpers/GatewayPgJourneyOrchestrator';
import { STRIPE_TEST_CARDS } from '../../../data/stripe-cards';
import { TEST_DATA } from '../../../data/stripeTestData';
import { PASSENGERS } from '../../../data/passengers';
import { getPassengerAppConfig } from '../../../../../mobile/appium/config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../../../../../mobile/appium/harness/PassengerTripHappyPathHarness';

type BusinessHold3dsScenario = {
	testCaseId: string;
	title: string;
	holdMode: 'on' | 'off';
	cardFlow: 'new' | 'existing';
	passengerName: string;
	origin: string;
	destination: string;
	// Resultado esperado extraido del campo "Deberia..." de la matriz (cuando exista).
	expectedTripOutcome: string;
};

const orchestrator = new GatewayPgJourneyOrchestrator();
const threeDsCard = STRIPE_TEST_CARDS.visa_3ds_success; // 4000 0025 0000 3155 — 3DS success

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

const SCENARIOS: BusinessHold3dsScenario[] = [
	{
		testCaseId: 'TS-STRIPE-TC1021',
		title:
			'Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada Hold y Cobro desde App Driver con validación 3DS — Vincular tarjeta nueva',
		holdMode: 'on',
		cardFlow: 'new',
		passengerName: PASSENGERS.colaborador.name,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		expectedTripOutcome:
			'Deberia crear el viaje con hold autorizado despues de completar el challenge 3DS exitosamente',
	},
	{
		testCaseId: 'TS-STRIPE-TC1022',
		title:
			'Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada sin Hold y Cobro desde App Driver con validación 3DS — Vincular tarjeta nueva',
		holdMode: 'off',
		cardFlow: 'new',
		passengerName: PASSENGERS.colaborador.name,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		expectedTripOutcome:
			'Deberia crear el viaje sin hold (cobro diferido) despues de completar el challenge 3DS exitosamente',
	},
	{
		testCaseId: 'TS-STRIPE-TC1023',
		title:
			'Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada Hold y Cobro desde App Driver con validación 3DS — Usar tarjeta vinculada existente',
		holdMode: 'on',
		cardFlow: 'existing',
		passengerName: PASSENGERS.colaborador.name,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		expectedTripOutcome:
			'Deberia reusar la tarjeta 3DS ya vinculada y crear el hold (el challenge puede o no dispararse segun la autorizacion previa)',
	},
	{
		testCaseId: 'TS-STRIPE-TC1024',
		title:
			'Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada sin Hold y Cobro desde App Driver con validación 3DS — Usar tarjeta vinculada existente',
		holdMode: 'off',
		cardFlow: 'existing',
		passengerName: PASSENGERS.colaborador.name,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		expectedTripOutcome:
			'Deberia reusar la tarjeta 3DS ya vinculada y crear el viaje sin hold (cobro diferido)',
	},
];

test.describe.serial('Gateway PG · E2E Mobile · App Pax Business — Hold con 3DS', () => {
	for (const scenario of SCENARIOS) {
		test.describe(`[${scenario.testCaseId}] ${scenario.title}`, () => {
			test(
				`hold=${scenario.holdMode} · 3ds · card=${scenario.cardFlow}`,
				async () => {
					// DRAFT — requiere datos de prueba app-pax-business y validación manual.
					// TODO(QA): Remover test.fixme una vez que:
					//   - Se confirme el toggle hold ON/OFF para el carrier business de 'smith, Emanuel'.
					//   - Se valide que handleThreeDsPopup resuelve el challenge en modo business.
					//   - PassengerTripHappyPathHarness exponga un hook para forzar hold mode.
					test.fixme(
						true,
						`DRAFT ${scenario.testCaseId} — requiere validacion manual del toggle hold ${scenario.holdMode} + 3DS flow en modo business antes de habilitarse en CI.`,
					);

					const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, {
						profileMode: 'business',
					});
					let journey = createJourney(scenario.testCaseId);
					const card = {
						number: threeDsCard.number,
						expiry: threeDsCard.exp,
						cvc: threeDsCard.cvc,
						holderName: threeDsCard.holderName,
					};
					const cardLast4 = card.number.replace(/\D/g, '').slice(-4); // 3155

					try {
						// TODO(backend): Precondicion — garantizar enableCreditCardHold = scenario.holdMode
						// en el carrier business del colaborador. Extender OperationalPreferencesPage
						// o crear helper API si el toggle no es accesible desde app-pax UI.

						await test.step(`[${scenario.testCaseId}] start passenger session (business mode)`, async () => {
							await harness.startSession();
						});

						if (scenario.cardFlow === 'new') {
							// TODO(wallet-cleanup): eliminar del wallet cualquier tarjeta con
							// last4 = cardLast4 (3155) para forzar vinculacion nueva.
							await test.step(`[${scenario.testCaseId}] add new 3DS card to wallet`, async () => {
								const walletState = await harness.ensureWalletCard(card);
								// Deberia agregar la tarjeta 3DS nueva al wallet (puede disparar 3DS de validacion inicial).
								expect(walletState).toBe('added');
							});
						} else {
							// TODO(wallet-precondition): garantizar que la tarjeta 3DS YA este vinculada
							// al colaborador business antes del test. Hoy ensureWalletCard vuelve
							// 'already-present' cuando corresponde.
							await test.step(`[${scenario.testCaseId}] select existing 3DS wallet card`, async () => {
								const walletState = await harness.ensureWalletCard(card);
								// Deberia detectar la tarjeta 3DS ya vinculada como existente.
								expect(walletState).toMatch(/added|already-present/);
								await harness.selectExistingCard(cardLast4);
							});
						}

						await test.step(`[${scenario.testCaseId}] create business trip with 3DS challenge`, async () => {
							// handleThreeDsPopup se dispara internamente cuando el backend pide 3DS.
							const tripId = await harness.createTrip(scenario.origin, scenario.destination, cardLast4);
							// Deberia crear el viaje business 3DS y devolver tripId estable.
							// Comentario matriz: ${scenario.expectedTripOutcome}
							expect(tripId, scenario.expectedTripOutcome).toBeTruthy();

							journey = orchestrator.attachTripData(journey, {
								tripId: tripId ?? 'TODO',
							});
							journey = orchestrator.prepareMobileHandoff(
								journey,
								`Passenger business 3DS trip created for ${scenario.testCaseId} (hold=${scenario.holdMode}, card=${scenario.cardFlow})`,
							);
							await orchestrator.persist(journey);
						});

						// TODO(driver-handoff): validar cobro desde app driver una vez que
						// DriverTripHappyPathHarness este wireado a este journey (flow 2).
					} catch (error) {
						journey = orchestrator.fail(
							journey,
							error instanceof Error ? error.message : `Draft ${scenario.testCaseId} failed`,
						);
						await orchestrator.persist(journey);
						throw error;
					} finally {
						await harness.endSession();
					}
				},
			);
		});
	}
});
