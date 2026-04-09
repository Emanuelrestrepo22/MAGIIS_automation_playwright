/**
 * PassengerNewTripScreen
 * Pantalla de solicitud de nuevo viaje desde la Passenger App.
 *
 * TODO: todos los selectores deben validarse contra la app real con Appium Inspector.
 */

import { AppiumSessionBase } from '../base/AppiumSessionBase';

export interface TripRequest {
	origin: string;
	destination: string;
	cardLast4: string;
}

export class PassengerNewTripScreen extends AppiumSessionBase {

	/**
	 * Abre el formulario de nuevo viaje.
	 */
	async openNewTrip(): Promise<void> {
		// TODO: confirmar selector — puede ser botón flotante o item de menú
		// await this.tap(this.byAccessibilityId('new-trip-btn'));
		throw new Error('PassengerNewTripScreen.openNewTrip() — pendiente de implementación');
	}

	/**
	 * Completa el origen del viaje (dirección o punto en el mapa).
	 */
	async setOrigin(address: string): Promise<void> {
		// TODO: puede ser un campo de texto con autocompletado de Google Places
		// await this.typeIn(this.byAccessibilityId('origin-input'), address);
		// await this.tap(this.byText(address)); // seleccionar del dropdown
		throw new Error('PassengerNewTripScreen.setOrigin() — pendiente de implementación');
	}

	/**
	 * Completa el destino del viaje.
	 */
	async setDestination(address: string): Promise<void> {
		// await this.typeIn(this.byAccessibilityId('destination-input'), address);
		// await this.tap(this.byText(address));
		throw new Error('PassengerNewTripScreen.setDestination() — pendiente de implementación');
	}

	/**
	 * Selecciona la tarjeta de pago para este viaje.
	 * La tarjeta debe haberse agregado previamente al wallet.
	 */
	async selectPaymentCard(last4: string): Promise<void> {
		// TODO: confirmar si la selección de tarjeta está en esta pantalla o en el resumen
		// await this.tap(this.byAccessibilityId('payment-method-selector'));
		// await this.tap(this.byText(`•••• ${last4}`));
		throw new Error('PassengerNewTripScreen.selectPaymentCard() — pendiente de implementación');
	}

	/**
	 * Confirma la solicitud del viaje.
	 * Dispara la búsqueda de conductor y el evento que llega como push al driver.
	 *
	 * @returns el ID del viaje creado (si la app lo expone)
	 */
	async confirmTrip(): Promise<string | undefined> {
		// await this.tap(this.byAccessibilityId('confirm-trip-btn'));
		// TODO: capturar el tripId de la respuesta o de la pantalla de estado
		throw new Error('PassengerNewTripScreen.confirmTrip() — pendiente de implementación');
	}
}
