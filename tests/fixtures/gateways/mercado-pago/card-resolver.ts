/**
 * MercadoPago Card Resolver
 * ==========================
 *
 * BL-026 (2026-07-20) — convierte un identificador de intención al objeto
 * `MercadoPagoTestCard` completo del namespace `MP_CARDS`.
 *
 * Igual que Authorize/eBizCharge, retorna directo el objeto del policy. El trigger del
 * outcome es el `holderName` (keyword de estado), no el número.
 *
 * Uso en specs:
 *
 *   import { resolveCard } from 'tests/fixtures/gateways/mercado-pago/card-resolver';
 *   const card = resolveCard('APPROVED');
 *   await fillCardForm(card.number, card.exp, card.cvc, card.holderName); // ← holderName = trigger
 *
 * Para uso cross-gateway, preferir `tests/fixtures/gateways/_shared/resolver.ts`.
 */

import { MP_CARDS, type MercadoPagoCardPolicyKey } from './card-policy';
import type { MercadoPagoTestCard } from './cards';

/** Identificador de card MercadoPago: key semántico de MP_CARDS. */
export type MercadoPagoCardId = MercadoPagoCardPolicyKey;

/**
 * Resuelve un cardId al objeto MercadoPagoTestCard completo del namespace MP_CARDS.
 *
 * @throws Si el cardId no existe en MP_CARDS.
 */
export function resolveCard(cardId: MercadoPagoCardId): MercadoPagoTestCard {
	const card = MP_CARDS[cardId];
	if (!card) {
		throw new Error(
			`MercadoPago card '${cardId}' no existe en MP_CARDS. Agregarla al policy en tests/fixtures/gateways/mercado-pago/card-policy.ts.`
		);
	}
	return card;
}

/** Lista todos los keys disponibles en MP_CARDS — útil para tests parametrizados. */
export function listMercadoPagoCardIds(): MercadoPagoCardId[] {
	return Object.keys(MP_CARDS) as MercadoPagoCardId[];
}
