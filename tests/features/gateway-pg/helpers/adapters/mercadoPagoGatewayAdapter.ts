import { JOURNEY_DEFAULTS_BY_GATEWAY } from '../../data/journey-defaults';
import { XRAY_KEYS_BY_GATEWAY } from '../../data/xray-keys';
import type { GatewayPgAdapter } from './types';
import { areEnvKeysConfigured } from './types';

/**
 * Credenciales del dispatcher MP (carrier ARG). MP no pide creds en un modal de link
 * (vincula por cuenta), pero SÍ requiere un carrier propio → user/pass dedicados.
 */
const MERCADO_PAGO_CREDS_ENV_KEYS = ['USER_CARRIER_MP', 'PASS_CARRIER_MP'];

/**
 * Adapter declarativo Mercado Pago.
 * S2 (carrier/gateway-standardization) — extendido con config operacional
 * (cardForm / outcomeTrigger / link / creds / registry Xray).
 */
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
	],

	// ── Config operacional (S2) ──────────────────────────────────────────────
	cardForm: 'native-angular',
	// MP dispara el outcome por el NOMBRE del titular (keyword APRO/OTHE/…).
	outcomeTrigger: 'holder-name',
	// 5° campo del form nativo = tipo + número de documento (DNI).
	nativeExtraField: 'document',
	// TODO(live): [200] asumido — status real de la request de link MP NO verificado.
	linkSuccessStatuses: [200],
	// TODO(live): matcher NO verificado — base del matcher Authorize + needle propio.
	linkMutationUrlPattern: /odnservice|payment.?gateway|paymentgateway|vendor|integration|mercado/i,
	credsEnvKeys: MERCADO_PAGO_CREDS_ENV_KEYS,
	isConfigured: () => areEnvKeysConfigured(MERCADO_PAGO_CREDS_ENV_KEYS),
	xrayKeys: XRAY_KEYS_BY_GATEWAY['mercado-pago'],
	journeyDefaults: JOURNEY_DEFAULTS_BY_GATEWAY['mercado-pago']
};
