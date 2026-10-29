/**
 * DriverViajeCalleScreen — navegación del flujo "viaje calle" (driver-initiated) en App Driver.
 *
 * AGNÓSTICO DE PASARELA: cubre P1-P7 (bienvenida → iniciar viaje calle → finalizar → abrir cobro).
 * El cobro (form de tarjeta) NO vive acá — lo maneja el payment screen del gateway activo
 * (`DriverTripPaymentScreen` para Stripe; `MercadoPagoDriverPaymentScreen` para MP), compartiendo
 * el mismo `driver`.
 *
 * Selectores confirmados por captura step-by-step del device (carrier ARG/EEUU TEST, 2026-07-22).
 * Los `#ion-overlay-N` del recorder son dinámicos → se usan selectores por componente
 * (`app-confirm-modal button.btn.primary`) filtrando el visible.
 *
 * Formaliza el script exploratorio `scripts/start-viaje-calle-flow.ts` en un POM mantenible.
 */

import type { MobileActorConfig } from '../config/appiumRuntime';
import { AppiumSessionBase, type AppiumDriver } from '../base/AppiumSessionBase';

const SEL = {
	/** P1 — botón "Aceptar" de la pantalla de bienvenida (/pre-home). */
	welcomeAccept: '#main-content app-pre-home .button-accept-absolute button',
	/** P2 — ícono "Pasajero"/viaje calle en el home (dispara startStreetTravel). */
	viajeCalleIcon: 'page-home div.driver-pass.home-icon',
	/** P3/P5 — botón primario del modal de confirmación (visible). */
	confirmPrimary: 'app-confirm-modal button.btn.primary',
	/** P4 — botón "Finalizar Viaje" en TravelInProgressPage. */
	finishTrip: 'app-page-travel-in-progress div.btn-finish-container button',
	/** P6 — botón del método de pago con tarjeta en el resumen. */
	cardMethod: 'app-travel-resume div.travel-payment ion-row ion-col:nth-child(2) button',
	/** P7 — botón "Ingresar tarjeta" (footer del resumen) → abre el modal de cobro. */
	ingresarTarjeta: 'app-travel-resume ion-footer ion-toolbar button'
} as const;

export class DriverViajeCalleScreen extends AppiumSessionBase {
	constructor(config: MobileActorConfig, driver?: AppiumDriver) {
		super(config, driver);
	}

	/**
	 * Click JS sobre el primer elemento visible que matchea `selector` en el WebView.
	 * Ionic/Angular requieren click real vía DOM (no `execute()` crudo de coordenadas),
	 * por eso se usa `element.click()` dentro de `execute` (mismo patrón que DriverHomeScreen).
	 */
	private async clickWeb(selector: string, timeout = 15_000): Promise<boolean> {
		const driver = this.requireDriver();
		await this.switchToWebView(timeout);
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			const clicked = await driver
				.execute((sel: string) => {
					const nodes = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
					const el = nodes.find(node => node.offsetParent !== null);
					if (el) {
						el.click();
						return true;
					}
					return false;
				}, selector)
				.catch(() => false);
			if (clicked) {
				return true;
			}
			await driver.pause(300);
		}
		return false;
	}

	/** P1 — acepta la pantalla de bienvenida si está presente (idempotente). */
	async acceptWelcome(): Promise<void> {
		await this.clickWeb(SEL.welcomeAccept, 8_000).catch(() => false);
	}

	/** P2-P3 — inicia el viaje calle y confirma el modal. Espera TravelInProgressPage. */
	async startViajeCalle(): Promise<void> {
		if (!(await this.clickWeb(SEL.viajeCalleIcon))) {
			throw new Error(
				'[DriverViajeCalleScreen] botón viaje calle (div.driver-pass.home-icon) no encontrado/visible'
			);
		}
		if (!(await this.clickWeb(SEL.confirmPrimary))) {
			throw new Error('[DriverViajeCalleScreen] modal de confirmación de viaje calle no apareció');
		}
		await this.waitForWebUrlContains('TravelInProgressPage', 20_000);
	}

	/** P4-P5 — finaliza el viaje y confirma. Espera TravelResumePage. */
	async finishTrip(): Promise<void> {
		if (!(await this.clickWeb(SEL.finishTrip))) {
			throw new Error('[DriverViajeCalleScreen] botón "Finalizar Viaje" no encontrado/visible');
		}
		if (!(await this.clickWeb(SEL.confirmPrimary))) {
			throw new Error('[DriverViajeCalleScreen] modal "¿Finalizar Viaje?" no apareció');
		}
		await this.waitForWebUrlContains('TravelResumePage', 20_000);
	}

	/** P6-P7 — selecciona método tarjeta y abre el modal de cobro ("Ingresar tarjeta"). */
	async openCardPayment(): Promise<void> {
		if (!(await this.clickWeb(SEL.cardMethod))) {
			throw new Error('[DriverViajeCalleScreen] botón de método de pago con tarjeta no encontrado/visible');
		}
		if (!(await this.clickWeb(SEL.ingresarTarjeta))) {
			throw new Error('[DriverViajeCalleScreen] botón "Ingresar tarjeta" no encontrado/visible');
		}
	}
}
