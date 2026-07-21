/**
 * eBizCharge Card Resolver
 * =========================
 *
 * BL-027 (2026-07-20) — convierte un identificador de intención al objeto
 * `EbizTestCard` completo del namespace `EBIZ_CARDS`.
 *
 * Igual que Authorize, el resolver retorna directo el objeto del policy (no acepta
 * "número directo") — aunque en eBizCharge el outcome sí lo define el número, cada
 * intención tiene su número propio, así que resolver por key semántica es lo consistente.
 *
 * Uso en specs:
 *
 *   import { resolveCard } from 'tests/fixtures/gateways/ebizcharge/card-resolver';
 *   const card = resolveCard('SUCCESS');
 *   await fillCardForm(card.number, card.exp, card.cvc);
 *
 * Para uso cross-gateway, preferir `tests/fixtures/gateways/_shared/resolver.ts`.
 */

import { EBIZ_CARDS, type EbizCardPolicyKey } from './card-policy';
import type { EbizTestCard } from './cards';

/** Identificador de card eBizCharge: key semántico de EBIZ_CARDS. */
export type EbizCardId = EbizCardPolicyKey;

/**
 * Resuelve un cardId al objeto EbizTestCard completo del namespace EBIZ_CARDS.
 *
 * @throws Si el cardId no existe en EBIZ_CARDS.
 */
export function resolveCard(cardId: EbizCardId): EbizTestCard {
	const card = EBIZ_CARDS[cardId];
	if (!card) {
		throw new Error(`eBizCharge card '${cardId}' no existe en EBIZ_CARDS. Agregarla al policy en tests/fixtures/gateways/ebizcharge/card-policy.ts.`);
	}
	return card;
}

/** Lista todos los keys disponibles en EBIZ_CARDS — útil para tests parametrizados. */
export function listEbizCardIds(): EbizCardId[] {
	return Object.keys(EBIZ_CARDS) as EbizCardId[];
}
