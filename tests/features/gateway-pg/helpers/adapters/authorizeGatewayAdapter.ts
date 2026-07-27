import { JOURNEY_DEFAULTS_BY_GATEWAY } from '../../data/journey-defaults';
import { XRAY_KEYS_BY_GATEWAY } from '../../data/xray-keys';
import type { GatewayPgAdapter } from './types';
import { areEnvKeysConfigured } from './types';

/** Credenciales sandbox del modal de link Authorize (ver `.env.example`). */
const AUTHORIZE_CREDS_ENV_KEYS = ['AUTHORIZE_API_LOGIN_ID', 'AUTHORIZE_TRANSACTION_KEY'];

/**
 * Adapter declarativo Authorize.net — metadata estática del comportamiento del gateway.
 *
 * BL-024 Fase 4 (2026-05-13) — vinculado a su fixture canónico en
 * `tests/fixtures/gateways/authorize/` (cards.ts + card-policy.ts + card-resolver.ts).
 * S2 (carrier/gateway-standardization) — extendido con config operacional
 * (cardForm / outcomeTrigger / link / creds / registry Xray).
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
	mobileTodos: ['Finish trip from Android app', 'Confirm charge event reaches Authorize flow'],
	validationTodos: ['Confirm backend payment state', 'Validate Authorize transaction visibility when required'],

	// ── Config operacional (S2) ──────────────────────────────────────────────
	cardForm: 'native-angular',
	outcomeTrigger: 'cvv-zip',
	// 5° campo del form nativo = ZIP (formcontrolname NO confirmado live — el helper
	// mantiene candidatos + fallback FRAGILE, ver helpers/authorize.helpers.ts).
	nativeExtraField: 'zip',
	// Quirk backend VERIFICADO (HANDOFF 2026-07-25): 500 = conectada desde estado
	// limpio; 409 = ya vinculada por otra sesión. 400 = NO conectada.
	linkSuccessStatuses: [500, 409],
	// Matcher VERIFICADO live (endpoint del link = odnService, MG-476) — mismo regex
	// que AppStoreGatewaysPage.expectLinkStatusOk.
	linkMutationUrlPattern: /odnservice|payment.?gateway|paymentgateway|vendor|integration|authorize/i,
	credsEnvKeys: AUTHORIZE_CREDS_ENV_KEYS,
	isConfigured: () => areEnvKeysConfigured(AUTHORIZE_CREDS_ENV_KEYS),
	xrayKeys: XRAY_KEYS_BY_GATEWAY.authorize,
	journeyDefaults: JOURNEY_DEFAULTS_BY_GATEWAY.authorize
};
