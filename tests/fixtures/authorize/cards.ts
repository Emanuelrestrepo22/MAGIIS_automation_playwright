/**
 * Authorize.net Test Cards — Source of Truth Canónica
 * =====================================================
 *
 * Ubicación OFICIAL de las tarjetas de prueba Authorize.net para todo el proyecto.
 *
 * Diferencia con Stripe:
 *   - En Stripe el NÚMERO de tarjeta determina el outcome (4242 OK, 9235 fail 3DS).
 *   - En Authorize.net **el outcome se dispara por CVV o ZIP** sobre tarjetas fijas:
 *       - CVV `900` → CVV match (approved)
 *       - CVV `901` → CVV does NOT match
 *       - CVV `904` → CVV not processed
 *       - ZIP `46282` → declined genérico (Response Code 2)
 *       - ZIP `46205` → AVS "N: No Match"
 *       - ZIP `46225-46228` → partial / prepaid authorization
 *   - **No requiere 3DS** en el flujo estándar (consistente con
 *     `authorizeGatewayAdapter.requires3ds = false`).
 *
 * Para Amex el CVV es de 4 dígitos en lugar de 3, pero los triggers se mantienen.
 *
 * Regla arquitectónica:
 *   - Cualquier test/spec/helper que necesite una tarjeta Authorize la importa
 *     desde `tests/fixtures/authorize/cards`.
 *   - NO duplicar definiciones inline.
 *   - Para elegir QUÉ card usar según la intención del test, usar el namespace
 *     semántico en `card-policy.ts` (ej. `AUTHORIZE_CARDS.SUCCESS`).
 *
 * Referencia externa:
 *   <https://developer.authorize.net/hello_world/testing_guide.html>
 */

export type AuthorizeCardBrand =
	| 'visa'
	| 'mastercard'
	| 'amex'
	| 'discover'
	| 'diners'
	| 'jcb';

/**
 * Outcomes esperados del sandbox Authorize.net.
 * Cada uno está disparado por una combinación específica de CVV y/o ZIP.
 */
export type AuthorizeOutcome =
	| 'approved'
	| 'declined-generic'
	| 'cvv-mismatch'
	| 'cvv-not-processed'
	| 'avs-no-match'
	| 'avs-non-us-issuer'
	| 'partial-authorization'
	| 'prepaid-zero-balance';

export type AuthorizeTestCard = {
	number: string;
	brand: AuthorizeCardBrand;
	exp: { month: string; year: string };
	cvc: string;
	zip: string;
	holderName: string;
	expectedOutcome: AuthorizeOutcome;
	description: string;
};

/**
 * Expiry recomendada — cualquier fecha futura es válida en sandbox.
 * Usamos 12/2030 para evitar tener que actualizar el fixture todos los años.
 */
export const AUTHORIZE_DEFAULT_EXPIRY = { month: '12', year: '2030' } as const;

export const AUTHORIZE_DEFAULT_HOLDER = 'MAGIIS QA Test';

/**
 * Registry de tarjetas canónicas Authorize.net.
 *
 * Cada entrada combina (number, cvc, zip) para disparar un outcome específico.
 * El número de tarjeta se mantiene constante (Visa 4111-... como default), lo
 * que cambia entre escenarios es el CVV y/o el ZIP.
 */
export const AUTHORIZE_TEST_CARDS = {
	// ═══════════════════════════════════════════════════════════════════
	// HAPPY PATHS
	// ═══════════════════════════════════════════════════════════════════

	visaSuccess: {
		number: '4111111111111111',
		brand: 'visa',
		exp: AUTHORIZE_DEFAULT_EXPIRY,
		cvc: '900',
		zip: '90210',
		holderName: AUTHORIZE_DEFAULT_HOLDER,
		expectedOutcome: 'approved',
		description: 'Visa + CVV 900 (match) + ZIP neutro → approved (Response Code 1)',
	},

	mastercardSuccess: {
		number: '5424000000000015',
		brand: 'mastercard',
		exp: AUTHORIZE_DEFAULT_EXPIRY,
		cvc: '900',
		zip: '90210',
		holderName: AUTHORIZE_DEFAULT_HOLDER,
		expectedOutcome: 'approved',
		description: 'Mastercard + CVV 900 + ZIP neutro → approved',
	},

	amexSuccess: {
		number: '370000000000002',
		brand: 'amex',
		exp: AUTHORIZE_DEFAULT_EXPIRY,
		cvc: '9000', // Amex requiere 4 dígitos
		zip: '90210',
		holderName: AUTHORIZE_DEFAULT_HOLDER,
		expectedOutcome: 'approved',
		description: 'Amex + CVV 9000 (4 dígitos) + ZIP neutro → approved',
	},

	discoverSuccess: {
		number: '6011000000000012',
		brand: 'discover',
		exp: AUTHORIZE_DEFAULT_EXPIRY,
		cvc: '900',
		zip: '90210',
		holderName: AUTHORIZE_DEFAULT_HOLDER,
		expectedOutcome: 'approved',
		description: 'Discover + CVV 900 + ZIP neutro → approved',
	},

	// ═══════════════════════════════════════════════════════════════════
	// UNHAPPY PATHS — DECLINES
	// ═══════════════════════════════════════════════════════════════════

	declinedGeneric: {
		number: '4111111111111111',
		brand: 'visa',
		exp: AUTHORIZE_DEFAULT_EXPIRY,
		cvc: '900',
		zip: '46282', // trigger declined
		holderName: AUTHORIZE_DEFAULT_HOLDER,
		expectedOutcome: 'declined-generic',
		description: 'Visa + ZIP 46282 → Response Code 2 (declined genérico)',
	},

	// ═══════════════════════════════════════════════════════════════════
	// UNHAPPY PATHS — CVV
	// ═══════════════════════════════════════════════════════════════════

	cvvMismatch: {
		number: '4111111111111111',
		brand: 'visa',
		exp: AUTHORIZE_DEFAULT_EXPIRY,
		cvc: '901', // trigger CVV no match
		zip: '90210',
		holderName: AUTHORIZE_DEFAULT_HOLDER,
		expectedOutcome: 'cvv-mismatch',
		description: 'Visa + CVV 901 → CVV "N: Does NOT Match"',
	},

	cvvNotProcessed: {
		number: '4111111111111111',
		brand: 'visa',
		exp: AUTHORIZE_DEFAULT_EXPIRY,
		cvc: '904', // trigger CVV not processed
		zip: '90210',
		holderName: AUTHORIZE_DEFAULT_HOLDER,
		expectedOutcome: 'cvv-not-processed',
		description: 'Visa + CVV 904 → CVV "P: Is NOT Processed"',
	},

	// ═══════════════════════════════════════════════════════════════════
	// UNHAPPY PATHS — AVS
	// ═══════════════════════════════════════════════════════════════════

	avsNoMatch: {
		number: '4111111111111111',
		brand: 'visa',
		exp: AUTHORIZE_DEFAULT_EXPIRY,
		cvc: '900',
		zip: '46205', // trigger AVS no match
		holderName: AUTHORIZE_DEFAULT_HOLDER,
		expectedOutcome: 'avs-no-match',
		description: 'Visa + ZIP 46205 → AVS "N: No Match"',
	},

	avsNonUsIssuer: {
		number: '4111111111111111',
		brand: 'visa',
		exp: AUTHORIZE_DEFAULT_EXPIRY,
		cvc: '900',
		zip: '46204',
		holderName: AUTHORIZE_DEFAULT_HOLDER,
		expectedOutcome: 'avs-non-us-issuer',
		description: 'Visa + ZIP 46204 → AVS "G: Non-U.S. Issuer"',
	},

	// ═══════════════════════════════════════════════════════════════════
	// EDGE CASES — PARTIAL / PREPAID AUTHORIZATIONS
	// ═══════════════════════════════════════════════════════════════════

	partialAuthorization: {
		number: '4111111111111111',
		brand: 'visa',
		exp: AUTHORIZE_DEFAULT_EXPIRY,
		cvc: '900',
		zip: '46225',
		holderName: AUTHORIZE_DEFAULT_HOLDER,
		expectedOutcome: 'partial-authorization',
		description: 'Visa + ZIP 46225 → Partial Auth ($1.23 authorized)',
	},

	prepaidZeroBalance: {
		number: '4111111111111111',
		brand: 'visa',
		exp: AUTHORIZE_DEFAULT_EXPIRY,
		cvc: '900',
		zip: '46228',
		holderName: AUTHORIZE_DEFAULT_HOLDER,
		expectedOutcome: 'prepaid-zero-balance',
		description: 'Visa + ZIP 46228 → Prepaid Auth con $0 de balance',
	},
} as const satisfies Record<string, AuthorizeTestCard>;

export type AuthorizeTestCardKey = keyof typeof AUTHORIZE_TEST_CARDS;

/** Devuelve los últimos 4 dígitos del número, útil para asserts de UI. */
export function getAuthorizeCardLast4(card: AuthorizeTestCard): string {
	return card.number.slice(-4);
}
