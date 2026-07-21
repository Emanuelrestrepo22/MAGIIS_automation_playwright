/**
 * KATA Component (Layer 3) — Carrier · Alta de Viaje (formulario nuevo viaje).
 *
 * Versión KATA del POM `tests/pages/carrier/NewTravelPage(Base).ts`: extiende `UiBase`
 * y expone el subconjunto que consumen los specs de hold. Compone el POM legacy
 * internamente (delegación) — NO se duplica la lógica Stripe Elements / Angular
 * (~900 líneas, deuda TIER A BL-038) ni se toca el POM legacy, que sigue siendo la
 * base compartida por contractor + specs aún no amoldados (multi-session safety).
 *
 * NOTA @atc — MAPEO PENDIENTE REASIGNAR: el idmap `atp-mg-gateway-idmap.md` es
 * API-level (TC-PAY-*); los TS-STRIPE-TC10xx (UI) no tienen 1:1. `fillMinimum`
 * (alta + validación de tarjeta preautorizada) se mapea al MG más cercano del área C
 * (alta/validación tarjeta): MG-148 (TC-PAY-C-01). Reasignar cuando el ATP tenga TCs
 * UI del alta de viaje con hold.
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase.
 *   - Import por alias (@pages), sin relativos nuevos.
 *   - Mini-flujo de alta/validación decorado con @atc; esperas trazadas con @step.
 */

import type { TestContextOptions } from '@TestContext';
import type { NewTravelFormInput } from '@pages/carrier';

import { NewTravelPage as LegacyNewTravelPage } from '@pages/carrier';
import { atc, step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';

export type { NewTravelFormInput } from '@pages/carrier';

export class CarrierNewTravelPage extends UiBase {
	private readonly legacy: LegacyNewTravelPage;

	constructor(options: TestContextOptions) {
		super(options);
		this.legacy = new LegacyNewTravelPage(this.page);
	}

	/** Espera a que el formulario de alta de viaje esté cargado. */
	@step
	async ensureLoaded(timeout = 15_000): Promise<void> {
		await this.legacy.ensureLoaded(timeout);
	}

	/**
	 * Mini-flujo ATC: completa el formulario mínimo (cliente/pasajero/origen/destino) y
	 * vincula/valida la tarjeta preautorizada. @atc MG-148 (área C — pendiente reasignar).
	 */
	@atc('MG-148', { severity: 'critical', description: 'Alta de viaje: completar formulario + validar tarjeta preautorizada' })
	async fillMinimum(opts: NewTravelFormInput): Promise<void> {
		await this.legacy.fillMinimum(opts);
	}

	/** Espera a que el botón "Seleccionar Vehículo" esté habilitado. */
	@step
	async waitForVehicleSelectionReady(timeout = 45_000): Promise<void> {
		await this.legacy.waitForVehicleSelectionReady(timeout);
	}

	/** Abre el selector de vehículos (espera habilitación + overlay). */
	@step
	async clickSelectVehicle(): Promise<void> {
		await this.legacy.clickSelectVehicle();
	}

	/** Envía el servicio (Dar de Alta / Enviar Servicio). */
	@step
	async clickSendService(): Promise<void> {
		await this.legacy.clickSendService();
	}
}
