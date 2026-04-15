/**
 * DriverTripPaymentScreen
 * Pantalla de cobro Stripe en el Driver Android App (flujo Cargo a Bordo).
 *
 * Contexto:
 *   - Se activa DESPUÉS de DriverTripSummaryScreen.selectPaymentMethod() cuando
 *     el método seleccionado es "Cargo a Bordo" (tarjeta de crédito).
 *   - El formulario Stripe se renderiza como WebView dentro de la app Driver.
 *   - El conductor ingresa los datos de la tarjeta del pasajero (provista por el
 *     operador) y confirma el cobro.
 *
 * Selectores:
 *   ⚠️  TODO — Verificar con Appium Inspector conectando al emulador en la pantalla
 *              de cobro. Los valores aquí son hipótesis basadas en el patrón de Stripe.
 *
 *   URL del WebView esperada: contiene "stripe" o el dominio del gateway configurado.
 *   Contenedor nativo: identificar con Appium Inspector (accessibility-id o resource-id).
 *
 * Trazabilidad:
 *   TC1082–TC1086  appPax declines       → fillAndSubmit + expectDeclined
 *   TC1087–TC1091  appPax antifraud      → fillAndSubmit + expectDeclined
 *   TC1092–TC1095  appPax 3DS            → fillAndSubmit + handle3DSChallenge
 *   TC1097–TC1101  contractor declines   → fillAndSubmit + expectDeclined
 *   TC1102–TC1106  contractor antifraud  → fillAndSubmit + expectDeclined
 *   TC1107–TC1110  contractor 3DS        → fillAndSubmit + handle3DSChallenge
 *   TC1112–TC1116  empresa declines      → fillAndSubmit + expectDeclined
 *   TC1117–TC1121  empresa antifraud     → fillAndSubmit + expectDeclined
 */

import type { MobileActorConfig } from '../config/appiumRuntime';
import { AppiumSessionBase, type AppiumDriver } from '../base/AppiumSessionBase';

// ---------------------------------------------------------------------------
// Selectores — TODO: confirmar con Appium Inspector
// ---------------------------------------------------------------------------

/**
 * Selectores hipotéticos del formulario Stripe en WebView.
 * Reemplazar con valores reales tras dump con Appium Inspector.
 */
const PAYMENT_FORM_SELECTORS = {
	// WebView URL tokens que indican que el formulario de pago está activo.
	// TODO: verificar URL real en Appium Inspector.
	urlTokens: ['stripe', 'payment', 'checkout', 'gateway'],

	// Campos del formulario Stripe (dentro del WebView).
	// Stripe normalmente usa iframes; la estrategia es ejecutar JS en el contexto del frame.
	// TODO: confirmar si el form está en un iframe o en el documento raíz.
	cardNumber: '[data-testid="cardNumber"], input[placeholder*="Card"], input[name="cardnumber"], input[autocomplete="cc-number"]',
	cardExpiry: '[data-testid="cardExpiry"], input[placeholder*="MM"], input[name="exp"], input[autocomplete="cc-exp"]',
	cardCvc: '[data-testid="cardCvc"], input[placeholder*="CVC"], input[placeholder*="CVV"], input[name="cvc"], input[autocomplete="cc-csc"]',
	cardZip: '[data-testid="billingName"], input[placeholder*="ZIP"], input[name="postal"]',
	submitButton: 'button[type="submit"], button[data-testid="hosted-payment-submit-button"], button.SubmitButton',

	// Mensajes de resultado (post-submit).
	errorMessage: '[class*="error"], [class*="Error"], [role="alert"], .PaymentMethodError',
	successIndicator: '[class*="success"], [class*="Success"], [data-testid="success"]',

	// 3DS challenge — aparece en un WebView / iframe secundario.
	// TODO: identificar el WebView de challenge con Appium Inspector.
	threeDSFrame: 'iframe[name*="stripe"], iframe[src*="3ds"], iframe[src*="stripe"]',
	threeDSCompleteButton: '[id="test-source-authorize-3ds"], [data-testid="3ds-challenge-complete"]',
	threeDSFailButton: '[id="test-source-fail-3ds"], [data-testid="3ds-challenge-fail"]',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CardData = {
	number: string;
	expiry: string;
	cvc: string;
	zip?: string;
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
	 * Espera a que la pantalla de cobro Stripe esté activa en el WebView.
	 * Retorna true si se detecta dentro del timeout, false si no.
	 *
	 * TODO: Ajustar `urlTokens` tras confirmar URL real con Appium Inspector.
	 */
	async waitForPaymentScreen(timeout = 30_000): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			await this.switchToWebView(3_000);

			const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
			const matchesUrl = PAYMENT_FORM_SELECTORS.urlTokens.some(token =>
				url.toLowerCase().includes(token),
			);
			if (matchesUrl) return true;

			// Fallback: detectar el campo de tarjeta en el DOM.
			const hasCardInput = await driver
				.execute<boolean, []>(() => !!document.querySelector('input[autocomplete="cc-number"], input[name="cardnumber"]'))
				.catch(() => false);
			if (hasCardInput) return true;

			await driver.pause(500);
		}

		return false;
	}

	/**
	 * Llena el formulario de cobro Stripe con los datos de la tarjeta.
	 *
	 * NOTA: Si Stripe renderiza los campos dentro de iframes, será necesario
	 * ejecutar el fill mediante WebdriverIO switchFrame o JS injection.
	 * TODO: validar estrategia de fill en Appium Inspector una vez operativo.
	 */
	async fillCardForm(card: CardData): Promise<void> {
		const driver = this.getDriver();
		await this.switchToWebView();

		console.log('[DriverTripPaymentScreen] Llenando formulario de cobro...');

		// Estrategia: fill directo vía JS en el WebView.
		// Si los campos están en un iframe Stripe, necesitaremos adaptar esto.
		await driver.execute(
			(selectors: typeof PAYMENT_FORM_SELECTORS, cardData: CardData) => {
				const fill = (selector: string, value: string): boolean => {
					const el = document.querySelector(selector) as HTMLInputElement | null;
					if (!el) return false;
					const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
						window.HTMLInputElement.prototype,
						'value',
					)?.set;
					nativeInputValueSetter?.call(el, value);
					el.dispatchEvent(new Event('input', { bubbles: true }));
					el.dispatchEvent(new Event('change', { bubbles: true }));
					return true;
				};

				fill(selectors.cardNumber, cardData.number);
				fill(selectors.cardExpiry, cardData.expiry);
				fill(selectors.cardCvc, cardData.cvc);
				if (cardData.zip) fill(selectors.cardZip, cardData.zip);
			},
			PAYMENT_FORM_SELECTORS,
			card,
		);

		console.log(`[DriverTripPaymentScreen] Tarjeta ${card.number.slice(-4)} ingresada`);
	}

	/**
	 * Hace click en el botón de envío del formulario Stripe.
	 */
	async submitPayment(): Promise<void> {
		const driver = this.getDriver();
		await this.switchToWebView();

		console.log('[DriverTripPaymentScreen] Enviando pago...');

		const clicked = await driver
			.execute<boolean, []>(() => {
				const btn = document.querySelector(
					'button[type="submit"], button.SubmitButton',
				) as HTMLElement | null;
				if (btn) {
					btn.click();
					return true;
				}
				return false;
			})
			.catch(() => false);

		if (!clicked) {
			// Fallback nativo.
			// TODO: ajustar selector nativo con Appium Inspector.
			await driver.$('//android.widget.Button[contains(@text,"Pagar") or contains(@text,"Cobrar") or contains(@text,"Submit")]').click();
		}

		console.log('[DriverTripPaymentScreen] Submit realizado');
	}

	/**
	 * Espera el resultado del pago y retorna el outcome.
	 * Timeout conservador de 15s para cobros asíncronos.
	 *
	 * Resultado:
	 *   - 'success'      → cobro aprobado, viaje finalizado
	 *   - 'declined'     → tarjeta rechazada (fondos, perdida, robada, CVC, etc.)
	 *   - '3ds-required' → challenge 3DS activado (llamar handle3DSChallenge())
	 *   - 'unknown'      → no se reconoció el estado — revisar DOM dump
	 */
	async waitForPaymentOutcome(timeout = 15_000): Promise<PaymentOutcome> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			await this.switchToWebView(2_000);

			const result = await driver
				.execute<PaymentOutcome | null, []>(() => {
					const normalize = (v: unknown) => String(v ?? '').toLowerCase().trim();
					const body = normalize(document.body.innerText ?? document.body.textContent);

					// 3DS challenge detectado primero (URL cambia antes que los mensajes).
					const url = window.location.href;
					if (/3ds|3d-secure|challenge/i.test(url)) {
						return { status: '3ds-required' };
					}

					// Error / decline.
					const errorEl = document.querySelector('[class*="error"], [class*="Error"], [role="alert"]') as HTMLElement | null;
					if (errorEl) {
						return { status: 'declined', reason: (errorEl.innerText || errorEl.textContent || '').trim() };
					}

					// Textos de decline en body.
					if (/declinada|declined|rechazada|insufficient|stolen|lost|cvc|do not honor/i.test(body)) {
						return { status: 'declined', reason: body.slice(0, 200) };
					}

					// Antifraud / blocked.
					if (/bloqueada|blocked|fraud|antifraud|elevated risk|highest risk/i.test(body)) {
						return { status: 'declined', reason: `antifraud: ${body.slice(0, 200)}` };
					}

					// Éxito.
					const successEl = document.querySelector('[class*="success"], [class*="Success"]') as HTMLElement | null;
					if (successEl) {
						return { status: 'success', message: successEl.innerText?.trim() };
					}

					if (/aprobado|approved|exitoso|success|finalizado|completed/i.test(body)) {
						return { status: 'success' };
					}

					return null;
				})
				.catch(() => null);

			if (result) return result;

			await driver.pause(500);
		}

		const rawSource = await driver.getPageSource().catch(() => '');
		return { status: 'unknown', raw: rawSource.slice(0, 500) };
	}

	/**
	 * Maneja el challenge 3DS (WebView secundario que aparece tras el submit).
	 *
	 * @param action 'complete' (aprobar) | 'fail' (rechazar)
	 *
	 * TODO: Identificar el iframe/WebView de challenge con Appium Inspector.
	 *       En entorno Stripe Test los botones son:
	 *         - Aprobar: id="test-source-authorize-3ds"
	 *         - Rechazar: id="test-source-fail-3ds"
	 */
	async handle3DSChallenge(action: 'complete' | 'fail', timeout = 20_000): Promise<void> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;
		const targetId = action === 'complete'
			? PAYMENT_FORM_SELECTORS.threeDSCompleteButton
			: PAYMENT_FORM_SELECTORS.threeDSFailButton;

		console.log(`[DriverTripPaymentScreen] Esperando challenge 3DS (action=${action})...`);

		while (Date.now() < deadline) {
			// Intentar desde WebView activo.
			await this.switchToWebView(3_000);

			const clicked = await driver
				.execute<boolean, [string]>(
					(selector) => {
						const el = document.querySelector(selector) as HTMLElement | null;
						if (el) {
							el.click();
							return true;
						}
						// Buscar también por texto visible si el selector falla.
						const buttons = Array.from(document.querySelectorAll('button, [role="button"]')) as HTMLElement[];
						const match = action === 'complete'
							? buttons.find(b => /autorizar|authorize|completar|complete|aprobar|approve/i.test(b.innerText))
							: buttons.find(b => /rechazar|fail|deny|cancelar/i.test(b.innerText));

						if (match) {
							match.click();
							return true;
						}
						return false;
					},
					targetId,
				)
				.catch(() => false);

			if (clicked) {
				console.log(`[DriverTripPaymentScreen] 3DS challenge ${action} ejecutado`);
				return;
			}

			await driver.pause(500);
		}

		throw new Error(
			`[DriverTripPaymentScreen] No se encontró botón de 3DS challenge (action=${action}) en ${timeout}ms. ` +
			`TODO: Verificar selectores con Appium Inspector en la pantalla de challenge.`,
		);
	}

	/**
	 * Flujo completo: fill → submit → esperar resultado.
	 * Retorna el outcome para que el spec haga el assert correspondiente.
	 */
	async fillAndSubmit(card: CardData, submitTimeout = 15_000): Promise<PaymentOutcome> {
		await this.fillCardForm(card);
		await this.submitPayment();
		return this.waitForPaymentOutcome(submitTimeout);
	}
}
