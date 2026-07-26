import { JOURNEY_DEFAULTS } from '../../data/journey-defaults';
import { XRAY_KEYS_BY_GATEWAY } from '../../data/xray-keys';
import type { GatewayPgAdapter } from './types';
import { areEnvKeysConfigured } from './types';

/**
 * Credenciales propias: NINGUNA — Stripe usa el carrier default (OAuth Connect ya
 * vinculado). La cadena de login estándar resuelve USER_CARRIER_STRIPE_<ENV> → … → USER_CARRIER.
 */
const STRIPE_CREDS_ENV_KEYS: string[] = [];

/**
 * Adapter declarativo Stripe — metadata estática del comportamiento del gateway.
 *
 * BL-024 Fase 4 (2026-05-13) — vinculado a su fixture canónico en
 * `tests/fixtures/gateways/stripe/` (cards.ts + card-policy.ts + card-resolver.ts).
 * S2 (carrier/gateway-standardization) — extendido con config operacional
 * (cardForm / outcomeTrigger / link / creds / registry Xray).
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
	],

	// ── Config operacional (S2) ──────────────────────────────────────────────
	cardForm: 'stripe-elements',
	outcomeTrigger: 'number',
	// TODO(live): [200] asumido — status real de la request de link Stripe (OAuth
	// Connect) NO verificado en vivo todavía (link Stripe = flujo live F5).
	linkSuccessStatuses: [200],
	// TODO(live): matcher NO verificado — base del matcher Authorize + needle propio.
	linkMutationUrlPattern: /odnservice|payment.?gateway|paymentgateway|vendor|integration|stripe/i,
	credsEnvKeys: STRIPE_CREDS_ENV_KEYS,
	isConfigured: () => areEnvKeysConfigured(STRIPE_CREDS_ENV_KEYS),
	xrayKeys: XRAY_KEYS_BY_GATEWAY.stripe,
	journeyDefaults: JOURNEY_DEFAULTS
};
