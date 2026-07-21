/**
 * DriverTripPaymentScreen
 * Pantalla de cobro Cargo a Bordo en el Driver Android App (Ionic 6 WebView).
 *
 * ⚠️  REESCRITO DESDE EL SOURCE (2026-07-21) — magiis-mobile-driver-v2:
 *     src/app/components/credit-card-payment-data/credit-card-payment-data.component.{html,ts}
 *
 * Realidad confirmada por código (NO es un iframe de Stripe como asumía la versión previa):
 *   - El cobro es un MODAL nativo Ionic con un <form> Angular (ion-input con ids estables).
 *   - Ionic 6.3.9 → ion-input renderiza el <input> real dentro de su shadowRoot.
 *   - El form arranca con `disabledForm=true`: expiración, código de seguridad y titular
 *     son [readonly] hasta que `verifyCreditCard()` (ionChange de #cardNumber, len>=3)
 *     libera el resto. ⇒ SIEMPRE llenar #cardNumber primero.
 *   - Con Stripe (isStripe = currentTravel.mercadopagoAppCode==='STRIPE') NO se piden
 *     docType/docNumber (ocultos y sin validators).
 *   - Botón "Cobrar": <span (click)="submit()"> en el header (`.header.end span.title`),
 *     visible SOLO cuando `formGroup.valid`. Con form inválido aparece `span.invalid-charge`.
 *   - IMPORTANTE: `submit()` NO cobra. Arma el objeto `card` y hace `dismiss({card})`.
 *     El COBRO real y el resultado (decline/antifraud) los maneja la página PADRE
 *     (travel-in-progress.ts / travel-resume.ts) vía payTravel + alertService.showAtentionModal.
 *     ⇒ El decline se detecta como ATTENTION MODAL `ion-modal.alert-modal-atention.show-modal`
 *        (mismo patrón que login-smoke maneja para "sesión expirada"), NO como error inline.
 *
 * PENDIENTE DE VALIDACIÓN EN DEVICE (marcado con // TODO[device]):
 *   - Estrategia de fill de ion-input enmascarado (mask directive + Angular CVA).
 *   - Selector/keys exactos del attention modal de decline (confirmar con un dump).
 *   - handle3DSChallenge para los TCs 3DS (fuera del alcance decline/antifraud actual).
 *
 * Trazabilidad (matriz):
 *   TC1112–TC1116  empresa declines     → fillAndSubmit + expectDeclined
 *   TC1117–TC1121  empresa antifraud    → fillAndSubmit + expectDeclined
 *   TC1082–TC1091  appPax declines/antifraud   (mismo flujo)
 *   TC1097–TC1106  contractor declines/antifraud
 */

import type { MobileActorConfig } from '../config/appiumRuntime';
import { AppiumSessionBase, type AppiumDriver } from '../base/AppiumSessionBase';

// ---------------------------------------------------------------------------
// Selectores — confirmados desde el source del componente Angular
// ---------------------------------------------------------------------------

const PAYMENT_SELECTORS = {
	// Campos del form (ion-input; el <input> real vive en shadowRoot).
	cardNumber: '#cardNumber',
	cardExpiry: '#cardExpirationDate',
	securityCode: '#securityCode', // OJO: NO es #cardCvc
	cardholderName: '#cardholderName',

	// Botón "Cobrar" (solo presente cuando formGroup.valid).
	submitCharge: '.header.end span.title',
	submitInvalid: 'span.invalid-charge',

	// Cerrar modal.
	dismissChip: 'ion-chip .modal-close-icon',

	// Resultado del cobro (lo dispara la página PADRE travel-resume.ts, no el form).
	// Confirmado en source (2026-07-21): el decline de tarjeta en travel-resume.ts usa
	// `alertService.dialog()` → AlertController.create() = ion-alert NATIVO
	// (creditCardErrorAlert/errorAlert: título "Atención", botones "Reintentar"/"Salir").
	// travel-in-progress.ts NO maneja el cobro (solo showAtentionModal en errores de conexión).
	// Detectamos AMBOS por robustez: ion-alert nativo (primario) + attention modal (fallback).
	alertNative: 'ion-alert',
	alertNativeMessage: 'ion-alert .alert-message',
	alertNativeTitle: 'ion-alert .alert-title',
	attentionModal: 'ion-modal.alert-modal-atention.show-modal',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CardData = {
	number: string;
	expiry: string; // formato MM/YY (mask **/**)
	cvc: string;
	holderName?: string;
};

export type PaymentOutcome =
	| { status: 'success'; message?: string }
	| { status: 'declined'; reason: string }
	| { status: '3ds-required' }
	| { status: 'unknown'; raw: string };

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export class DriverTripPaymentScreen extends AppiumSessionBase {
	constructor(config: MobileActorConfig, driver?: AppiumDriver) {
		super(config, driver);
	}

	/**
	 * Espera a que el modal de cobro esté presente (campo #cardNumber en el DOM del WebView).
	 */
	async waitForPaymentScreen(timeout = 30_000): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			await this.switchToWebView(3_000);
			const present = await driver
				.execute<boolean, [string]>(
					(sel) => !!document.querySelector(sel),
					PAYMENT_SELECTORS.cardNumber,
				)
				.catch(() => false);
			if (present) return true;
			await driver.pause(500);
		}
		return false;
	}

	/**
	 * Llena el form de cobro. Estrategia:
	 *   1. #cardNumber PRIMERO (dispara verifyCreditCard → libera disabledForm).
	 *   2. Espera a que el resto deje de estar readonly.
	 *   3. Llena expiración, código de seguridad y titular.
	 *
	 * ion-input Ionic 6 = Shadow DOM: seteamos el <input> interno + disparamos
	 * input/change (para el mask directive) y ionInput/ionChange (para la CVA de Angular).
	 */
	async fillCardForm(card: CardData): Promise<void> {
		const driver = this.getDriver();
		await this.switchToWebView();

		console.log('[DriverTripPaymentScreen] Llenando cobro (cardNumber primero)...');

		// setter compartido para ion-input con shadow DOM.
		const setIonInput = (sel: string, value: string): boolean => {
			const host = document.querySelector(sel) as (HTMLElement & { value?: unknown }) | null;
			if (!host) return false;
			const root = (host as unknown as { shadowRoot?: ShadowRoot }).shadowRoot;
			const inner = (root ? root.querySelector('input') : host.querySelector('input')) as HTMLInputElement | null;
			const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
			if (inner && setter) {
				inner.focus();
				setter.call(inner, value);
				inner.dispatchEvent(new Event('input', { bubbles: true }));
				inner.dispatchEvent(new Event('change', { bubbles: true }));
			}
			try { host.value = value; } catch { /* noop */ }
			host.dispatchEvent(new CustomEvent('ionInput', { detail: { value }, bubbles: true }));
			host.dispatchEvent(new CustomEvent('ionChange', { detail: { value }, bubbles: true }));
			return true;
		};

		// 1. cardNumber → libera el resto del form.
		await driver.execute(setIonInput, PAYMENT_SELECTORS.cardNumber, card.number);

		// 2. Esperar a que expiración deje de ser readonly (disabledForm=false).
		//    TODO[device]: confirmar cómo se refleja disabledForm en el DOM del ion-input.
		const enabledDeadline = Date.now() + 8_000;
		while (Date.now() < enabledDeadline) {
			const editable = await driver
				.execute<boolean, [string]>((sel) => {
					const host = document.querySelector(sel) as HTMLElement | null;
					if (!host) return false;
					const root = (host as unknown as { shadowRoot?: ShadowRoot }).shadowRoot;
					const inner = (root ? root.querySelector('input') : host.querySelector('input')) as HTMLInputElement | null;
					const ro = host.getAttribute('readonly');
					return !!inner && !inner.readOnly && ro !== 'true' && ro !== '';
				}, PAYMENT_SELECTORS.cardExpiry)
				.catch(() => false);
			if (editable) break;
			await driver.pause(300);
		}

		// 3. Resto de campos.
		await driver.execute(setIonInput, PAYMENT_SELECTORS.cardExpiry, card.expiry);
		await driver.execute(setIonInput, PAYMENT_SELECTORS.securityCode, card.cvc);
		await driver.execute(setIonInput, PAYMENT_SELECTORS.cardholderName, card.holderName ?? 'TEST DRIVER');

		console.log(`[DriverTripPaymentScreen] Tarjeta ${card.number.slice(-4)} ingresada`);
	}

	/**
	 * Click en "Cobrar" (span (click)="submit()" del header, solo visible si el form es válido).
	 * Esto cierra el modal devolviendo la card a la página padre, que ejecuta el cobro real.
	 */
	async submitPayment(): Promise<void> {
		const driver = this.getDriver();
		await this.switchToWebView();

		console.log('[DriverTripPaymentScreen] Enviando cobro...');

		const clicked = await driver
			.execute<boolean, [string, string]>((chargeSel, invalidSel) => {
				// Si el form no es válido, el botón "Cobrar" no está clickeable.
				if (document.querySelector(invalidSel)) return false;
				const btn = document.querySelector(chargeSel) as HTMLElement | null;
				if (btn) { btn.click(); return true; }
				return false;
			}, PAYMENT_SELECTORS.submitCharge, PAYMENT_SELECTORS.submitInvalid)
			.catch(() => false);

		if (!clicked) {
			throw new Error(
				'[DriverTripPaymentScreen] No se pudo clickear "Cobrar" — el form no es válido ' +
				'o el selector cambió. Verificar #cardNumber/#cardExpirationDate/#securityCode/#cardholderName.',
			);
		}
		console.log('[DriverTripPaymentScreen] Cobro enviado (modal dismiss → cobro en página padre)');
	}

	/**
	 * Espera el resultado del cobro. El decline/antifraud lo muestra la página padre como
	 * attention modal (ion-modal.alert-modal-atention). Éxito = no aparece attention modal
	 * y el viaje avanza a finalizado.
	 *
	 * TODO[device]: confirmar los textos/keys del attention modal en un dump real y afinar
	 * la clasificación declined vs 3ds vs success.
	 */
	async waitForPaymentOutcome(timeout = 20_000): Promise<PaymentOutcome> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			await this.switchToWebView(2_000);

			const result = await driver
				.execute<PaymentOutcome | null, [string, string, string]>((alertSel, alertMsgSel, modalSel) => {
					const normalize = (v: unknown) => String(v ?? '').toLowerCase().trim();
					const classify = (text: string, prefix = ''): PaymentOutcome =>
						/bloquead|blocked|fraud|antifraud|riesgo|risk|high[_ -]?risk/i.test(text)
							? { status: 'declined', reason: `antifraud: ${prefix}${text.slice(0, 200)}` }
							: { status: 'declined', reason: `${prefix}${text.slice(0, 200)}` || 'declined' };

					// 3DS: la app redirige a un WebView/URL de challenge.
					if (/3ds|3d-secure|challenge/i.test(window.location.href)) {
						return { status: '3ds-required' };
					}

					// (1) ion-alert nativo — camino real del decline en travel-resume.ts.
					const alertEl = document.querySelector(alertSel) as HTMLElement | null;
					if (alertEl) {
						const msgEl = document.querySelector(alertMsgSel) as HTMLElement | null;
						const text = normalize(msgEl?.innerText ?? msgEl?.textContent ?? alertEl.innerText ?? alertEl.textContent);
						return classify(text, 'alert: ');
					}

					// (2) Attention modal (fallback: ion-modal.alert-modal-atention).
					const modal = document.querySelector(modalSel) as HTMLElement | null;
					if (modal) {
						const text = normalize(modal.innerText ?? modal.textContent);
						return classify(text, 'attention: ');
					}

					return null;
				}, PAYMENT_SELECTORS.alertNative, PAYMENT_SELECTORS.alertNativeMessage, PAYMENT_SELECTORS.attentionModal)
				.catch(() => null);

			if (result) return result;
			await driver.pause(500);
		}

		// Sin attention modal en el timeout → asumimos cobro OK (viaje finaliza).
		// El spec debe corroborar el estado del viaje por otra vía (backend/UI).
		return { status: 'success' };
	}

	/**
	 * Cierra el alert de decline. En el ion-alert nativo prioriza "Salir" (exit) para NO
	 * disparar el reintento ("Reintentar" reabre el modal de cobro). Fallback: "Aceptar"
	 * del attention modal (patrón login-smoke).
	 */
	async dismissAttentionModal(): Promise<boolean> {
		const driver = this.getDriver();
		await this.switchToWebView(2_000);
		return driver
			.execute<boolean, []>(() => {
				const clickByText = (root: ParentNode, texts: string[]): boolean => {
					const els = Array.from(root.querySelectorAll('button, [role="button"], .alert-button, ion-button, *')) as HTMLElement[];
					for (const t of texts) {
						const btn = els.find((el) => (el.textContent?.trim() ?? '') === t && typeof el.click === 'function');
						if (btn) { btn.click(); return true; }
					}
					return false;
				};
				// 1) ion-alert nativo → "Salir" (evita reintento).
				const alertEl = document.querySelector('ion-alert');
				if (alertEl && clickByText(alertEl, ['Salir', 'Exit', 'Cancelar', 'Aceptar', 'OK'])) return true;
				// 2) Fallback global (attention modal).
				return clickByText(document, ['Salir', 'Aceptar', 'OK', 'Cerrar']);
			})
			.catch(() => false);
	}

	/**
	 * Maneja el challenge 3DS. FUERA del alcance decline/antifraud actual.
	 * TODO[device]: identificar cómo renderiza la app el challenge Stripe (WebView redirect).
	 */
	async handle3DSChallenge(action: 'complete' | 'fail'): Promise<void> {
		throw new Error(
			`[DriverTripPaymentScreen] handle3DSChallenge(${action}) sin implementar — ` +
			'requiere dump del challenge Stripe en device (fuera del alcance decline/antifraud).',
		);
	}

	/**
	 * Flujo completo: llenar → cobrar → esperar resultado.
	 */
	async fillAndSubmit(card: CardData, outcomeTimeout = 20_000): Promise<PaymentOutcome> {
		await this.fillCardForm(card);
		await this.submitPayment();
		return this.waitForPaymentOutcome(outcomeTimeout);
	}
}
