/**
 * Tipos compartidos para los flows E2E multi-environment de Gateway PG.
 *
 * Diseño gateway-agnostic: el mismo spec corre con Stripe hoy,
 * con MercadoPago u otra pasarela mañana — solo cambia GatewayFlowConfig.
 *
 * Flow 1 — Carrier Web + Driver App:
 *   [Playwright] Carrier crea viaje → hold Stripe → status ready-for-driver
 *   [Appium]     Driver recibe push → acepta → navega → cierra viaje
 *
 * Flow 2 — Passenger App + Driver App (futuro):
 *   [Appium]     Passenger agrega tarjeta y crea viaje
 *   [Appium]     Driver acepta y completa el viaje
 */

export type SupportedGateway = 'stripe' | 'mercado-pago' | 'ebizcharge' | 'authorize';

/**
 * Configuración de la pasarela de pago para el flow E2E.
 * Parametriza qué tarjeta usar, si hay hold y si se requiere 3DS.
 */
export type GatewayFlowConfig = {
	/** Identificador de la pasarela. */
	gateway: SupportedGateway;
	/** Últimos 4 dígitos de la tarjeta de prueba a usar. */
	cardLast4: string;
	/** El viaje debe ejecutar hold antes de asignar conductor. */
	holdEnabled: boolean;
	/** El flujo incluye desafío 3DS durante la creación del viaje. */
	requires3DS: boolean;
	/** Etiqueta legible para reportes y nombres de journeyId. */
	label: string;
};

/**
 * Configuraciones predefinidas por pasarela.
 * Importar la que corresponda en cada spec o script.
 */
export const GATEWAY_CONFIGS: Record<string, GatewayFlowConfig> = {
	/** Stripe — tarjeta directa sin 3DS, hold habilitado. */
	'stripe-hold-no3ds': {
		gateway:     'stripe',
		cardLast4:   '4242',
		holdEnabled: true,
		requires3DS: false,
		label:       'Stripe Hold ON sin 3DS (4242 4242 4242 4242)',
	},
	/** Stripe — tarjeta 3DS requerido, hold habilitado. */
	'stripe-hold-3ds': {
		gateway:     'stripe',
		cardLast4:   '3155',
		holdEnabled: true,
		requires3DS: true,
		label:       'Stripe Hold ON con 3DS (4000 0025 0000 3155)',
	},
	/** MercadoPago — placeholder para futura implementación. */
	'mercado-pago-hold-no3ds': {
		gateway:     'mercado-pago',
		cardLast4:   '0000', // TODO: reemplazar con tarjeta de prueba MercadoPago real
		holdEnabled: true,
		requires3DS: false,
		label:       'MercadoPago Hold ON sin 3DS',
	},

	// ── Flow 3: Contractor (Colaborador) ────────────────────────────────────

	/** Stripe — colaborador sin 3DS, hold habilitado. */
	'contractor-stripe-hold-no3ds': {
		gateway:     'stripe',
		cardLast4:   '4242',
		holdEnabled: true,
		requires3DS: false,
		label:       'Contractor · Stripe Hold ON sin 3DS (4242)',
	},
	/** Stripe — colaborador con 3DS, hold habilitado. */
	'contractor-stripe-hold-3ds': {
		gateway:     'stripe',
		cardLast4:   '3155',
		holdEnabled: true,
		requires3DS: true,
		label:       'Contractor · Stripe Hold ON con 3DS (3155)',
	},
};

/**
 * Resultado que devuelve la fase mobile al spec Playwright.
 * Se serializa en evidence/journey-context/<journeyId>.json al completar.
 */
export type MobilePhaseResult = {
	journeyId:     string;
	status:        'driver-completed' | 'failed';
	totalAmount:   string;
	paymentMethod: string;
	checkpoints:   string[];
	errorMessage?: string;
};

/**
 * Opciones que el spec pasa a la fase mobile via process env.
 * Evita argumentos posicionales y facilita la lectura en CI.
 */
export type MobilePhaseEnvInput = {
	/** ID del journey creado en la fase web. */
	E2E_JOURNEY_ID: string;
	/** Timeout total para la fase mobile en ms (default: 180000). */
	E2E_MOBILE_TIMEOUT_MS?: string;
};
