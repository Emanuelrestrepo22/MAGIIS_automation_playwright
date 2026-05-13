import type { GatewayPgAdapter } from './types';

/**
 * Adapter declarativo Stripe — metadata estática del comportamiento del gateway.
 *
 * BL-024 Fase 4 (2026-05-13) — vinculado a su fixture canónico en
 * `tests/fixtures/gateways/stripe/` (cards.ts + card-policy.ts + card-resolver.ts).
 *
 * Para resolver una tarjeta concreta por intención (multi-gateway), usar
 * `resolveCard({ gateway: 'stripe', intent })` desde `tests/fixtures/gateways/_shared`.
 *
 * Para uso Stripe-only, importar directamente desde `tests/fixtures/gateways/stripe/`.
 */
export const stripeGatewayAdapter: GatewayPgAdapter = {
	gateway: 'stripe',
	displayName: 'Stripe',
	defaultPortal: 'web',
	usesSharedCardForm: true,
	requiresMobileCompletion: true,
	requires3ds: true,
	tags: ['@gateway-pg', '@stripe', '@payment', '@hybrid-e2e'],
	expectedValidationSources: ['web-ui', 'mobile-ui', 'api', 'gateway-dashboard'],
	webTodos: [
		'Confirm shared card-linking selectors in web portal',
		'Capture Stripe payment or card reference after linking'
	],
	mobileTodos: [
		'Finish driver trip from Android app',
		'Confirm charge trigger in mobile completion flow'
	],
	validationTodos: [
		'Validate payment outcome by API',
		'Validate Stripe dashboard or webhook callback if required',
		'Validate 3DS dependency when the case requires challenge flow'
	]
};
