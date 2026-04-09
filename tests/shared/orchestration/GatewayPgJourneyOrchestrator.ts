import type { E2EFlowType, GatewayPgJourneyContext, GatewayPgJourneyStatus, JourneyActor, JourneyPhase, JourneyPortal, PaymentGateway, PaymentValidationSource } from '../contracts/gateway-pg';
import { readJourneyContext, writeJourneyContext } from '../context/journeyContextStore';
import { getGatewayPgAdapter } from '../gateway-pg/adapters';

// Input mínimo para iniciar un journey. El resto de la información se infiere
// desde el adapter del gateway y el tipo de flujo.
type CreateDraftJourneyInput = {
	testCaseId: string;
	gateway: PaymentGateway;
	portal?: JourneyPortal;
	role: string;
	flowType?: E2EFlowType;
};

// Datos que suelen aparecer recién después de crear o completar el viaje.
type TripDataInput = Pick<GatewayPgJourneyContext, 'tripId' | 'driverId' | 'riderId' | 'paymentReference' | 'cardReference'>;

export class GatewayPgJourneyOrchestrator {
	createDraftJourney(input: CreateDraftJourneyInput): GatewayPgJourneyContext {
		// El adapter encapsula diferencias entre Stripe, Mercado Pago, etc.
		const adapter = getGatewayPgAdapter(input.gateway);
		const now = new Date().toISOString();
		const journeyId = [input.testCaseId, input.gateway, Date.now().toString()].join('-');

		const flowType = input.flowType ?? 'carrier-web-driver-app';
		const initialActor: JourneyActor = flowType === 'passenger-app-driver-app' ? 'passenger' : 'carrier-dispatcher';
		const initialPhase: JourneyPhase = flowType === 'passenger-app-driver-app' ? 'passenger_wallet_setup' : 'web_setup';

		return {
			// El contexto arranca con metadatos suficientes para que web, mobile y validación
			// puedan retomar el journey sin conocer cómo se creó.
			journeyId,
			testCaseId: input.testCaseId,
			flowType,
			gateway: input.gateway,
			portal: input.portal ?? adapter.defaultPortal,
			role: input.role,
			currentActor: initialActor,
			phase: initialPhase,
			status: 'draft',
			createdAt: now,
			updatedAt: now,
			sharedCardForm: adapter.usesSharedCardForm,
			requiresMobileCompletion: adapter.requiresMobileCompletion,
			requires3ds: adapter.requires3ds,
			tags: [...adapter.tags, `@${flowType}`],
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
			...(flowType === 'passenger-app-driver-app'
				? {
						passengerHandoff: {
							actor: 'passenger' as JourneyActor,
							platform: 'android' as const,
							status: 'pending' as const,
							appPathEnv: 'ANDROID_PASSENGER_APP_PATH',
							appiumServerEnv: 'APPIUM_SERVER_URL'
						}
					}
				: {}),
			notes: [`Draft journey created for ${adapter.displayName} — flow: ${flowType}`]
		};
	}

	updatePhase(context: GatewayPgJourneyContext, phase: JourneyPhase, status: GatewayPgJourneyStatus, note?: string): GatewayPgJourneyContext {
		// Helper central para registrar cada transición de estado con timestamp actualizado.
		return {
			...context,
			phase,
			status,
			updatedAt: new Date().toISOString(),
			notes: note ? [...context.notes, note] : context.notes
		};
	}

	attachTripData(context: GatewayPgJourneyContext, data: TripDataInput): GatewayPgJourneyContext {
		// Une IDs reales del viaje al contexto persistido para las siguientes fases.
		return {
			...context,
			...data,
			updatedAt: new Date().toISOString()
		};
	}

	registerValidationSource(context: GatewayPgJourneyContext, source: PaymentValidationSource): GatewayPgJourneyContext {
		// Una fuente de validación se agrega una sola vez, aunque la verifiquemos repetidamente.
		if (context.validationSources.includes(source)) {
			return context;
		}

		return {
			...context,
			updatedAt: new Date().toISOString(),
			validationSources: [...context.validationSources, source]
		};
	}

	prepareMobileHandoff(context: GatewayPgJourneyContext, note?: string): GatewayPgJourneyContext {
		// Según el flujo, el punto "listo para mobile" cae en una fase distinta.
		const phase: JourneyPhase = context.flowType === 'passenger-app-driver-app' ? 'passenger_trip_creation' : 'web_trip_creation';

		return {
			...this.updatePhase(context, phase, 'ready-for-driver', note),
			currentActor: 'driver',
			driverHandoff: { ...context.driverHandoff, status: 'ready' }
		};
	}

	completeMobilePhase(context: GatewayPgJourneyContext, note?: string): GatewayPgJourneyContext {
		// Marca que la fase del driver terminó y deja el contexto listo para validar cobro.
		return {
			...this.updatePhase(context, 'driver_trip_completion', 'driver-completed', note),
			currentActor: 'driver',
			driverHandoff: { ...context.driverHandoff, status: 'completed' }
		};
	}

	completeValidation(context: GatewayPgJourneyContext, note?: string): GatewayPgJourneyContext {
		// Último paso: confirmamos que el flujo llegó a una validación de pago consistente.
		return this.updatePhase(context, 'payment_validation', 'payment-validated', note);
	}

	fail(context: GatewayPgJourneyContext, note: string): GatewayPgJourneyContext {
		// Conserva la fase actual para que sea claro en qué punto exacto falló el journey.
		return this.updatePhase(context, context.phase, 'failed', note);
	}

	async persist(context: GatewayPgJourneyContext): Promise<string> {
		// Persistimos para que otra fase o runner pueda reanudar el journey más tarde.
		return writeJourneyContext(context);
	}

	async load(journeyId: string): Promise<GatewayPgJourneyContext> {
		// Recupera el contexto previamente serializado desde evidence/journey-context.
		return readJourneyContext(journeyId);
	}
}
