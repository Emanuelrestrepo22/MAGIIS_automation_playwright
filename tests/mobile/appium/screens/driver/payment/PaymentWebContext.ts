/**
 * PaymentWebContext — primitivas del WebView sobre `MobileSession` (composición) que comparten las
 * screens de pago del chofer: cambio de contexto/frame, ejecución in-document, existencia, lectura y
 * escritura de inputs Ionic. Sin lógica de negocio.
 */

import type { MobileSession } from '../../../core/MobileSession';
import { tryUntil } from '../../../core/Waits';

type FrameApi = {
	switchFrame?: (el: unknown) => Promise<void>;
	switchToFrame?: (el: unknown) => Promise<void>;
};

export class PaymentWebContext {
	constructor(private readonly session: MobileSession) {}

	/** Cambia a la primera WebView; `null` si no aparece dentro de `timeoutMs`. */
	async switchToWebView(timeoutMs = 10_000): Promise<string | null> {
		return tryUntil(() => this.session.switchContext('webview'), { timeout: timeoutMs, interval: 250 });
	}

	/** Ejecuta `fn` en el WebView (asegura el contexto antes). */
	async exec<T>(fn: (...args: never[]) => T, ...args: unknown[]): Promise<T> {
		if (!(await this.switchToWebView())) throw new Error('No WEBVIEW context available');
		return (await this.session.driver.execute(fn as never, ...(args as never[]))) as T;
	}

	/** Ejecuta `fn` sin re-seleccionar contexto (el caller ya está en la WebView). */
	async execHere<T>(fn: (...args: never[]) => T, ...args: unknown[]): Promise<T> {
		return (await this.session.driver.execute(fn as never, ...(args as never[]))) as T;
	}

	/** Cambia el frame activo (`null` = top-frame). Soporta `switchFrame` y `switchToFrame`. */
	async switchFrame(target: unknown): Promise<void> {
		const api = this.session.driver as unknown as FrameApi;
		if (typeof api.switchFrame === 'function') return api.switchFrame(target);
		if (typeof api.switchToFrame === 'function') return api.switchToFrame(target);
		throw new Error('Driver does not support frame switching');
	}

	/** Vuelve al top-frame sin lanzar. */
	async toTopFrame(): Promise<void> {
		await this.switchFrame(null).catch(() => undefined);
	}

	/** Elemento WDIO por selector (para entrar a frames y tipear). */
	$(selector: string) {
		return this.session.driver.$(selector);
	}

	/** ¿Alguno de `selectors` existe en el documento? Silent-fail. */
	async exists(selectors: readonly string[]): Promise<boolean> {
		return this.exec((sel: string) => !!document.querySelector(sel), selectors.join(', ')).catch(() => false);
	}

	/** Valor actual del primer campo que resuelva ('' si no existe), bajando al `<input>` interno. */
	async readValue(selectors: readonly string[]): Promise<string> {
		return this.exec((sels: string[]) => {
			for (const sel of sels) {
				const host = document.querySelector(sel) as (HTMLElement & { shadowRoot?: ShadowRoot | null }) | null;
				if (!host) continue;
				const inner = (
					host.matches('input, textarea')
						? host
						: (host.shadowRoot?.querySelector('input, textarea') ?? host.querySelector('input, textarea'))
				) as HTMLInputElement | null;
				return String(inner?.value ?? '');
			}
			return '';
		}, selectors).catch(() => '');
	}

	/**
	 * Escribe `value` en el `<input>` real del primer selector que resuelva con SETTER NATIVO +
	 * `input`/`change` (los campos tienen máscara y paste/drop bloqueados). Silent-fail: `false`.
	 */
	async fillInput(selectors: readonly string[], value: string): Promise<boolean> {
		return this.exec(
			(sels: string[], next: string) => {
				const setter =
					Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set ??
					Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
				if (!setter) return false;
				for (const sel of sels) {
					const host = document.querySelector(sel) as
						| (HTMLElement & { shadowRoot?: ShadowRoot | null })
						| null;
					if (!host) continue;
					const input = (host.shadowRoot?.querySelector('input, textarea') ??
						(host.matches('input, textarea') ? host : null) ??
						host.querySelector('input, textarea')) as HTMLInputElement | HTMLTextAreaElement | null;
					if (!input) continue;
					input.focus?.();
					setter.call(input, next);
					input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
					input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
					return true;
				}
				return false;
			},
			selectors,
			value
		).catch(() => false);
	}
}
