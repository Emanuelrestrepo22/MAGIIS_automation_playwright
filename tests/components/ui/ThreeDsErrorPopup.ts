/**
 * KATA Component (Layer 3) — Stripe 3DS Error Popup.
 *
 * Versión KATA del POM `tests/features/gateway-pg/pages/ThreeDSErrorPopup.ts` (re-exportado
 * vía `@pages/carrier`): extiende `UiBase` y expone el popup de error que aparece cuando la
 * autenticación 3DS falla (tarjeta rechazada / no autenticada). Compone el POM legacy
 * internamente; el POM legacy queda intacto (multi-session safety).
 *
 * Es una superficie de verificación (esperar / leer mensaje / cerrar), no un mini-flujo de
 * negocio → métodos decorados con @step, sin @atc.
 *
 * Convención KATA aplicada:
 *   - Extiende UiBase.
 *   - Import por alias (@pages), sin relativos nuevos.
 */

import type { TestContextOptions } from '@TestContext';

import { ThreeDSErrorPopup as LegacyThreeDSErrorPopup } from '@pages/carrier';
import { step } from '@utils/decorators';
import { UiBase } from '@ui/UiBase';

export class ThreeDsErrorPopup extends UiBase {
	private readonly legacy: LegacyThreeDSErrorPopup;

	constructor(options: TestContextOptions) {
		super(options);
		this.legacy = new LegacyThreeDSErrorPopup(this.page);
	}

	/** Espera a que el popup de error 3DS sea visible. */
	@step
	async waitForVisible(timeout = 10_000): Promise<void> {
		await this.legacy.waitForVisible(timeout);
	}

	/** Devuelve el texto del mensaje de error (o null). */
	async getMessage(): Promise<string | null> {
		return this.legacy.getMessage();
	}

	/** Cierra / acepta el popup de error. */
	@step
	async accept(): Promise<void> {
		await this.legacy.accept();
	}
}
