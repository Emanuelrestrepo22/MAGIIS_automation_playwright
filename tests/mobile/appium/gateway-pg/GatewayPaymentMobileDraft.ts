import type { PaymentGateway } from '../../../shared/contracts/gateway-pg';

export type MobileGatewayCompletionInput = {
	journeyId: string;
	tripId: string;
	gateway: PaymentGateway;
	driverAppPathEnv: string;
};

export class GatewayPaymentMobileDraft {
	async completeTripAndTriggerCharge(input: MobileGatewayCompletionInput): Promise<void> {
		void input;

		/*
			TODO: initialize Appium session with ANDROID_DRIVER_APP_PATH and APPIUM_SERVER_URL.
			TODO: login or restore driver session in Android app.
			TODO: open assigned trip by tripId.
			TODO: finish trip from driver app.
			TODO: confirm that payment event is triggered for the selected gateway.
			TODO: persist updated journey context for payment validation phase.
		*/
	}
}
