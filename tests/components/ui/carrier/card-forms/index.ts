/**
 * Barrel + factory de estrategias de card form por pasarela (@ui/carrier/card-forms).
 *
 * Seam S3 (carrier/gateway-standardization). `cardFormFor(gateway)` resuelve la
 * estrategia desde el adapter declarativo (`adapter.cardForm` +
 * `adapter.nativeExtraField`) — única fuente de esa config, sin mapa duplicado acá.
 *
 * NO se re-exporta desde el barrel `@ui/carrier` para no acoplar todo el barrel a
 * los adapters de gateway-pg: importar directo `@ui/carrier/card-forms`.
 */

import type { GatewayName } from '@fixtures/gateways/_shared';

import { getGatewayPgAdapter } from '@features/gateway-pg/helpers/adapters';
import { NativeAngularCardForm } from './NativeAngularCardForm';
import { StripeElementsCardForm } from './StripeElementsCardForm';
import type { CardFormStrategy } from './CardFormStrategy';

export type { CardFormFillInput, CardFormKind, CardFormStrategy } from './CardFormStrategy';
export { NativeAngularCardForm, type NativeAngularExtraField } from './NativeAngularCardForm';
export { StripeElementsCardForm } from './StripeElementsCardForm';

/** Cache por pasarela — las estrategias son stateless, una instancia alcanza. */
const strategyCache = new Map<GatewayName, CardFormStrategy>();

/**
 * Devuelve la estrategia de card form de `gateway`, gobernada por su adapter:
 *   - `cardForm: 'stripe-elements'` → `StripeElementsCardForm` (solo Stripe hoy).
 *   - `cardForm: 'native-angular'`  → `NativeAngularCardForm` con el 5° campo de
 *     `adapter.nativeExtraField` (MP='document', Authorize='zip', eBiz=ninguno).
 */
export function cardFormFor(gateway: GatewayName): CardFormStrategy {
	const cached = strategyCache.get(gateway);
	if (cached) return cached;

	const adapter = getGatewayPgAdapter(gateway);
	const strategy: CardFormStrategy =
		adapter.cardForm === 'stripe-elements'
			? new StripeElementsCardForm()
			: new NativeAngularCardForm({ extraField: adapter.nativeExtraField });

	strategyCache.set(gateway, strategy);
	return strategy;
}
