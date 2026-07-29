/**
 * KATA Component (Layer 3) — Contractor · Alta de Viaje (formulario nuevo viaje).
 *
 * Versión KATA del POM `tests/pages/contractor/NewTravelPage.ts`: extiende `UiBase`
 * y compone el POM legacy contractor internamente (delegación). NO se duplica la
 * lógica Angular/Stripe Elements ni se toca el POM legacy, que sigue siendo la base
 * compartida por los specs aún no amoldados (multi-session safety).
 *
 * En contractor el campo cliente y pasajero son el mismo ("Seleccione un usuario"),
 * por eso `fillMinimum` recibe `client === passenger`. El resto del formulario
 * (origen, destino, tarjeta, validar, vehículo) se hereda del POM carrier vía el
 * legacy contractor.
 *
 * NOTA @atc — MAPEO POR ÁREA (aceptado): el idmap `atp-mg-gateway-idmap.md` es
 * API-level (TC-PAY-*); los TS-STRIPE-P2-TC00x (UI) no tienen 1:1. `fillMinimum`
 * (alta + validación tarjeta preautorizada) → MG-148 (área C, TC-PAY-C-01), mismo
 * mapeo que el carrier. `selectSavedCard` (selección de tarjeta guardada, UI) →
 * MG-482 (área C UI, TC-PAY-C-05). Reasignar cuando el ATP tenga TCs UI del alta
 * contractor.
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase.
 *   - Import por alias (@pages, @ui, @utils), sin relativos nuevos.
 *   - Mini-flujos decorados con @atc; esperas/acciones simples con @step.
 *   - `hasHighlightedSavedCard` es util silent-fail (retorna boolean, no lanza).
 */

import type { TestContextOptions } from '@TestContext';
import type { NewTravelFormInput, PaymentMethod } from '@pages/carrier';

import { expect } from '@playwright/test';
import { ContractorNewTravelPage as LegacyContractorNewTravelPage } from '@pages/contractor';
import { atc, step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';

export class ContractorNewTravelPage extends UiBase {
	private readonly legacy: LegacyContractorNewTravelPage;

	constructor(options: TestContextOptions) {
		super(options);
		this.legacy = new LegacyContractorNewTravelPage(this.page);
	}

	/** Espera a que el formulario contractor esté cargado (campo "Seleccione un usuario"). */
	@step
	async ensureLoaded(timeout = 15_000): Promise<void> {
		await this.legacy.ensureLoaded(timeout);
	}

	/**
	 * Mini-flujo ATC: completa el formulario mínimo (usuario/origen/destino) y
	 * vincula/valida la tarjeta preautorizada. @atc MG-148 (área C — pendiente reasignar).
	 */
	@atc('MG-148', {
		severity: 'critical',
		description: 'Alta de viaje contractor: completar formulario + validar tarjeta preautorizada'
	})
	async fillMinimum(opts: NewTravelFormInput): Promise<void> {
		await this.legacy.fillMinimum(opts);
	}

	/** Selecciona un usuario (colaborador) en el formulario contractor. */
	@step
	async selectClient(name: string): Promise<void> {
		await this.legacy.selectClient(name);
	}

	/** Selecciona la dirección de origen. */
	@step
	async setOrigin(address: string): Promise<void> {
		await this.legacy.setOrigin(address);
	}

	/** Selecciona la dirección de destino. */
	@step
	async setDestination(address: string): Promise<void> {
		await this.legacy.setDestination(address);
	}

	/**
	 * Util silent-fail: indica si el colaborador tiene una tarjeta guardada resaltada
	 * (`.highlighted`). Retorna false ante cualquier fallo — NO lanza. El spec/step lo
	 * usa como precondición para `test.skip`.
	 */
	async hasHighlightedSavedCard(timeout = 5_000): Promise<boolean> {
		const highlighted = this.page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').first();
		return highlighted.isVisible({ timeout }).catch(() => false);
	}

	/**
	 * Mini-flujo ATC: selecciona la tarjeta guardada resaltada del colaborador.
	 * @atc MG-482 (área C UI — pendiente reasignar).
	 */
	@atc('MG-482', {
		severity: 'critical',
		description: 'Alta de viaje contractor: seleccionar tarjeta guardada del colaborador'
	})
	async selectSavedCard(): Promise<void> {
		await this.legacy.selectSavedCard();
	}

	/**
	 * Journey contractor hasta el método de pago, SIN llenar la tarjeta (S7): usuario +
	 * direcciones con los campos ESPECÍFICOS de contractor (clear-if-filled del origen
	 * auto-cargado). Para gateways de form nativo (MP/Authorize/eBiz): el caller sigue con
	 * `selectPaymentMethod('Preautorizada')` + la CardFormStrategy de la pasarela.
	 */
	@step
	async fillJourneyUntilPayment(opts: { client: string; origin: string; destination: string }): Promise<void> {
		await this.legacy.fillJourneyUntilPayment(opts);
	}

	/** Selecciona el método de pago del alta (ej. 'Preautorizada' antes del card form). */
	@step
	async selectPaymentMethod(method: PaymentMethod): Promise<void> {
		await this.legacy.selectPaymentMethod(method);
	}

	/**
	 * Click en "Validar" del form NATIVO Angular y espera el oráculo de tarjeta validada.
	 * Mismo contrato que el delegate carrier (`CarrierNewTravelPage.validateNativeCard`):
	 * acepta CUALQUIERA de las dos manifestaciones verificadas live del éxito — toast
	 * "Tarjeta válida" (alta de tarjeta nueva) o Forma de Pago resuelta a "*** <last4>"
	 * (tarjeta ya vinculada). Ver la historia del oráculo en el docblock del carrier: el
	 * toast desaparecía por la política AVS de la cuenta sandbox, no por cambio del FE.
	 */
	@step
	async validateNativeCard(last4: string): Promise<void> {
		await this.page.getByRole('button', { name: /^(Valid|Validar)$/i }).click();
		const validated = this.page
			.getByText(/Tarjeta v[áa]lida|Valid card|Card valid/i)
			.or(this.page.getByText(new RegExp(`\\*+\\s*${last4}`)));
		await expect(
			validated.first(),
			`validación OK: toast "Tarjeta válida" o Forma de Pago resuelta a *** ${last4}`
		).toBeVisible({ timeout: 45_000 });
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
