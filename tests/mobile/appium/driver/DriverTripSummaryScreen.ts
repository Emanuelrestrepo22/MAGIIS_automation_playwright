/**
 * DriverTripSummaryScreen
 * Pantalla de resumen post-viaje del Driver Android App.
 * Se muestra después de confirmar "¿Finalizar Viaje?" y antes del cierre final.
 *
 * Selectores confirmados DOM dump 2026-04-13:
 *   URL: /TravelResumePage
 *   Contenedor activo: app-travel-resume (class="ion-page can-go-back")
 *
 * Flujo obligatorio en esta pantalla:
 *   1. selectPaymentMethod()  → tap en button.payment (últimos 4 dígitos de la tarjeta)
 *                               El botón muestra clase "payment" / "payment active"
 *                               Este tap HABILITA el botón de cierre.
 *   2. confirmAndFinish()     → tap en button.btn.finish
 *                               Texto varía: "Cerrar Viaje" | "Firmar y Cerrar viaje"
 *                               Si es "Firmar y Cerrar viaje" → aparece un segundo
 *                               "Cerrar Viaje" post-firma (llamar confirmAndFinish() de nuevo)
 *
 *   Botón peaje:   button (sin clase) text="Peaje"   (extra, antes de cerrar)
 *   Botón estac.:  button (sin clase) text="Estac."  (extra, antes de cerrar)
 *   Total a cobrar: span text="$XX.XX"
 */

import type { MobileActorConfig } from '../config/appiumRuntime';
import { AppiumSessionBase, type AppiumDriver } from '../base/AppiumSessionBase';
import { DRIVER_ACTION_SELECTORS } from './DriverFlowSelectors';

export type TripSummarySnapshot = {
	url: string;
	totalAmount: string;
	paymentMethod: string;
	extras: string[];
	buttons: string[];
	rawTexts: string[];
};

export class DriverTripSummaryScreen extends AppiumSessionBase {
	constructor(config: MobileActorConfig, driver?: AppiumDriver) {
		super(config, driver);
	}

	/**
	 * Verifica que estamos en la pantalla de resumen.
	 * URL esperada: /navigator/TravelResumePage o similar.
	 */
	async waitForSummaryScreen(timeout = 15_000): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			await this.switchToWebView(3_000);
			const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
			// URL confirmada: /TravelResumePage — también verificar por contenedor como fallback
			if (url.includes('TravelResumePage')) return true;
			const hasResume = await driver.execute<boolean, []>(() => {
				return !!document.querySelector('app-travel-resume');
			}).catch(() => false);
			if (hasResume) return true;
			await driver.pause(500);
		}
		return false;
	}

	/**
	 * Captura snapshot completo de la pantalla de resumen.
	 */
	async getSnapshot(): Promise<TripSummarySnapshot | null> {
		try {
			await this.switchToWebView();
			return await this.getDriver().execute<TripSummarySnapshot, []>(() => {
				const normalize = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
				const isVisible = (el: Element) => {
					const h = el as HTMLElement;
					const r = h.getBoundingClientRect();
					const s = window.getComputedStyle(h);
					return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
				};

				const buttons = Array.from(document.querySelectorAll('button, ion-button, [role="button"]'))
					.filter(isVisible)
					.map(el => normalize((el as HTMLElement).innerText))
					.filter(Boolean);

				const rawTexts = Array.from(document.querySelectorAll('span, p, h1, h2, h3, ion-label, ion-title'))
					.filter(isVisible)
					.map(el => normalize((el as HTMLElement).innerText))
					.filter(t => t.length > 1 && t.length < 120);

				// Total del viaje — buscar patrón $XX.XX
				const totalMatch = rawTexts.find(t => /\$\s*[\d,.]+/.test(t)) ?? '';

				// Forma de pago seleccionada — buscar tarjeta o efectivo
				const paymentMatch = rawTexts.find(t =>
					/tarjeta|card|efectivo|cash|wallet|\*{2,}|\d{4}$/i.test(t)
				) ?? '';

				// Extras: peaje, estacionamiento
				const extras = rawTexts.filter(t =>
					/peaje|estacionamiento|toll|parking|extra/i.test(t)
				);

				return {
					url: window.location.href,
					totalAmount: totalMatch,
					paymentMethod: paymentMatch,
					extras,
					buttons,
					rawTexts: rawTexts.slice(0, 60),
				};
			});
		} catch (e) {
			console.warn('[DriverTripSummaryScreen] getSnapshot error:', e instanceof Error ? e.message : e);
			return null;
		}
	}

	/**
	 * PASO 1 — Seleccionar método de pago.
	 * El usuario debe tocar el botón que muestra los últimos 4 dígitos de la tarjeta.
	 * Este tap HABILITA el botón de cierre del viaje.
	 *
	 * Comportamiento confirmado 2026-04-13:
	 *   - button.payment (puede tener clase "payment" o "payment active")
	 *   - El botón de cierre queda deshabilitado hasta que se selecciona una tarjeta.
	 *
	 * @param last4 Últimos 4 dígitos opcionales para validar la tarjeta seleccionada.
	 */
	async selectPaymentMethod(last4?: string): Promise<string> {
		await this.switchToWebView();
		const driver = this.getDriver();

		const selectedText = await driver.execute((digits?: string) => {
			const container = document.querySelector('app-travel-resume');
			if (!container) return '';
			// Buscar botón de pago por clase o dentro del bloque div.travel-payment
			const candidates = [
				...Array.from(container.querySelectorAll('button.payment, button[class*="payment"]')),
				...Array.from(container.querySelectorAll('div.travel-payment button')),
			] as HTMLButtonElement[];
			let target: HTMLButtonElement | undefined;
			if (digits) {
				target = candidates.find(b => b.offsetParent !== null && (b.innerText ?? '').includes(digits));
			}
			if (!target) {
				target = candidates.find(b => b.offsetParent !== null);
			}
			if (target) { target.click(); return (target.innerText ?? '').trim(); }
			return '';
		}, last4);

		if (selectedText) {
			console.log(`[DriverTripSummaryScreen] ✓ Tarjeta seleccionada: "${selectedText}"`);
		} else {
			console.warn('[DriverTripSummaryScreen] selectPaymentMethod: botón de tarjeta no encontrado');
		}

		await driver.pause(1_000);
		return selectedText as string;
	}

	/**
	 * PASO 2 — Tap en el botón de cierre del viaje.
	 * Debe llamarse DESPUÉS de selectPaymentMethod() — el botón está deshabilitado hasta entonces.
	 *
	 * Variantes de texto confirmadas:
	 *   "Cerrar Viaje"          → flujo estándar
	 *   "Firmar y Cerrar viaje" → flujo con firma requerida (requiere un segundo tap post-firma)
	 */
	async confirmAndFinish(): Promise<void> {
		await this.switchToWebView();
		const driver = this.getDriver();

		// Textos posibles del botón de cierre, en orden de prioridad
		const CLOSE_TEXTS = ['Cerrar Viaje', 'Firmar y Cerrar viaje', 'Finalizar Viaje'];

		const clicked = await driver.execute((candidates: string[]) => {
			const container = document.querySelector('app-travel-resume');
			if (!container) return '';
			const btns = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
			for (const txt of candidates) {
				const btn = btns.find(
					b => (b.innerText ?? '').trim() === txt && b.offsetParent !== null && !b.disabled
				);
				if (btn) { btn.click(); return txt; }
			}
			return '';
		}, CLOSE_TEXTS) as string;

		if (!clicked) {
			const snapshot = await this.getSnapshot();
			const details  = snapshot
				? `Botones visibles: ${snapshot.buttons.join(' | ')}`
				: 'snapshot unavailable';
			throw new Error(`[DriverTripSummaryScreen] confirmAndFinish: botón de cierre no encontrado o deshabilitado. ${details}\nVerificar que selectPaymentMethod() fue llamado antes.`);
		}

		console.log(`[DriverTripSummaryScreen] ✓ Tap "${clicked}"`);
		await driver.pause(4_000);
	}

	/**
	 * Agrega un peaje al resumen del viaje.
	 * Selector confirmado DOM dump 2026-04-09:
	 *   [BTN] class="" text="Peaje"  (dentro de app-travel-resume div.travel-extras)
	 * TODO: confirmar flujo completo (modal de ingreso de monto) con dump activo.
	 */
	async addToll(amount: string): Promise<void> {
		await this.switchToWebView();
		const driver = this.getDriver();
		try {
			const allBtns = await driver.$$('app-travel-resume button') as unknown as any[];
			for (const btn of allBtns) {
				const text    = (await btn.getText().catch(() => '')).trim();
				const visible = await btn.isDisplayed().catch(() => false);
				if (text === 'Peaje' && visible) {
					await btn.click();
					console.log(`[DriverTripSummaryScreen] ✓ Tap "Peaje" — monto: ${amount}`);
					// TODO: confirmar modal de ingreso de monto y selector de input
					await driver.pause(1_000);
					return;
				}
			}
		} catch (e) {
			console.warn('[DriverTripSummaryScreen] addToll error:', e);
		}
		console.warn(`[DriverTripSummaryScreen] addToll(${amount}): botón "Peaje" no encontrado`);
	}

	/**
	 * Agrega un estacionamiento al resumen del viaje.
	 * Selector confirmado DOM dump 2026-04-09:
	 *   [BTN] class="" text="Estac."  (dentro de app-travel-resume div.travel-extras)
	 * TODO: confirmar flujo completo (modal de ingreso de monto) con dump activo.
	 */
	async addParking(amount: string): Promise<void> {
		await this.switchToWebView();
		const driver = this.getDriver();
		try {
			const allBtns = await driver.$$('app-travel-resume button') as unknown as any[];
			for (const btn of allBtns) {
				const text    = (await btn.getText().catch(() => '')).trim();
				const visible = await btn.isDisplayed().catch(() => false);
				if (text === 'Estac.' && visible) {
					await btn.click();
					console.log(`[DriverTripSummaryScreen] ✓ Tap "Estac." — monto: ${amount}`);
					// TODO: confirmar modal de ingreso de monto y selector de input
					await driver.pause(1_000);
					return;
				}
			}
		} catch (e) {
			console.warn('[DriverTripSummaryScreen] addParking error:', e);
		}
		console.warn(`[DriverTripSummaryScreen] addParking(${amount}): botón "Estac." no encontrado`);
	}

	/**
	 * Retorna el texto del botón de pago visible en pantalla (ej: "VISA 4242").
	 * Selector: button.payment o button.payment.active dentro de app-travel-resume.
	 */
	async getActivePaymentMethod(): Promise<string> {
		try {
			await this.switchToWebView();
			return await this.getDriver().execute<string, []>(() => {
				const container = document.querySelector('app-travel-resume');
				if (!container) return '';
				const btns = Array.from(container.querySelectorAll('button.payment, button[class*="payment"]')) as HTMLButtonElement[];
				const visible = btns.find(b => b.offsetParent !== null);
				return (visible?.innerText ?? '').trim();
			});
		} catch {
			return '';
		}
	}

	/**
	 * Verifica que la forma de pago mostrada contiene los últimos 4 dígitos esperados.
	 */
	async assertPaymentMethod(last4: string): Promise<void> {
		const snapshot = await this.getSnapshot();
		if (!snapshot) throw new Error('[DriverTripSummaryScreen] No se pudo obtener snapshot');
		const found = snapshot.rawTexts.some(t => t.includes(last4));
		if (!found) {
			throw new Error(
				`[DriverTripSummaryScreen] Tarjeta *${last4} no encontrada en pantalla de resumen.\nTextos visibles: ${snapshot.rawTexts.join(' | ')}`
			);
		}
	}

	/**
	 * Retorna el monto total a cobrar visible en pantalla.
	 * Selector confirmado: span text="$XX.XX" adyacente a "Total a Cobrar"
	 */
	async getTotalAmount(): Promise<string> {
		try {
			await this.switchToWebView();
			const result = await this.getDriver().execute<string, []>(() => {
				const spans = Array.from(document.querySelectorAll('app-travel-resume span'));
				const totalSpan = spans.find(el => /^\$[\d,.]+$/.test((el as HTMLElement).innerText?.trim() ?? ''));
				return (totalSpan as HTMLElement)?.innerText?.trim() ?? '';
			});
			return result ?? '';
		} catch {
			const snapshot = await this.getSnapshot();
			return snapshot?.totalAmount ?? '';
		}
	}
}
