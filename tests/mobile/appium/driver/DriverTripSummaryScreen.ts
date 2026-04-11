/**
 * DriverTripSummaryScreen
 * Pantalla de resumen post-viaje del Driver Android App.
 * Se muestra después de confirmar "¿Finalizar Viaje?" y antes del cierre final.
 *
 * Selectores confirmados DOM dump 2026-04-09:
 *   URL: /TravelResumePage
 *   Contenedor activo: app-travel-resume (class="ion-page can-go-back")
 *   Botón cerrar viaje: button.btn.finish  text="Cerrar Viaje"
 *   Botón peaje:        button (sin clase)  text="Peaje"
 *   Botón estac.:       button (sin clase)  text="Estac."
 *   Forma de pago activa: button.payment.active  text="VISA 4242"
 *   Total a cobrar:     span text="Total a Cobrar" + span text="$XX.XX"
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
	 * Tap en "Cerrar Viaje" en la pantalla de resumen.
	 * Selector confirmado DOM dump 2026-04-09:
	 *   button.btn.finish  text="Cerrar Viaje"  (dentro de app-travel-resume)
	 * Nota: el texto es "Cerrar Viaje", distinto al "Finalizar Viaje" de TravelNavigationPage.
	 */
	async confirmAndFinish(): Promise<void> {
		await this.switchToWebView();
		const driver = this.getDriver();
		const snapshotBefore = await this.getSnapshot();
		let clicked = false;

		try {
			// Selector estable confirmado: app-travel-resume button.btn.finish
			const btn = await driver.$(DRIVER_ACTION_SELECTORS.closeTripPrimaryButton);
			if (await btn.isDisplayed().catch(() => false)) {
				const text = (await btn.getText().catch(() => '')).trim();
				if (text === 'Cerrar Viaje') {
					await btn.click();
					clicked = true;
					console.log('[DriverTripSummaryScreen] ✓ Tap "Cerrar Viaje"');
				}
			}
		} catch (e) {
			console.warn('[DriverTripSummaryScreen] selector específico falló:', e);
		}

		// Fallback: iterar button.btn.finish filtrando por texto
		if (!clicked) {
			try {
				const allBtns = await driver.$$('button.btn.finish') as unknown as any[];
				for (const btn of allBtns) {
					const text    = (await btn.getText().catch(() => '')).trim();
					const visible = await btn.isDisplayed().catch(() => false);
					if (text === 'Cerrar Viaje' && visible) {
						await btn.click();
						clicked = true;
						console.log('[DriverTripSummaryScreen] ✓ Tap "Cerrar Viaje" (fallback)');
						break;
					}
				}
			} catch (e) {
				console.warn('[DriverTripSummaryScreen] fallback error:', e);
			}
		}

		if (!clicked) {
			const details = snapshotBefore
				? `URL=${snapshotBefore.url} | Textos=${snapshotBefore.rawTexts.join(' || ')} | Botones=${snapshotBefore.buttons.join(' || ')}`
				: 'snapshot unavailable';
			throw new Error(`[DriverTripSummaryScreen] confirmAndFinish: botón "Cerrar Viaje" no encontrado. ${details}`);
		}

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
	 * Retorna la forma de pago activa visible en pantalla.
	 * Selector confirmado: button.payment.active  text="VISA 4242"
	 */
	async getActivePaymentMethod(): Promise<string> {
		try {
			await this.switchToWebView();
			const btn = await this.getDriver().$('app-travel-resume button.payment.active');
			return (await btn.getText().catch(() => '')).trim();
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
