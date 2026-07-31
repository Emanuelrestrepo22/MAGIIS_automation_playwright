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
 * Si un intent no se soporta para un gateway, lanza con mensaje claro.
 *
 * El mapping intent → policy key de cada gateway vive acá centralizado.
 * Cada gateway sigue manteniendo su `card-policy.ts` con namespace propio
 * (CARDS para Stripe, AUTHORIZE_CARDS para Authorize); este resolver es
 * sólo el adaptador cross-gateway.
 */

import { CARDS } from '../stripe/card-policy';
import { resolveCard as stripeResolveCard, type CardId as StripeCardId } from '../stripe/card-resolver';
import type { StripeTestCard } from '../stripe/cards';
import { AUTHORIZE_CARDS } from '../authorize/card-policy';
import { resolveCard as authorizeResolveCard, type AuthorizeCardId } from '../authorize/card-resolver';
import type { AuthorizeTestCard } from '../authorize/cards';
import { resolveCard as ebizResolveCard, type EbizCardId } from '../ebizcharge/card-resolver';
import type { EbizTestCard } from '../ebizcharge/cards';
import { resolveCard as mpResolveCard, type MercadoPagoCardId } from '../mercado-pago/card-resolver';
import type { MercadoPagoTestCard } from '../mercado-pago/cards';
import type { CardIntent, GenericTestCard, ResolveCardArgs } from './types';

// ═══════════════════════════════════════════════════════════════════════
// INTENT MAPPING — cada gateway expone sus intents soportados
// ═══════════════════════════════════════════════════════════════════════

/**
 * Mapping Stripe — qué key del namespace `CARDS` resuelve cada intent.
 * Todos los intents canónicos están soportados en Stripe.
 */
const STRIPE_INTENT_MAP: Record<CardIntent, keyof typeof CARDS> = {
	HAPPY_NO_AUTH: 'SUCCESS_NO_3DS',
	HAPPY_AUTH: 'HAPPY_3DS',
	FAIL_AUTH: 'FAIL_3DS',
	DECLINE_AUTHORIZE: 'DECLINE_AUTHORIZE',
	DECLINE_CAPTURE: 'DECLINE_CAPTURE',
	DECLINE_INVALID_CVC: 'DECLINE_INVALID_CVC'
};

/**
 * Mapping Authorize — soporte parcial. Los intents que requieren 3DS
 * (HAPPY_AUTH, FAIL_AUTH) y DECLINE_CAPTURE no aplican porque el sandbox
 * Authorize no expone esos comportamientos en su test suite estándar.
 */
const AUTHORIZE_INTENT_MAP: Partial<Record<CardIntent, AuthorizeCardId>> = {
	HAPPY_NO_AUTH: 'SUCCESS',
	DECLINE_AUTHORIZE: 'DECLINE_GENERIC',
	DECLINE_INVALID_CVC: 'DECLINE_CVV'
};

/**
 * Mapping eBizCharge — soporte parcial (BL-027). eBiz no expone 3DS
 * (HAPPY_AUTH/FAIL_AUTH) ni un decline específico de capture (DECLINE_CAPTURE).
 * El outcome lo determina el número de tarjeta (como Stripe).
 */
const EBIZCHARGE_INTENT_MAP: Partial<Record<CardIntent, EbizCardId>> = {
	HAPPY_NO_AUTH: 'SUCCESS',
	DECLINE_AUTHORIZE: 'DECLINE_DO_NOT_HONOR',
	DECLINE_INVALID_CVC: 'DECLINE_CVV'
};

/**
 * Mapping MercadoPago — soporte parcial (BL-026). MP dispara el outcome por el NOMBRE
 * del titular (keyword). No expone 3DS (HAPPY_AUTH/FAIL_AUTH) ni decline de capture.
 */
const MERCADO_PAGO_INTENT_MAP: Partial<Record<CardIntent, MercadoPagoCardId>> = {
	HAPPY_NO_AUTH: 'APPROVED',
	DECLINE_AUTHORIZE: 'REJECTED_OTHER',
	DECLINE_INVALID_CVC: 'REJECTED_INVALID_CVV'
};

// ═══════════════════════════════════════════════════════════════════════
// NORMALIZERS — convierten cada gateway-specific card a GenericTestCard
// ═══════════════════════════════════════════════════════════════════════

function normalizeStripeCard(card: StripeTestCard, intent: CardIntent): GenericTestCard {
	const intentsRequiring3DS: CardIntent[] = ['HAPPY_AUTH', 'FAIL_AUTH'];
	return {
		gateway: 'stripe',
		number: card.number,
		last4: card.last4,
		expiry: card.exp,
		cvc: card.cvc,
		holderName: card.holderName,
		zip: card.zip_code,
		expectedOutcome: intent.toLowerCase().replace(/_/g, '-'),
		requires3ds: intentsRequiring3DS.includes(intent)
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
// PUBLIC API — resolver polimórfico
// ═══════════════════════════════════════════════════════════════════════

/**
 * Resuelve una tarjeta cross-gateway por intención.
 *
 * Los 4 gateways (stripe, authorize, mercado-pago, ebizcharge) tienen datos; el soporte
 * de intents por gateway es parcial (ver *_INTENT_MAP).
 * @throws Si el intent no aplica para ese gateway específico.
 */
export function resolveCard({ gateway, intent }: ResolveCardArgs): GenericTestCard {
	switch (gateway) {
		case 'stripe': {
			const policyKey = STRIPE_INTENT_MAP[intent];
			if (!policyKey) {
				throw new Error(
					`Intent '${intent}' no soportado por gateway 'stripe' — agregar mapping en STRIPE_INTENT_MAP.`
				);
			}
			const cardNumber = CARDS[policyKey] as StripeCardId;
			const stripeCard = stripeResolveCard(cardNumber);
			return normalizeStripeCard(stripeCard, intent);
		}

		case 'authorize': {
			const policyKey = AUTHORIZE_INTENT_MAP[intent];
			if (!policyKey) {
				throw new Error(
					`Intent '${intent}' no soportado por gateway 'authorize' — el sandbox no expone ese comportamiento (verificar AUTHORIZE_INTENT_MAP).`
				);
			}
			const authorizeCard = authorizeResolveCard(policyKey);
			return normalizeAuthorizeCard(authorizeCard);
		}

		case 'mercado-pago': {
			const policyKey = MERCADO_PAGO_INTENT_MAP[intent];
			if (!policyKey) {
				throw new Error(
					`Intent '${intent}' no soportado por gateway 'mercado-pago' — MP no expone ese comportamiento (sin 3DS ni decline de capture; verificar MERCADO_PAGO_INTENT_MAP).`
				);
			}
			const mpCard = mpResolveCard(policyKey);
			return normalizeMercadoPagoCard(mpCard);
		}

		case 'ebizcharge': {
			const policyKey = EBIZCHARGE_INTENT_MAP[intent];
			if (!policyKey) {
				throw new Error(
					`Intent '${intent}' no soportado por gateway 'ebizcharge' — eBiz no expone ese comportamiento (sin 3DS ni decline de capture; verificar EBIZCHARGE_INTENT_MAP).`
				);
			}
			const ebizCard = ebizResolveCard(policyKey);
			return normalizeEbizchargeCard(ebizCard);
		}

		default: {
			const exhaustive: never = gateway;
			throw new Error(`Gateway desconocido: ${exhaustive}`);
		}
	}
}

/**
 * Lista de intents soportados por cada gateway — útil para iteración en specs.
 */
export const SUPPORTED_INTENTS_BY_GATEWAY = {
	stripe: Object.keys(STRIPE_INTENT_MAP) as CardIntent[],
	authorize: Object.keys(AUTHORIZE_INTENT_MAP) as CardIntent[],
	'mercado-pago': Object.keys(MERCADO_PAGO_INTENT_MAP) as CardIntent[],
	ebizcharge: Object.keys(EBIZCHARGE_INTENT_MAP) as CardIntent[]
} as const;
