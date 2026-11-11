/**
 * PaymentResultScreen — señales de resultado del cobro:
 *   - `ion-modal.alert-modal-atention.show-modal` (attention modal): DECLINE / error de cobro.
 *   - `app-alert-modal` (alert bloqueante): "Viaje perdido / Cancelado / expirado".
 * Lee UNA vez lo que hay en pantalla; la espera con timeout y el "sin modal => éxito" son del PBO.
 */

import type { MobileSession } from '../../../core/MobileSession';
import { SEL } from './PaymentLocators';
import { PaymentWebContext } from './PaymentWebContext';
import type { PaymentOutcome } from './PaymentTypes';

export class PaymentResultScreen {
	private readonly web: PaymentWebContext;

	constructor(session: MobileSession) {
		this.web = new PaymentWebContext(session);
	}

	/** Resultado visible ahora (`declined` / `trip-lost`) o `null` si no hay ningún modal. */
	async readVisibleOutcome(): Promise<PaymentOutcome | null> {
		await this.web.switchToWebView(2_000);
		return this.web
			.execHere(
				(attentionSel: string, alertSel: string): PaymentOutcome | null => {
					const norm = (v: unknown) =>
						String(v ?? '')
							.toLowerCase()
							.trim();
					const lostRe = /perdid|cancelad|expir|lost|cancel|expired/i;

					const alertEl = document.querySelector(alertSel) as HTMLElement | null;
					if (alertEl) {
						const t = norm(alertEl.innerText ?? alertEl.textContent);
						if (lostRe.test(t)) return { status: 'trip-lost', reason: t.slice(0, 200) };
					}

					const modal = document.querySelector(attentionSel) as HTMLElement | null;
					if (modal) {
						const t = norm(modal.innerText ?? modal.textContent);
						if (lostRe.test(t)) return { status: 'trip-lost', reason: t.slice(0, 200) };
						return { status: 'declined', reason: t.slice(0, 200) || 'attention-modal' };
					}
					return null;
				},
				SEL.attentionModal,
				SEL.blockingAlert
			)
			.catch(() => null);
	}

	/** Cierra el alert bloqueante o el attention modal; `true` si había un botón para tapear. */
	async dismiss(): Promise<boolean> {
		await this.web.switchToWebView(2_000);
		return this.web
			.execHere((): boolean => {
				const pick = (): HTMLElement | null => {
					const inAlert = document.querySelector('app-alert-modal .button button') as HTMLElement | null;
					if (inAlert) return inAlert;
					const alertBtn = document.querySelector('.alert-button') as HTMLElement | null;
					if (alertBtn) return alertBtn;
					return (
						(Array.from(document.querySelectorAll('button, [role="button"]')) as HTMLElement[]).find(b =>
							/aceptar|captar|cerrar|ok|salir|accept|close|exit/i.test(b.textContent ?? '')
						) ?? null
					);
				};
				const btn = pick();
				if (!btn) return false;
				btn.click();
				return true;
			})
			.catch(() => false);
	}
}
