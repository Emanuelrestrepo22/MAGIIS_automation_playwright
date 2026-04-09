import type { GatewayPgAdapter } from './types';

export const ebizchargeGatewayAdapter: GatewayPgAdapter = {
	gateway: 'ebizcharge',
	displayName: 'eBizCharge',
	defaultPortal: 'web',
	usesSharedCardForm: true,
	requiresMobileCompletion: true,
	requires3ds: false,
	tags: ['@gateway-pg', '@ebizcharge', '@payment', '@hybrid-e2e'],
	expectedValidationSources: ['web-ui', 'mobile-ui', 'api'],
	webTodos: [
		'Confirm eBizCharge-specific fields that diverge after common card-linking form',
		'Capture payment reference emitted from eBizCharge flow'
	],
	mobileTodos: [
		'Validate trip completion and charge trigger in Android app',
		'Confirm mobile state after charge'
	],
	validationTodos: [
		'Confirm backend payment state',
		'Confirm eBizCharge response or transaction ID if exposed'
	]
};
