/**
 * PassengerTripStatusScreen
 * Pantalla de estado del viaje activo en la Passenger App.
 * Muestra en tiempo real el estado: buscando conductor → en camino → en curso → completado.
 *
 * TODO: todos los selectores deben validarse contra la app real con Appium Inspector.
 */

import { AppiumSessionBase } from '../base/AppiumSessionBase';

export class PassengerTripStatusScreen extends AppiumSessionBase {

	/**
	 * Espera hasta que el viaje tenga conductor asignado.
	 * @param timeout - tiempo máximo de espera en ms (default 60s)
	 */
	async waitForDriverAssigned(timeout = 60_000): Promise<void> {
		// TODO: confirmar selector del estado "Conductor asignado" / "Driver en camino"
		// await this.waitForElement(this.byAccessibilityId('driver-assigned-status'), timeout);
		throw new Error('PassengerTripStatusScreen.waitForDriverAssigned() — pendiente de implementación');
	}

	/**
	 * Espera hasta que el viaje sea completado.
	 */
	async waitForTripCompleted(timeout = 120_000): Promise<void> {
		// TODO: confirmar selector del estado "Viaje completado"
		// await this.waitForElement(this.byAccessibilityId('trip-completed-status'), timeout);
		throw new Error('PassengerTripStatusScreen.waitForTripCompleted() — pendiente de implementación');
	}

	/**
	 * Obtiene el estado actual del viaje como texto.
	 */
	async getTripStatus(): Promise<string> {
		// TODO: localizar label de estado del viaje
		// const el = await this.driver.$(this.byAccessibilityId('trip-status-label'));
		// return el.getText();
		throw new Error('PassengerTripStatusScreen.getTripStatus() — pendiente de implementación');
	}

	/**
	 * Verifica que el cobro fue procesado correctamente (pantalla post-viaje).
	 */
	async verifyPaymentProcessed(expectedAmount?: string): Promise<void> {
		// TODO: confirmar pantalla de resumen de cobro
		// await this.waitForElement(this.byAccessibilityId('payment-confirmed-screen'));
		// if (expectedAmount) {
		//   const amountEl = await this.driver.$(this.byAccessibilityId('charged-amount'));
		//   const text = await amountEl.getText();
		//   if (!text.includes(expectedAmount)) throw new Error(`Monto esperado: ${expectedAmount}, obtenido: ${text}`);
		// }
		throw new Error('PassengerTripStatusScreen.verifyPaymentProcessed() — pendiente de implementación');
	}
}
