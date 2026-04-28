/**
 * Authorize.net Card Resolver
 * ============================
 *
 * Convierte un identificador de intención al objeto AuthorizeTestCard completo.
 *
 * Análogo a `tests/fixtures/stripe/card-resolver.ts`, pero con una diferencia:
 * en Authorize.net el outcome se define por (number, cvc, zip) combinados, no
 * sólo por el number. Por eso el resolver retorna directo el objeto del policy
 * en vez de buscar por número en un registry separado.
 *
 * Uso en specs:
 *
 *   import { resolveCard } from '../../../fixtures/authorize/card-resolver';
 *   const card = resolveCard('SUCCESS');
 *   await fillCardForm(card.number, card.exp, card.cvc, card.zip);
 */

import { AUTHORIZE_CARDS, type AuthorizeCardPolicyKey } from './card-policy';
import type { AuthorizeTestCard } from './cards';

/**
 * Identificador de card Authorize: key semántico de AUTHORIZE_CARDS.
 *
 * A diferencia de Stripe, NO se acepta "número directo" como cardId porque en
 * Authorize varias entries comparten el mismo número y se distinguen por CVV/ZIP.
 */
export type AuthorizeCardId = AuthorizeCardPolicyKey;

/**
 * Resuelve un cardId al objeto AuthorizeTestCard completo del namespace
 * AUTHORIZE_CARDS.
 *
 * @param cardId — key de AUTHORIZE_CARDS (ej. 'SUCCESS', 'DECLINE_CVV')
 * @returns AuthorizeTestCard con number, brand, exp, cvc, zip, holderName, expectedOutcome
 * @throws Si el cardId no existe en AUTHORIZE_CARDS
 */
export function resolveCard(cardId: AuthorizeCardId): AuthorizeTestCard {
	const card = AUTHORIZE_CARDS[cardId];
	if (!card) {
		throw new Error(
			`Authorize card '${cardId}' no existe en AUTHORIZE_CARDS. Agregarla al policy en tests/fixtures/authorize/card-policy.ts.`,
		);
	}
	return card;
}

/**
 * Lista todos los keys disponibles en AUTHORIZE_CARDS — útil para tests
 * parametrizados que quieran iterar sobre todos los outcomes posibles.
 */
export function listAuthorizeCardIds(): AuthorizeCardId[] {
	return Object.keys(AUTHORIZE_CARDS) as AuthorizeCardId[];
}
