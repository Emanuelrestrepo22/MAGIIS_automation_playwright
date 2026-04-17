/**
 * TCs: TS-STRIPE-TC1017–TC1020
 * Feature: Alta de Viaje desde App Pax — Usuario App Pax modo Business / Colaborador
 *          — Tarjeta Preautorizada (Hold ON/OFF) SIN validacion 3DS — Cobro desde App Driver
 * Tags: @stripe @gateway-pg @hold @app-pax @app-driver @business
 * Portal: app-pax (mobile Android)
 * Ambiente: TEST
 * Fuente: docs/gateway-pg/stripe/normalized-test-cases.json (TS-STRIPE-TC1017..TC1020)
 * See also:
 *   - tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-no3ds.e2e.spec.ts
 *     (cubre los mismos sourceCaseIds via PASSENGER_BUSINESS_NO3DS_SCENARIOS — sin describes con TC canonico)
 *
 * DRAFT — Fase 5 desambiguacion matriz Stripe.
 * Todos los tests arrancan con `test.fixme()` hasta que QA valide manualmente:
 *   1. Toggle hold ON/OFF desde Admin / Carrier parameters para el cliente business
 *      al que pertenece el colaborador PASSENGERS.colaborador ('smith, Emanuel').
 *   2. Comportamiento backend del flag enableCreditCardHold cuando el viaje nace
 *      desde app-pax (no desde carrier web). El flujo actual solo valida hold
 *      cuando el carrier dispatcher crea el viaje.
 *   3. Precondicion real de "card-new" vs "card-existing" desde wallet mobile
 *      (ver PassengerWalletScreen.ensureWalletCard / selectExistingCard).
 */
import { expect, test } from '../../../../../TestBase';
import { GatewayPgJourneyOrchestrator } from '../../../helpers/GatewayPgJourneyOrchestrator';
import { STRIPE_TEST_CARDS } from '../../../data/stripe-cards';
import { TEST_DATA } from '../../../data/stripeTestData';
import { PASSENGERS } from '../../../data/passengers';
import { getPassengerAppConfig } from '../../../../../mobile/appium/config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../../../../../mobile/appium/harness/PassengerTripHappyPathHarness';

type BusinessHoldScenario = {
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
const businessCard = STRIPE_TEST_CARDS.visa_success; // 4242 — sin 3DS

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

const SCENARIOS: BusinessHoldScenario[] = [
	{
		testCaseId: 'TS-STRIPE-TC1017',
		title:
			'Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Vincular tarjeta nueva',
		holdMode: 'on',
		cardFlow: 'new',
		passengerName: PASSENGERS.colaborador.name,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		expectedTripOutcome:
			'Deberia crear el viaje con hold autorizado y dejarlo disponible para asignar conductor',
	},
	{
		testCaseId: 'TS-STRIPE-TC1018',
		title:
			'Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Vincular tarjeta nueva',
		holdMode: 'off',
		cardFlow: 'new',
		passengerName: PASSENGERS.colaborador.name,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		expectedTripOutcome:
			'Deberia crear el viaje sin hold (cobro diferido) y dejarlo disponible para asignar conductor',
	},
	{
		testCaseId: 'TS-STRIPE-TC1019',
		title:
			'Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada Hold desde Alta de Viaje y Cobro desde App Driver — Usar tarjeta vinculada existente',
		holdMode: 'on',
		cardFlow: 'existing',
		passengerName: PASSENGERS.colaborador.name,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		expectedTripOutcome:
			'Deberia reusar la tarjeta ya vinculada, crear hold y dejar el viaje disponible para asignar conductor',
	},
	{
		testCaseId: 'TS-STRIPE-TC1020',
		title:
			'Validar Alta de Viaje desde app pax para usuario app pax modo business con Tarjeta Preautorizada sin Hold desde Alta de Viaje, Cobro desde App Driver — Usar tarjeta vinculada existente',
		holdMode: 'off',
		cardFlow: 'existing',
		passengerName: PASSENGERS.colaborador.name,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		expectedTripOutcome:
			'Deberia reusar la tarjeta ya vinculada, crear el viaje sin hold y dejarlo disponible para asignar conductor',
	},
];

test.describe.serial('Gateway PG · E2E Mobile · App Pax Business — Hold sin 3DS', () => {
	for (const scenario of SCENARIOS) {
		test.describe(`[${scenario.testCaseId}] ${scenario.title}`, () => {
			test(
				`hold=${scenario.holdMode} · card=${scenario.cardFlow}`,
				async () => {
					// DRAFT — requiere datos de prueba app-pax-business y validación manual.
					// TODO(QA): Remover test.fixme una vez que:
					//   - Se confirme el toggle hold ON/OFF para el carrier business de 'smith, Emanuel'.
					//   - Se valide la precondicion card-new (wallet vacia) vs card-existing via wallet Appium.
					//   - PassengerTripHappyPathHarness exponga un hook para forzar hold mode (hoy no existe).
					test.fixme(
						true,
						`DRAFT ${scenario.testCaseId} — requiere validacion manual del toggle hold ${scenario.holdMode} y del estado wallet ${scenario.cardFlow} antes de habilitarse en CI.`,
					);

					const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, {
						profileMode: 'business',
					});
					let journey = createJourney(scenario.testCaseId);
					const card = {
						number: businessCard.number,
						expiry: businessCard.exp,
						cvc: businessCard.cvc,
						holderName: businessCard.holderName,
					};
					const cardLast4 = card.number.replace(/\D/g, '').slice(-4);

					try {
						// TODO(backend): Precondicion — garantizar que enableCreditCardHold del carrier
						// business al que pertenece scenario.passengerName este en `scenario.holdMode`.
						// Helper candidato: extender OperationalPreferencesPage con setHoldEnabled via API
						// o reutilizar disableHoldAndSave/restoreHoldAndSave de carrier/hold/apppax-hold-3ds.spec.ts.

						await test.step(`[${scenario.testCaseId}] start passenger session (business mode)`, async () => {
							await harness.startSession();
						});

						if (scenario.cardFlow === 'new') {
							// TODO(wallet-cleanup): garantizar que el wallet del colaborador NO tenga
							// tarjeta con last4 = cardLast4 antes de ejecutar. Reutilizar
							// `deletePassengerCard` de tests/features/gateway-pg/helpers/card-precondition.ts
							// una vez que se resuelva el passengerId del colaborador (la API actual
							// no devuelve colaboradores contractor via endpoint carrier).
							await test.step(`[${scenario.testCaseId}] add new card to wallet`, async () => {
								const walletState = await harness.ensureWalletCard(card);
								// Deberia agregar la tarjeta nueva al wallet del colaborador business.
								expect(walletState).toBe('added');
							});
						} else {
							// TODO(wallet-precondition): garantizar que la tarjeta YA este vinculada.
							// Hoy ensureWalletCard es idempotente (added | already-present) pero no
							// falla si la tarjeta no estaba; para card-existing deberiamos fallar
							// si el estado retornado no es 'already-present'.
							await test.step(`[${scenario.testCaseId}] select existing wallet card`, async () => {
								const walletState = await harness.ensureWalletCard(card);
								// Deberia detectar la tarjeta ya vinculada como existente.
								expect(walletState).toMatch(/added|already-present/);
								await harness.selectExistingCard(cardLast4);
							});
						}

						await test.step(`[${scenario.testCaseId}] create business trip from app pax`, async () => {
							const tripId = await harness.createTrip(scenario.origin, scenario.destination, cardLast4);
							// Deberia crear el viaje business y devolver tripId estable.
							// Comentario matriz: ${scenario.expectedTripOutcome}
							expect(tripId, scenario.expectedTripOutcome).toBeTruthy();

							journey = orchestrator.attachTripData(journey, {
								tripId: tripId ?? 'TODO',
							});
							journey = orchestrator.prepareMobileHandoff(
								journey,
								`Passenger business trip created for ${scenario.testCaseId} (hold=${scenario.holdMode}, card=${scenario.cardFlow})`,
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
