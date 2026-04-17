/**
 * Tarjetas de prueba Stripe para entorno TEST.
 * Fuente: https://stripe.com/docs/testing#cards
 *
 * No usar en UAT/PROD. Esos entornos deben leer tarjetas reales
 * desde variables de entorno o una fuente administrada aparte.
 */

import { faker } from '@faker-js/faker';

export interface StripeTestCard {
	number: string;
	last4: string;
	exp: string;
	cvc: string;
	zip_code: string;
	holderName: string;
}

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
		holderName: TEST_STRIPE_CARD_HOLDER_NAME,
	};
}

export const STRIPE_TEST_CARDS = {
	/** Pago exitoso sin 3DS */
	visa_success: createStripeTestCard('4242424242424242'),
	/** 3DS requerido -> autenticacion exitosa (requires_action) */
	visa_3ds_success: createStripeTestCard('4000002500003155'),
	/** 3DS requerido -> autenticacion falla */
	visa_3ds_fail: createStripeTestCard('4000000000009235'),
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
	declined_after_3ds: createStripeTestCard('4000008400001629'),
} as const satisfies Record<string, StripeTestCard>;

export function getStripeCardLast4(cardNumber: string): string {
	return cardNumber.slice(-4);
}
