/**
 * Stripe — Mapping `last4 → cardNumber completo`
 * ================================================
 *
 * BL-024 mejora continua (2026-05-13) — extraído desde
 * `tests/pages/carrier/NewTravelPageBase.ts` para reducir el acoplamiento
 * del POM con datos Stripe. El POM consume desde acá; cuando entre Authorize
 * tendrá su propio mapping análogo (o no, según la naturaleza del trigger).
 *
 * Cuándo se usa:
 *   Los specs/POMs MAGIIS reciben `cardLast4: string` (4 dígitos) como input
 *   por trazabilidad humana (matrices QA, logs, evidencia visual). Para llenar
 *   el form Stripe Elements se necesita el número completo (PAN). Esta tabla
 *   resuelve la traducción.
 *
 * Para qué NO usar:
 *   - No es un namespace semántico — para eso está `card-policy.ts` (CARDS).
 *   - Authorize NO usa este mapping porque su trigger es CVV/ZIP, no número.
 */

import { STRIPE_TEST_CARDS } from './cards';

/**
 * Mapping inverso `last4 → cardNumber`. Cubre TODAS las cards del registry
 * env-aware `STRIPE_TEST_CARDS`. Construido programáticamente para que no
 * haga falta mantener una lista paralela.
 *
 * Importante:
 *   - Las cards con last4 colidente (ej. `highest_risk` y `always_blocked`
 *     comparten `0019`) quedan con UN solo número en el mapping. El que gane
 *     depende del orden de `Object.values()`. Documentar en `cards.ts` si
 *     hay colisión consciente.
 *   - Si el last4 no existe, lookup devuelve `undefined`. El caller debe
 *     validar antes de fillear el form (lanzar error claro).
 */
export const STRIPE_CARD_BY_LAST4: Readonly<Record<string, string>> = Object.freeze(
	Object.fromEntries(
		Object.values(STRIPE_TEST_CARDS).map((cardNumber: string) => [cardNumber.slice(-4), cardNumber]),
	),
);

/**
 * Resuelve un cardNumber completo desde su last4. Lanza si no existe.
 *
 * Uso preferido por POMs (sintaxis declarativa):
 *
 *   import { resolveStripeCardByLast4 } from 'tests/fixtures/gateways/stripe/card-by-last4';
 *   const cardNumber = resolveStripeCardByLast4(last4);
 */
export function resolveStripeCardByLast4(last4: string): string {
	const cardNumber = STRIPE_CARD_BY_LAST4[last4];
	if (!cardNumber) {
		throw new Error(
			`[stripe/card-by-last4] No existe card Stripe con last4='${last4}'. ` +
				`Cards disponibles: ${Object.keys(STRIPE_CARD_BY_LAST4).join(', ')}.`,
		);
	}
	return cardNumber;
}
