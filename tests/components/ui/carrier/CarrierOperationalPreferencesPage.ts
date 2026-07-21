/**
 * KATA Component (Layer 3) — Carrier · Configuración Parámetros (Preferencias Operativas).
 *
 * Versión KATA del POM `tests/pages/carrier/OperationalPreferencesPage.ts`: extiende
 * `UiBase` y expone el subconjunto de "hold" (pre-autorización) que consumen los specs.
 * Compone el POM legacy internamente para no duplicar los locators/timing Angular ya
 * validados; el POM legacy queda intacto para specs aún no amoldados.
 *
 * BL-i18n/v1.72.8: el estado de hold se fija por API (el toggle de la UI no persiste) —
 * `ensureHoldEnabled`/`assert*` delegan en el POM legacy, que ya usa `setHoldViaApi`.
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase.
 *   - Import por alias (@pages), sin relativos nuevos.
 *   - Queries/verificaciones trazadas con @step; fail-fast en públicos.
 */

import type { TestContextOptions } from '@TestContext';

import { OperationalPreferencesPage as LegacyOperationalPreferencesPage } from '@pages/carrier';
import { step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';

export class CarrierOperationalPreferencesPage extends UiBase {
	private readonly legacy: LegacyOperationalPreferencesPage;

	constructor(options: TestContextOptions) {
		super(options);
		this.legacy = new LegacyOperationalPreferencesPage(this.page);
	}

	/** Navega a Configuración Parámetros y espera el heading de preferencias. */
	@step
	async goto(): Promise<void> {
		await this.legacy.goto();
	}

	/** Asegura el hold habilitado (vía API, BL-i18n/v1.72.8). */
	@step
	async ensureHoldEnabled(): Promise<void> {
		await this.legacy.ensureHoldEnabled();
	}

	/** Verifica que el hold esté habilitado (fuente de verdad: API). */
	@step
	async assertHoldEnabled(): Promise<void> {
		await this.legacy.assertHoldEnabled();
	}
}
