import { JOURNEY_DEFAULTS_BY_GATEWAY } from '../../data/journey-defaults';
import { EBIZCHARGE_LINK_MUTATION_URL_PATTERN, EBIZCHARGE_LINK_SUCCESS_STATUSES } from '../../data/link-status-defaults';
import { XRAY_KEYS_BY_GATEWAY } from '../../data/xray-keys';
import type { GatewayPgAdapter } from './types';
import { areEnvKeysConfigured } from './types';

/** Credenciales merchant del modal de link eBizCharge (ver `.env.example`). */
// 4 factores del modal real (verificado en vivo 2026-07-30): Subscription-Key + Security Id + User Id + Password.
const EBIZCHARGE_CREDS_ENV_KEYS = ['EBIZ_MERCHANT_USER', 'EBIZ_MERCHANT_PASSWORD', 'EBIZ_SECURITY_KEY', 'EBIZ_SUBSCRIPTION_KEY'];

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
	mobileTodos: ['Validate trip completion and charge trigger in Android app', 'Confirm mobile state after charge'],
	validationTodos: ['Confirm backend payment state', 'Confirm eBizCharge response or transaction ID if exposed'],

	// ── Config operacional (S2) ──────────────────────────────────────────────
	cardForm: 'native-angular',
	// eBiz dispara el outcome por número de tarjeta (como Stripe).
	outcomeTrigger: 'number',
	// 5º campo VERIFICADO EN VIVO (2026-07-30): autocomplete de DIRECCIÓN que deriva el ZIP.
	// Se comporta como pick-up/drop-off — escribir, elegir la sugerencia, y el sistema completa el
	// código postal. Para eBiz el ZIP es valor derivado, no dato de entrada.
	nativeExtraField: 'address-zip',
	// TODO(live): [200] asumido — status real de la request de link eBiz NO verificado.
	// FUENTE ÚNICA compartida con el POM (data/link-status-defaults.ts — anti-drift T11).
	linkSuccessStatuses: [...EBIZCHARGE_LINK_SUCCESS_STATUSES],
	// TODO(live): matcher NO verificado — base del matcher Authorize + needle propio.
	linkMutationUrlPattern: EBIZCHARGE_LINK_MUTATION_URL_PATTERN,
	credsEnvKeys: EBIZCHARGE_CREDS_ENV_KEYS,
	isConfigured: () => areEnvKeysConfigured(EBIZCHARGE_CREDS_ENV_KEYS),
	xrayKeys: XRAY_KEYS_BY_GATEWAY.ebizcharge,
	journeyDefaults: JOURNEY_DEFAULTS_BY_GATEWAY.ebizcharge
};
