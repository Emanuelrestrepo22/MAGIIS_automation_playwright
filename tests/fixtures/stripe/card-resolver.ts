/**
 * Card Resolver — Convierte identificador de intención al objeto StripeTestCard completo.
 * ========================================================================================
 *
 * Patrón inspirado en step definitions de Gherkin: el scenario declara la INTENCIÓN
 * como identificador simple (`CARDS.HAPPY_3DS`), el resolver convierte a objeto técnico
 * con number/exp/cvc/zip/holderName.
 *
 * Flujo de resolución:
 *   1. Si cardId es un key de CARDS (ej. 'HAPPY_3DS') → obtiene el número del policy.
 *   2. Si cardId es un número directo (ej. '4242424242424242') → lo usa directamente.
 *   3. Busca en STRIPE_TEST_CARD_FIXTURES el objeto completo que coincide con ese número.
 *   4. Lanza si no encuentra match (error temprano, fácil de diagnosticar).
 *
 * Uso en specs:
 *
 *   import { resolveCard } from '../../../fixtures/stripe/card-resolver';
 *   const card = resolveCard(scenario.cardId);
 *   await fillCardForm(card.number, card.exp, card.cvc);
 */

import { CARDS } from './card-policy';
import { STRIPE_TEST_CARD_FIXTURES, type StripeTestCard } from './cards';

/**
 * Identificador de card: key semántico de CARDS (ej. 'HAPPY_3DS') o número directo.
 * Preferir siempre keys de CARDS para auto-complete y type safety.
 */
export type CardId = keyof typeof CARDS | string;

/**
 * Resuelve un cardId (intención de policy o número directo) al objeto
 * StripeTestCard completo con number/exp/cvc/zip_code/holderName.
 *
 * @param cardId — key de CARDS (ej. 'HAPPY_3DS') o número directo (ej. '4000...')
 * @returns StripeTestCard completo del registry
 * @throws Si el cardId no matchea ninguna entrada conocida en STRIPE_TEST_CARD_FIXTURES
 */
export function resolveCard(cardId: CardId): StripeTestCard {
	const cardNumber = cardId in CARDS
		? CARDS[cardId as keyof typeof CARDS]
		: cardId;

	const found = Object.values(STRIPE_TEST_CARD_FIXTURES).find(c => c.number === cardNumber);
	if (!found) {
		throw new Error(
			`Card '${cardId}' (number: ${cardNumber}) no existe en STRIPE_TEST_CARD_FIXTURES. Agregarla al registry en tests/features/gateway-pg/data/stripe-cards.ts.`
		);
	}
	return found;
}
