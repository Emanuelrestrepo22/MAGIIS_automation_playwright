import { PASSENGERS } from './passengers';
import { STRIPE_TEST_CARDS, type StripeTestCard } from './stripe-cards';
import { TEST_DATA } from './stripeTestData';

export type PassengerPersonalNo3dsStep =
	| 'wallet-add-card'
	| 'wallet-select-card'
	| 'trip-create'
	| 'trip-assigned';

export type PassengerPersonalNo3dsScenario = {
	testCaseId: string;
	sourceCaseIds: string[];
	title: string;
	active: boolean;
	step: PassengerPersonalNo3dsStep;
	card: StripeTestCard;
	passenger: string;
	profileMode: 'personal';
	origin: string;
	destination: string;
	requiresDriverPhase: boolean;
	targetSpecPath: string;
	requiredScreenObjects: string[];
	technicalRisks: string[];
};

const TARGET_SPEC_PATH = 'tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-personal-no3ds.e2e.spec.ts';

export const PASSENGER_PERSONAL_NO3DS_SCENARIOS: PassengerPersonalNo3dsScenario[] = [
	{
		testCaseId: 'TC-PAX-07',
		sourceCaseIds: ['TS-STRIPE-TC1009', 'TS-STRIPE-TC1011'],
		title: 'Add card to passenger wallet',
		active: true,
		step: 'wallet-add-card',
		card: STRIPE_TEST_CARDS.visa_success,
		passenger: PASSENGERS.appPax.name,
		profileMode: 'personal',
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: false,
		targetSpecPath: TARGET_SPEC_PATH,
		requiredScreenObjects: [
			'Modo Personal',
			'Mi cuenta',
			'Billetera',
			'AGREGAR',
			'GUARDAR',
			'Stripe iframe cardnumber / cc-exp-month / cc-exp-year / cc-csc',
		],
		technicalRisks: [
			'Wallet state can persist across runs when APPIUM_NO_RESET=true.',
			'Stripe iframe name can vary while keeping the same fields.',
		],
	},
	{
		testCaseId: 'TC-PAX-08',
		sourceCaseIds: ['TS-STRIPE-TC1010', 'TS-STRIPE-TC1012'],
		title: 'Select an existing card for a trip',
		active: true,
		step: 'wallet-select-card',
		card: STRIPE_TEST_CARDS.visa_success,
		passenger: PASSENGERS.appPax.name,
		profileMode: 'personal',
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: false,
		targetSpecPath: TARGET_SPEC_PATH,
		requiredScreenObjects: [
			'Modo Personal',
			'Mi cuenta',
			'Billetera',
			'Saved card label ending in the last 4 digits',
		],
		technicalRisks: [
			'The card may already be selected as default, so the action can become a no-op.',
			'Card label formatting can vary slightly across app versions.',
		],
	},
	{
		testCaseId: 'TC-PAX-09',
		sourceCaseIds: ['TS-STRIPE-TC1011', 'TS-STRIPE-TC1012'],
		title: 'Create trip from passenger app',
		active: true,
		step: 'trip-create',
		card: STRIPE_TEST_CARDS.visa_success,
		passenger: PASSENGERS.appPax.name,
		profileMode: 'personal',
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: false,
		targetSpecPath: TARGET_SPEC_PATH,
		requiredScreenObjects: [
			'Modo Personal',
			'Origen',
			'Destino',
			'Seleccionar Vehiculo',
			'Ahora',
			'Efectivo',
			'Tarjeta de crédito',
		],
		technicalRisks: [
			'Trip confirmation can return without a stable trip id on some builds.',
			'Payment methods can change order depending on the current profile state and carrier defaults.',
		],
	},
	{
		testCaseId: 'TC-PAX-10',
		sourceCaseIds: ['TS-STRIPE-TC1010', 'TS-STRIPE-TC1011'],
		title: 'See trip in progress / assigned driver',
		active: false,
		step: 'trip-assigned',
		card: STRIPE_TEST_CARDS.visa_success,
		passenger: PASSENGERS.appPax.name,
		profileMode: 'personal',
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: true,
		targetSpecPath: TARGET_SPEC_PATH,
		requiredScreenObjects: [
			'Modo Personal',
			'assigned driver keywords',
			'conductor',
			'driver',
			'en camino',
		],
		technicalRisks: [
			'Driver handoff is not wired in this lane yet.',
			'The current status screen uses keyword heuristics until a dedicated dump is captured.',
		],
	},
];
