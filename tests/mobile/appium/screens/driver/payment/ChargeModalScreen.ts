/**
 * ChargeModalScreen — el modal de cobro a bordo (`ion-modal > credit-card-payment-data`).
 * Responsable de DETECTAR cuál overlay está activo (hay stales huérfanos), marcarlo y decir qué rama
 * de form expone. Sin aserciones ni pausas: la espera es por condición (`Waits.tryUntil`).
 */

import type { MobileSession } from '../../../core/MobileSession';
import { tryUntil } from '../../../core/Waits';
import { ACTIVATION_GRACE_MS, CHARGE_MODAL_MARK, NATIVE, SEL } from './PaymentLocators';
import { PaymentWebContext } from './PaymentWebContext';
import type { ChargeModalReadiness, ChargeModalSignal } from './PaymentTypes';

export class ChargeModalScreen {
	private readonly web: PaymentWebContext;

	constructor(session: MobileSession) {
		this.web = new PaymentWebContext(session);
	}

	/**
	 * Espera a que el overlay topmost esté LISTO PARA TIPEAR (ver `markActive`). Con `has-focus` o
	 * overlay recién montado sale en el primer poll; sin esas señales acepta el topmost listo recién
	 * pasada `ACTIVATION_GRACE_MS` ('ready-after-grace'). La rama Stripe (iframe de número) cuenta
	 * como lista. 'timeout' si nada califica.
	 */
	async waitUntilShown(timeoutMs = 30_000): Promise<ChargeModalReadiness> {
		const started = Date.now();
		const result = await tryUntil<ChargeModalReadiness>(
			async () => {
				await this.web.switchToWebView(3_000);
				const graced = Date.now() - started >= ACTIVATION_GRACE_MS;
				const signal = await this.markActive(graced);
				if (signal === 'focused' || signal === 'fresh') return 'ready';
				if (signal === 'graced') return 'ready-after-grace';
				const stripeReady = await this.web
					.execHere((sel: string) => !!document.querySelector(sel), SEL.iframeNumber)
					.catch(() => false);
				return stripeReady ? 'ready' : false;
			},
			{ timeout: timeoutMs, interval: 300 }
		);
		return result ?? 'timeout';
	}

	/**
	 * Marca el overlay ACTIVO con `data-qa-charge-modal="1"` para que fill/readback/COBRAR operen sobre
	 * el mismo form y nunca sobre un stale. Elegible = `show-modal` + host `#cardNumber` con `<input>`
	 * interno no `readOnly`/`disabled`; entre elegibles gana el ÚLTIMO en orden de DOM (mayor z-index).
	 *   - `focused`: tiene `has-focus` (la app acaba de abrirlo) — señal fuerte.
	 *   - `fresh`: sin marca previa (recién montado) — señal fuerte.
	 *   - `graced`: sólo topmost-listo; válido si `allowUnfocused`.
	 *   - `none`: nada elegible (p.ej. rama Stripe: no hay `#cardNumber` nativo).
	 * El marcador es una anotación de TEST sobre el DOM, no un selector de la app.
	 */
	async markActive(allowUnfocused = false): Promise<ChargeModalSignal> {
		return this.web
			.exec(
				(attr: string, permitUnfocused: boolean, numberSel: string): ChargeModalSignal => {
					const all = Array.from(document.querySelectorAll('credit-card-payment-data')) as HTMLElement[];

					const isVisible = (el: HTMLElement): boolean => {
						const overlay = el.closest('ion-modal');
						return overlay ? overlay.classList.contains('show-modal') : el.offsetParent !== null;
					};
					const numberHost = (el: HTMLElement): HTMLElement | null =>
						el.querySelector(numberSel) as HTMLElement | null;
					const isReady = (el: HTMLElement): boolean => {
						const host = numberHost(el) as (HTMLElement & { shadowRoot?: ShadowRoot | null }) | null;
						if (!host) return false;
						const inner = (
							host.matches('input, textarea')
								? host
								: (host.shadowRoot?.querySelector('input, textarea') ??
									host.querySelector('input, textarea'))
						) as HTMLInputElement | null;
						return !!inner && !inner.readOnly && !inner.disabled;
					};
					const hasFocus = (el: HTMLElement): boolean => {
						const host = numberHost(el);
						return !!host && /\bhas-focus\b/.test(host.className);
					};
					const topmost = (list: HTMLElement[]): HTMLElement | null => list[list.length - 1] ?? null;

					const eligible = all.filter(el => isVisible(el) && isReady(el));
					if (!eligible.length) return 'none';

					const focused = topmost(eligible.filter(hasFocus));
					const brandNew = topmost(eligible.filter(el => el.getAttribute(attr) === null));
					const target = focused ?? brandNew ?? (permitUnfocused ? topmost(eligible) : null);
					if (!target) return 'none';

					for (const el of all) {
						if (el.getAttribute(attr) === '1' && el !== target) el.setAttribute(attr, 'stale');
					}
					target.setAttribute(attr, '1');

					if (focused === target) return 'focused';
					if (brandNew === target) return 'fresh';
					return 'graced';
				},
				CHARGE_MODAL_MARK,
				allowUnfocused,
				NATIVE.numberHostAny
			)
			.catch((): ChargeModalSignal => 'none');
	}

	/** ¿El overlay activo expone el form NATIVO (host `#cardNumber`)? Una lectura, sin espera. */
	async exposesNativeForm(): Promise<boolean> {
		return (await this.markActive(true)) !== 'none' && (await this.web.exists(NATIVE.number));
	}

	/** Alinea el WebView al top-frame antes de decidir la rama (el frame activo puede ser firebase-auth). */
	async alignToTopFrame(): Promise<void> {
		await this.web.switchToWebView();
		await this.web.toTopFrame();
	}
}
