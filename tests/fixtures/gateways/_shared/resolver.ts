/**
 * Cross-gateway Card Resolver — BL-024 Fase 3 (2026-05-13)
 * ==========================================================
 *
 * Resolver polimórfico que devuelve una tarjeta normalizada (`GenericTestCard`)
 * dado un `{ gateway, intent }`. Habilita specs parametrizables como:
 *
 *   test.describe.each(GATEWAYS)('[$gateway] Hold con auth', (gateway) => {
 *     test('happy path', async () => {
 *       const card = resolveCard({ gateway, intent: 'HAPPY_AUTH' });
 *       // ... usa card.number, card.cvc, card.zip — todos están en el shape común
 *     });
 *   });
 *
 * El soporte de intents por pasarela ya NO vive acá: es la tabla declarativa
 * `CARD_MATRIX` (`./card-matrix.ts`), exhaustiva por construcción. Este archivo aporta
 * solo los NORMALIZADORES (cada card gateway-specific → `GenericTestCard`) y las dos
 * APIs públicas:
 *
 *   - `resolveCard({gateway,intent})` — LANZA si el intent no aplica. Contrato histórico,
 *     4 call-sites verdes dependen de él y sus mensajes están citados en los
 *     `ARCHITECTURE.md` de eBizCharge y MercadoPago.
 *   - `intentSupport(gateway,intent)` — NO lanza: devuelve una unión discriminada con la
 *     razón del N/A. Es la que consumen las suites parametrizadas para emitir un
 *     `test.skip` que explique por qué el caso no corre, en vez de omitirlo en silencio.
 *
 * Cada gateway sigue manteniendo su `card-policy.ts` con namespace propio (CARDS para
 * Stripe, AUTHORIZE_CARDS para Authorize, …); este resolver es sólo el adaptador.
 */

import { CARDS } from '../stripe/card-policy';
import { resolveCard as stripeResolveCard, type CardId as StripeCardId } from '../stripe/card-resolver';
import type { StripeTestCard } from '../stripe/cards';
import { resolveCard as authorizeResolveCard, type AuthorizeCardId } from '../authorize/card-resolver';
import type { AuthorizeTestCard } from '../authorize/cards';
import { resolveCard as ebizResolveCard, type EbizCardId } from '../ebizcharge/card-resolver';
import type { EbizTestCard } from '../ebizcharge/cards';
import { resolveCard as mpResolveCard, type MercadoPagoCardId } from '../mercado-pago/card-resolver';
import type { MercadoPagoTestCard } from '../mercado-pago/cards';
import { CARD_MATRIX, isSupported, type CardMatrixCell } from './card-matrix';
import type { CardIntent, GatewayName, GenericTestCard, ResolveCardArgs } from './types';

// ═══════════════════════════════════════════════════════════════════════
// NORMALIZERS — convierten cada gateway-specific card a GenericTestCard
// ═══════════════════════════════════════════════════════════════════════

/**
 * `requires3ds` llega como ARGUMENTO desde la celda de `CARD_MATRIX`, no derivado del
 * nombre del intent: derivarlo del nombre hacía que cualquier intent nuevo heredara
 * `false` sin que nadie lo decidiera.
 */
function normalizeStripeCard(card: StripeTestCard, intent: CardIntent, requires3ds: boolean): GenericTestCard {
	return {
		gateway: 'stripe',
		number: card.number,
		last4: card.last4,
		expiry: card.exp,
		cvc: card.cvc,
		holderName: card.holderName,
		zip: card.zip_code,
		expectedOutcome: intent.toLowerCase().replace(/_/g, '-'),
		requires3ds
	};
}

function normalizeAuthorizeCard(card: AuthorizeTestCard): GenericTestCard {
	return {
		gateway: 'authorize',
		number: card.number,
		last4: card.number.slice(-4),
		expiry: `${card.exp.month}/${card.exp.year.slice(-2)}`,
		cvc: card.cvc,
		holderName: card.holderName,
		zip: card.zip,
		expectedOutcome: card.expectedOutcome,
		requires3ds: false
	};
}

function normalizeEbizchargeCard(card: EbizTestCard): GenericTestCard {
	// card.exp viene en formato MMYY (ej. '0930'); el shape común usa 'MM/YY'.
	const expiry = `${card.exp.slice(0, 2)}/${card.exp.slice(2)}`;
	return {
		gateway: 'ebizcharge',
		number: card.number,
		last4: card.number.slice(-4),
		expiry,
		cvc: card.cvc,
		holderName: card.holderName,
		expectedOutcome: card.expectedOutcome,
		requires3ds: false
	};
}

function normalizeMercadoPagoCard(card: MercadoPagoTestCard): GenericTestCard {
	// En MP `holderName` es el TRIGGER del outcome (keyword de estado), no un dato inerte.
	// card.exp ya viene en formato MM/YY ('11/30').
	return {
		gateway: 'mercado-pago',
		number: card.number,
		last4: card.number.slice(-4),
		expiry: card.exp,
		cvc: card.cvc,
		holderName: card.holderName,
		// Documento del fixture MP (post-review A11): el form nativo lo consume vía
		// NativeAngularCardForm.fillDocumentField (sus literales quedan como fallback).
		docType: card.identificationType,
		docNumber: card.identificationNumber,
		expectedOutcome: card.expectedOutcome,
		requires3ds: false
	};
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════

/** Resultado de consultar la matriz sin lanzar. */
export type IntentSupport =
	| { readonly supported: true; readonly card: GenericTestCard; readonly slowMs?: number; readonly note?: string }
	| { readonly supported: false; readonly reason: string };

function cellFor(gateway: GatewayName, intent: CardIntent): CardMatrixCell<string> {
	const row = CARD_MATRIX[gateway] as Readonly<Record<CardIntent, CardMatrixCell<string>>>;
	return row[intent];
}

/**
 * Consulta la matriz SIN lanzar. Para suites parametrizadas: permite emitir un
 * `test.skip` con la razón declarada en la celda, de modo que el caso no soportado quede
 * VISIBLE en el reporte en vez de desaparecer.
 */
export function intentSupport(gateway: GatewayName, intent: CardIntent): IntentSupport {
	const cell = cellFor(gateway, intent);

	if (!cell) {
		return {
			supported: false,
			reason: `Intent '${intent}' no declarado en CARD_MATRIX.${gateway} — agregar la celda (soporte o N/A con razón).`
		};
	}

	if (!isSupported(cell)) {
		return { supported: false, reason: cell.na };
	}

	switch (gateway) {
		case 'stripe': {
			const cardNumber = CARDS[cell.card as keyof typeof CARDS] as StripeCardId;
			return {
				supported: true,
				card: normalizeStripeCard(stripeResolveCard(cardNumber), intent, cell.requires3ds ?? false),
				slowMs: cell.slowMs,
				note: cell.note
			};
		}
		case 'authorize':
			return {
				supported: true,
				card: normalizeAuthorizeCard(authorizeResolveCard(cell.card as AuthorizeCardId)),
				slowMs: cell.slowMs,
				note: cell.note
			};
		case 'ebizcharge':
			return {
				supported: true,
				card: normalizeEbizchargeCard(ebizResolveCard(cell.card as EbizCardId)),
				slowMs: cell.slowMs,
				note: cell.note
			};
		case 'mercado-pago':
			return {
				supported: true,
				card: normalizeMercadoPagoCard(mpResolveCard(cell.card as MercadoPagoCardId)),
				slowMs: cell.slowMs,
				note: cell.note
			};
		default: {
			const exhaustive: never = gateway;
			throw new Error(`Gateway desconocido: ${exhaustive}`);
		}
	}
}

/**
 * Resuelve una tarjeta cross-gateway por intención.
 *
 * Los 4 gateways (stripe, authorize, mercado-pago, ebizcharge) tienen datos; el soporte
 * de intents por gateway es parcial (ver `CARD_MATRIX`).
 * @throws Si el intent no aplica para ese gateway específico.
 */
export function resolveCard({ gateway, intent }: ResolveCardArgs): GenericTestCard {
	const support = intentSupport(gateway, intent);
	if (!support.supported) {
		throw new Error(`Intent '${intent}' no soportado por gateway '${gateway}' — ${support.reason}`);
	}
	return support.card;
}

/**
 * Lista de intents soportados por cada gateway — útil para iteración en specs.
 *
 * El `.filter(isSupported)` es load-bearing: la matriz declara TODOS los intents por
 * pasarela (soportados y N/A), así que sin el filtro esto devolvería el set completo para
 * las 4 y la invariante `requires3ds ⇔ soporta HAPPY_AUTH` pasaría espuriamente.
 * `assertCardMatrixIntegrity()` pinnea los conteos justamente para atrapar ese olvido.
 */
export const SUPPORTED_INTENTS_BY_GATEWAY = Object.fromEntries(
	(Object.keys(CARD_MATRIX) as GatewayName[]).map(gateway => {
		const row = CARD_MATRIX[gateway] as Readonly<Record<CardIntent, CardMatrixCell<string>>>;
		return [gateway, (Object.keys(row) as CardIntent[]).filter(intent => isSupported(row[intent]))];
	})
) as Record<GatewayName, CardIntent[]>;
