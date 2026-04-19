/**
 * Stripe Test Cards — Source of Truth Canónica
 * ==============================================
 *
 * Ubicación OFICIAL de las tarjetas de prueba Stripe para todo el proyecto.
 *
 * Esta carpeta (`tests/fixtures/stripe/`) es el lugar ÚNICO donde viven las
 * tarjetas atómicas reutilizables — a diferencia de `features/<x>/data/` que
 * aloja scenarios específicos (combinaciones card × user × flow).
 *
 * Regla arquitectónica:
 *   - Cualquier test/spec/helper que necesite una tarjeta Stripe la importa
 *     desde `@/tests/fixtures/stripe/cards` o directamente `tests/fixtures/stripe/cards`.
 *   - NO duplicar definiciones inline en tests.
 *   - NO usar `features/gateway-pg/data/stripe-cards` en código nuevo (re-export legacy).
 *
 * Para la elección de QUÉ card usar según la intención del test, usar el
 * namespace semántico en `card-policy.ts` (ej. `CARDS.HAPPY_3DS`).
 *
 * Referencia externa: https://stripe.com/docs/testing#cards
 */

// Registry camelCase con resolución env (test/uat/prod) — usado por todos los tests activos.
export {
	STRIPE_TEST_CARDS,
	STRIPE_EXPIRY,
	STRIPE_CVC,
	STRIPE_BILLING_ZIP,
	STRIPE_CARD_HOLDER_NAME,
} from '../../features/gateway-pg/data/stripeTestData';

// Registry raw snake_case (sin env resolution) + helpers — para usos internos/avanzados.
export {
	STRIPE_TEST_CARDS as STRIPE_TEST_CARD_FIXTURES,
	TEST_STRIPE_CARD_EXPIRY,
	TEST_STRIPE_CARD_CVC,
	TEST_STRIPE_CARD_ZIP_CODE,
	TEST_STRIPE_CARD_HOLDER_NAME,
	getStripeCardLast4,
	type StripeTestCard,
} from '../../features/gateway-pg/data/stripe-cards';
