export const STRIPE_TEST_CARDS = {
	successDirect: '4242424242424242',
	success3DS: '4000002500003155',
	fail3DS: '4000000000009235',
	insufficientFunds: '4000000000009995',
	declined: '4000000000000002'
} as const;

export const STRIPE_EXPIRY = '12/26';
export const STRIPE_CVC = '123';

export const TEST_DATA = {
	passenger: 'Juan Perez Test',
	origin: 'Av. Corrientes 1234, CABA',
	destination: 'Av. Santa Fe 5678, CABA'
} as const;
