import { PASSENGERS } from './passengers';
import { STRIPE_TEST_CARDS, type StripeTestCard } from './stripe-cards';
import { TEST_DATA } from './stripeTestData';

export type PassengerBusinessStep =
	| 'wallet-add-card'
	| 'wallet-select-card'
	| 'trip-create'
	| 'trip-assigned';

export type PassengerBusinessScenario = {
	testCaseId: string;
	sourceCaseIds: string[];
	title: string;
	active: boolean;
	step: PassengerBusinessStep;
	card: StripeTestCard;
	passenger: string;
	profileMode: 'business';
	origin: string;
	destination: string;
	requiresDriverPhase: boolean;
	targetSpecPath: string;
	requiredScreenObjects: string[];
	technicalRisks: string[];
};

const NO3DS_TARGET_SPEC_PATH = 'tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-no3ds.e2e.spec.ts';
const THREE_DS_TARGET_SPEC_PATH = 'tests/features/gateway-pg/specs/stripe/e2e-mobile/apppax-business-3ds.e2e.spec.ts';

export const PASSENGER_BUSINESS_NO3DS_SCENARIOS: PassengerBusinessScenario[] = [
	{
		testCaseId: 'TC-PAX-BIZ-01',
		sourceCaseIds: ['TS-STRIPE-TC1017', 'TS-STRIPE-TC1025'],
		title: 'Add card to collaborator wallet',
		active: true,
		step: 'wallet-add-card',
		card: STRIPE_TEST_CARDS.visa_success,
		passenger: PASSENGERS.colaborador.name,
		profileMode: 'business',
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: false,
		targetSpecPath: NO3DS_TARGET_SPEC_PATH,
		requiredScreenObjects: [
			'Compañía',
			'Mi cuenta',
			'Billetera',
			'AGREGAR',
			'GUARDAR',
			'Stripe iframe cardnumber / cc-exp-month / cc-exp-year / cc-csc',
		],
		technicalRisks: [
			'Business profile toggle can be disabled if the collaborator profile is not provisioned.',
			'Wallet state can persist across runs when APPIUM_NO_RESET=true.',
		],
	},
	{
		testCaseId: 'TC-PAX-BIZ-02',
		sourceCaseIds: ['TS-STRIPE-TC1018', 'TS-STRIPE-TC1026'],
		title: 'Select an existing card for a business trip',
		active: true,
		step: 'wallet-select-card',
		card: STRIPE_TEST_CARDS.visa_success,
		passenger: PASSENGERS.colaborador.name,
		profileMode: 'business',
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: false,
		targetSpecPath: NO3DS_TARGET_SPEC_PATH,
		requiredScreenObjects: [
			'Compañía',
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
		testCaseId: 'TC-PAX-BIZ-03',
		sourceCaseIds: ['TS-STRIPE-TC1019', 'TS-STRIPE-TC1027'],
		title: 'Create business trip from passenger app',
		active: true,
		step: 'trip-create',
		card: STRIPE_TEST_CARDS.visa_success,
		passenger: PASSENGERS.colaborador.name,
		profileMode: 'business',
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: false,
		targetSpecPath: NO3DS_TARGET_SPEC_PATH,
		requiredScreenObjects: [
			'Compañía',
			'Origen',
			'Destino',
			'Seleccionar Vehiculo',
			'Ahora',
			'Cuenta corriente',
			'Tarjeta de crédito',
		],
		technicalRisks: [
			'Trip confirmation can return without a stable trip id on some builds.',
			'Business payment defaults can vary if the profile exposes checking account first.',
		],
	},
	{
		testCaseId: 'TC-PAX-BIZ-04',
		sourceCaseIds: ['TS-STRIPE-TC1020', 'TS-STRIPE-TC1028'],
		title: 'See business trip in progress / assigned driver',
		active: false,
		step: 'trip-assigned',
		card: STRIPE_TEST_CARDS.visa_success,
		passenger: PASSENGERS.colaborador.name,
		profileMode: 'business',
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: true,
		targetSpecPath: NO3DS_TARGET_SPEC_PATH,
		requiredScreenObjects: [
			'Compañía',
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

export const PASSENGER_BUSINESS_3DS_SCENARIOS: PassengerBusinessScenario[] = [
	{
		testCaseId: 'TC-PAX-BIZ-05',
		sourceCaseIds: ['TS-STRIPE-TC1021', 'TS-STRIPE-TC1029'],
		title: 'Add card to collaborator wallet with 3DS card',
		active: true,
		step: 'wallet-add-card',
		card: STRIPE_TEST_CARDS.visa_3ds_success,
		passenger: PASSENGERS.colaborador.name,
		profileMode: 'business',
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: false,
		targetSpecPath: THREE_DS_TARGET_SPEC_PATH,
		requiredScreenObjects: [
			'Compañía',
			'Mi cuenta',
			'Billetera',
			'AGREGAR',
			'GUARDAR',
			'Stripe iframe cardnumber / cc-exp-month / cc-exp-year / cc-csc',
		],
		technicalRisks: [
			'3DS-capable cards may still branch into platform-specific validation flows.',
			'Business profile toggle can be disabled if the collaborator profile is not provisioned.',
		],
	},
	{
		testCaseId: 'TC-PAX-BIZ-06',
		sourceCaseIds: ['TS-STRIPE-TC1022', 'TS-STRIPE-TC1030'],
		title: 'Select an existing 3DS card for a business trip',
		active: true,
		step: 'wallet-select-card',
		card: STRIPE_TEST_CARDS.visa_3ds_success,
		passenger: PASSENGERS.colaborador.name,
		profileMode: 'business',
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: false,
		targetSpecPath: THREE_DS_TARGET_SPEC_PATH,
		requiredScreenObjects: [
			'Compañía',
			'Mi cuenta',
			'Billetera',
			'Saved card label ending in the last 4 digits',
		],
		technicalRisks: [
			'The card may already be selected as default, so the action can become a no-op.',
			'3DS-capable cards can display different labels after wallet save.',
		],
	},
	{
		testCaseId: 'TC-PAX-BIZ-07',
		sourceCaseIds: ['TS-STRIPE-TC1023', 'TS-STRIPE-TC1031'],
		title: 'Create business trip with 3DS card',
		active: true,
		step: 'trip-create',
		card: STRIPE_TEST_CARDS.visa_3ds_success,
		passenger: PASSENGERS.colaborador.name,
		profileMode: 'business',
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: false,
		targetSpecPath: THREE_DS_TARGET_SPEC_PATH,
		requiredScreenObjects: [
			'Compañía',
			'Origen',
			'Destino',
			'Seleccionar Vehiculo',
			'Ahora',
			'Cuenta corriente',
			'Tarjeta de crédito',
		],
		technicalRisks: [
			'Trip confirmation can return without a stable trip id on some builds.',
			'Business payment defaults can vary if the profile exposes checking account first.',
		],
	},
	{
		testCaseId: 'TC-PAX-BIZ-08',
		sourceCaseIds: ['TS-STRIPE-TC1024', 'TS-STRIPE-TC1032'],
		title: 'See business trip in progress / assigned driver with 3DS',
		active: false,
		step: 'trip-assigned',
		card: STRIPE_TEST_CARDS.visa_3ds_success,
		passenger: PASSENGERS.colaborador.name,
		profileMode: 'business',
		origin: TEST_DATA.origin,
		destination: TEST_DATA.destination,
		requiresDriverPhase: true,
		targetSpecPath: THREE_DS_TARGET_SPEC_PATH,
		requiredScreenObjects: [
			'Compañía',
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
