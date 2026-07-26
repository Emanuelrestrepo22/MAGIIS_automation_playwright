import type { PaymentGateway } from '../../contracts/gateway-pg.types';
import { SUPPORTED_INTENTS_BY_GATEWAY } from '../../../../fixtures/gateways/_shared';
import { XRAY_KEYS_BY_GATEWAY } from '../../data/xray-keys';
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
 * Validación in-process de consistencia adapter ↔ resolver ↔ registry Xray.
 *
 * S2 (carrier/gateway-standardization) — extendida de la versión BL-024 (que solo
 * chequeaba `requires3ds` de stripe/authorize) a las 4 pasarelas y a la config
 * operacional nueva:
 *
 *   1. `requires3ds` ⇔ el resolver soporta `HAPPY_AUTH` (3DS es EXCLUSIVO Stripe;
 *      para el resto los casos 3DS NO se generan — ni siquiera como skipped).
 *   2. Todo gateway soporta `HAPPY_NO_AUTH` (intent mínimo de cualquier suite).
 *   3. `nativeExtraField` solo tiene sentido con `cardForm: 'native-angular'`.
 *   4. `cardForm: 'stripe-elements'` ⇒ `outcomeTrigger: 'number'` (Elements no
 *      expone trigger por CVV/ZIP ni por holder).
 *   5. `linkSuccessStatuses` no vacío (el matcher de éxito del link lo consume S4).
 *   6. `xrayKeys` apunta EXACTAMENTE a la entrada del registry de su gateway
 *      (identidad referencial — evita copias divergentes del registry).
 *
 * Si los datos divergen, lanza error en runtime — útil como check de
 * integridad en tests o smoke. NO se ejecuta automáticamente.
 *
 * Devuelve `true` si todo consistente, lanza si hay drift.
 */
export function assertAdapterFixtureConsistency(): true {
	for (const adapter of Object.values(gatewayAdapterMap)) {
		const gateway = adapter.gateway;
		const intents = SUPPORTED_INTENTS_BY_GATEWAY[gateway];

		// 1. requires3ds ⇔ resolver soporta HAPPY_AUTH.
		const resolverSupports3ds = intents.includes('HAPPY_AUTH');
		if (adapter.requires3ds !== resolverSupports3ds) {
			throw new Error(
				`[adapter-fixture-drift] ${gateway}.requires3ds = ${adapter.requires3ds} pero el resolver ${resolverSupports3ds ? 'soporta' : 'NO soporta'} HAPPY_AUTH.`,
			);
		}

		// 2. Intent mínimo HAPPY_NO_AUTH.
		if (!intents.includes('HAPPY_NO_AUTH')) {
			throw new Error(`[adapter-fixture-drift] el resolver de ${gateway} no soporta HAPPY_NO_AUTH (intent mínimo).`);
		}

		// 3. nativeExtraField solo aplica al form nativo Angular.
		if (adapter.nativeExtraField && adapter.cardForm !== 'native-angular') {
			throw new Error(
				`[adapter-fixture-drift] ${gateway}.nativeExtraField='${adapter.nativeExtraField}' pero cardForm='${adapter.cardForm}' (solo aplica a 'native-angular').`,
			);
		}

		// 4. Stripe Elements dispara outcome por número.
		if (adapter.cardForm === 'stripe-elements' && adapter.outcomeTrigger !== 'number') {
			throw new Error(
				`[adapter-fixture-drift] ${gateway}: cardForm 'stripe-elements' exige outcomeTrigger 'number' (actual: '${adapter.outcomeTrigger}').`,
			);
		}

		// 5. Statuses de éxito del link declarados.
		if (adapter.linkSuccessStatuses.length === 0) {
			throw new Error(`[adapter-fixture-drift] ${gateway}.linkSuccessStatuses está vacío.`);
		}

		// 6. Registry Xray por identidad referencial (sin copias divergentes).
		if (adapter.xrayKeys !== XRAY_KEYS_BY_GATEWAY[gateway]) {
			throw new Error(
				`[adapter-fixture-drift] ${gateway}.xrayKeys NO referencia XRAY_KEYS_BY_GATEWAY['${gateway}'] (data/xray-keys.ts es la única fuente).`,
			);
		}
	}

	return true;
}
