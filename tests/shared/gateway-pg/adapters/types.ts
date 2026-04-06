import type {
	JourneyPortal,
	PaymentGateway,
	PaymentValidationSource
} from '../../contracts/gateway-pg';

export type GatewayPgAdapter = {
	gateway: PaymentGateway;
	displayName: string;
	defaultPortal: JourneyPortal;
	usesSharedCardForm: boolean;
	requiresMobileCompletion: boolean;
	requires3ds: boolean;
	tags: string[];
	expectedValidationSources: PaymentValidationSource[];
	webTodos: string[];
	mobileTodos: string[];
	validationTodos: string[];
};
