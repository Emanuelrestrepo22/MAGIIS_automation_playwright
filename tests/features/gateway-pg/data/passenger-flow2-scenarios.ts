import { PASSENGERS } from './passengers';
import { STRIPE_TEST_CARDS, type StripeTestCard } from './stripe-cards';
import { TEST_DATA } from './stripeTestData';

export type PassengerFlow2Step = 'wallet-add-card' | 'wallet-select-card' | 'wallet-delete-linked-card' | 'trip-create' | 'trip-assigned' | 'trip-completed' | 'wallet-negative';

export type PassengerFlow2Scenario = {
	testCaseId: string;
	sourceCaseIds: string[];
	title: string;
	active: boolean;
	step: PassengerFlow2Step;
	card: StripeTestCard;
	passenger: string;
	origin: string;
	destination: string;
	requiresDriverPhase: boolean;
	targetSpecPath: string;
	requiredScreenObjects: string[];
	technicalRisks: string[];
};

const TARGET_SPEC_PATH = 'tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-3ds.e2e.spec.ts';

export const PASSENGER_FLOW2_SCENARIOS: PassengerFlow2Scenario[] = [
	{
		testCaseId: 'TC-PAX-01',
		sourceCaseIds: ['TS-STRIPE-TC1049', 'TS-STRIPE-TC1053'],
		title: 'Add card to passenger wallet',
		active: true,
		step: 'wallet-add-card',
		card: STRIPE_TEST_CARDS.visa_3ds_success,
		passenger: PASSENGERS.appPax.name,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: false,
		targetSpecPath: TARGET_SPEC_PATH,
		requiredScreenObjects: ['Mi cuenta', 'Billetera', 'AGREGAR', 'GUARDAR', 'Stripe iframe cardnumber / cc-exp-month / cc-exp-year / cc-csc'],
		technicalRisks: ['Wallet state can persist across runs when APPIUM_NO_RESET=true.', 'Stripe iframe may render with a different internal name while keeping the same inputs.']
	},
	{
		testCaseId: 'TC-PAX-11',
		sourceCaseIds: ['DBTS-STRIPE-TC003', 'TS-STRIPE-TC1122'],
		title: 'Delete linked 3DS card from passenger wallet',
		active: true,
		step: 'wallet-delete-linked-card',
		card: STRIPE_TEST_CARDS.visa_3ds_success,
		passenger: PASSENGERS.appPax.name,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: false,
		targetSpecPath: TARGET_SPEC_PATH,
		requiredScreenObjects: ['Mi cuenta', 'Billetera', 'Saved 3DS card label ending in the last 4 digits', 'delete action / menu / trash', 'principal fallback if needed'],
		technicalRisks: ['Wallet state can persist across runs when APPIUM_NO_RESET=true.', 'The delete action may first need to open the card row options popover.', 'If the wallet starts empty, the test reseeds the linked 3DS card before deleting it.']
	},
	{
		testCaseId: 'TC-PAX-02',
		sourceCaseIds: ['TS-STRIPE-TC1050', 'TS-STRIPE-TC1054'],
		title: 'Select an existing card for a trip',
		active: true,
		step: 'wallet-select-card',
		card: STRIPE_TEST_CARDS.visa_3ds_success,
		passenger: PASSENGERS.appPax.name,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: false,
		targetSpecPath: TARGET_SPEC_PATH,
		requiredScreenObjects: ['Mi cuenta', 'Billetera', 'Saved card label ending in the last 4 digits'],
		technicalRisks: ['The card may already be selected as default, so the action can become a no-op.', 'Card label formatting can vary slightly across app versions.']
	},
	{
		testCaseId: 'TC-PAX-03',
		sourceCaseIds: ['TS-STRIPE-TC1053', 'TS-STRIPE-TC1055'],
		title: 'Create trip from passenger app',
		active: true,
		step: 'trip-create',
		card: STRIPE_TEST_CARDS.visa_3ds_success,
		passenger: PASSENGERS.appPax.name,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: false,
		targetSpecPath: TARGET_SPEC_PATH,
		requiredScreenObjects: ['Origen', 'Destino', 'Seleccionar Vehiculo', 'Ahora'],
		technicalRisks: ['Trip confirmation can return without a stable trip id on some builds.', 'Trip submit may still open a hold/3DS branch depending on backend config.']
	},
	{
		testCaseId: 'TC-PAX-04',
		sourceCaseIds: ['TS-STRIPE-TC1054', 'TS-STRIPE-TC1062'],
		title: 'See trip in progress / assigned driver',
		active: false,
		step: 'trip-assigned',
		card: STRIPE_TEST_CARDS.visa_3ds_success,
		passenger: PASSENGERS.appPax.name,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: true,
		targetSpecPath: TARGET_SPEC_PATH,
		requiredScreenObjects: ['assigned driver keywords', 'conductor', 'driver', 'en camino'],
		technicalRisks: ['Driver handoff is not wired in this lane yet.', 'The current status screen uses keyword heuristics until a dedicated dump is captured.']
	},
	{
		testCaseId: 'TC-PAX-05',
		sourceCaseIds: ['TS-STRIPE-TC1055', 'TS-STRIPE-TC1061'],
		title: 'See trip completed and payment processed',
		active: false,
		step: 'trip-completed',
		card: STRIPE_TEST_CARDS.visa_3ds_success,
		passenger: PASSENGERS.appPax.name,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: true,
		targetSpecPath: TARGET_SPEC_PATH,
		requiredScreenObjects: ['completado', 'finalizado', 'cobro', 'pago', 'captured'],
		technicalRisks: ['This case depends on the driver app finishing the ride first.', 'Payment confirmation is currently heuristic until a passenger post-trip dump is added.']
	},
	{
		testCaseId: 'TC-PAX-06',
		sourceCaseIds: ['TS-STRIPE-TC1056'],
		title: 'Reject card save / validation failure',
		active: false,
		step: 'wallet-negative',
		card: STRIPE_TEST_CARDS.incorrect_cvc,
		passenger: PASSENGERS.appPax.name,
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: false,
		targetSpecPath: TARGET_SPEC_PATH,
		requiredScreenObjects: ['Stripe error copy', 'card validation feedback'],
		technicalRisks: ['The exact error copy can vary depending on the Stripe test card branch.', 'Negative save flow may close the iframe before the error is rendered.']
	}
];
