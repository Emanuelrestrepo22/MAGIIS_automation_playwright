import type { JourneyPortal, PaymentGateway, PaymentValidationSource } from '../../contracts/gateway-pg.types';
import type { GatewayJourneyDefaults } from '../../data/journey-defaults';
import type { GatewayXrayRegistry } from '../../data/xray-keys';
import { getCurrentUserEnvironment } from '@fixtures/users';

/**
 * Tipo de formulario de tarjeta que renderiza el portal para la pasarela.
 *   - 'stripe-elements': iframes de Stripe Elements (ver NewTravelPageBase.fillPreauthorizedCard).
 *   - 'native-angular':  form Angular nativo compartido por MP / Authorize / eBiz
 *     (creditCardNumber, expiryDate, creditCardCVV, creditCardOwnerName + 5° campo variable).
 */
export type GatewayCardFormKind = 'stripe-elements' | 'native-angular';

/**
 * Qué campo de la tarjeta sandbox dispara el outcome (approved/declined/…):
 *   - 'number':      el número de tarjeta (Stripe, eBizCharge).
 *   - 'cvv-zip':     la combinación CVV + ZIP (Authorize.Net).
 *   - 'holder-name': el nombre del titular — keyword APRO/OTHE/… (Mercado Pago).
 */
export type GatewayOutcomeTrigger = 'number' | 'cvv-zip' | 'holder-name';

/**
 * 5° campo del form nativo Angular (además de los 4 comunes):
 *   - 'zip':      Authorize (formcontrolname del ZIP NO confirmado live — FRAGILE).
 *   - 'document': Mercado Pago (tipo + número de documento).
 * Ausente para 'stripe-elements' o cuando el form nativo no pide campo extra.
 */
export type GatewayNativeExtraField = 'zip' | 'document' | 'address-zip';

/**
 * Adapter declarativo por pasarela — metadata estática + config operacional
 * (S2, carrier/gateway-standardization). Los specs/factories/steps consultan
 * el adapter para ramificar SIN if-por-pasarela dispersos.
 */
export type GatewayPgAdapter = {
	gateway: PaymentGateway;
	displayName: string;
	defaultPortal: JourneyPortal;
	usesSharedCardForm: boolean;
	requiresMobileCompletion: boolean;
	requires3ds: boolean;
	tags: string[];
	expectedValidationSources: PaymentValidationSource[];
	webTodos: string[];
	mobileTodos: string[];
	validationTodos: string[];

	// ── Config operacional (S2) ──────────────────────────────────────────────

	/** Tipo de form de tarjeta del portal (selecciona la CardFormStrategy — S3). */
	cardForm: GatewayCardFormKind;
	/** Campo de la tarjeta sandbox que dispara el outcome. */
	outcomeTrigger: GatewayOutcomeTrigger;
	/** 5° campo del form nativo Angular, si aplica. */
	nativeExtraField?: GatewayNativeExtraField;
	/**
	 * Statuses HTTP de ÉXITO conocidos de la request de link.
	 * Authorize: [500, 409] (quirk backend VERIFICADO — 500 = conectada desde estado
	 * limpio, 409 = ya vinculada por otra sesión; 400 = NO conectada).
	 * Resto: [200] hasta verificar live (TODO).
	 */
	linkSuccessStatuses: number[];
	/** Matcher de URL de la mutación de link/unlink (solo Authorize verificado live). */
	linkMutationUrlPattern: RegExp;
	/**
	 * Env vars de credenciales propias de la pasarela. Vacío = usa las credenciales
	 * default del carrier (cadena USER_CARRIER_<GW>_<ENV> → … → USER_CARRIER).
	 */
	credsEnvKeys: string[];
	/** `true` si TODAS las `credsEnvKeys` están presentes (no vacías) en el env. */
	isConfigured(): boolean;
	/** Registry Xray/matriz de la pasarela (referencia a `data/xray-keys.ts`). */
	xrayKeys: GatewayXrayRegistry;
	/**
	 * Defaults de journey MAGIIS de la pasarela (S8): referencia a la entrada del gateway
	 * en `JOURNEY_DEFAULTS_BY_GATEWAY` (`data/journey-defaults.ts` — única fuente; la
	 * identidad referencial se valida en `assertAdapterFixtureConsistency`).
	 */
	journeyDefaults: GatewayJourneyDefaults;
};

/**
 * Keys de `keys` que NO están presentes en el env — considera presente tanto la key
 * directa `K` como su variante por ambiente `K_<ENV>` (post-review A4: mismo sufijo
 * TEST/UAT/PROD que la cadena de login `USER_CARRIER_<GW>_<ENV> → …`, resuelto con
 * `getCurrentUserEnvironment()` de `@fixtures/users`).
 */
export function missingEnvKeys(keys: readonly string[]): string[] {
	const envSuffix = getCurrentUserEnvironment().toUpperCase();
	return keys.filter(key => !process.env[key]?.trim() && !process.env[`${key}_${envSuffix}`]?.trim());
}

/**
 * Helper compartido de `isConfigured()`: toda key listada debe existir y no estar
 * vacía en `process.env` — como `K` directa o como variante `K_<ENV>` (ver
 * `missingEnvKeys`). Lista vacía = configurado (usa creds default del carrier).
 */
export function areEnvKeysConfigured(keys: readonly string[]): boolean {
	return missingEnvKeys(keys).length === 0;
}
