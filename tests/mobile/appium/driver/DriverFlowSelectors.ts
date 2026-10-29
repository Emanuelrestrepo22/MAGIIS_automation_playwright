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
		webSelectors: ['app-page-travel-confirm', 'button.btn.primary']
	},
	'in-progress': {
		urlTokens: ['TravelInProgressPage'],
		webSelectors: ['app-page-travel-in-progress', 'app-page-travel-in-progress button.btn.finish']
	},
	resume: {
		urlTokens: ['TravelResumePage'],
		webSelectors: ['app-travel-resume', 'app-travel-resume button.btn.finish']
	},
	closed: {
		urlTokens: ['/navigator/home', 'TravelConfirmPage'],
		webSelectors: ['button.driver-home.home-icon-base', 'app-page-travel-confirm button.btn.primary']
	}
};

export const DRIVER_ACTION_SELECTORS = {
	acceptTripPrimaryButton: 'button.btn.primary',
	/** Independiente de idioma: único CTA del footer de TravelConfirmPage (DOM dump 2026-10-20: `<button class="btn primary">Accept</button>`). */
	acceptTripConfirmPageButton: 'app-page-travel-confirm button.btn.primary',
	startTripPrimaryButton: 'button.btn.primary.trip-pax-start',
	endTripPrimaryButton: 'app-page-travel-in-progress button.btn.finish',
	confirmModalYesButtons: ['app-confirm-modal button.btn.primary', 'ion-modal button.btn.primary'],
	closeTripPrimaryButton: 'app-travel-resume button.btn.finish'
} as const;

/**
 * Textos de botones del driver app por idioma (ES + EN). Fuente: magiis-mobile-driver-v2
 * `src/assets/i18n/{es,en}.json` (develop). Los selectores por clase/id siguen siendo la vía primaria;
 * estos textos son fallback para cuando el UI del chofer está en inglés o español.
 */
export const DRIVER_UI_TEXTS = {
	/** i18n `buttons.accept` (es "Aceptar" / en "Accept"); "Tomar viaje" = legado. */
	accept: ['Aceptar', 'Accept', 'Tomar viaje'],
	/** i18n `travel_to_start.start_trip` / `buttons.start_trip`. */
	startTrip: ['Empezar Viaje', 'Start Trip'],
	/** i18n `travel_in_progress.finish_travel`. */
	endTrip: ['Finalizar Viaje', 'End Trip'],
	/** i18n `buttons.yes` (es "Si" / en "Yes") en app-confirm-modal (empezar / finalizar). */
	confirmYes: ['Si', 'Sí', 'Yes'],
	/** i18n `travel_resume.close_travel` / `travel_resume.sign` (+ `travel_in_progress.finish_travel` legado). */
	closeTrip: [
		'Cerrar Viaje',
		'Firmar y Cerrar viaje',
		'Finalizar Viaje',
		'Close Trip',
		'Sign and Close Trip',
		'End Trip'
	],
	/** i18n `home.available_label` / `home.not_available_label`. */
	availability: ['Disponible', 'No disponible', 'Available', 'Not Available']
} as const;

/** Comparación exacta insensible a mayúsculas/espacios contra una lista de textos aceptados. */
export function matchesAnyText(text: string | null | undefined, candidates: readonly string[]): boolean {
	const norm = (v: string) => v.replace(/\s+/g, ' ').trim().toLowerCase();
	const t = norm(text ?? '');
	return t.length > 0 && candidates.some(c => norm(c) === t);
}
