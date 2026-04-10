import { STRIPE_TEST_CARDS } from './stripeTestData';

export type CarrierDriverHappyPathRules = {
	holdEnabled: boolean;
	threeDSMode: 'none' | 'challenge-accept';
	active: boolean;
};

export type CarrierDriverHappyPathScenario = {
	testCaseId: string;
	title: string;
	client: string;
	passenger: string;
	origin: string;
	destination: string;
	cardLast4: string;
	rules: CarrierDriverHappyPathRules;
};

const DEFAULT_ORIGIN = 'Cazadores 1987, Buenos Aires, Argentina';
const DEFAULT_DESTINATION = 'La Pampa 915, Pilar, Buenos Aires, Argentina';
const DEFAULT_CLIENT = 'Usa Tres, Marcela';

/**
 * Plantilla reusable para casos happy path Carrier -> Driver.
 * Cada caso nuevo cambia solo datos/reglas sin duplicar el flujo.
 */
export const CARRIER_DRIVER_HAPPY_PATH_SCENARIOS: CarrierDriverHappyPathScenario[] = [
	{
		testCaseId: 'FLOW1-TC01',
		title: 'Hold ON + tarjeta successDirect sin 3DS',
		client: DEFAULT_CLIENT,
		passenger: DEFAULT_CLIENT,
		origin: DEFAULT_ORIGIN,
		destination: DEFAULT_DESTINATION,
		cardLast4: STRIPE_TEST_CARDS.successDirect.slice(-4),
		rules: {
			holdEnabled: true,
			threeDSMode: 'none',
			active: true,
		},
	},
	{
		testCaseId: 'TS-STRIPE-TC1013',
		title: 'Hold ON + 3DS obligatorio (aceptar challenge)',
		client: DEFAULT_CLIENT,
		passenger: DEFAULT_CLIENT,
		origin: DEFAULT_ORIGIN,
		destination: DEFAULT_DESTINATION,
		cardLast4: STRIPE_TEST_CARDS.success3DS.slice(-4),
		rules: {
			holdEnabled: true,
			threeDSMode: 'challenge-accept',
			active: false,
		},
	},
	{
		testCaseId: 'TS-STRIPE-TC1014',
		title: 'Hold OFF + 3DS obligatorio (aceptar challenge)',
		client: DEFAULT_CLIENT,
		passenger: DEFAULT_CLIENT,
		origin: DEFAULT_ORIGIN,
		destination: DEFAULT_DESTINATION,
		cardLast4: STRIPE_TEST_CARDS.success3DS.slice(-4),
		rules: {
			holdEnabled: false,
			threeDSMode: 'challenge-accept',
			active: false,
		},
	},
];

