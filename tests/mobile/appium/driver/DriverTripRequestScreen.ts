/**
 * DriverTripRequestScreen
 * Pantalla de detalle de solicitud de viaje en la Driver App.
 * El driver ve la información del viaje y puede aceptarlo o rechazarlo.
 *
 * TODO: todos los selectores deben validarse contra la app real con Appium Inspector.
 * Ver: .claude/skills/magiis-appium-hybrid-e2e/references/appium-implementation-rules.md
 */

import { AppiumSessionBase } from '../base/AppiumSessionBase';

export class DriverTripRequestScreen extends AppiumSessionBase {

	/**
	 * Acepta la solicitud de viaje.
	 * Dispara el evento que cambia el estado del viaje a ACCEPTED en backend.
	 */
	async acceptTrip(): Promise<void> {
		// TODO: confirmar selector del botón "Aceptar viaje" con Appium Inspector
		// await this.tap(this.byAccessibilityId('accept-trip-btn'));
		throw new Error('DriverTripRequestScreen.acceptTrip() — pendiente de implementación');
	}

	/**
	 * Lee el origen del viaje tal como lo muestra la app.
	 */
	async getTripOrigin(): Promise<string> {
		// TODO: localizar label de origen
		// const el = await this.driver.$(this.byAccessibilityId('trip-origin-label'));
		// return el.getText();
		throw new Error('DriverTripRequestScreen.getTripOrigin() — pendiente de implementación');
	}

	/**
	 * Lee el destino del viaje tal como lo muestra la app.
	 */
	async getTripDestination(): Promise<string> {
		// TODO: localizar label de destino
		throw new Error('DriverTripRequestScreen.getTripDestination() — pendiente de implementación');
	}

	/**
	 * Verifica que la información del viaje coincide con lo creado en el portal web/passenger.
	 */
	async verifyTripDetails(expected: { origin: string; destination: string }): Promise<void> {
		const origin = await this.getTripOrigin();
		const dest   = await this.getTripDestination();
		if (!origin.includes(expected.origin)) {
			throw new Error(`Origen esperado "${expected.origin}", obtenido "${origin}"`);
		}
		if (!dest.includes(expected.destination)) {
			throw new Error(`Destino esperado "${expected.destination}", obtenido "${dest}"`);
		}
	}
}
