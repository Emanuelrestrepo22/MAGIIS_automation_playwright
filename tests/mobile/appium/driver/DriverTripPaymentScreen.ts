/**
 * DriverTripPaymentScreen — Cargo a Bordo (build TEST driver 2026-07, STRIPE ELEMENTS).
 *
 * ⚠️ REESCRITO 2026-07-21 para el BUILD INSTALADO (más nuevo que el source
 * magiis-mobile-driver-v2). Arquitectura HÍBRIDA confirmada por DOM real del device:
 *   ion-modal > credit-card-payment-data (componente Ionic MAGIIS)
 *     ├─ header .header-title = "Pago con Tarjeta"
 *     ├─ <form> con Stripe Elements montado en .first-segment ion-row.elements-row
 *     │    └─ iframe[src*="elements-inner-card"] (Stripe hosted card Element COMBINADO)
 *     │         · .CardNumberField-input-wrapper input   (cardNumber-first)
 *     │         · .CardExpiryField-input-wrapper input    (emerge al validar número)
 *     │         · .CardCvcField-input-wrapper input        (emerge)
 *     │         · .PostalCodeField-input-wrapper input     (puede aparecer)
 *     └─ button.btn.primary  → "COBRAR"  (FUERA del iframe; disabled hasta form Stripe válido)
 *
 * Fill: switchToWebView (MAGIIS) → switchFrame al iframe Stripe → TYPING REAL (addValue) del
 * número (Stripe escucha keydown/input; NO set-value crudo) → esperar expiry/cvc → llenarlos →
 * switchFrame(null) de vuelta → esperar COBRAR !disabled → tap.
 *
 * Resultado del cobro (lo dispara la app tras COBRAR):
 *   - DECLINE / error → `ion-modal.alert-modal-atention.show-modal` (attention modal).
 *   - Alerts bloqueantes de expiración/cancelación → `app-alert-modal .button button` ("Aceptar").
 *
 * 🔴 TIMING: la ventana del driver-candidato para completar el cobro es CORTA. Si el fill Stripe
 *    tarda, el viaje se cancela ("El Viaje fue Cancelado" / "Viaje perdido"). Ver GAP REPORT.
 *
 * TODO[device]: confirmar API de switchFrame en el WebView Appium, y los selectores exactos
 * de los campos que emergen (expiry/cvc/postal) — validados parcialmente contra dump real.
 */

import type { MobileActorConfig } from '../config/appiumRuntime';
import { AppiumSessionBase, type AppiumDriver } from '../base/AppiumSessionBase';

const SEL = {
	modal: 'credit-card-payment-data',
	header: 'credit-card-payment-data .header-title',
	// iframe Stripe del card Element combinado.
	stripeCardIframe: 'iframe[src*="elements-inner-card"]',
	stripeAnyIframe: 'iframe[name^="__privateStripeFrame"]',
	// Campos dentro del iframe Stripe.
	fCardNumber: '.CardNumberField-input-wrapper input, input[name="cardnumber"], input[autocomplete="cc-number"]',
	fExpiry: '.CardExpiryField-input-wrapper input, input[name="exp-date"], input[autocomplete="cc-exp"]',
	fCvc: '.CardCvcField-input-wrapper input, input[name="cvc"], input[autocomplete="cc-csc"]',
	fPostal: '.PostalCodeField-input-wrapper input, input[name="postal"], input[autocomplete="postal-code"]',
	// Campos MAGIIS que pueden emerger fuera del iframe Stripe (nombre titular / postal).
	fHolderNameOutside: 'credit-card-payment-data input[formcontrolname="cardholderName"], credit-card-payment-data #cardholderName, credit-card-payment-data input[name="cardholderName"]',
	fPostalOutside: 'credit-card-payment-data input[formcontrolname="postalCode"], credit-card-payment-data input[name="postalCode"], credit-card-payment-data #postalCode',
	// Botón COBRAR (WebView MAGIIS, fuera del iframe) — selector real del build.
	cobrar: 'credit-card-payment-data ion-content form button, credit-card-payment-data button.btn.primary',
	// Resultado / alerts.
	attentionModal: 'ion-modal.alert-modal-atention.show-modal',
	blockingAlert: 'app-alert-modal',
} as const;

export type CardData = {
	number: string;
	expiry: string; // "MM/YY"
	cvc: string;
	holderName?: string;
	postal?: string;
};

export type PaymentOutcome =
	| { status: 'success'; message?: string }
	| { status: 'declined'; reason: string }
	| { status: 'trip-lost'; reason: string }
	| { status: '3ds-required' }
	| { status: 'unknown'; raw: string };

export class DriverTripPaymentScreen extends AppiumSessionBase {
	constructor(config: MobileActorConfig, driver?: AppiumDriver) {
		super(config, driver);
	}

	/** Detecta el modal de cobro (credit-card-payment-data / iframe Stripe) en el WebView. */
	async waitForPaymentScreen(timeout = 30_000): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			await this.switchToWebView(3_000);
			const present = await driver
				.execute<boolean, [string, string]>(
					(modalSel, iframeSel) => !!document.querySelector(modalSel) || !!document.querySelector(iframeSel),
					SEL.modal,
					SEL.stripeCardIframe,
				)
				.catch(() => false);
			if (present) return true;
			await driver.pause(400);
		}
		return false;
	}

	/**
	 * Llena la tarjeta en el Stripe Element (dentro del iframe) con TYPING REAL.
	 * Orden: número (dispara emerger de expiry/cvc) → expiry → cvc → postal (si existe).
	 */
	async fillCardForm(card: CardData): Promise<void> {
		const driver = this.getDriver();
		await this.switchToWebView();

		const digits = (v: string) => v.replace(/\D/g, '');
		const number = digits(card.number);
		const exp = digits(card.expiry); // "12/34" → "1234"
		const cvc = digits(card.cvc);

		const entered = await this.withStripeFrame(async () => {
			// Número (cardNumber-first).
			const numEl = driver.$(SEL.fCardNumber);
			await numEl.waitForExist({ timeout: 10_000 });
			await numEl.click().catch(() => undefined);
			await numEl.addValue(number);
			await driver.pause(600);

			// Expiry (emerge tras número válido).
			const expEl = driver.$(SEL.fExpiry);
			if (await expEl.waitForExist({ timeout: 6_000 }).then(() => true).catch(() => false)) {
				await expEl.click().catch(() => undefined);
				await expEl.addValue(exp);
			}
			// CVC.
			const cvcEl = driver.$(SEL.fCvc);
			if (await cvcEl.waitForExist({ timeout: 6_000 }).then(() => true).catch(() => false)) {
				await cvcEl.click().catch(() => undefined);
				await cvcEl.addValue(cvc);
			}
			// Postal dentro del Stripe Element (si el Element lo incluye).
			const postalEl = driver.$(SEL.fPostal);
			if (await postalEl.isExisting().catch(() => false)) {
				await postalEl.click().catch(() => undefined);
				await postalEl.addValue(card.postal ?? '1234567');
			}
			return true;
		}).catch((e) => {
			console.warn('[DriverTripPaymentScreen] fillCardForm iframe error:', e instanceof Error ? e.message : e);
			return false;
		});

		if (!entered) {
			throw new Error(
				'[DriverTripPaymentScreen] No se pudo llenar el Stripe Element (iframe). ' +
				'Verificar switchFrame + selector .CardNumberField-input-wrapper input en device.',
			);
		}

		// Campos que emergen FUERA del iframe (MAGIIS form): nombre del titular / postal.
		await this.switchToWebView();
		const holder = card.holderName ?? 'RESTREPO EMANUEL';
		const postal = card.postal ?? '1234567';
		for (const [sel, value] of [[SEL.fHolderNameOutside, holder], [SEL.fPostalOutside, postal]] as const) {
			const el = driver.$(sel);
			if (await el.isExisting().catch(() => false) && await el.isDisplayed().catch(() => false)) {
				await el.click().catch(() => undefined);
				await el.addValue(value).catch(() => undefined);
			}
		}
		console.log(`[DriverTripPaymentScreen] Tarjeta ${number.slice(-4)} ingresada (Stripe Elements) + titular/postal si aplican`);
	}

	/** Tap COBRAR (WebView MAGIIS). Espera a que deje de estar disabled (form Stripe válido). */
	async submitPayment(enableTimeout = 12_000): Promise<void> {
		const driver = this.getDriver();
		await this.switchToWebView();

		const deadline = Date.now() + enableTimeout;
		while (Date.now() < deadline) {
			const state = await driver
				.execute<{ found: boolean; disabled: boolean }, [string]>((sel) => {
					const b = document.querySelector(sel) as HTMLButtonElement | null;
					if (!b) return { found: false, disabled: true };
					return { found: true, disabled: b.disabled || b.getAttribute('disabled') !== null };
				}, SEL.cobrar)
				.catch(() => ({ found: false, disabled: true }));

			if (state.found && !state.disabled) {
				await driver
					.execute<boolean, [string]>((sel) => {
						const b = document.querySelector(sel) as HTMLElement | null;
						if (b) { b.click(); return true; }
						return false;
					}, SEL.cobrar)
					.catch(() => false);
				console.log('[DriverTripPaymentScreen] COBRAR tapeado');
				return;
			}
			await driver.pause(500);
		}
		throw new Error(
			'[DriverTripPaymentScreen] COBRAR quedó deshabilitado (form Stripe inválido/incompleto) ' +
			`en ${enableTimeout}ms — el fill del iframe Stripe no habilitó el botón.`,
		);
	}

	/**
	 * Espera el resultado del cobro. DECLINE → attention modal. También detecta el alert
	 * bloqueante de "Viaje perdido/Cancelado" (trip-lost) vs éxito (avanza el viaje).
	 */
	async waitForPaymentOutcome(timeout = 25_000): Promise<PaymentOutcome> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			await this.switchToWebView(2_000);
			const result = await driver
				.execute<PaymentOutcome | null, [string, string]>((attentionSel, alertSel) => {
					const norm = (v: unknown) => String(v ?? '').toLowerCase().trim();

					// Alert bloqueante app-alert-modal (Viaje perdido / Cancelado).
					const alertEl = document.querySelector(alertSel) as HTMLElement | null;
					if (alertEl) {
						const t = norm(alertEl.innerText ?? alertEl.textContent);
						if (/perdid|cancelad|expir/i.test(t)) return { status: 'trip-lost', reason: t.slice(0, 200) };
					}

					// Attention modal (decline / error de cobro).
					const modal = document.querySelector(attentionSel) as HTMLElement | null;
					if (modal) {
						const t = norm(modal.innerText ?? modal.textContent);
						if (/perdid|cancelad|expir/i.test(t)) return { status: 'trip-lost', reason: t.slice(0, 200) };
						return { status: 'declined', reason: t.slice(0, 200) || 'attention-modal' };
					}
					return null;
				}, SEL.attentionModal, SEL.blockingAlert)
				.catch(() => null);
			if (result) return result;
			await driver.pause(400);
		}
		// Sin modal → asumir que el viaje avanzó (cobro OK).
		return { status: 'success' };
	}

	/** Cierra el alert bloqueante (Viaje perdido/Cancelado) o el attention modal. */
	async dismissAttentionModal(): Promise<boolean> {
		const driver = this.getDriver();
		await this.switchToWebView(2_000);
		return driver
			.execute<boolean, []>(() => {
				const pick = (): HTMLElement | null => {
					const inAlert = document.querySelector('app-alert-modal .button button') as HTMLElement | null;
					if (inAlert) return inAlert;
					const alertBtn = document.querySelector('.alert-button') as HTMLElement | null;
					if (alertBtn) return alertBtn;
					return (Array.from(document.querySelectorAll('button, [role="button"]')) as HTMLElement[]).find(
						(b) => /aceptar|captar|cerrar|ok|salir/i.test(b.textContent ?? ''),
					) ?? null;
				};
				const btn = pick();
				if (btn) { btn.click(); return true; }
				return false;
			})
			.catch(() => false);
	}

	/**
	 * Completa (o falla) el challenge 3DS de Stripe que emerge tras COBRAR (card always-3DS).
	 * El challenge es una página hosted de Stripe dentro de iframe(s) anidados (stripe frame →
	 * challenge/acs frame). Estrategia: recorrer todos los iframes, entrar a cada uno y buscar el
	 * botón de completar ("Complete"/"Completar"/"Complete authentication"/"Authorize test payment").
	 * TODO[device]: confirmar el texto/estructura exacta del challenge con el debugger en vivo.
	 */
	async handle3DSChallenge(action: 'complete' | 'fail', timeout = 30_000): Promise<void> {
		const driver = this.getDriver();
		const completeTexts = ['complete authentication', 'complete auth', 'complete', 'completar', 'authorize test payment', 'authorize', 'autenticar', 'finish', 'submit'];
		const failTexts = ['fail authentication', 'fail auth', 'fail', 'rechazar', 'cancel', 'cancelar'];
		const wanted = action === 'complete' ? completeTexts : failTexts;

		const anyDriver = driver as unknown as {
			switchFrame?: (el: unknown) => Promise<void>;
			switchToFrame?: (el: unknown) => Promise<void>;
		};
		const enter = async (el: unknown): Promise<void> => {
			if (typeof anyDriver.switchFrame === 'function') { await anyDriver.switchFrame(el); return; }
			if (typeof anyDriver.switchToFrame === 'function') { await anyDriver.switchToFrame(el); return; }
		};

		const tryClickInCurrentFrame = async (): Promise<boolean> =>
			driver
				.execute<boolean, [string[]]>((texts) => {
					const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
					const els = Array.from(document.querySelectorAll('button, [role="button"], a, input[type="button"], input[type="submit"]')) as HTMLElement[];
					const m = els.find((b) => (b as HTMLElement).offsetParent !== null && texts.some((t) => norm(b.textContent).includes(t) || norm((b as HTMLInputElement).value).includes(t)));
					if (m) { m.click(); return true; }
					return false;
				}, wanted)
				.catch(() => false);

		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			await this.switchToWebView(3_000);
			// 1) Intento en el documento top.
			if (await tryClickInCurrentFrame()) { console.log(`[DriverTripPaymentScreen] 3DS ${action} (top frame)`); return; }

			// 2) Recorrer iframes (incluye stripe challenge/acs anidados).
			const iframeCount = await driver.execute<number, []>(() => document.querySelectorAll('iframe').length).catch(() => 0);
			for (let i = 0; i < iframeCount; i++) {
				try {
					await enter(null); // top
					await this.switchToWebView(1_000);
					const frame = driver.$(`iframe:nth-of-type(${i + 1})`);
					if (!(await frame.isExisting().catch(() => false))) continue;
					await enter(frame);
					if (await tryClickInCurrentFrame()) { console.log(`[DriverTripPaymentScreen] 3DS ${action} (iframe ${i})`); await enter(null); return; }
					// challenge suele estar 1 nivel más adentro
					const inner = driver.$('iframe');
					if (await inner.isExisting().catch(() => false)) {
						await enter(inner);
						if (await tryClickInCurrentFrame()) { console.log(`[DriverTripPaymentScreen] 3DS ${action} (iframe ${i}>inner)`); await enter(null); return; }
					}
				} catch { /* seguir con el próximo iframe */ }
				finally { await enter(null).catch(() => undefined); }
			}
			await driver.pause(700);
		}
		console.warn(`[DriverTripPaymentScreen] 3DS ${action}: no se encontró el botón de challenge en ${timeout}ms (TODO[device]: confirmar selector con debugger).`);
	}

	/** Flujo completo: llenar Stripe → COBRAR → esperar resultado. */
	async fillAndSubmit(card: CardData, outcomeTimeout = 25_000): Promise<PaymentOutcome> {
		await this.fillCardForm(card);
		await this.submitPayment();
		return this.waitForPaymentOutcome(outcomeTimeout);
	}

	// --- helpers ---------------------------------------------------------------

	/**
	 * Ejecuta `fn` dentro del iframe del Stripe card Element y vuelve al top del WebView.
	 * TODO[device]: validar la API de switchFrame en el WebView Appium (WebdriverIO v9).
	 */
	private async withStripeFrame<T>(fn: () => Promise<T>): Promise<T> {
		const driver = this.getDriver();
		const frame = driver.$(SEL.stripeCardIframe);
		await frame.waitForExist({ timeout: 10_000 });
		const anyDriver = driver as unknown as {
			switchFrame?: (el: unknown) => Promise<void>;
			switchToFrame?: (el: unknown) => Promise<void>;
		};
		const enter = async (el: unknown): Promise<void> => {
			if (typeof anyDriver.switchFrame === 'function') { await anyDriver.switchFrame(el); return; }
			if (typeof anyDriver.switchToFrame === 'function') { await anyDriver.switchToFrame(el); return; }
			throw new Error('switchFrame/switchToFrame no disponible en el driver');
		};
		try {
			await enter(frame);
			return await fn();
		} finally {
			try { await enter(null); } catch { /* noop */ }
		}
	}
}
