import type { GatewayPgAdapter } from './types';

export const mercadoPagoGatewayAdapter: GatewayPgAdapter = {
	gateway: 'mercado-pago',
	displayName: 'Mercado Pago',
	defaultPortal: 'web',
	usesSharedCardForm: true,
	requiresMobileCompletion: true,
	requires3ds: false,
	tags: ['@gateway-pg', '@mercado-pago', '@payment', '@hybrid-e2e'],
	expectedValidationSources: ['web-ui', 'mobile-ui', 'api'],
	webTodos: [
		'Confirm card-linking selectors for shared payment form',
		'Capture Mercado Pago card or token reference after linking'
	],
	mobileTodos: [
		'Confirm driver trip completion flow in Android app',
		'Validate mobile payment status after trip finalization'
	],
	validationTodos: [
		'Confirm backend payment event',
		'Confirm Mercado Pago charge reference or callback outcome'
	]
};
