import type { GatewayPgAdapter } from './types';

/**
 * Adapter declarativo Authorize.net — metadata estática del comportamiento del gateway.
 *
 * BL-024 Fase 4 (2026-05-13) — vinculado a su fixture canónico en
 * `tests/fixtures/gateways/authorize/` (cards.ts + card-policy.ts + card-resolver.ts).
 *
 * Para resolver una tarjeta concreta por intención (multi-gateway), usar
 * `resolveCard({ gateway: 'authorize', intent })` desde `tests/fixtures/gateways/_shared`.
 *
 * Notas Authorize:
 *   - `requires3ds: false` — el flujo MAGIIS estándar no usa 3DS en Authorize.
 *   - El outcome se dispara por combinación (CVV + ZIP), no por número.
 */
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
