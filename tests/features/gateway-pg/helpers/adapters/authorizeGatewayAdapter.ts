import type { GatewayPgAdapter } from './types';

export const authorizeGatewayAdapter: GatewayPgAdapter = {
	gateway: 'authorize',
	displayName: 'Authorize',
	defaultPortal: 'web',
	usesSharedCardForm: true,
	requiresMobileCompletion: true,
	requires3ds: false,
	tags: ['@gateway-pg', '@authorize', '@payment', '@hybrid-e2e'],
	expectedValidationSources: ['web-ui', 'mobile-ui', 'api', 'gateway-dashboard'],
	webTodos: [
		'Confirm Authorize.Net-specific branch after shared card-linking form',
		'Capture payment token or reference when available'
	],
	mobileTodos: [
		'Finish trip from Android app',
		'Confirm charge event reaches Authorize flow'
	],
	validationTodos: [
		'Confirm backend payment state',
		'Validate Authorize transaction visibility when required'
	]
};
