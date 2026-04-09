/**
 * Tarjetas de prueba Stripe Test Mode.
 * Fuente: https://stripe.com/docs/testing#cards
 *
 * NUNCA usar en producción. Solo para ambientes TEST y UAT con Stripe en test mode.
 */

export interface StripeTestCard {
  number: string;
  exp: string;
  cvc: string;
  last4: string;
}

export const STRIPE_TEST_CARDS = {
  /** Pago exitoso sin 3DS */
  visa_success: {
    number: '4242424242424242',
    exp: '12/26',
    cvc: '123',
    last4: '4242',
  },
  /** 3DS requerido → autenticación exitosa (requires_action) */
  visa_3ds_success: {
    number: '4000002500003155',
    exp: '12/26',
    cvc: '123',
    last4: '3155',
  },
  /** 3DS requerido → autenticación falla */
  visa_3ds_fail: {
    number: '4000000000009235',
    exp: '12/26',
    cvc: '123',
    last4: '9235',
  },
  /** Fondos insuficientes */
  declined_funds: {
    number: '4000000000009995',
    exp: '12/26',
    cvc: '123',
    last4: '9995',
  },
  /** Declinada genérica */
  declined_generic: {
    number: '4000000000000002',
    exp: '12/26',
    cvc: '123',
    last4: '0002',
  },
} as const satisfies Record<string, StripeTestCard>;
