/**
 * Selectores canónicos para checkpoints y acciones del flujo Driver.
 * Fuente de verdad para TravelConfirm -> InProgress -> Resume -> Closed.
 */

export type DriverCheckpointStage = 'confirm' | 'in-progress' | 'resume' | 'closed';

type DriverCheckpointSelector = {
	urlTokens: string[];
	webSelectors: string[];
};

export const DRIVER_CHECKPOINT_SELECTORS: Record<DriverCheckpointStage, DriverCheckpointSelector> = {
	confirm: {
		urlTokens: ['TravelConfirmPage'],
		webSelectors: ['app-page-travel-confirm', 'button.btn.primary'],
	},
	'in-progress': {
		urlTokens: ['TravelInProgressPage'],
		webSelectors: ['app-page-travel-in-progress', 'app-page-travel-in-progress button.btn.finish'],
	},
	resume: {
		urlTokens: ['TravelResumePage'],
		webSelectors: ['app-travel-resume', 'app-travel-resume button.btn.finish'],
	},
	closed: {
		urlTokens: ['/navigator/home', 'TravelConfirmPage'],
		webSelectors: ['button.driver-home.home-icon-base', 'app-page-travel-confirm button.btn.primary'],
	},
};

export const DRIVER_ACTION_SELECTORS = {
	acceptTripPrimaryButton: 'button.btn.primary',
	startTripPrimaryButton: 'button.btn.primary.trip-pax-start',
	endTripPrimaryButton: 'app-page-travel-in-progress button.btn.finish',
	confirmModalYesButtons: ['app-confirm-modal button.btn.primary', 'ion-modal button.btn.primary'],
	closeTripPrimaryButton: 'app-travel-resume button.btn.finish',
} as const;

