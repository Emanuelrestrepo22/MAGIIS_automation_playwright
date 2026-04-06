/**
 * DriverHomeScreen
 * Pantalla principal de la Driver App al iniciar sesión.
 * Aquí aparecen las solicitudes de viaje entrantes.
 *
 * TODO: todos los selectores deben validarse contra la app real.
 */

import { AppiumSessionBase } from '../base/AppiumSessionBase';

export class DriverHomeScreen extends AppiumSessionBase {

	/**
	 * Espera a que llegue una solicitud de viaje (push notification o card en home).
	 * @param tripId - ID del viaje esperado (para verificar que es el correcto)
	 * @param timeout - tiempo máximo de espera en ms
	 */
	async waitForTripRequest(tripId: string, timeout = 30_000): Promise<void> {
		// TODO: confirmar selector — puede ser un card con data-testid o accessibility-id
		// La notificación puede llegar como push (sistema) o como card en la lista home
		console.log(`[DriverHomeScreen] Esperando solicitud de viaje ${tripId}...`);

		// TODO: implementar con WebdriverIO:
		// await this.waitForElement(this.byAccessibilityId('trip-request-card'), timeout);
		throw new Error('DriverHomeScreen.waitForTripRequest() — pendiente de implementación con WebdriverIO');
	}

	/**
	 * Verifica que el viaje visible en home corresponde al tripId esperado.
	 */
	async verifyTripId(tripId: string): Promise<boolean> {
		// TODO: localizar el elemento que muestra el tripId en el card de solicitud
		console.log(`[DriverHomeScreen] Verificando tripId: ${tripId}`);
		// TODO: return (await this.driver.$(`//*[@text="${tripId}"]`)).isDisplayed();
		throw new Error('DriverHomeScreen.verifyTripId() — pendiente de implementación');
	}

	/**
	 * Navega al detalle de la solicitud de viaje para poder aceptarla.
	 */
	async openTripRequest(): Promise<void> {
		// TODO: confirmar si se hace tap en el card o llega a una pantalla nueva directamente
		// await this.tap(this.byAccessibilityId('trip-request-card'));
		throw new Error('DriverHomeScreen.openTripRequest() — pendiente de implementación');
	}

	/**
	 * Verifica que el driver está en estado ONLINE y disponible para recibir viajes.
	 */
	async isDriverOnline(): Promise<boolean> {
		// TODO: confirmar selector del toggle online/offline
		// return (await this.driver.$(this.byAccessibilityId('driver-status-online'))).isDisplayed();
		throw new Error('DriverHomeScreen.isDriverOnline() — pendiente de implementación');
	}

	/**
	 * Activa el estado ONLINE del driver si está offline.
	 */
	async goOnline(): Promise<void> {
		// TODO: tap en toggle de estado
		// await this.tap(this.byAccessibilityId('driver-status-toggle'));
		throw new Error('DriverHomeScreen.goOnline() — pendiente de implementación');
	}
}
