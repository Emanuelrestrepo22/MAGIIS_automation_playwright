import type { GatewayPgJourneyContext, JourneyPhase, PaymentGateway, PaymentValidationSource } from '../contracts/gateway-pg.types';
import { getGatewayPgAdapter } from './adapters';

// Estas funciones son helpers funcionales para crear y evolucionar
// el estado compartido de un journey gateway-pg.
type CreateGatewayPgJourneyInput = {
	testCaseId: string;
	gateway: PaymentGateway;
	portal: 'web' | 'contractor' | 'carrier';
	role: string;
};

export function createGatewayPgJourney(input: CreateGatewayPgJourneyInput): GatewayPgJourneyContext {
	// El adapter aporta los defaults específicos de cada pasarela
	// sin ensuciar la orquestación con ifs por gateway.
	const adapter = getGatewayPgAdapter(input.gateway);
	const now = new Date().toISOString();
	const journeyId = [input.testCaseId, input.gateway, Date.now().toString()].join('-');

	return {
		// El contexto nace en "draft" y luego cada fase lo va enriqueciendo.
		journeyId,
		testCaseId: input.testCaseId,
		flowType: 'carrier-web-driver-app',
		gateway: input.gateway,
		portal: input.portal,
		role: input.role,
		currentActor: 'carrier-dispatcher',
		phase: 'web_setup',
		status: 'draft',
		createdAt: now,
		updatedAt: now,
		sharedCardForm: adapter.usesSharedCardForm,
		requiresMobileCompletion: adapter.requiresMobileCompletion,
		requires3ds: adapter.requires3ds,
		tags: adapter.tags,
		validationSources: [],
		gatewaySpecificTodos: [...adapter.webTodos],
		mobileTodos: [...adapter.mobileTodos],
		validationTodos: [...adapter.validationTodos],
		driverHandoff: {
			actor: 'driver',
			platform: 'android',
			status: 'pending',
			appPathEnv: 'ANDROID_DRIVER_APP_PATH',
			appiumServerEnv: 'APPIUM_SERVER_URL'
		},
		notes: []
	};
}

export function advanceGatewayPgJourney(context: GatewayPgJourneyContext, phase: JourneyPhase, status: GatewayPgJourneyContext['status'], note?: string): GatewayPgJourneyContext {
	// Este helper muta el "estado lógico" del journey sin tocar datos de viaje.
	return {
		...context,
		phase,
		status,
		updatedAt: new Date().toISOString(),
		notes: note ? [...context.notes, note] : context.notes
	};
}

export function attachTripData(context: GatewayPgJourneyContext, data: Pick<GatewayPgJourneyContext, 'tripId' | 'driverId' | 'riderId' | 'paymentReference' | 'cardReference'>): GatewayPgJourneyContext {
	// Se usa cuando la fase web o mobile devuelve IDs reales que luego
	// otras fases necesitan reutilizar.
	return {
		...context,
		...data
	};
}

export function registerValidationSource(context: GatewayPgJourneyContext, source: PaymentValidationSource): GatewayPgJourneyContext {
	// Evitamos duplicados porque una misma fuente de validación puede chequearse
	// varias veces durante el flujo.
	if (context.validationSources.includes(source)) {
		return context;
	}

	return {
		...context,
		updatedAt: new Date().toISOString(),
		validationSources: [...context.validationSources, source]
	};
}
