/**
 * KATA Component (Layer 3) — Carrier · Gestión de Viajes.
 *
 * Versión KATA del POM `tests/pages/carrier/TravelManagementPage.ts`: extiende `UiBase`
 * y expone el subconjunto que consumen los specs de hold. Compone el POM legacy
 * internamente (delegación); el POM legacy queda intacto para specs aún no amoldados.
 *
 * NOTA @atc — MAPEO PENDIENTE REASIGNAR: el idmap `atp-mg-gateway-idmap.md` es
 * API-level. La verificación de que el viaje quedó en "Por Asignar" (hold aprobado)
 * se mapea al MG más cercano del área E (Hold): MG-158 (TC-PAY-E-01). Reasignar cuando
 * el ATP tenga TCs UI de hold.
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase.
 *   - Import por alias (@pages), sin relativos nuevos.
 *   - Verificación de hold decorada con @atc; navegación trazada con @step.
 */

import type { TestContextOptions } from '@TestContext';

import { TravelManagementPage as LegacyTravelManagementPage } from '@pages/carrier';
import { atc, step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';

export class CarrierTravelManagementPage extends UiBase {
	private readonly legacy: LegacyTravelManagementPage;

	constructor(options: TestContextOptions) {
		super(options);
		this.legacy = new LegacyTravelManagementPage(this.page);
	}

	/** Navega a Gestión de Viajes y espera la tabla. */
	@step
	async goto(): Promise<void> {
		await this.legacy.goto();
	}

	/** Abre la pestaña "Programados" dentro de Gestión de Viajes. */
	@step
	async openScheduledTrips(): Promise<void> {
		await this.legacy.openScheduledTrips();
	}

	/** Abre el detalle del primer viaje programado visible. */
	@step
	async openFirstScheduledTripDetail(): Promise<void> {
		await this.legacy.openFirstScheduledTripDetail();
	}

	/**
	 * Mini-flujo ATC de verificación: confirma que el viaje del pasajero quedó en la
	 * columna "Por Asignar" (hold aprobado / Stripe pre-autorizó). @atc MG-158 (área E —
	 * pendiente reasignar).
	 */
	@atc('MG-158', { severity: 'critical', description: 'Verificar viaje en "Por Asignar" tras hold aprobado' })
	async expectPassengerInPorAsignar(passenger: string, destination?: string, status?: string): Promise<void> {
		await this.legacy.expectPassengerInPorAsignar(passenger, destination, status);
	}
}
