/**
 * TripResumeScreen — resumen/cierre del viaje del Driver (`/TravelResumePage`, `app-travel-resume`).
 * Canónica funcional: `DriverTripSummaryScreen` (selectores confirmados DOM dump 2026-04-13).
 * Cubre: forma de pago (`button.payment`), total, botón de cierre (`button.btn.finish`) y extras
 * (`div.travel-extras`). POM puro: sin aserciones de negocio, sin esperas fijas ni xpath por texto.
 * Los textos del botón de cierre salen de I18n (`driver.travelResume.closeTrip` / `signAndCloseTrip`).
 * La firma (modal `app-page-signer`) vive en `SignaturePadScreen`; navegar entre ambas lo hace el PBO.
 */

import { parseMoneyText } from '../../contracts/f5AppHandoff';
import { defineLocator, resolveWebSelectors } from '../../core/Locator';
import type { I18n } from '../../core/I18n';
import type { MobileSession } from '../../core/MobileSession';
import { Waits, type UntilOptions } from '../../core/Waits';

const CONTAINER = defineLocator({ id: 'driver.resume.container', web: 'app-travel-resume' });
const PAYMENT_BUTTONS = defineLocator({
	id: 'driver.resume.paymentButton',
	web: ['app-travel-resume button.payment', 'app-travel-resume button[class*="payment"]', 'app-travel-resume div.travel-payment button']
});
const CLOSE_BUTTON = defineLocator({
	id: 'driver.resume.closeButton',
	web: 'app-travel-resume button.btn.finish',
	textKey: 'driver.travelResume.closeTrip'
});
const EXTRA_BUTTONS = defineLocator({ id: 'driver.resume.extraButton', web: 'app-travel-resume div.travel-extras button' });
const SPANS = defineLocator({ id: 'driver.resume.span', web: 'app-travel-resume span' });

/** Texto con formato de importe monetario (`$12.50`, `€ 1 234,50`). Función pura. */
export function looksLikeMoney(text: string): boolean {
	const t = text.trim();
	return /^[$€£]?\s*\d[\d.,\s]*\s*[$€£]?$/.test(t) && /[$€£]/.test(t) && parseMoneyText(t) !== null;
}

/** Datos crudos de un botón de pago del resumen (los de efectivo/tarjeta solo tienen ícono, sin texto). */
export type PaymentButtonRaw = { className: string; text: string; html: string };

/**
 * Pura: etiqueta de un botón de pago. Usa el texto si lo hay (p. ej. «VISA 4242»); si no, el ícono
 * (`cash|money|bill` → `cash`, `card|credit` → `card`) y, en último caso, la posición observada en el DOM
 * del 11/11 (efectivo primero, tarjeta después). El seleccionado lleva la clase `active` y el sufijo ` (activo)`.
 */
export function describePaymentButtons(buttons: readonly PaymentButtonRaw[]): string[] {
	const byPosition = ['cash', 'card'];
	return buttons.map((b, i) => {
		const html = b.html.toLowerCase();
		const kind =
			b.text.trim() ||
			(/cash|money|bill|efectivo/.test(html) ? 'cash' : /card|credit|tarjeta/.test(html) ? 'card' : (byPosition[i] ?? `payment-${i}`));
		return /(^|\s)active(\s|$)/.test(b.className) ? `${kind} (activo)` : kind;
	});
}

export class TripResumeScreen {
	constructor(
		private readonly session: MobileSession,
		private readonly i18n: I18n
	) {}

	private async web() {
		if ((await this.session.context()) !== 'webview') await this.session.switchContext('webview');
		return this.session.driver;
	}

	/** Estado observable: la pantalla de resumen está visible (URL `TravelResumePage` o contenedor). */
	async isShown(): Promise<boolean> {
		const driver = await this.web();
		return driver
			.execute<boolean, [string]>((sel: string) => {
				return window.location.href.includes('TravelResumePage') || !!document.querySelector(sel);
			}, resolveWebSelectors(CONTAINER)[0]!)
			.catch(() => false);
	}

	async waitUntilShown(options: UntilOptions = {}): Promise<void> {
		await Waits.until(() => this.isShown(), { label: `${CONTAINER.id} visible`, timeout: 15_000, ...options });
	}

	private async visibleTexts(selector: string): Promise<string[]> {
		const driver = await this.web();
		return driver
			.execute<string[], [string]>((sel: string) => {
				return (Array.from(document.querySelectorAll(sel)) as HTMLElement[])
					.filter(e => e.offsetParent !== null)
					.map(e =>
						String(e.innerText ?? '')
							.replace(/\s+/g, ' ')
							.trim()
					)
					.filter(Boolean);
			}, selector)
			.catch(() => []);
	}

	/** Texto del total a cobrar (primer span con formato de importe); '' si no se ve. */
	async readTotalText(): Promise<string> {
		const spans = await this.visibleTexts(SPANS.web as string);
		return spans.find(looksLikeMoney) ?? '';
	}

	/** Total numérico vía `parseMoneyText`; null si no se ve o no se pudo parsear. */
	async readTotal(): Promise<number | null> {
		const text = await this.readTotalText();
		return text ? parseMoneyText(text) : null;
	}

	/** Textos de los botones de pago visibles (p. ej. «VISA 4242»). */
	async readPaymentMethods(): Promise<string[]> {
		const driver = await this.web();
		const raw = await driver
			.execute<PaymentButtonRaw[], [string[]]>(
				(sels: string[]) => {
					const seen = new Set<Element>();
					const out: Array<{ className: string; text: string; html: string }> = [];
					for (const s of sels) {
						for (const el of Array.from(document.querySelectorAll(s))) {
							if (seen.has(el) || (el as HTMLElement).offsetParent === null) continue;
							seen.add(el);
							out.push({ className: el.className, text: ((el as HTMLElement).innerText ?? '').trim(), html: el.innerHTML });
						}
					}
					return out;
				},
				resolveWebSelectors(PAYMENT_BUTTONS)
			)
			.catch(() => [] as PaymentButtonRaw[]);
		return describePaymentButtons(raw);
	}

	/** Forma de pago seleccionada (botón `active`), o la primera visible; '' si no hay. */
	async readPaymentMethod(): Promise<string> {
		const methods = await this.readPaymentMethods();
		return methods.find(m => m.endsWith(' (activo)')) ?? methods[0] ?? '';
	}

	/**
	 * Toca el botón de pago (el que contiene `last4`, o el primero visible). Habilita el botón de cierre.
	 * Devuelve el texto del botón tocado; '' si no había botón.
	 */
	async tapPaymentMethod(last4?: string): Promise<string> {
		const driver = await this.web();
		return driver.execute<string, [string[], string | null]>(
			(sels: string[], digits: string | null) => {
				const all = sels.flatMap(s => Array.from(document.querySelectorAll(s))) as HTMLButtonElement[];
				const visible = all.filter(b => b.offsetParent !== null);
				const target = (digits ? visible.find(b => (b.innerText ?? '').includes(digits)) : undefined) ?? visible[0];
				if (!target) return '';
				target.click();
				return String(target.innerText ?? '').trim();
			},
			resolveWebSelectors(PAYMENT_BUTTONS),
			last4 ?? null
		);
	}

	/** Etiqueta del botón de cierre visible (`button.btn.finish`); '' si no está. */
	async readCloseLabel(): Promise<string> {
		return (await this.visibleTexts(CLOSE_BUTTON.web as string))[0] ?? '';
	}

	/** Estado observable: el botón de cierre está visible y habilitado (se habilita tras elegir pago). */
	async isCloseEnabled(): Promise<boolean> {
		const driver = await this.web();
		return driver
			.execute<boolean, [string]>((sel: string) => {
				const b = document.querySelector(sel) as HTMLButtonElement | null;
				return !!b && b.offsetParent !== null && !b.disabled;
			}, CLOSE_BUTTON.web as string)
			.catch(() => false);
	}

	/** true si la etiqueta actual del cierre es la variante «Firmar y Cerrar viaje» (cuenta corriente). */
	async closeRequiresSignature(): Promise<boolean> {
		return this.i18n.matches(await this.readCloseLabel(), 'driver.travelResume.signAndCloseTrip');
	}

	/**
	 * Toca el botón de cierre. Valida por I18n que la etiqueta sea de cierre (cerrar o firmar y cerrar)
	 * antes de tocar. Devuelve la etiqueta tocada. Lanza si no está, está deshabilitado o su texto no coincide.
	 */
	async tapClose(): Promise<string> {
		const label = await this.readCloseLabel();
		const isCloseLabel =
			this.i18n.matches(label, 'driver.travelResume.closeTrip') ||
			this.i18n.matches(label, 'driver.travelResume.signAndCloseTrip');
		if (!isCloseLabel) {
			throw new Error(`[TripResumeScreen] ${CLOSE_BUTTON.id}: botón de cierre ausente o con etiqueta inesperada ("${label}").`);
		}
		const driver = await this.web();
		const clicked = await driver
			.execute<boolean, [string]>((sel: string) => {
				const b = document.querySelector(sel) as HTMLButtonElement | null;
				if (!b || b.offsetParent === null || b.disabled) return false;
				b.click();
				return true;
			}, CLOSE_BUTTON.web as string)
			.catch(() => false);
		if (!clicked) {
			throw new Error(`[TripResumeScreen] ${CLOSE_BUTTON.id}: botón de cierre deshabilitado (¿falta elegir forma de pago?).`);
		}
		return label;
	}

	/** Etiquetas de los botones de extras visibles (peaje, estacionamiento, …). */
	async readExtras(): Promise<string[]> {
		return this.visibleTexts(EXTRA_BUTTONS.web as string);
	}

	/** Toca el extra visible en la posición `index` (0 = primero). Lanza si no existe. */
	async tapExtra(index: number): Promise<string> {
		const driver = await this.web();
		const text = await driver.execute<string, [string, number]>(
			(sel: string, i: number) => {
				const btn = (Array.from(document.querySelectorAll(sel)) as HTMLButtonElement[]).filter(b => b.offsetParent !== null)[i];
				if (!btn) return '';
				btn.click();
				return String(btn.innerText ?? '').trim();
			},
			EXTRA_BUTTONS.web as string,
			index
		);
		if (!text) throw new Error(`[TripResumeScreen] ${EXTRA_BUTTONS.id}: no hay extra visible en la posición ${index}.`);
		return text;
	}
}
