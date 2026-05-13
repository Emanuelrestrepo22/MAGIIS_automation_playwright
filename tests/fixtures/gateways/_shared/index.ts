/**
 * Barrel cross-gateway — BL-024 Fase 3 (2026-05-13).
 *
 * Entry point único para tipos comunes y resolver polimórfico.
 *
 * Uso:
 *   import { resolveCard, type CardIntent, type GatewayName } from 'tests/fixtures/gateways/_shared';
 */

export type {
	CardIntent,
	GatewayName,
	GenericTestCard,
	ResolveCardArgs,
} from './types';

export { resolveCard, SUPPORTED_INTENTS_BY_GATEWAY } from './resolver';
