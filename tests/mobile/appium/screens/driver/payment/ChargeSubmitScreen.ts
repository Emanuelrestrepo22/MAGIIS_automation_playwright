/**
 * ChargeSubmitScreen — botón COBRAR (`button.btn.primary`, fuera del iframe Stripe).
 * Arranca `disabled` y la app lo habilita sólo con el form válido: la screen lo LEE y lo TAPEA, nunca
 * lo fuerza. El COBRAR del overlay ACTIVO va primero; el selector histórico es fallback de la rama Stripe.
 */

import type { MobileSession } from '../../../core/MobileSession';
import { NATIVE, SEL } from './PaymentLocators';
import { PaymentWebContext } from './PaymentWebContext';

export type SubmitButtonState = { found: boolean; disabled: boolean };

export class ChargeSubmitScreen {
	private readonly web: PaymentWebContext;

	constructor(session: MobileSession) {
		this.web = new PaymentWebContext(session);
	}

	/** Estado actual de COBRAR (`found:false` si no existe). */
	async readState(): Promise<SubmitButtonState> {
		return this.web
			.exec(
				(activeSel: string, fallbackSel: string): SubmitButtonState => {
					const b = (document.querySelector(activeSel) ??
						document.querySelector(fallbackSel)) as HTMLButtonElement | null;
					if (!b) return { found: false, disabled: true };
					return { found: true, disabled: b.disabled || b.getAttribute('disabled') !== null };
				},
				NATIVE.cobrar,
				SEL.cobrar
			)
			.catch((): SubmitButtonState => ({ found: false, disabled: true }));
	}

	/** Click (DOM) sobre COBRAR; `true` si el botón existía. */
	async tap(): Promise<boolean> {
		return this.web
			.exec(
				(activeSel: string, fallbackSel: string): boolean => {
					const b = (document.querySelector(activeSel) ??
						document.querySelector(fallbackSel)) as HTMLElement | null;
					if (!b) return false;
					b.click();
					return true;
				},
				NATIVE.cobrar,
				SEL.cobrar
			)
			.catch(() => false);
	}
}
