import type { PaymentGateway } from '../../contracts/gateway-pg.types';
import { authorizeGatewayAdapter } from './authorizeGatewayAdapter';
import { ebizchargeGatewayAdapter } from './ebizchargeGatewayAdapter';
import { mercadoPagoGatewayAdapter } from './mercadoPagoGatewayAdapter';
import { stripeGatewayAdapter } from './stripeGatewayAdapter';
import type { GatewayPgAdapter } from './types';

const gatewayAdapterMap: Record<PaymentGateway, GatewayPgAdapter> = {
	'mercado-pago': mercadoPagoGatewayAdapter,
	stripe: stripeGatewayAdapter,
	ebizcharge: ebizchargeGatewayAdapter,
	authorize: authorizeGatewayAdapter
};

export function getGatewayPgAdapter(gateway: PaymentGateway): GatewayPgAdapter {
	return gatewayAdapterMap[gateway];
}

export function listGatewayPgAdapters(): GatewayPgAdapter[] {
	return Object.values(gatewayAdapterMap);
}

// ═══════════════════════════════════════════════════════════════════════
// BL-024 Fase 4 — Bridge declarativo ↔ fixtures
// ═══════════════════════════════════════════════════════════════════════

/**
 * Re-export del resolver polimórfico cross-gateway desde `fixtures/gateways/_shared`.
 *
 * Permite consumir desde un solo punto:
 *   - el adapter declarativo (metadata estática del gateway)
 *   - el resolver de tarjetas (factory por intención)
 *
 * Uso:
 *   import { getGatewayPgAdapter, resolveCard } from 'helpers/adapters';
 *
 *   const adapter = getGatewayPgAdapter('stripe');
 *   if (adapter.requires3ds) {
 *     const card = resolveCard({ gateway: 'stripe', intent: 'HAPPY_AUTH' });
 *     // ... usar card.number, card.cvc, card.zip
 *   }
 */
export {
	resolveCard,
	SUPPORTED_INTENTS_BY_GATEWAY,
	type CardIntent,
	type GatewayName,
	type GenericTestCard,
	type ResolveCardArgs,
} from '../../../../fixtures/gateways/_shared';

/**
 * Validación in-process de consistencia entre adapter declarativo y resolver.
 *
 * Verifica que el `requires3ds` del adapter coincida con el comportamiento
 * real del resolver para el intent HAPPY_AUTH cuando aplica.
 *
 * Si los datos divergen, lanza error en runtime — útil como check de
 * integridad en tests o smoke. NO se ejecuta automáticamente.
 *
 * Devuelve `true` si todo consistente, lanza si hay drift.
 */
export function assertAdapterFixtureConsistency(): true {
	const checks: Array<{ gateway: PaymentGateway; expected: boolean }> = [
		{ gateway: 'stripe', expected: true },
		{ gateway: 'authorize', expected: false },
	];

	for (const { gateway, expected } of checks) {
		const adapter = gatewayAdapterMap[gateway];
		if (adapter.requires3ds !== expected) {
			throw new Error(
				`[adapter-fixture-drift] ${gateway}.requires3ds = ${adapter.requires3ds} pero el resolver espera ${expected}.`,
			);
		}
	}

	return true;
}
