/**
 * @deprecated Re-export legacy — la SoT real vive en `tests/fixtures/stripe/cards.ts`.
 *
 * BL-024 Fase 1 (2026-05-13) — invertida la dirección de dependencia. Este archivo
 * se mantiene SOLO para no romper imports existentes (POMs, helpers, specs).
 * Nuevos archivos deben importar desde `tests/fixtures/stripe/cards` directamente.
 *
 * Mapping de nombres preservados:
 *   - `STRIPE_TEST_CARDS` (acá legacy) === `STRIPE_TEST_CARDS_RAW` (en SoT)
 *   - El resto de exports mantiene el mismo nombre.
 */

export {
	STRIPE_TEST_CARDS_RAW as STRIPE_TEST_CARDS,
	TEST_STRIPE_CARD_EXPIRY,
	TEST_STRIPE_CARD_CVC,
	TEST_STRIPE_CARD_ZIP_CODE,
	TEST_STRIPE_CARD_HOLDER_NAME,
	getStripeCardLast4,
	type StripeTestCard,
} from '../../../fixtures/stripe/cards';
