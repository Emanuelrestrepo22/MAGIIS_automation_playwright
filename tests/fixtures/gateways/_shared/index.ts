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
	LegacyCardIntent,
	ApprovalIntent,
	DeclineIntent,
	FraudIntent,
	SoftVerificationIntent,
	ReferralIntent,
	GatewayName,
	GenericTestCard,
	ResolveCardArgs,
	CardAnnotationKind,
	CardAnnotationEntry,
	CardAnnotationRegistry
} from './types';

export { CARD_ANNOTATIONS, listAnnotations, countAnnotations, assertAnnotationReferenceIntegrity } from './annotations';

export { ALL_CARD_INTENTS } from './types';

export { resolveCard, intentSupport, SUPPORTED_INTENTS_BY_GATEWAY, type IntentSupport } from './resolver';

export {
	CARD_MATRIX,
	isSupported,
	assertCardMatrixIntegrity,
	EXPECTED_SUPPORTED_COUNTS,
	type CardMatrixCell,
	type CardMatrixRow,
	type CardMatrixShape,
	type CardMatrixSupported,
	type CardMatrixNotApplicable
} from './card-matrix';
