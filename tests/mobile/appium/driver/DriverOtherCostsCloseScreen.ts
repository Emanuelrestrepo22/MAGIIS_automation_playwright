/**
 * DriverOtherCostsCloseScreen — ciclo del viaje en la App Driver hasta el cierre, con la carga
 * de un «Otro costo» en el Resumen (Universal F1, MG-995/MG-996; Xray TM-1099).
 *
 * Locators relevados en vivo el 29/09/2026 sobre `com.magiis.app.uat.driver` 2.6.14 (emulador
 * Android 15, WebView Chrome 153). Todos son de DOM, independientes del idioma de la app (UAT
 * corre en inglés; los screens previos buscan textos en español) y sin coordenadas fijas:
 *
 *   Home          button#availability                                   (toggle Disponible / No disponible)
 *   Asignado      URL /TravelConfirmPage;data=…"travelId":<id>…         + button.btn.primary («Accept»)
 *   A iniciar     URL /TravelToStartPage                                + button.btn.primary («Start Trip»)
 *   Confirmación  ion-modal.confirm-modal.show-modal button.btn.primary («Yes»)
 *   En curso      URL /TravelInProgressPage                             + button.btn.finish («End Trip»)
 *   Resumen       URL /TravelResumePage · app-travel-resume
 *                   Otros costos   .travel-extras button:has(img[src*="addCost"])   (queda disabled sin conceptos por agregar)
 *                   filas          .travel-detail ion-row → .amount_description|.amount-description + ion-label.amount
 *                   detalle        travel-item-details → .accordion-header + .accordion-content ion-item
 *                   totales        .travel-total → .label + .ammount     (1.º Total, 2.º comisión del chofer)
 *                   medios de pago .travel-payment button.payment → ion-icon.src = …/<CASH|CHECKING_ACCOUNT|CREDIT_CARD>-*.svg
 *                   cierre         ion-footer button.btn.finish  («Close Trip» / «Sign and Close Trip» / «Enter card»)
 *   Modal Otros   ion-modal.add-other-modal.show-modal app-travel-add-other
 *                   concepto       ion-select (interface popover) → ion-popover.select-popover ion-item.select-interface-option
 *                   importe        ion-input[formcontrolname=costPrice] input   (prefijado y deshabilitado para Fijo)
 *                   guardar        .buttons button.btn.primary
 *   Firma         ion-modal.show-modal app-page-signer canvas.canvas-draw + button.btn.primary («Confirm»)
 *
 * Clicks: WebDriver `element.click()` en el contexto WEBVIEW (chromedriver). El `el.click()` de DOM
 * no dispara todos los handlers de Ionic/Angular (ver DriverTripRequestScreen). La firma se dibuja
 * con acciones W3C de tipo touch con origen en el canvas.
 */

import type { MobileActorConfig } from '../config/appiumRuntime';
import { AppiumSessionBase, type AppiumDriver } from '../base/AppiumSessionBase';

export type DriverPaymentMethodCode = 'CASH' | 'CHECKING_ACCOUNT' | 'CREDIT_CARD';

export type OtherCostFormState = {
	selectedConcept: string;
	amount: string;
	amountEditable: boolean;
	saveEnabled: boolean;
};

export type TripSummaryValues = {
	url: string;
	/** Filas del detalle tal como se ven: [etiqueta, importe]. */
	rows: Array<[string, string]>;
	fare: string | null;
	otherFees: string | null;
	/** Ítems desplegados bajo «Otros costos» (texto de cada ion-item). */
	otherFeeItems: string[];
	total: string | null;
	commission: string | null;
	activePaymentMethod: string | null;
	paymentMethods: string[];
	otherCostsButtonDisabled: boolean | null;
	closeButtonText: string | null;
};

const SEL = {
	availability: 'button#availability',
	primaryButton: 'button.btn.primary',
	confirmModalYes: 'ion-modal.confirm-modal.show-modal button.btn.primary',
	endTripButton: 'button.btn.finish',
	resume: 'app-travel-resume',
	otherCostsButton: 'app-travel-resume .travel-extras button:has(img[src*="addCost"])',
	otherCostModal: 'ion-modal.add-other-modal.show-modal',
	otherCostSelect: 'ion-modal.add-other-modal.show-modal ion-select',
	otherCostOption: 'ion-popover.select-popover ion-item.select-interface-option',
	otherCostSave: 'ion-modal.add-other-modal.show-modal .buttons button.btn.primary',
	paymentButtons: 'app-travel-resume .travel-payment button.payment',
	closeTripButton: 'app-travel-resume ion-footer button.btn.finish',
	signerCanvas: 'ion-modal.show-modal app-page-signer canvas.canvas-draw',
	signerConfirm: 'ion-modal.show-modal app-page-signer button.btn.primary'
} as const;

const DEFAULT_TIMEOUT = 30_000;

export class DriverOtherCostsCloseScreen extends AppiumSessionBase {
	constructor(config: MobileActorConfig, driver?: AppiumDriver) {
		super(config, driver);
	}

	// ── primitivas ────────────────────────────────────────────────────────────

	/**
	 * Contexto WEBVIEW + la ventana visible. La app puede exponer más de un handle de ventana
	 * (el WebView principal y documentos auxiliares): se elige el que está `visible`.
	 */
	private async webview(): Promise<void> {
		const context = await this.switchToWebView(15_000);
		if (!context) throw new Error('[DriverOtherCostsCloseScreen] sin contexto WEBVIEW');
		const driver = this.getDriver();
		const current = await driver.getWindowHandle().catch(() => null);
		if (current && (await driver.execute(() => document.visibilityState).catch(() => '')) === 'visible') return;
		for (const handle of await driver.getWindowHandles()) {
			await driver.switchToWindow(handle);
			if ((await driver.execute(() => document.visibilityState).catch(() => '')) === 'visible') return;
		}
	}

	async currentUrl(): Promise<string> {
		await this.webview();
		return this.getDriver()
			.execute(() => window.location.href)
			.catch(() => '');
	}

	private async waitForUrl(fragment: string, timeout = DEFAULT_TIMEOUT): Promise<void> {
		let last = '';
		await this.getDriver()
			.waitUntil(
				async () => {
					last = await this.currentUrl();
					return last.includes(fragment);
				},
				{ timeout, interval: 700, timeoutMsg: `[DriverOtherCostsCloseScreen] no se llegó a ${fragment}` }
			)
			.catch(() => {
				throw new Error(
					`[DriverOtherCostsCloseScreen] no se llegó a ${fragment} en ${timeout} ms (URL: ${last.replace(/;.*/, '')})`
				);
			});
	}

	/**
	 * Click WebDriver sobre el primer elemento visible (y habilitado) del selector, opcionalmente
	 * con texto exacto. Reintenta hasta `timeout`: los elementos Ionic se montan con animación.
	 */
	private async clickVisible(selector: string, opts: { text?: string; timeout?: number } = {}): Promise<string> {
		const driver = this.getDriver();
		let clicked: string | null = null;
		await driver
			.waitUntil(
				async () => {
					await this.webview();
					const elements = await driver.$$(selector).getElements();
					for (const el of elements) {
						if (!(await el.isDisplayed().catch(() => false))) continue;
						if (!(await el.isEnabled().catch(() => false))) continue;
						const text = (await el.getText().catch(() => '')).trim();
						if (opts.text !== undefined && text !== opts.text) continue;
						await el.click();
						clicked = text;
						return true;
					}
					return false;
				},
				{ timeout: opts.timeout ?? DEFAULT_TIMEOUT, interval: 600 }
			)
			.catch(() => undefined);
		if (clicked === null) {
			throw new Error(
				`[DriverOtherCostsCloseScreen] no apareció un elemento visible y habilitado para «${selector}»${opts.text ? ` con texto «${opts.text}»` : ''}`
			);
		}
		return clicked;
	}

	private async waitForGone(selector: string, timeout = DEFAULT_TIMEOUT): Promise<void> {
		await this.getDriver().waitUntil(
			async () => {
				await this.webview();
				return (
					(await this.getDriver().execute((s: string) => document.querySelectorAll(s).length, selector)) === 0
				);
			},
			{ timeout, interval: 500, timeoutMsg: `[DriverOtherCostsCloseScreen] «${selector}» sigue abierto` }
		);
	}

	/** Captura de pantalla NATIVA (lo que ve el chofer, incluida la barra de estado). */
	async screenshot(filePath: string): Promise<string> {
		const driver = this.getDriver();
		await this.switchToNative();
		try {
			await driver.saveScreenshot(filePath);
		} finally {
			await this.webview();
		}
		return filePath;
	}

	// ── home / disponibilidad ────────────────────────────────────────────────

	/** true si la app muestra una pantalla de login (sesión del chofer perdida). */
	async isLoggedOut(): Promise<boolean> {
		const url = await this.currentUrl();
		if (/\/login/i.test(url)) return true;
		// `app-login` queda montado (oculto) aunque haya sesión: sólo cuenta un password VISIBLE.
		return this.getDriver()
			.execute(() =>
				Array.from(document.querySelectorAll('input[type="password"]')).some(
					e => e.getBoundingClientRect().height > 0
				)
			)
			.catch(() => false);
	}

	async getAvailabilityLabel(): Promise<string> {
		await this.webview();
		return (
			(
				await this.getDriver()
					// Hay DOS `#availability`: uno dentro de un `page-home` oculto (siempre «No disponible»)
					// y el visible. Sólo cuenta el que tiene tamaño en pantalla.
					.execute(
						(s: string) =>
							(
								Array.from(document.querySelectorAll(s)).find(
									e => e.getBoundingClientRect().height > 0
								) as HTMLElement | undefined
							)?.innerText ?? '',
						SEL.availability
					)
					.catch(() => '')
			).trim()
		);
	}

	/**
	 * Toca el toggle de disponibilidad y espera a que su etiqueta cambie (el cambio es asíncrono:
	 * tarda más de 3 s). El estado resultante lo confirma el llamador por API.
	 */
	async toggleAvailability(timeout = 20_000): Promise<string> {
		const before = await this.getAvailabilityLabel();
		await this.clickVisible(SEL.availability);
		let after = before;
		await this.getDriver()
			.waitUntil(
				async () => {
					after = await this.getAvailabilityLabel();
					return after !== before && after !== '';
				},
				{ timeout, interval: 700 }
			)
			.catch(() => undefined);
		return after;
	}

	// ── ciclo del viaje ─────────────────────────────────────────────────────

	/** Espera el aviso «viaje asignado» del viaje indicado (TravelConfirmPage con su travelId). */
	async waitForAssignedTrip(travelId: number, timeout = 60_000): Promise<void> {
		let last = '';
		await this.getDriver()
			.waitUntil(
				async () => {
					last = decodeURIComponent(await this.currentUrl());
					return last.includes('TravelConfirmPage') && last.includes(`"travelId":${travelId}`);
				},
				{ timeout, interval: 1_000 }
			)
			.catch(() => {
				throw new Error(
					`[DriverOtherCostsCloseScreen] el viaje ${travelId} no llegó a la app en ${timeout} ms (URL: ${last.replace(/;.*/, '')})`
				);
			});
	}

	async acceptTrip(): Promise<void> {
		await this.clickVisible(SEL.primaryButton);
		await this.waitForUrl('TravelToStartPage');
	}

	async startTrip(): Promise<void> {
		await this.clickVisible(SEL.primaryButton);
		await this.clickVisible(SEL.confirmModalYes);
		await this.waitForUrl('TravelInProgressPage');
	}

	async endTrip(): Promise<void> {
		await this.clickVisible(SEL.endTripButton);
		await this.clickVisible(SEL.confirmModalYes);
		await this.waitForUrl('TravelResumePage', 45_000);
		await this.waitForSummaryRendered();
	}

	/** true si la app está en el Resumen de un viaje (p. ej. un viaje que quedó sin cerrar). */
	async isOnSummary(): Promise<boolean> {
		return (await this.currentUrl()).includes('TravelResumePage');
	}

	/**
	 * La URL del Resumen cambia antes de que Angular pinte el contenido: espera a que la página
	 * visible tenga los botones de extras y el total (leer antes devuelve nulos).
	 */
	async waitForSummaryRendered(timeout = 20_000): Promise<void> {
		await this.getDriver().waitUntil(
			async () => {
				await this.webview();
				return this.getDriver().execute((resumeSel: string) => {
					const root = Array.from(document.querySelectorAll(resumeSel)).find(
						e => e.getBoundingClientRect().height > 0
					);
					// «Otros costos» se monta después que Peaje/Estac. (la app consulta el catálogo del
					// chofer al llegar a destino): se espera ese botón puntual, no cualquier extra.
					return Boolean(
						root?.querySelector('.travel-extras button img[src*="addCost"]') &&
							root.querySelector('.travel-total')
					);
				}, SEL.resume);
			},
			{ timeout, interval: 500, timeoutMsg: '[DriverOtherCostsCloseScreen] el Resumen no terminó de renderizar' }
		);
	}

	// ── Resumen: Otros costos ────────────────────────────────────────────────

	async openOtherCosts(): Promise<void> {
		await this.clickVisible(SEL.otherCostsButton);
		await this.clickVisible(SEL.otherCostSelect, { timeout: 15_000 }).catch(error => {
			throw new Error(
				`[DriverOtherCostsCloseScreen] el modal de Otros costos no abrió: ${(error as Error).message}`
			);
		});
	}

	/** Conceptos que ofrece el selector (con el popover abierto por `openOtherCosts`). */
	async listOfferedConcepts(): Promise<string[]> {
		await this.getDriver().waitUntil(
			async () => {
				await this.webview();
				return (
					(await this.getDriver().execute(
						(s: string) => document.querySelectorAll(s).length,
						SEL.otherCostOption
					)) > 0
				);
			},
			{
				timeout: 15_000,
				interval: 500,
				timeoutMsg: '[DriverOtherCostsCloseScreen] el selector de conceptos no mostró opciones'
			}
		);
		return this.getDriver().execute(
			(s: string) =>
				Array.from(document.querySelectorAll(s)).map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim()),
			SEL.otherCostOption
		);
	}

	async selectConcept(name: string): Promise<void> {
		await this.clickVisible(SEL.otherCostOption, { text: name, timeout: 15_000 });
		await this.waitForGone('ion-popover.select-popover', 10_000);
		// El form valida en el `ionChange` del select: se da margen a que «Save» se habilite. No
		// falla acá: si no se habilita, lo dice la aserción del llamador con el estado leído.
		await this.getDriver()
			.waitUntil(async () => (await this.readOtherCostForm()).saveEnabled, { timeout: 5_000, interval: 300 })
			.catch(() => undefined);
	}

	/** Cierra el modal de Otros costos con «Cancel» si quedó abierto (limpieza). */
	async cancelOtherCostModalIfOpen(): Promise<boolean> {
		await this.webview();
		const open = await this.getDriver().execute(
			(s: string) => document.querySelectorAll(s).length > 0,
			SEL.otherCostModal
		);
		if (!open) return false;
		await this.clickVisible(`${SEL.otherCostModal} .buttons button.btn-outlined-red`);
		await this.waitForGone(SEL.otherCostModal, 10_000);
		return true;
	}

	async readOtherCostForm(): Promise<OtherCostFormState> {
		await this.webview();
		const state = await this.getDriver().execute((modalSel: string) => {
			const modal = document.querySelector(modalSel);
			if (!modal) return null;
			const select = modal.querySelector('ion-select') as (HTMLElement & { value?: unknown }) | null;
			const ionInput = modal.querySelector('ion-input') as (HTMLElement & { disabled?: boolean }) | null;
			const input = modal.querySelector('ion-input input') as HTMLInputElement | null;
			const save = modal.querySelector('.buttons button.btn.primary') as HTMLButtonElement | null;
			return {
				selectedConcept: String(select?.value ?? ''),
				amount: input?.value ?? '',
				amountEditable: Boolean(input && !input.disabled && !input.readOnly && !ionInput?.disabled),
				saveEnabled: Boolean(save && !save.disabled)
			};
		}, SEL.otherCostModal);
		if (!state) throw new Error('[DriverOtherCostsCloseScreen] el modal de Otros costos no está abierto');
		return state;
	}

	async saveOtherCost(): Promise<void> {
		await this.clickVisible(SEL.otherCostSave);
		await this.waitForGone(SEL.otherCostModal, 15_000);
	}

	async readSummary(): Promise<TripSummaryValues> {
		await this.webview();
		const values = await this.getDriver().execute((resumeSel: string) => {
			// Ionic apila páginas: puede quedar un Resumen anterior oculto. Sólo cuenta el visible.
			const root = Array.from(document.querySelectorAll(resumeSel)).find(
				e => e.getBoundingClientRect().height > 0
			);
			if (!root) return null;
			const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
			const rows = Array.from(root.querySelectorAll('.travel-detail ion-row'))
				.map(row => {
					const label = row.querySelector('.amount_description, .amount-description');
					const amount = row.querySelector('ion-label.amount');
					return label && amount
						? ([norm(label.textContent), norm(amount.textContent)] as [string, string])
						: null;
				})
				.filter((r): r is [string, string] => r !== null);
			const find = (re: RegExp) => rows.find(([label]) => re.test(label))?.[1] ?? null;
			const otherFeesBlock = Array.from(root.querySelectorAll('travel-item-details')).find(block =>
				/other fees|otros costos/i.test(norm(block.querySelector('.accordion-header')?.textContent))
			);
			const totals = Array.from(root.querySelectorAll('.travel-total'));
			const totalBlock = totals.find(t => !t.querySelector('.travel-total-commission-label'));
			const commissionBlock = totals.find(t => t.querySelector('.travel-total-commission-label'));
			const payments = Array.from(root.querySelectorAll('.travel-payment button.payment')).map(b => {
				const src = String((b.querySelector('ion-icon') as (Element & { src?: string }) | null)?.src ?? '');
				const code = (src.split('/').pop() ?? '').replace(/-(black|white)\.svg$/, '').replace(/\.svg$/, '');
				return { code, active: b.classList.contains('active') };
			});
			const othersButton = root.querySelector(
				'.travel-extras button:has(img[src*="addCost"])'
			) as HTMLButtonElement | null;
			const closeButton = root.querySelector('ion-footer button.btn.finish');
			return {
				url: window.location.href,
				rows,
				fare: find(/^(fare|tarifa)$/i),
				otherFees: find(/other fees|otros costos/i),
				otherFeeItems: otherFeesBlock
					? Array.from(otherFeesBlock.querySelectorAll('.accordion-content ion-item')).map(i =>
							norm(i.textContent)
						)
					: [],
				total: norm(totalBlock?.querySelector('.ammount')?.textContent) || null,
				commission: norm(commissionBlock?.querySelector('.ammount')?.textContent) || null,
				activePaymentMethod: payments.find(p => p.active)?.code ?? null,
				paymentMethods: payments.map(p => p.code),
				// Deshabilitado = atributo `disabled` o la clase `button-other-cost-disabled` (sin
				// conceptos por agregar: catálogo vacío para el chofer o todos ya cargados).
				otherCostsButtonDisabled: othersButton
					? othersButton.disabled || othersButton.classList.contains('button-other-cost-disabled')
					: null,
				closeButtonText: norm(closeButton?.textContent) || null
			};
		}, SEL.resume);
		if (!values) throw new Error('[DriverOtherCostsCloseScreen] no se está en el Resumen del viaje');
		return values;
	}

	/** Elige el medio de pago del cierre por su código (el ícono del botón lo nombra). */
	async selectPaymentMethod(code: DriverPaymentMethodCode): Promise<void> {
		await this.webview();
		const driver = this.getDriver();
		const buttons = await driver.$$(SEL.paymentButtons).getElements();
		for (const button of buttons) {
			if (!(await button.isDisplayed().catch(() => false))) continue;
			const src = await driver.execute(
				(el: HTMLElement) =>
					String((el.querySelector('ion-icon') as (Element & { src?: string }) | null)?.src ?? ''),
				button as unknown as HTMLElement
			);
			if (src.includes(`/${code}-`) || src.endsWith(`/${code}.svg`)) {
				await button.click();
				await driver.waitUntil(async () => (await this.readSummary()).activePaymentMethod === code, {
					timeout: 10_000,
					interval: 500,
					timeoutMsg: `[DriverOtherCostsCloseScreen] el medio de pago ${code} no quedó activo`
				});
				return;
			}
		}
		throw new Error(`[DriverOtherCostsCloseScreen] el Resumen no ofrece el medio de pago ${code}`);
	}

	/**
	 * Cierre con firma del pasajero («Sign and Close Trip», p. ej. cuenta corriente): abre el
	 * firmador, dibuja un trazo, verifica que el canvas cambió y confirma. Si la app vuelve a
	 * pedir «Close Trip» después de firmar, lo toca. Termina cuando la app vuelve al home.
	 * Devuelve si el canvas registró el trazo (evidencia de que la firma no fue vacía).
	 */
	async signAndCloseTrip(): Promise<{ signatureDrawn: boolean }> {
		await this.clickVisible(SEL.closeTripButton);
		const driver = this.getDriver();
		await this.webview();
		const canvas = await driver.$(SEL.signerCanvas);
		await canvas.waitForDisplayed({ timeout: 15_000 });
		const blank = await driver.execute(
			(c: HTMLCanvasElement) => c.toDataURL(),
			canvas as unknown as HTMLCanvasElement
		);
		const stroke = (x: number, y: number) => ({
			type: 'pointerMove' as const,
			duration: 150,
			origin: canvas,
			x,
			y
		});
		await driver.performActions([
			{
				type: 'pointer',
				id: 'signature',
				parameters: { pointerType: 'touch' },
				actions: [
					{ type: 'pointerMove', duration: 0, origin: canvas, x: -80, y: -40 },
					{ type: 'pointerDown', button: 0 },
					stroke(-20, 30),
					stroke(40, -30),
					stroke(90, 40),
					{ type: 'pointerUp', button: 0 }
				]
			}
		]);
		await driver.releaseActions().catch(() => undefined);
		const drawn = await driver.execute(
			(c: HTMLCanvasElement) => c.toDataURL(),
			canvas as unknown as HTMLCanvasElement
		);
		const signatureDrawn = drawn !== blank;
		if (!signatureDrawn) throw new Error('[DriverOtherCostsCloseScreen] el trazo de firma no quedó en el canvas');
		await this.clickVisible(SEL.signerConfirm);

		await driver.waitUntil(
			async () => {
				const url = await this.currentUrl();
				if (url.includes('/navigator/home')) return true;
				// Variante con segundo paso: tras firmar, el botón vuelve a «Close Trip».
				await this.clickVisible(SEL.closeTripButton, { timeout: 1_500 }).catch(() => undefined);
				return false;
			},
			{
				timeout: 45_000,
				interval: 1_500,
				timeoutMsg: '[DriverOtherCostsCloseScreen] la app no volvió al home tras cerrar el viaje'
			}
		);
		return { signatureDrawn };
	}
}
