import { getDriverAppConfig } from '../config/appiumRuntime';
import type { MobileGatewayExecutionPlan } from '../contracts/mobileGatewayExecutionPlan';
import type { GatewayPgJourneyContext } from '../../../shared/contracts/gateway-pg';

export class DriverTripCompletionDraft {
	buildExecutionPlan(context: GatewayPgJourneyContext): MobileGatewayExecutionPlan {
		if (!context.tripId) {
			throw new Error(`Journey ${context.journeyId} is missing tripId for mobile completion`);
		}

		const config = getDriverAppConfig();

		return {
			journeyId: context.journeyId,
			testCaseId: context.testCaseId,
			tripId: context.tripId,
			gateway: context.gateway,
			appiumServerUrl: config.appiumServerUrl,
			androidDriverAppPath: config.appPath,
			platform: 'android',
			steps: [
				'Start Appium session for Android driver app',
				'Authenticate or restore driver session',
				'Open assigned trip by tripId',
				'Finish trip from driver app',
				'Trigger charge event on trip completion',
				'Persist updated journey context for payment validation'
			],
			todos: [
				...context.mobileTodos,
				'Confirm Android locators in real device or emulator',
				'Implement Appium driver wrapper for Android execution'
			]
		};
	}

	async executeDraft(context: GatewayPgJourneyContext): Promise<MobileGatewayExecutionPlan> {
		return this.buildExecutionPlan(context);
	}
}
