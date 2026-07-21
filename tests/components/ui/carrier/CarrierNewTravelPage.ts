/**
 * KATA Component (Layer 3) — Carrier · Alta de Viaje (formulario nuevo viaje).
 *
 * Versión KATA del POM `tests/pages/carrier/NewTravelPage(Base).ts`: extiende `UiBase`
 * y expone el subconjunto que consumen los specs de hold. Compone el POM legacy
 * internamente (delegación) — NO se duplica la lógica Stripe Elements / Angular
 * (~900 líneas, deuda TIER A BL-038) ni se toca el POM legacy, que sigue siendo la
 * base compartida por contractor + specs aún no amoldados (multi-session safety).
 *
 * NOTA @atc — MAPEO POR ÁREA (aceptado): el idmap `atp-mg-gateway-idmap.md` es
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
import type { NewTravelFormInput, ValidateCardResult } from '@pages/carrier';

import { expect } from '@playwright/test';
import { NewTravelPage as LegacyNewTravelPage } from '@pages/carrier';
import { atc, step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';

export type { NewTravelFormInput } from '@pages/carrier';

/**
 * Entrada del alta de viaje con método "Cargo a Bordo".
 * `passenger` opcional: cuando el cliente auto-asigna el pasajero (app pax /
 * empresa individuo, `#passenger` con `ng-reflect-is-disabled="true"`) se omite.
 */
export type CargoTravelInput = {
	client: string;
	passenger?: string;
	origin: string;
	destination: string;
};

export class CarrierNewTravelPage extends UiBase {
	private readonly legacy: LegacyNewTravelPage;

	constructor(options: TestContextOptions) {
		super(options);
		this.legacy = new LegacyNewTravelPage(this.page);
	}

	/** Navega directo al formulario de alta de viaje. */
	@step
	async goto(): Promise<void> {
		await this.legacy.goto();
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

	/**
	 * Mini-flujo ATC: completa el formulario de alta con método "Cargo a Bordo" (sin
	 * tarjeta ni formulario Stripe en carrier — el cobro ocurre luego en la Driver App).
	 * Maneja el pasajero de forma adaptativa: si el cliente lo auto-asigna (`#passenger`
	 * deshabilitado), valida su contenido; si no, lo selecciona explícitamente; si no se
	 * pasa `passenger` (app pax), lo omite.
	 *
	 * @atc MG-161 (área F — cobro). mapeo por área aceptado: el idmap `atp-mg-gateway-idmap.md`
	 * es API-level (TC-PAY-F-*); los TS-STRIPE-TC10xx UI de Cargo a Bordo no tienen 1:1.
	 * MG-161 (TC-PAY-F-01) es el MG más cercano del área de cobro.
	 */
	@atc('MG-161', { severity: 'critical', description: 'Alta de viaje Cargo a Bordo: completar formulario + método Cargo a Bordo' })
	async fillCargoABordo(opts: CargoTravelInput): Promise<void> {
		await this.legacy.selectClient(opts.client);
		if (opts.passenger) {
			const passengerField = this.page.locator('#passenger');
			const autoAssigned = (await passengerField.getAttribute('ng-reflect-is-disabled')) === 'true';
			if (autoAssigned) {
				await expect(passengerField).not.toHaveText('', { timeout: 10_000 });
			} else {
				await this.legacy.selectPassenger(opts.passenger);
			}
		}
		await this.legacy.setOrigin(opts.origin);
		await this.legacy.setDestination(opts.destination);
		await this.legacy.selectPaymentMethod('CargoABordo');
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

	/** Envía el alta de viaje (validar + seleccionar vehículo + enviar servicio). */
	@step
	async submit(): Promise<void> {
		await this.legacy.submit();
	}

	/**
	 * Click en "Validar" tolerando el rechazo de la tarjeta (fondos insuficientes,
	 * declinada). Retorna `{ success, errorMessage }` sin lanzar cuando la tarjeta
	 * es rechazada — el spec decide la aserción.
	 */
	@step
	async clickValidateCardAllowingReject(timeout = 8_000): Promise<ValidateCardResult> {
		return this.legacy.clickValidateCardAllowingReject(timeout);
	}

	// ── Granulares del alta (para flujos que no usan `fillMinimum`) ──────────────
	// Los consume el spec de preauth-failure (cliente contractor + pasajero app pax
	// invitado), donde el formulario se completa campo a campo. Additive: no alteran
	// `fillMinimum`/`fillCargoABordo`. Delegación directa al POM legacy → @step.

	/** Selecciona el cliente del viaje (autocompletar). */
	@step
	async selectClient(name: string): Promise<void> {
		await this.legacy.selectClient(name);
	}

	/** Selecciona el pasajero app pax invitado y completa su nombre. */
	@step
	async selectGuestPassenger(name: string): Promise<void> {
		await this.legacy.selectGuestPassenger(name);
	}

	/** Fija la dirección de origen del viaje. */
	@step
	async setOrigin(address: string): Promise<void> {
		await this.legacy.setOrigin(address);
	}

	/** Fija la dirección de destino del viaje. */
	@step
	async setDestination(address: string): Promise<void> {
		await this.legacy.setDestination(address);
	}

	/** Vincula/valida la tarjeta preautorizada por sus últimos 4 dígitos. */
	@step
	async selectCardByLast4(last4: string, skipValidate = false, allowDecline = false): Promise<void> {
		await this.legacy.selectCardByLast4(last4, skipValidate, allowDecline);
	}
}
