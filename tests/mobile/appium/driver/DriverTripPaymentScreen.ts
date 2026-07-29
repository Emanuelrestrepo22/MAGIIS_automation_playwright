/**
 * DriverTripPaymentScreen — Cargo a Bordo (build TEST driver 2026-07).
 *
 * DOS RAMAS de form de tarjeta, elegidas por PRESENCIA del campo nativo (ver `fillCardForm`):
 *
 *   A) NATIVA — `credit-card-payment-data` con inputs Ionic propios (`#cardNumber`,
 *      `#cardExpirationDate`, `#securityCode`, `#cardholderName`), SIN ningún iframe. Es lo que
 *      renderiza la app cuando el carrier tiene vinculada una pasarela que no monta Stripe
 *      Elements (medido con Authorize el 2026-07-29, dump
 *      `evidence/dom-dump/driver-cargo-decline-failure-2026-07-29T23-05-50-769Z.txt`).
 *   B) STRIPE ELEMENTS — cada campo en SU propio iframe `__privateStripeFrame`. Único camino con
 *      3DS; lo consumen los 12 specs de cargo de Stripe. INTACTO.
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
	// Stripe Elements CLÁSICO: CADA campo en SU PROPIO iframe __privateStripeFrame (confirmado
	// por dump 2026-07-21). Se identifican por el title (i18n ES).
	iframeNumber: 'iframe[title="Cuadro de entrada seguro del número de tarjeta"]',
	iframeExpiry: 'iframe[title="Cuadro de entrada seguro de la fecha de vencimiento"]',
	iframeCvc: 'iframe[title="Cuadro de entrada seguro del CVC"]',
	// Dentro de cada iframe Stripe hay un input DECOY oculto (input.StripeField--fake,
	// aria-hidden/disabled) + el input REAL (input.InputElement). Targetear el real.
	stripeInput: 'input.InputElement, input:not(.StripeField--fake):not([aria-hidden="true"]):not([disabled])',
	// Campos NATIVOS del form MAGIIS (WebView principal, fuera de iframe).
	fHolderNameOutside:
		'credit-card-payment-data input[formcontrolname="cardholderName"], #cardholderName, input[formcontrolname="cardholderName"]',
	fPostalOutside: 'credit-card-payment-data input[formcontrolname="zipCode"], input[formcontrolname="zipCode"]',
	// ── RAMA NATIVA (sin Stripe) ───────────────────────────────────────────────────────────────
	// Guard de rama: presencia del campo de número NATIVO. Los 3 sabores del selector son los
	// mismos que ya resuelve `PassengerWalletScreen.fillCardForm` para este componente; el
	// atributo `id`/`formcontrolname`/`data-checkout` de `cardNumber` está medido en el dump del
	// modal del driver (`credit-card-payment-data > form > .first-segment ion-input#cardNumber`).
	nativeGuard:
		'credit-card-payment-data input#cardNumber, input#cardNumber, input[formcontrolname="cardNumber"], input[data-checkout="cardNumber"]',
	// Los 4 campos del form nativo del DRIVER, medidos por el probe
	// `tests/mobile/appium/scripts/driver-charge-from-resume.ts` (#cardNumber #cardExpirationDate
	// #securityCode #cardholderName). Las variantes formcontrolname/data-checkout son las que ya
	// usa el pasajero para el MISMO componente.
	nativeNumber: ['input#cardNumber', 'input[formcontrolname="cardNumber"]', 'input[data-checkout="cardNumber"]'],
	nativeExpiry: [
		'input#cardExpirationDate',
		'input[formcontrolname="cardExpirationDate"]',
		'input[data-checkout="cardExpirationDate"]'
	],
	nativeCvc: ['input#securityCode', 'input[formcontrolname="securityCode"]', 'input[data-checkout="securityCode"]'],
	nativeHolder: [
		'input#cardholderName',
		'input[formcontrolname="cardholderName"]',
		'input[data-checkout="cardholderName"]',
		'ion-input[formcontrolname="cardholderName"] input'
	],
	// El probe del driver NO vio `zipCode` en su modal (sí existe en el form del pasajero) ⇒ se
	// llena SOLO si el campo aparece en vivo. Selectores medidos, sin inventar un `#zipCode`.
	nativeZip: ['input[formcontrolname="zipCode"]', 'input[data-checkout="zipCode"]'],
	// Botón COBRAR (WebView MAGIIS, fuera del iframe) — selector real del build.
	cobrar: 'credit-card-payment-data ion-content form button, credit-card-payment-data button.btn.primary',
	// Resultado / alerts.
	attentionModal: 'ion-modal.alert-modal-atention.show-modal',
	blockingAlert: 'app-alert-modal'
} as const;

export type CardData = {
	number: string;
	expiry: string; // "MM/YY"
	cvc: string;
	holderName?: string;
	postal?: string;
};

/** Radiografía del form NATIVO — diagnóstico de por qué COBRAR sigue deshabilitado. */
type NativeFormState = {
	/** classList del `<form>` (trae `ng-valid`/`ng-invalid` del FormGroup de Angular). */
	form: string;
	fields: Record<string, { found: boolean; value: string; invalid: boolean }>;
	/** `.header.end span.title` con texto /cobrar/i ⇒ el form se considera válido. */
	chargeValidVisible: boolean;
	/** `span.invalid-charge` presente ⇒ el form se considera inválido. */
	chargeInvalidVisible: boolean;
	submit: { found: boolean; disabled: boolean; text: string };
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
				.execute<
					boolean,
					[string, string]
				>((modalSel, iframeSel) => !!document.querySelector(modalSel) || !!document.querySelector(iframeSel), SEL.modal, SEL.iframeNumber)
				.catch(() => false);
			if (present) return true;
			await driver.pause(400);
		}
		return false;
	}

	/**
	 * Llena la tarjeta eligiendo la rama por **PRESENCIA DEL CAMPO NATIVO**, no por nombre de
	 * pasarela: si el modal expone `#cardNumber` (form Ionic propio) va por la rama NATIVA; si no,
	 * por Stripe Elements. Elegir por presencia y no por `gateway` es lo que hace que eBizCharge y
	 * Mercado Pago entren por el camino nativo sin tocar una línea acá — el screen no tiene por qué
	 * saber qué pasarela vinculó el carrier, sólo qué form renderizó la app.
	 *
	 * El guard corre con el frame ALINEADO al top del WebView (`switchFrameTarget(null)`), mismo
	 * criterio que `PassengerWalletScreen.fillCardForm`: sin eso el guard puede resolver el form
	 * estando el frame activo en el iframe de firebase-auth y el fill posterior fallaría.
	 *
	 * Rama Stripe (sin cambios): Stripe Elements CLÁSICO ⇒ CADA campo en SU PROPIO iframe → hay que
	 * switchFrame a cada uno por separado (llenar número+expiry+cvc en un solo iframe falla con
	 * "element not interactable"). Nombre y código postal son inputs NATIVOS del form MAGIIS.
	 */
	async fillCardForm(card: CardData): Promise<void> {
		const driver = this.getDriver();
		const digits = (v: string) => v.replace(/\D/g, '');
		const number = digits(card.number);
		const exp = digits(card.expiry); // "12/34" → "1234"
		const cvc = digits(card.cvc);

		// 0) ¿Form NATIVO (sin iframes)? → rama nativa y salir.
		await this.switchToWebView();
		await this.switchFrameTarget(null).catch(() => undefined);
		if (await this.findAnyElement(SEL.nativeGuard)) {
			await this.fillNativeCardForm(card);
			return;
		}

		// 1) Cada campo Stripe en SU iframe.
		const okNum = await this.typeInStripeIframe(SEL.iframeNumber, number);
		if (!okNum) {
			throw new Error(
				'[DriverTripPaymentScreen] No se pudo llenar el número (iframe Stripe). Verificar title del iframe.'
			);
		}
		await driver.pause(400);
		await this.typeInStripeIframe(SEL.iframeExpiry, exp);
		await driver.pause(300);
		await this.typeInStripeIframe(SEL.iframeCvc, cvc);

		// 2) Campos NATIVOS del form MAGIIS: cardholderName / zipCode son ION-INPUT (no input raw).
		//    Setear el <input> interno (shadow) + disparar input/change + ionInput/ionChange para
		//    que el FormControl de Angular se actualice (addValue sobre el host ion-input no basta).
		await this.switchToWebView();
		const holder = card.holderName ?? 'RESTREPO EMANUEL';
		const postal = card.postal ?? '1234567';
		await driver
			.execute<boolean, [string, string]>(
				(holderName, zip) => {
					const setIon = (id: string, value: string): void => {
						const host = document.getElementById(id) as (HTMLElement & { value?: unknown }) | null;
						if (!host) return;
						const root = (host as unknown as { shadowRoot?: ShadowRoot }).shadowRoot;
						const inner = (
							root ? root.querySelector('input') : host.querySelector('input')
						) as HTMLInputElement | null;
						const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
						if (inner && setter) {
							inner.focus();
							setter.call(inner, value);
							inner.dispatchEvent(new Event('input', { bubbles: true }));
							inner.dispatchEvent(new Event('change', { bubbles: true }));
						}
						try {
							host.value = value;
						} catch {
							/* noop */
						}
						host.dispatchEvent(new CustomEvent('ionInput', { detail: { value }, bubbles: true }));
						host.dispatchEvent(new CustomEvent('ionChange', { detail: { value }, bubbles: true }));
					};
					setIon('cardholderName', holderName);
					setIon('zipCode', zip);
					return true;
				},
				holder,
				postal
			)
			.catch(() => false);
		console.log(
			`[DriverTripPaymentScreen] Tarjeta ${number.slice(-4)} ingresada (Stripe classic: iframe por campo) + titular/postal (ion-input)`
		);
	}

	/**
	 * RAMA NATIVA: llena el form Ionic propio del modal de cobro (`credit-card-payment-data`), el que
	 * renderiza la Driver App cuando NO hay Stripe Elements (medido con Authorize el 2026-07-29).
	 *
	 * Reusa la receta ya probada en device por `PassengerWalletScreen.fillNativeCardForm` para el
	 * MISMO componente, hoy en `AppiumSessionBase.fillWebInputField`: setter nativo + dispatch de
	 * `input`/`change`. Es la única mecánica válida acá — el input tiene máscara
	 * (`**** **** **** ****`) y `onpaste`/`oncopy`/`ondrag`/`ondrop` bloqueados.
	 *
	 * REVEAL PROGRESIVO: al abrir, el modal SÓLO tiene `#cardNumber` montado; el resto vive detrás
	 * de `ng-if` en `false` y aparece cuando la marca queda reconocida por un número válido. De ahí
	 * la pausa entre el número y los demás campos.
	 */
	private async fillNativeCardForm(card: CardData): Promise<void> {
		const driver = this.getDriver();
		const digits = (v: string) => v.replace(/\D/g, '');
		const number = digits(card.number);

		// 1) Número → dispara validación + reveal del resto del form.
		if (!(await this.fillWebInputField(SEL.nativeNumber, number).catch(() => false))) {
			throw new Error(
				'[DriverTripPaymentScreen] No se pudo llenar #cardNumber en el form NATIVO ' +
					`(selectores: ${SEL.nativeNumber.join(', ')}).`
			);
		}
		// Reveal progresivo: esperar a que el campo de vencimiento se MONTE (ng-if false → true) en
		// vez de dormir a ciegas. El fixed-pause de 2.5s de la receta del pasajero queda como piso
		// (la marca puede tardar en resolverse) y como techo el poll — si no monta, el diagnóstico de
		// `submitPayment` va a nombrar el campo faltante.
		await driver.pause(2_500);
		await this.waitForNativeField(SEL.nativeExpiry, 8_000);

		// 2) Vencimiento MM/AA. Se verifica por READBACK y, si la máscara del campo rechazó el
		//    formato con barra, se reintenta compacto (MMAA). No es un reintento a ciegas: el
		//    segundo intento sólo ocurre si el valor NO quedó escrito.
		const { combined, compact } = this.parseExpiryParts(card.expiry);
		await this.fillWebInputField(SEL.nativeExpiry, combined).catch(() => false);
		if (!(await this.hasDigits(SEL.nativeExpiry, 4))) {
			console.warn(
				`[DriverTripPaymentScreen] #cardExpirationDate quedó vacío con "${combined}" — reintentando compacto "${compact}".`
			);
			await this.fillWebInputField(SEL.nativeExpiry, compact).catch(() => false);
		}

		// 3) CVV / código de seguridad.
		await this.fillWebInputField(SEL.nativeCvc, digits(card.cvc)).catch(() => false);

		// 4) Titular (sólo si el caso lo trae — el dato es del fixture de la pasarela).
		if (card.holderName) {
			await this.fillWebInputField(SEL.nativeHolder, card.holderName).catch(() => false);
		}

		// 5) Código postal SÓLO si el campo existe: el probe del driver no lo vio, el del pasajero sí.
		//    No se asume obligatorio (`postal` tampoco existe en todas las pasarelas).
		if (card.postal && (await this.findAnyElement(SEL.nativeZip.join(', ')))) {
			await this.fillWebInputField(SEL.nativeZip, card.postal).catch(() => false);
		}

		await driver.pause(500);
		const state = await this.readNativeFormState();
		console.log(
			`[DriverTripPaymentScreen] form NATIVO credit-card-payment-data completado (tarjeta ${number.slice(-4)}): ${JSON.stringify(state)}`
		);
	}

	/** Espera a que alguno de `selectors` exista en el DOM (reveal progresivo). No lanza. */
	private async waitForNativeField(selectors: readonly string[], timeout: number): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;
		const joined = selectors.join(', ');
		while (Date.now() < deadline) {
			if (await this.findAnyElement(joined)) return true;
			await driver.pause(400);
		}
		return false;
	}

	/** ¿El primer campo que resuelva de `selectors` tiene al menos `min` dígitos? (readback). */
	private async hasDigits(selectors: readonly string[], min: number): Promise<boolean> {
		const state = await this.readFieldValue(selectors);
		return state.replace(/\D/g, '').length >= min;
	}

	/** Valor actual del primer campo que resuelva de `selectors` ('' si no existe). */
	private async readFieldValue(selectors: readonly string[]): Promise<string> {
		return this.executeInWebView((sels: string[]) => {
			for (const sel of sels) {
				const node = document.querySelector(sel) as HTMLInputElement | null;
				if (node) return String(node.value ?? '');
			}
			return '';
		}, selectors).catch(() => '');
	}

	/**
	 * Radiografía del form NATIVO: valor + validez por campo, clases del `<form>`, señales de
	 * cobro (`.header.end span.title` ⇒ válido / `span.invalid-charge` ⇒ inválido, medidas por
	 * `scripts/driver-charge-from-resume.ts`) y estado del botón COBRAR. Alimenta el log del fill y
	 * el mensaje de error de `submitPayment` — que es EXACTAMENTE donde el flujo moría a ciegas.
	 */
	private async readNativeFormState(): Promise<NativeFormState> {
		const groups: Array<[string, readonly string[]]> = [
			['cardNumber', SEL.nativeNumber],
			['cardExpirationDate', SEL.nativeExpiry],
			['securityCode', SEL.nativeCvc],
			['cardholderName', SEL.nativeHolder],
			['zipCode', SEL.nativeZip]
		];

		return this.executeInWebView(
			(entries: Array<[string, readonly string[]]>, cobrarSel: string) => {
				const fields: Record<string, { found: boolean; value: string; invalid: boolean }> = {};
				for (const [name, sels] of entries) {
					let node: HTMLInputElement | null = null;
					for (const sel of sels) {
						node = document.querySelector(sel) as HTMLInputElement | null;
						if (node) break;
					}
					if (!node) {
						fields[name] = { found: false, value: '', invalid: false };
						continue;
					}
					const host = (node.closest('ion-input') ?? node) as HTMLElement;
					fields[name] = {
						found: true,
						value: String(node.value ?? ''),
						invalid: /\b(ng-invalid|ion-invalid)\b/.test(host.className)
					};
				}

				const form = document.querySelector('credit-card-payment-data form') as HTMLElement | null;
				const button = document.querySelector(cobrarSel) as HTMLButtonElement | null;

				return {
					form: form ? form.className : '<no-form>',
					fields,
					chargeValidVisible: Array.from(document.querySelectorAll('.header.end span.title')).some(s =>
						/cobrar/i.test((s as HTMLElement).innerText || '')
					),
					chargeInvalidVisible: !!document.querySelector('span.invalid-charge'),
					submit: {
						found: !!button,
						disabled: button ? button.disabled || button.getAttribute('disabled') !== null : true,
						text: button ? String(button.innerText ?? '').trim() : ''
					}
				};
			},
			groups,
			SEL.cobrar
		).catch(
			(): NativeFormState => ({
				form: '<unavailable>',
				fields: {},
				chargeValidVisible: false,
				chargeInvalidVisible: false,
				submit: { found: false, disabled: true, text: '' }
			})
		);
	}

	/**
	 * Escribe `value` en el input del iframe Stripe identificado por `iframeSelector` (title).
	 * Vuelve al top del WebView al terminar. Typing REAL (addValue) — Stripe escucha key events.
	 */
	private async typeInStripeIframe(iframeSelector: string, value: string): Promise<boolean> {
		const driver = this.getDriver();
		const anyDriver = driver as unknown as {
			switchFrame?: (el: unknown) => Promise<void>;
			switchToFrame?: (el: unknown) => Promise<void>;
		};
		const enter = async (el: unknown): Promise<void> => {
			if (typeof anyDriver.switchFrame === 'function') {
				await anyDriver.switchFrame(el);
				return;
			}
			if (typeof anyDriver.switchToFrame === 'function') {
				await anyDriver.switchToFrame(el);
				return;
			}
			throw new Error('switchFrame/switchToFrame no disponible');
		};

		await this.switchToWebView();
		await enter(null).catch(() => undefined); // GARANTIZAR top-frame antes de buscar el iframe
		const frame = driver.$(iframeSelector);
		if (
			!(await frame
				.waitForExist({ timeout: 8_000 })
				.then(() => true)
				.catch(() => false))
		) {
			console.warn(`[DriverTripPaymentScreen] iframe no encontrado: ${iframeSelector}`);
			return false;
		}
		try {
			await enter(frame);
			const input = driver.$(SEL.stripeInput);
			await input.waitForExist({ timeout: 6_000 });
			await input.click().catch(() => undefined);
			// addValue = typing real (NO retry por-valor: re-tipear en Stripe hace append → inválido).
			await input.addValue(value);
			return true;
		} catch (e) {
			console.warn(
				`[DriverTripPaymentScreen] typeInStripeIframe(${iframeSelector}) error:`,
				e instanceof Error ? e.message : e
			);
			return false;
		} finally {
			await enter(null).catch(() => undefined); // volver al top-frame para el próximo campo
		}
	}

	/**
	 * Tap COBRAR (`credit-card-payment-data button.btn.primary`, texto ` COBRAR `). Espera a que
	 * deje de estar `disabled` — el botón arranca deshabilitado y la app lo habilita sólo con el
	 * form válido, así que el click nunca se fuerza.
	 *
	 * Si se agota el tiempo, el error incluye la RADIOGRAFÍA del form (`readNativeFormState`): qué
	 * campo no se montó, cuál quedó vacío y cuál quedó `ng-invalid`. Sin eso el fallo era un
	 * "quedó deshabilitado" ciego, y cada reintento cuesta un viaje real.
	 */
	async submitPayment(enableTimeout = 12_000): Promise<void> {
		const driver = this.getDriver();
		await this.switchToWebView();

		const deadline = Date.now() + enableTimeout;
		while (Date.now() < deadline) {
			const state = await driver
				.execute<{ found: boolean; disabled: boolean }, [string]>(sel => {
					const b = document.querySelector(sel) as HTMLButtonElement | null;
					if (!b) return { found: false, disabled: true };
					return { found: true, disabled: b.disabled || b.getAttribute('disabled') !== null };
				}, SEL.cobrar)
				.catch(() => ({ found: false, disabled: true }));

			if (state.found && !state.disabled) {
				await driver
					.execute<boolean, [string]>(sel => {
						const b = document.querySelector(sel) as HTMLElement | null;
						if (b) {
							b.click();
							return true;
						}
						return false;
					}, SEL.cobrar)
					.catch(() => false);
				console.log('[DriverTripPaymentScreen] COBRAR tapeado');
				return;
			}
			await driver.pause(500);
		}

		const state = await this.readNativeFormState();
		const culprits = Object.entries(state.fields)
			.filter(([, f]) => f.found && (f.invalid || f.value.length === 0))
			.map(([name, f]) => `${name}(value="${f.value}"${f.invalid ? ',ng-invalid' : ',vacío'})`);
		const missing = Object.entries(state.fields)
			.filter(([, f]) => !f.found)
			.map(([name]) => name);

		throw new Error(
			`[DriverTripPaymentScreen] COBRAR quedó deshabilitado en ${enableTimeout}ms (form inválido/incompleto). ` +
				`form="${state.form}" | campos inválidos/vacíos: ${culprits.length ? culprits.join(', ') : 'ninguno'} ` +
				`| campos NO montados: ${missing.length ? missing.join(', ') : 'ninguno'} ` +
				`| señales: chargeValid=${state.chargeValidVisible} chargeInvalid=${state.chargeInvalidVisible} ` +
				`| botón: ${JSON.stringify(state.submit)}`
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
				.execute<PaymentOutcome | null, [string, string]>(
					(attentionSel, alertSel) => {
						const norm = (v: unknown) =>
							String(v ?? '')
								.toLowerCase()
								.trim();

						// Alert bloqueante app-alert-modal (Viaje perdido / Cancelado).
						const alertEl = document.querySelector(alertSel) as HTMLElement | null;
						if (alertEl) {
							const t = norm(alertEl.innerText ?? alertEl.textContent);
							if (/perdid|cancelad|expir/i.test(t))
								return { status: 'trip-lost', reason: t.slice(0, 200) };
						}

						// Attention modal (decline / error de cobro).
						const modal = document.querySelector(attentionSel) as HTMLElement | null;
						if (modal) {
							const t = norm(modal.innerText ?? modal.textContent);
							if (/perdid|cancelad|expir/i.test(t))
								return { status: 'trip-lost', reason: t.slice(0, 200) };
							return { status: 'declined', reason: t.slice(0, 200) || 'attention-modal' };
						}
						return null;
					},
					SEL.attentionModal,
					SEL.blockingAlert
				)
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
					return (
						(Array.from(document.querySelectorAll('button, [role="button"]')) as HTMLElement[]).find(b =>
							/aceptar|captar|cerrar|ok|salir/i.test(b.textContent ?? '')
						) ?? null
					);
				};
				const btn = pick();
				if (btn) {
					btn.click();
					return true;
				}
				return false;
			})
			.catch(() => false);
	}

	/**
	 * SINGLE-PASS: si el challenge 3DS de Stripe está presente (en el top o en algún iframe
	 * anidado), clickea el botón COMPLETE (`#test-source-authorize-3ds`) o FAIL
	 * (`#test-source-fail-3ds`) y devuelve true. Si no está presente, devuelve false (para que
	 * el state-machine externo siga poleando). Selectores confirmados por el humano en vivo.
	 */
	async tryComplete3DS(action: 'complete' | 'fail' = 'complete'): Promise<boolean> {
		const driver = this.getDriver();
		const targetId = action === 'complete' ? 'test-source-authorize-3ds' : 'test-source-fail-3ds';
		const wordRe = action === 'complete' ? 'complete|completar|authorize|autoriz' : 'fail|rechaz';

		const anyDriver = driver as unknown as {
			switchFrame?: (el: unknown) => Promise<void>;
			switchToFrame?: (el: unknown) => Promise<void>;
		};
		const enter = async (el: unknown): Promise<void> => {
			if (typeof anyDriver.switchFrame === 'function') {
				await anyDriver.switchFrame(el);
				return;
			}
			if (typeof anyDriver.switchToFrame === 'function') {
				await anyDriver.switchToFrame(el);
				return;
			}
		};
		const clickHere = async (): Promise<boolean> =>
			driver
				.execute<boolean, [string, string]>(
					(id, re) => {
						const byId = document.getElementById(id) as HTMLElement | null;
						if (byId && byId.offsetParent !== null) {
							byId.click();
							return true;
						}
						const rx = new RegExp(re, 'i');
						const els = Array.from(
							document.querySelectorAll(
								'button, [role="button"], a, input[type="button"], input[type="submit"]'
							)
						) as HTMLElement[];
						const m = els.find(
							b =>
								b.offsetParent !== null &&
								(rx.test(b.textContent ?? '') || rx.test((b as HTMLInputElement).value ?? ''))
						);
						if (m) {
							m.click();
							return true;
						}
						return false;
					},
					targetId,
					wordRe
				)
				.catch(() => false);

		await this.switchToWebView(2_000);
		if (await clickHere()) return true;

		const iframeCount = await driver
			.execute<number, []>(() => document.querySelectorAll('iframe').length)
			.catch(() => 0);
		for (let i = 0; i < iframeCount; i++) {
			try {
				await enter(null);
				await this.switchToWebView(800);
				const frame = driver.$(`iframe:nth-of-type(${i + 1})`);
				if (!(await frame.isExisting().catch(() => false))) continue;
				await enter(frame);
				if (await clickHere()) {
					await enter(null);
					return true;
				}
				const inner = driver.$('iframe');
				if (await inner.isExisting().catch(() => false)) {
					await enter(inner);
					if (await clickHere()) {
						await enter(null);
						return true;
					}
				}
			} catch {
				/* siguiente iframe */
			} finally {
				await enter(null).catch(() => undefined);
			}
		}
		return false;
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
		const completeTexts = [
			'complete authentication',
			'complete auth',
			'complete',
			'completar',
			'authorize test payment',
			'authorize',
			'autenticar',
			'finish',
			'submit'
		];
		const failTexts = ['fail authentication', 'fail auth', 'fail', 'rechazar', 'cancel', 'cancelar'];
		const wanted = action === 'complete' ? completeTexts : failTexts;

		const anyDriver = driver as unknown as {
			switchFrame?: (el: unknown) => Promise<void>;
			switchToFrame?: (el: unknown) => Promise<void>;
		};
		const enter = async (el: unknown): Promise<void> => {
			if (typeof anyDriver.switchFrame === 'function') {
				await anyDriver.switchFrame(el);
				return;
			}
			if (typeof anyDriver.switchToFrame === 'function') {
				await anyDriver.switchToFrame(el);
				return;
			}
		};

		const tryClickInCurrentFrame = async (): Promise<boolean> =>
			driver
				.execute<boolean, [string[]]>(texts => {
					const norm = (v: unknown) =>
						String(v ?? '')
							.replace(/\s+/g, ' ')
							.trim()
							.toLowerCase();
					const els = Array.from(
						document.querySelectorAll(
							'button, [role="button"], a, input[type="button"], input[type="submit"]'
						)
					) as HTMLElement[];
					const m = els.find(
						b =>
							(b as HTMLElement).offsetParent !== null &&
							texts.some(
								t => norm(b.textContent).includes(t) || norm((b as HTMLInputElement).value).includes(t)
							)
					);
					if (m) {
						m.click();
						return true;
					}
					return false;
				}, wanted)
				.catch(() => false);

		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			await this.switchToWebView(3_000);
			// 1) Intento en el documento top.
			if (await tryClickInCurrentFrame()) {
				console.log(`[DriverTripPaymentScreen] 3DS ${action} (top frame)`);
				return;
			}

			// 2) Recorrer iframes (incluye stripe challenge/acs anidados).
			const iframeCount = await driver
				.execute<number, []>(() => document.querySelectorAll('iframe').length)
				.catch(() => 0);
			for (let i = 0; i < iframeCount; i++) {
				try {
					await enter(null); // top
					await this.switchToWebView(1_000);
					const frame = driver.$(`iframe:nth-of-type(${i + 1})`);
					if (!(await frame.isExisting().catch(() => false))) continue;
					await enter(frame);
					if (await tryClickInCurrentFrame()) {
						console.log(`[DriverTripPaymentScreen] 3DS ${action} (iframe ${i})`);
						await enter(null);
						return;
					}
					// challenge suele estar 1 nivel más adentro
					const inner = driver.$('iframe');
					if (await inner.isExisting().catch(() => false)) {
						await enter(inner);
						if (await tryClickInCurrentFrame()) {
							console.log(`[DriverTripPaymentScreen] 3DS ${action} (iframe ${i}>inner)`);
							await enter(null);
							return;
						}
					}
				} catch {
					/* seguir con el próximo iframe */
				} finally {
					await enter(null).catch(() => undefined);
				}
			}
			await driver.pause(700);
		}
		console.warn(
			`[DriverTripPaymentScreen] 3DS ${action}: no se encontró el botón de challenge en ${timeout}ms (TODO[device]: confirmar selector con debugger).`
		);
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
			if (typeof anyDriver.switchFrame === 'function') {
				await anyDriver.switchFrame(el);
				return;
			}
			if (typeof anyDriver.switchToFrame === 'function') {
				await anyDriver.switchToFrame(el);
				return;
			}
			throw new Error('switchFrame/switchToFrame no disponible en el driver');
		};
		try {
			await enter(frame);
			return await fn();
		} finally {
			try {
				await enter(null);
			} catch {
				/* noop */
			}
		}
	}
}
