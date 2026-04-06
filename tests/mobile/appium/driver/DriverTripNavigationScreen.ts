/**
 * DriverTripNavigationScreen
 * Pantalla de navegación del viaje activo en la Driver App.
 * El driver simula el recorrido y finaliza el viaje desde aquí.
 *
 * La finalización del viaje dispara el evento de cobro en el backend.
 *
 * TODO: todos los selectores deben validarse contra la app real con Appium Inspector.
 */

import { AppiumSessionBase } from '../base/AppiumSessionBase';
import type { GeoPoint } from '../../../shared/contracts/gateway-pg';

export class DriverTripNavigationScreen extends AppiumSessionBase {

	/**
	 * Marca el inicio del viaje (driver llegó al origen y recogió al pasajero).
	 */
	async startTrip(): Promise<void> {
		// TODO: confirmar selector del botón "Iniciar viaje" / "Recoger pasajero"
		// await this.tap(this.byAccessibilityId('start-trip-btn'));
		throw new Error('DriverTripNavigationScreen.startTrip() — pendiente de implementación');
	}

	/**
	 * Simula el recorrido del viaje enviando ubicaciones GPS al backend.
	 *
	 * En un emulador Android se puede simular GPS con:
	 *   adb emu geo fix <lng> <lat>
	 * O usando las capabilities de Appium para mock location.
	 *
	 * @param points - lista de coordenadas GPS que forman la ruta
	 * @param intervalMs - intervalo entre cada punto (default 2s)
	 */
	async simulateRoute(points: GeoPoint[], intervalMs = 2_000): Promise<void> {
		console.log(`[DriverTripNavigationScreen] Simulando ruta con ${points.length} puntos...`);
		for (const point of points) {
			console.log(`  → GPS: ${point.lat}, ${point.lng} ${point.label ?? ''}`);
			// TODO: implementar mock GPS con WebdriverIO / adb:
			// await this.driver.setGeoLocation({ latitude: point.lat, longitude: point.lng, altitude: 0 });
			await new Promise(r => setTimeout(r, intervalMs));
		}
		// TODO: remover el setTimeout cuando se implemente con WebdriverIO real
		throw new Error('DriverTripNavigationScreen.simulateRoute() — pendiente de implementación con WebdriverIO');
	}

	/**
	 * Finaliza el viaje. Dispara el evento de cobro en Stripe/pasarela.
	 * Este es el momento crítico del flujo E2E: si el cobro falla, el viaje queda en conflicto.
	 */
	async endTrip(): Promise<void> {
		// TODO: confirmar selector del botón "Finalizar viaje" con Appium Inspector
		// await this.tap(this.byAccessibilityId('end-trip-btn'));
		throw new Error('DriverTripNavigationScreen.endTrip() — pendiente de implementación');
	}

	/**
	 * Verifica que el viaje fue completado exitosamente en la app del driver.
	 */
	async verifyTripCompleted(): Promise<void> {
		// TODO: confirmar selector del estado de viaje completado
		// await this.waitForElement(this.byAccessibilityId('trip-completed-screen'));
		throw new Error('DriverTripNavigationScreen.verifyTripCompleted() — pendiente de implementación');
	}

	/**
	 * Obtiene el monto cobrado mostrado en la pantalla de resumen post-viaje.
	 */
	async getChargedAmount(): Promise<string> {
		// TODO: localizar el label de monto en la pantalla de resumen
		throw new Error('DriverTripNavigationScreen.getChargedAmount() — pendiente de implementación');
	}
}
