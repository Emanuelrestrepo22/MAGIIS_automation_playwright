/**
 * @deprecated Re-export legacy — la SoT real vive en:
 *   - `tests/fixtures/stripe/cards.ts` (datos del gateway)
 *   - `tests/features/gateway-pg/data/journey-defaults.ts` (datos de dominio)
 *
 * BL-024 Fase 1+2 (2026-05-13) — este archivo ahora es 100% thin re-export.
 * Nuevos archivos deben importar desde las SoT canónicas directamente.
 *
 * Mantenido para preservar imports existentes (POMs, helpers, specs).
 */

// Stripe-specific (env-aware) — vienen de la SoT real del gateway.
export {
	STRIPE_TEST_CARDS,
	STRIPE_EXPIRY,
	STRIPE_CVC,
	STRIPE_BILLING_ZIP,
	STRIPE_CARD_HOLDER_NAME,
} from '../../../fixtures/stripe/cards';

// Datos de dominio MAGIIS — agnósticos del gateway.
export { TEST_DATA } from './journey-defaults';
