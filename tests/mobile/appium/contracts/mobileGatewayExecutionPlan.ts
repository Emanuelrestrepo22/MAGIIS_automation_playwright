import type { PaymentGateway } from '../../../shared/contracts/gateway-pg';

export type MobileGatewayExecutionPlan = {
	journeyId: string;
	testCaseId: string;
	tripId: string;
	gateway: PaymentGateway;
	appiumServerUrl: string;
	/** Ruta al APK del driver. null cuando la app ya está instalada en el emulador. */
	androidDriverAppPath: string | null;
	platform: 'android';
	steps: string[];
	todos: string[];
};
