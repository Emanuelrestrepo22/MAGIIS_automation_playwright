/**
 * @deprecated Re-export legacy — la SoT real vive en
 * `tests/fixtures/gateways/stripe/cards.ts`.
 *
 * BL-024 Fase 3 (2026-05-13) — el umbrella multi-gateway se mueve a
 * `tests/fixtures/gateways/`. Este archivo se mantiene como thin re-export
 * para no romper imports existentes.
 *
 * Nuevos archivos deben importar desde `tests/fixtures/gateways/stripe/cards`.
 */

export {
	STRIPE_TEST_CARDS,
	STRIPE_TEST_CARDS_RAW,
	STRIPE_TEST_CARD_FIXTURES,
	STRIPE_EXPIRY,
	STRIPE_CVC,
	STRIPE_BILLING_ZIP,
	STRIPE_CARD_HOLDER_NAME,
	TEST_STRIPE_CARD_EXPIRY,
	TEST_STRIPE_CARD_CVC,
	TEST_STRIPE_CARD_ZIP_CODE,
	TEST_STRIPE_CARD_HOLDER_NAME,
	getStripeCardLast4,
	type StripeTestCard
} from '../gateways/stripe/cards';
