/**
 * Stripe Test Cards — Source of Truth Canónica
 * ==============================================
 *
 * BL-024 Fase 3 (2026-05-13) — la SoT canónica se mueve bajo el umbrella
 * `fixtures/gateways/stripe/`. La ubicación anterior `tests/fixtures/stripe/`
 * queda como thin re-export.
 *
 * Regla arquitectónica:
 *   - Importar desde `tests/fixtures/gateways/stripe/cards` en código nuevo.
 *   - Los re-exports en `tests/fixtures/stripe/*` y `features/gateway-pg/data/*`
 *     se mantienen por compat con specs existentes.
 *
 * Para la elección de QUÉ card usar según la intención del test, usar el
 * namespace semántico en `card-policy.ts` (ej. `CARDS.HAPPY_3DS`) o el
 * resolver polimórfico cross-gateway `_shared/resolver.ts`.
 *
 * Referencia externa: https://stripe.com/docs/testing#cards
 */

import { faker } from '@faker-js/faker';
import { getCurrentEnv } from '../../../config/runtime';

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface StripeTestCard {
	number: string;
	last4: string;
	exp: string;
	cvc: string;
	zip_code: string;
	holderName: string;
}

// ═══════════════════════════════════════════════════════════════════════
// RAW CONSTANTS — entorno TEST únicamente
// ═══════════════════════════════════════════════════════════════════════

export const TEST_STRIPE_CARD_EXPIRY = '12/34';
export const TEST_STRIPE_CARD_CVC = '123';
export const TEST_STRIPE_CARD_ZIP_CODE = '76000';
export const TEST_STRIPE_CARD_HOLDER_NAME = `${faker.person.firstName()} ${faker.person.lastName()}`;

function createStripeTestCard(number: string): StripeTestCard {
	return {
		number,
		last4: getStripeCardLast4(number),
		exp: TEST_STRIPE_CARD_EXPIRY,
		cvc: TEST_STRIPE_CARD_CVC,
		zip_code: TEST_STRIPE_CARD_ZIP_CODE,
		holderName: TEST_STRIPE_CARD_HOLDER_NAME
	};
}

/**
 * Registry RAW snake_case — tarjetas de prueba Stripe con todos los datos.
 * Para uso interno y avanzado (cuando se necesita el objeto completo).
 *
 * Para uso normal en specs, preferir `STRIPE_TEST_CARDS` (env-aware, devuelve
 * solo el `.number`) o el namespace semántico `CARDS` en `card-policy.ts`.
 */
export const STRIPE_TEST_CARDS_RAW = {
	/** Pago exitoso sin 3DS */
	visa_success: createStripeTestCard('4242424242424242'),
	/** 3DS requerido -> autenticacion exitosa (requires_action) */
	visa_3ds_success: createStripeTestCard('4000002500003155'),
	/** 3DS requerido -> el challenge aparece y el pago/autenticación FALLA (NO_AUTORIZADO).
	 *  FIX 2026-07-21: era 4000000000009235 (decline genérico SIN 3DS → nunca mostraba challenge). */
	visa_3ds_fail: createStripeTestCard('4000008400001629'),
	/** Fondos insuficientes */
	declined_funds: createStripeTestCard('4000000000009995'),
	/** Declinada generica */
	declined_generic: createStripeTestCard('4000000000000002'),
	/** 3DS obligatorio -> challenge */
	three_ds_required: createStripeTestCard('4000000000003220'),
	/** 3DS siempre requerido */
	always_authenticate: createStripeTestCard('4000002760003184'),
	/** Mastercard debit test card */
	mastercard_debit: createStripeTestCard('5200828282828210'),
	/** Tarjeta perdida */
	lost_card: createStripeTestCard('4000000000009987'),
	/** Tarjeta robada */
	stolen_card: createStripeTestCard('4000000000009979'),
	/**
	 * CVC incorrecto — decline code: incorrect_cvc
	 * Stripe: cargo declinado porque el CVC ingresado no coincide.
	 * Fuente Excel: TC1085 (4000 0000 0000 0127)
	 */
	incorrect_cvc: createStripeTestCard('4000000000000127'),
	/** Tarjeta expirada */
	expired_card: createStripeTestCard('4000000000000069'),
	/**
	 * Falla comprobacion de CVC (cvc_check fails) — TC1087
	 * Stripe: el cargo se intenta procesar pero el check de CVC falla.
	 * Fuente Excel: TC1087 (4000 0000 0000 0101)
	 */
	cvc_check_fail: createStripeTestCard('4000000000000101'),
	/**
	 * Riesgo maximo — Stripe Radar bloquea la transaccion — TC1088
	 * Fuente Excel: TC1088 (4100 0000 0000 0019)
	 */
	highest_risk: createStripeTestCard('4100000000000019'),
	/**
	 * Siempre bloqueada por Radar (alias de highest_risk) — TC1088
	 * Fuente Excel: TC1088 usa el mismo numero que highest_risk.
	 */
	always_blocked: createStripeTestCard('4100000000000019'),
	/**
	 * Falla CVC check con riesgo elevado — TC1089
	 * Fuente Excel: TC1089 (4000 0000 0000 4954)
	 * Nota: no documentada en Stripe docs públicos.
	 */
	cvc_check_fail_elevated: createStripeTestCard('4000000000004954'),
	/**
	 * ZIP falla con riesgo elevado — address_zip_check fails — TC1090
	 * Fuente Excel: TC1090 (4000 0000 0000 0036)
	 */
	zip_fail_elevated: createStripeTestCard('4000000000000036'),
	/**
	 * Dirección no disponible — address_line1_check fails — TC1091
	 * Fuente Excel: TC1091 (4000 0000 0000 0028)
	 */
	address_unavailable: createStripeTestCard('4000000000000028'),
	/**
	 * Error de autenticacion 3DS — TC1094
	 * Fuente Excel: TC1094 (4000 0084 2000 1629)
	 * Nota: no documentada en Stripe docs públicos.
	 */
	error_3ds: createStripeTestCard('4000008420001629'),
	/**
	 * 3DS obligatorio + pago rechazado post-autenticación (card_declined) — (4000 0084 0000 1629)
	 * Radar solicita 3DS obligatoriamente; la autenticación completa con éxito pero
	 * el cargo es rechazado con card_declined después de la autenticación.
	 * Fuente: Stripe docs — https://stripe.com/docs/testing#cards
	 */
	declined_after_3ds: createStripeTestCard('4000008400001629')
} as const satisfies Record<string, StripeTestCard>;

export function getStripeCardLast4(cardNumber: string): string {
	return cardNumber.slice(-4);
}

// ═══════════════════════════════════════════════════════════════════════
// ENV RESOLUTION — TEST usa los valores RAW; UAT/PROD requiere env vars.
// ═══════════════════════════════════════════════════════════════════════

const currentEnv = getCurrentEnv();
const isTestEnv = currentEnv === 'test';

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing ${name} for ${currentEnv} environment`);
	}

	return value;
}

function resolveCardNumber(envName: string, testValue: string): string {
	return isTestEnv ? testValue : requireEnv(envName);
}

/**
 * Registry env-aware camelCase — devuelve solo el `number` de cada tarjeta.
 * Resuelve desde process.env en UAT/PROD; usa valores RAW en TEST.
 *
 * Este es el registry que consumen activamente los POMs y specs Stripe.
 */
export const STRIPE_TEST_CARDS = {
	successDirect: resolveCardNumber('STRIPE_CARD_SUCCESS_DIRECT', STRIPE_TEST_CARDS_RAW.visa_success.number),
	success3DS: resolveCardNumber('STRIPE_CARD_SUCCESS_3DS', STRIPE_TEST_CARDS_RAW.visa_3ds_success.number),
	fail3DS: resolveCardNumber('STRIPE_CARD_FAIL_3DS', STRIPE_TEST_CARDS_RAW.visa_3ds_fail.number),
	insufficientFunds: resolveCardNumber('STRIPE_CARD_INSUFFICIENT_FUNDS', STRIPE_TEST_CARDS_RAW.declined_funds.number),
	declined: resolveCardNumber('STRIPE_CARD_DECLINED', STRIPE_TEST_CARDS_RAW.declined_generic.number),
	threeDSRequired: resolveCardNumber('STRIPE_CARD_3DS_REQUIRED', STRIPE_TEST_CARDS_RAW.three_ds_required.number),
	alwaysAuthenticate: resolveCardNumber(
		'STRIPE_CARD_ALWAYS_AUTHENTICATE',
		STRIPE_TEST_CARDS_RAW.always_authenticate.number
	),
	mastercardDebit: resolveCardNumber('STRIPE_CARD_MASTERCARD_DEBIT', STRIPE_TEST_CARDS_RAW.mastercard_debit.number),
	lostCard: resolveCardNumber('STRIPE_CARD_LOST', STRIPE_TEST_CARDS_RAW.lost_card.number),
	stolenCard: resolveCardNumber('STRIPE_CARD_STOLEN', STRIPE_TEST_CARDS_RAW.stolen_card.number),
	incorrectCvc: resolveCardNumber('STRIPE_CARD_INCORRECT_CVC', STRIPE_TEST_CARDS_RAW.incorrect_cvc.number),
	expiredCard: resolveCardNumber('STRIPE_CARD_EXPIRED', STRIPE_TEST_CARDS_RAW.expired_card.number),
	highestRisk: resolveCardNumber('STRIPE_CARD_HIGHEST_RISK', STRIPE_TEST_CARDS_RAW.highest_risk.number),
	alwaysBlocked: resolveCardNumber('STRIPE_CARD_ALWAYS_BLOCKED', STRIPE_TEST_CARDS_RAW.always_blocked.number),
	/** TC1087 — cvc_check falla post-auth (4000 0000 0000 0101) */
	cvcCheckFail: resolveCardNumber('STRIPE_CARD_CVC_CHECK_FAIL', STRIPE_TEST_CARDS_RAW.cvc_check_fail.number),
	/** TC1089 — cvc check fail elevated (4000 0000 0000 4954) */
	cvcCheckFailElevated: resolveCardNumber(
		'STRIPE_CARD_CVC_CHECK_FAIL_ELEVATED',
		STRIPE_TEST_CARDS_RAW.cvc_check_fail_elevated.number
	),
	/** TC1090 — zip fail elevated (4000 0000 0000 0036) */
	zipFailElevated: resolveCardNumber('STRIPE_CARD_ZIP_FAIL_ELEVATED', STRIPE_TEST_CARDS_RAW.zip_fail_elevated.number),
	/** TC1091 — address_line1 check falla (4000 0000 0000 0028) */
	addressUnavailable: resolveCardNumber(
		'STRIPE_CARD_ADDRESS_UNAVAILABLE',
		STRIPE_TEST_CARDS_RAW.address_unavailable.number
	),
	/** TC1094 — error autenticacion 3DS (4000 0084 2000 1629) */
	error3DS: resolveCardNumber('STRIPE_CARD_ERROR_3DS', STRIPE_TEST_CARDS_RAW.error_3ds.number),
	/** 3DS obligatorio → pago rechazado post-autenticación card_declined (4000 0084 0000 1629) */
	declinedAfter3DS: resolveCardNumber(
		'STRIPE_CARD_DECLINED_AFTER_3DS',
		STRIPE_TEST_CARDS_RAW.declined_after_3ds.number
	)
} as const;

export const STRIPE_EXPIRY = isTestEnv ? TEST_STRIPE_CARD_EXPIRY : requireEnv('STRIPE_CARD_EXPIRY');
export const STRIPE_CVC = isTestEnv ? TEST_STRIPE_CARD_CVC : requireEnv('STRIPE_CARD_CVC');
export const STRIPE_BILLING_ZIP = isTestEnv ? TEST_STRIPE_CARD_ZIP_CODE : requireEnv('STRIPE_CARD_ZIP_CODE');
export const STRIPE_CARD_HOLDER_NAME = isTestEnv ? TEST_STRIPE_CARD_HOLDER_NAME : requireEnv('STRIPE_CARD_HOLDER_NAME');

/**
 * Alias del registry RAW para código legacy que usa el nombre `STRIPE_TEST_CARD_FIXTURES`.
 * Nuevos archivos deben usar `STRIPE_TEST_CARDS_RAW` directamente.
 */
export const STRIPE_TEST_CARD_FIXTURES = STRIPE_TEST_CARDS_RAW;
