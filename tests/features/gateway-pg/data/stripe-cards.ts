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
	/** Tarjeta perdida */
	lost_card: createStripeTestCard('4000000000009987'),
	/** Tarjeta robada */
	stolen_card: createStripeTestCard('4000000000009979'),
	/** CVC incorrecto */
	incorrect_cvc: createStripeTestCard('4000000000000101'),
	/** Tarjeta expirada */
	expired_card: createStripeTestCard('4000000000000069'),
	/** Falla comprobacion de CVC */
	cvc_check_fail: createStripeTestCard('4212345678901237'),
	/** Riesgo maximo */
	highest_risk: createStripeTestCard('4100000000000019'),
	/** Bloqueada siempre, alias para antifraude */
	always_blocked: createStripeTestCard('4000000000000002'),
	/** ZIP falla con riesgo elevado */
	zip_fail_elevated: createStripeTestCard('4000000000000036'),
	/** Address unavailable */
	address_unavailable: createStripeTestCard('4000000000000010'),
} as const satisfies Record<string, StripeTestCard>;

export function getStripeCardLast4(cardNumber: string): string {
	return cardNumber.slice(-4);
}
