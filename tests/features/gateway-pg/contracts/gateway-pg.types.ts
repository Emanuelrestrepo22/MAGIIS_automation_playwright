export const SUPPORTED_PAYMENT_GATEWAYS = [
	'mercado-pago',
	'stripe',
	'ebizcharge',
	'authorize'
] as const;

/**
 * Fases del journey E2E.
 *
 * Flow 1 — Carrier Web + Driver App:
 *   web_setup → web_trip_creation → driver_trip_acceptance →
 *   driver_route_simulation → driver_trip_completion → payment_validation
 *
 * Flow 2 — Passenger App + Driver App:
 *   passenger_wallet_setup → passenger_trip_creation → driver_trip_acceptance →
 *   driver_route_simulation → driver_trip_completion → payment_validation
 */
export const SUPPORTED_JOURNEY_PHASES = [
	// Fases web (Playwright)
	'web_setup',
	'web_trip_creation',
	// Fases passenger mobile (Appium)
	'passenger_wallet_setup',
	'passenger_trip_creation',
	// Fases driver mobile (Appium) — compartidas por ambos flujos
	'driver_trip_acceptance',
	'driver_route_simulation',
	'driver_trip_completion',
	// Validación final
	'payment_validation'
] as const;

export type PaymentGateway = (typeof SUPPORTED_PAYMENT_GATEWAYS)[number];
export type JourneyPhase   = (typeof SUPPORTED_JOURNEY_PHASES)[number];

export type JourneyPortal = 'web' | 'contractor' | 'carrier' | 'pax';

/**
 * Actor que ejecuta la fase actual del journey.
 * - carrier-dispatcher: usuario web en portal Carrier
 * - driver: actor en Android Driver App
 * - passenger: actor en Android Passenger App
 */
export type JourneyActor = 'carrier-dispatcher' | 'driver' | 'passenger';

/**
 * Tipo de flujo E2E. Define cuál es la secuencia de actores.
 */
export type E2EFlowType = 'carrier-web-driver-app' | 'passenger-app-driver-app';

export type PaymentValidationSource =
	| 'web-ui'
	| 'mobile-ui'
	| 'api'
	| 'db'
	| 'gateway-dashboard'
	| 'event-log';

export type MobileHandoffStatus = 'pending' | 'ready' | 'completed';

export type GatewayPgJourneyStatus =
	| 'draft'
	| 'web-created'
	| 'passenger-trip-created'
	| 'ready-for-driver'
	| 'driver-accepted'
	| 'driver-en-route'
	| 'driver-completed'
	| 'payment-validated'
	| 'failed';

export type MobileActorHandoff = {
	actor: JourneyActor;
	platform: 'android';
	status: MobileHandoffStatus;
	appPathEnv: string;
	appiumServerEnv: string;
};

export type GatewayPgJourneyContext = {
	journeyId: string;
	testCaseId: string;
	flowType: E2EFlowType;
	gateway: PaymentGateway;
	portal: JourneyPortal;
	role: string;
	currentActor: JourneyActor;
	phase: JourneyPhase;
	status: GatewayPgJourneyStatus;
	createdAt: string;
	updatedAt: string;
	sharedCardForm: boolean;
	requiresMobileCompletion: boolean;
	requires3ds: boolean;
	tags: string[];
	// IDs de entidades del dominio — se van completando a medida que avanza el journey
	tripId?: string;
	driverId?: string;
	riderId?: string;
	paymentReference?: string;
	cardReference?: string;
	routeSimulationPoints?: GeoPoint[];
	// Handoffs hacia cada actor mobile
	driverHandoff: MobileActorHandoff;
	passengerHandoff?: MobileActorHandoff;
	validationSources: PaymentValidationSource[];
	gatewaySpecificTodos: string[];
	mobileTodos: string[];
	validationTodos: string[];
	notes: string[];
};

export type GeoPoint = {
	lat: number;
	lng: number;
	label?: string;
};
