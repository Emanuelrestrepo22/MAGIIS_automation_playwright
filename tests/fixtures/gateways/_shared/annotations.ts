/**
 * CARD_ANNOTATIONS — el eje de referencia, cross-gateway.
 * =======================================================
 *
 * Junta en un solo lugar los códigos de verificación que las pasarelas devuelven junto
 * con el outcome: AVS, CVV2, CAVV y Card Level. Son **datos**, no casos de prueba.
 *
 * Por qué existe este eje separado: la doc de eBizCharge publica 92 números de tarjeta,
 * pero 70 de ellos solo se diferencian en uno de estos códigos. Un caso de prueba por
 * número daría ~90 tests que validan lo mismo (que la transacción aprueba) con una
 * anotación distinta que el front no muestra. Manteniéndolos acá, la matriz de negocio
 * queda en 24 intents y estos 70 números siguen siendo verificables contra la doc.
 *
 * Fuentes (sin duplicar el dato):
 *   - eBizCharge → los 4 arrays `EBIZ_*_REFERENCE` de `ebizcharge/cards.ts`.
 *   - Authorize  → las entradas AVS/CVV de `AUTHORIZE_CARDS`, cuyo trigger es (cvc, zip)
 *     y no el número, así que se registran con `trigger`.
 *   - Stripe / MercadoPago → no publican tablas de anotación consumibles en el flujo
 *     MAGIIS (Stripe expone `cvc_check`/`address_line1_check` como resultado de la
 *     transacción, ya cubiertos por los intents de verificación blanda).
 */

import {
	EBIZ_AVS_REFERENCE,
	EBIZ_CVV2_REFERENCE,
	EBIZ_CAVV_REFERENCE,
	EBIZ_CARD_LEVEL_REFERENCE
} from '../ebizcharge/cards';
import { AUTHORIZE_CARDS } from '../authorize/card-policy';
import type { CardAnnotationEntry, CardAnnotationKind, CardAnnotationRegistry, GatewayName } from './types';

// ═══════════════════════════════════════════════════════════════════════
// eBizCharge — el outcome lo dispara el NÚMERO
// ═══════════════════════════════════════════════════════════════════════

const EBIZCHARGE_ANNOTATIONS: CardAnnotationRegistry = {
	avs: EBIZ_AVS_REFERENCE.map(row => ({
		gateway: 'ebizcharge' as const,
		kind: 'avs' as const,
		code: row.avs,
		number: row.number,
		// La doc fija el CVV por fila en esta tabla (123 / 321 / 999), no acepta "any".
		trigger: { cvc: row.cvc }
	})),
	cvv2: EBIZ_CVV2_REFERENCE.map(row => ({
		gateway: 'ebizcharge' as const,
		kind: 'cvv2' as const,
		code: row.cvv2,
		number: row.number,
		brand: row.brand
	})),
	cavv: EBIZ_CAVV_REFERENCE.map(row => ({
		gateway: 'ebizcharge' as const,
		kind: 'cavv' as const,
		code: row.cavv,
		number: row.number
	})),
	'card-level': EBIZ_CARD_LEVEL_REFERENCE.map(row => ({
		gateway: 'ebizcharge' as const,
		kind: 'card-level' as const,
		code: row.level,
		number: row.number
	}))
};

// ═══════════════════════════════════════════════════════════════════════
// Authorize — el outcome lo dispara (cvc, zip); el número es siempre el mismo
// ═══════════════════════════════════════════════════════════════════════

/**
 * Los códigos AVS/CVV de Authorize que NO tienen intent de negocio propio.
 * Los dos que sí lo tienen (`AVS_NO_MATCH` → `APPROVED_AVS_MISMATCH` y
 * `CVV_NOT_PROCESSED` → `APPROVED_CVV_MISMATCH`) viven en `CARD_MATRIX`; el resto son
 * variaciones del mismo comportamiento observable y se quedan acá.
 */
const AUTHORIZE_ANNOTATIONS: CardAnnotationRegistry = {
	avs: [
		{ policyKey: 'AVS_NON_US', code: 'G' },
		{ policyKey: 'AVS_UNAVAILABLE', code: 'R' },
		{ policyKey: 'AVS_NOT_SUPPORTED', code: 'S' },
		{ policyKey: 'AVS_ADDRESS_UNAVAILABLE', code: 'U' }
	].map(({ policyKey, code }) => {
		const card = AUTHORIZE_CARDS[policyKey as keyof typeof AUTHORIZE_CARDS];
		return {
			gateway: 'authorize' as const,
			kind: 'avs' as const,
			code,
			number: card.number,
			brand: card.brand,
			trigger: { cvc: card.cvc, zip: card.zip }
		};
	}),
	cvv2: [
		{ policyKey: 'CVV_SHOULD_BE_PRESENT', code: 'S' },
		{ policyKey: 'CVV_ISSUER_NOT_CERTIFIED', code: 'U' }
	].map(({ policyKey, code }) => {
		const card = AUTHORIZE_CARDS[policyKey as keyof typeof AUTHORIZE_CARDS];
		return {
			gateway: 'authorize' as const,
			kind: 'cvv2' as const,
			code,
			number: card.number,
			brand: card.brand,
			trigger: { cvc: card.cvc, zip: card.zip }
		};
	})
};

// ═══════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════

export const CARD_ANNOTATIONS = {
	stripe: {},
	authorize: AUTHORIZE_ANNOTATIONS,
	ebizcharge: EBIZCHARGE_ANNOTATIONS,
	'mercado-pago': {}
} as const satisfies Record<GatewayName, CardAnnotationRegistry>;

/** Todas las entradas, planas — para iterar en guards y docs. */
export function listAnnotations(gateway?: GatewayName): CardAnnotationEntry[] {
	const gateways = gateway ? [gateway] : (Object.keys(CARD_ANNOTATIONS) as GatewayName[]);
	return gateways.flatMap(gw => Object.values(CARD_ANNOTATIONS[gw] as CardAnnotationRegistry).flatMap(entries => entries ?? []));
}

/** Cuenta de entradas por familia — útil para verificar paridad contra la doc del PSP. */
export function countAnnotations(gateway: GatewayName): Record<CardAnnotationKind, number> {
	const registry = CARD_ANNOTATIONS[gateway] as CardAnnotationRegistry;
	return {
		avs: registry.avs?.length ?? 0,
		cvv2: registry.cvv2?.length ?? 0,
		cavv: registry.cavv?.length ?? 0,
		'card-level': registry['card-level']?.length ?? 0
	};
}

function isLuhnValid(number: string): boolean {
	let sum = 0;
	let double = false;
	for (let i = number.length - 1; i >= 0; i--) {
		let digit = Number(number[i]);
		if (double) {
			digit *= 2;
			if (digit > 9) digit -= 9;
		}
		sum += digit;
		double = !double;
	}
	return sum % 10 === 0;
}

/**
 * Valida el eje de anotación: código no vacío, número Luhn-válido, sin `(kind, code)`
 * duplicado por pasarela, y `trigger` presente cuando el número solo no alcanza para
 * distinguir la fila (caso Authorize, donde todas comparten el mismo número).
 *
 * @throws Con detalle `[card-annotation-drift]`.
 */
export function assertAnnotationReferenceIntegrity(): true {
	for (const gateway of Object.keys(CARD_ANNOTATIONS) as GatewayName[]) {
		const entries = listAnnotations(gateway);
		const vistos = new Set<string>();

		for (const entry of entries) {
			if (!entry.code.trim()) {
				throw new Error(`[card-annotation-drift] ${gateway}/${entry.kind}: entrada con código vacío (número ${entry.number}).`);
			}
			if (!isLuhnValid(entry.number)) {
				throw new Error(`[card-annotation-drift] ${gateway}/${entry.kind}: el número ${entry.number} no pasa Luhn.`);
			}
			if (entry.gateway !== gateway) {
				throw new Error(`[card-annotation-drift] entrada de ${entry.gateway} registrada bajo ${gateway}.`);
			}

			// La clave incluye la marca porque en eBizCharge el mismo código CVV2 existe
			// una vez por marca (M de Visa, M de Mastercard, …).
			const clave = `${entry.kind}|${entry.code}|${entry.brand ?? ''}`;
			if (vistos.has(clave)) {
				throw new Error(`[card-annotation-drift] ${gateway}: ${entry.kind} código '${entry.code}' duplicado${entry.brand ? ` para ${entry.brand}` : ''}.`);
			}
			vistos.add(clave);
		}

		// Si varias filas comparten número, el trigger es lo único que las distingue.
		const porNumero = new Map<string, CardAnnotationEntry[]>();
		for (const entry of entries) {
			porNumero.set(entry.number, [...(porNumero.get(entry.number) ?? []), entry]);
		}
		for (const [number, grupo] of porNumero) {
			if (grupo.length > 1 && grupo.some(e => !e.trigger)) {
				throw new Error(
					`[card-annotation-drift] ${gateway}: ${grupo.length} entradas comparten el número ${number} y alguna no declara \`trigger\` — ` +
						'sin trigger no hay forma de reproducir esa fila.'
				);
			}
		}
	}

	return true;
}
