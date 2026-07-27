import { JOURNEY_DEFAULTS_BY_GATEWAY } from '../../data/journey-defaults';
import { XRAY_KEYS_BY_GATEWAY } from '../../data/xray-keys';
import type { GatewayPgAdapter } from './types';
import { areEnvKeysConfigured } from './types';

/** Credenciales merchant del modal de link eBizCharge (ver `.env.example`). */
const EBIZCHARGE_CREDS_ENV_KEYS = ['EBIZ_MERCHANT_USER', 'EBIZ_MERCHANT_PASSWORD', 'EBIZ_SECURITY_KEY'];

/**
 * Adapter declarativo eBizCharge.
 * S2 (carrier/gateway-standardization) — extendido con config operacional
 * (cardForm / outcomeTrigger / link / creds / registry Xray).
 */
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
	],

	// ── Config operacional (S2) ──────────────────────────────────────────────
	cardForm: 'native-angular',
	// eBiz dispara el outcome por número de tarjeta (como Stripe).
	outcomeTrigger: 'number',
	// Sin 5° campo confirmado para eBiz (los campos del modal NO están verificados live — S4).
	// TODO(live): [200] asumido — status real de la request de link eBiz NO verificado.
	linkSuccessStatuses: [200],
	// TODO(live): matcher NO verificado — base del matcher Authorize + needle propio.
	linkMutationUrlPattern: /odnservice|payment.?gateway|paymentgateway|vendor|integration|ebiz/i,
	credsEnvKeys: EBIZCHARGE_CREDS_ENV_KEYS,
	isConfigured: () => areEnvKeysConfigured(EBIZCHARGE_CREDS_ENV_KEYS),
	xrayKeys: XRAY_KEYS_BY_GATEWAY.ebizcharge,
	journeyDefaults: JOURNEY_DEFAULTS_BY_GATEWAY.ebizcharge
};
