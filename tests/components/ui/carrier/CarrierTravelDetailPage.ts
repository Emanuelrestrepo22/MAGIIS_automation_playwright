/**
 * KATA Component (Layer 3) — Carrier · Detalle / Edición de Viaje Programado.
 *
 * Versión KATA del POM `tests/pages/carrier/TravelDetailPage.ts`: extiende `UiBase`
 * y expone el subconjunto que consumen los specs de operaciones (edición de método de
 * pago en viajes programados). Compone el POM legacy internamente (delegación); el POM
 * legacy queda intacto para specs aún no amoldados (multi-session safety).
 *
 * NOTA @atc — MAPEO por área EDIT: el idmap `atp-mg-gateway-idmap.md` tiene el área EDIT
 * (edición de viaje) en MG-415..MG-427 (Level UI). Los mini-flujos de edición se mapean a
 * los MG más cercanos de esa área: MG-415 (TC-PAY-EDIT-01) para vincular/validar tarjeta
 * durante la edición y MG-416 (TC-PAY-EDIT-02) para confirmar y guardar. PENDIENTE
 * REASIGNAR: no hay 1:1 entre los TS-STRIPE-P2-TC078xx UI y los TC-PAY-EDIT-* del idmap.
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase.
 *   - Import por alias (@pages), sin relativos nuevos.
 *   - Mini-flujos de edición decorados con @atc; navegación/acciones puntuales con @step.
 */

import type { TestContextOptions } from '@TestContext';

import { TravelDetailPage as LegacyTravelDetailPage } from '@pages/carrier';
import { atc, step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';

export class CarrierTravelDetailPage extends UiBase {
	private readonly legacy: LegacyTravelDetailPage;

	constructor(options: TestContextOptions) {
		super(options);
		this.legacy = new LegacyTravelDetailPage(this.page);
	}

	/** Selecciona una opción del dropdown de Forma de Pago. */
	@step
	async selectPaymentMethodOption(optionText: string | RegExp): Promise<void> {
		await this.legacy.selectPaymentMethodOption(optionText);
	}

	/** Completa los campos Stripe de la tarjeta preautorizada. */
	@step
	async fillPreauthorizedCard(cardNumber: string): Promise<void> {
		await this.legacy.fillPreauthorizedCard(cardNumber);
	}

	/** Confirma (Validar) la tarjeta cargada. */
	@step
	async clickValidateCard(): Promise<void> {
		await this.legacy.clickValidateCard();
	}

	/**
	 * Mini-flujo ATC: durante la edición del viaje, vincula y valida una tarjeta
	 * preautorizada nueva (seleccionar método → completar Stripe → Validar).
	 * @atc MG-415 (área EDIT — pendiente reasignar).
	 */
	@atc('MG-415', { severity: 'critical', description: 'Edición de viaje: vincular + validar tarjeta preautorizada' })
	async linkAndValidatePreauthorizedCard(cardNumber: string): Promise<void> {
		await this.legacy.selectPaymentMethodOption('Tarjeta de Crédito - Preautorizada');
		await this.legacy.fillPreauthorizedCard(cardNumber);
		await this.legacy.clickValidateCard();
	}

	/**
	 * Mini-flujo ATC: confirma la edición seleccionando una tarjeta ya vinculada,
	 * recalcula el viaje y guarda los cambios. @atc MG-416 (área EDIT — pendiente reasignar).
	 */
	@atc('MG-416', { severity: 'critical', description: 'Edición de viaje: seleccionar tarjeta vinculada + recalcular + guardar' })
	async confirmLinkedCardAndSave(cardLabel: string | RegExp): Promise<void> {
		await this.legacy.selectLinkedCard(cardLabel);
		await this.legacy.clickRecalculate();
		await this.legacy.clickSave();
	}
}
