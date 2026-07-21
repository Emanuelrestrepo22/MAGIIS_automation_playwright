/**
 * KATA Component (Layer 3) — Carrier Dashboard (portal V1).
 *
 * Versión KATA del POM `tests/pages/carrier/DashboardPage.ts`: extiende `UiBase`
 * (usa `this.page`) y expone el subconjunto del dashboard que consumen los specs de
 * hold. Compone el POM legacy internamente (delegación) para NO duplicar la lógica
 * Angular/SPA ya validada — el POM legacy queda intacto para los specs aún no
 * amoldados (multi-session safety).
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase.
 *   - Import por alias (@pages), sin relativos nuevos.
 *   - Métodos públicos fail-fast (delegan en el POM legacy, que ya falla rápido).
 */

import type { TestContextOptions } from '@TestContext';

import { DashboardPage as LegacyDashboardPage } from '@pages/carrier';
import { step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';

export class CarrierDashboardPage extends UiBase {
	private readonly legacy: LegacyDashboardPage;

	constructor(options: TestContextOptions) {
		super(options);
		this.legacy = new LegacyDashboardPage(this.page);
	}

	/** Navega desde el dashboard al formulario de nuevo viaje. */
	@step
	async openNewTravel(): Promise<void> {
		await this.legacy.openNewTravel();
	}
}
