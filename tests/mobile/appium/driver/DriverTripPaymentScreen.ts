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
	// Botón COBRAR (WebView MAGIIS, fuera del iframe) — selector real del build.
	cobrar: 'credit-card-payment-data ion-content form button, credit-card-payment-data button.btn.primary',
	// Resultado / alerts.
	attentionModal: 'ion-modal.alert-modal-atention.show-modal',
	blockingAlert: 'app-alert-modal'
} as const;

// ── RAMA NATIVA (sin Stripe) ──────────────────────────────────────────────────────────────────
//
// DOS hechos medidos el 2026-07-29 gobiernan estos selectores (dumps
// `evidence/dom-dump/driver-cargo-decline-failure-2026-07-29T23-05-50-769Z.txt` y `…T23-28-12-884Z.txt`):
//
//  1. `id` / `formcontrolname` / `data-checkout` viven en el HOST `<ion-input>`, NO en el `<input>`
//     interno:
//         <ion-input formcontrolname="cardNumber" id="cardNumber" data-checkout="cardNumber" …>
//           <input class="native-input sc-ion-input-md" placeholder="Número de tarjeta" required>
//         </ion-input>
//     ⇒ `input#cardNumber` y `input[formcontrolname="cardNumber"]` NO matchean NADA. Hay que
//     apuntar al host y bajar al input interno — que es exactamente lo que hacen
//     `AppiumSessionBase.setDomValue` (shadow o light DOM) y el probe
//     `scripts/driver-charge-from-resume.ts` (`probe('#cardNumber')` → `h.querySelector('input')`).
//
//  2. Puede haber VARIOS `credit-card-payment-data` montados a la vez, todos con `show-modal`: cada
//     corrida que muere en el cobro deja su `ion-modal` huérfano en el DOM (se observaron
//     `ion-overlay-243` stale + `ion-overlay-256` activo, y los `id` quedan DUPLICADOS). Un
//     `document.querySelector('#cardNumber')` pega en el STALE. ⇒ todo se scopea al overlay
//     TOPMOST vía el marcador de test `data-qa-charge-modal` que pone `markActiveChargeModal()`.
const CHARGE_MODAL_MARK = 'data-qa-charge-modal';
const MARKED = `[${CHARGE_MODAL_MARK}="1"]`;

/**
 * Gracia antes de aceptar un modal de cobro que NO da la señal `has-focus`. Existe para no llenar el
 * form ANTES de que la app termine de (re)abrirlo — `closeTravel → payTravelCreditCard` tarda ~2.5s
 * medidos, así que 6s da margen 2x. Con `has-focus` presente NO se paga nada de esto.
 */
const ACTIVATION_GRACE_MS = 6_000;

/** Variantes de selector del HOST `ion-input` de `name`, RELATIVAS al overlay que las contiene. */
const hostVariantsRaw = (name: string): readonly string[] => [
	`#${name}`,
	`ion-input#${name}`,
	`ion-input[formcontrolname="${name}"]`,
	`ion-input[data-checkout="${name}"]`
];

/** Idem, scopeadas al overlay ACTIVO (marcado) — lo que consume el fill/readback. */
const hostVariants = (name: string): readonly string[] => hostVariantsRaw(name).map(sel => `${MARKED} ${sel}`);

const NATIVE = {
	/** Marcador del overlay de cobro activo (lo setea `markActiveChargeModal`). */
	marked: MARKED,
	/** Host de `cardNumber` SIN scope — para buscar DENTRO de un overlay candidato. */
	numberHostAny: hostVariantsRaw('cardNumber').join(', '),
	number: hostVariants('cardNumber'),
	expiry: hostVariants('cardExpirationDate'),
	cvc: hostVariants('securityCode'),
	holder: hostVariants('cardholderName'),
	/**
	 * El probe del driver NO vio `zipCode` en su modal (sí existe en el form del pasajero) ⇒ se
	 * llena SÓLO si el campo aparece en vivo; no se asume obligatorio.
	 */
	zip: hostVariants('zipCode'),
	/** COBRAR del overlay ACTIVO — sin scopear, pegaría en el botón (disabled eterno) del stale. */
	cobrar: `${MARKED} button.btn.primary`
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

	/**
	 * Detecta el modal de cobro (credit-card-payment-data / iframe Stripe) en el WebView.
	 *
	 * ⚠️ BASELINE DE OVERLAYS STALE (2026-07-29): la app NO desmonta el `ion-modal` del cobro cuando
	 * una corrida muere ahí — quedan varios `credit-card-payment-data` con `show-modal` y los MISMOS
	 * `id` duplicados (medido: `ion-overlay-243` muerto + `ion-overlay-256` vivo). Con el chequeo
	 * "existe alguno" esta función daba `true` en 0.5s contra el modal MUERTO, cuando la app tarda
	 * ~2.5s en abrir el nuevo (`closeTravel → payTravelCreditCard`) ⇒ el fill iba al form equivocado.
	 *
	 * ⚠️ Y la app REUSA el elemento del modal en vez de montar uno nuevo (medido en el run verde de
	 * TC1081, viaje 67755: 3 overlays marcados stale y NUNCA apareció uno nuevo). Por eso la espera
	 * NO puede ser "apareció un overlay NUEVO" — esa condición no se cumple nunca y se comía los 30s
	 * completos antes del fallback, 30s que salen de la ventana CORTA del cobro del conductor.
	 *
	 * La condición real que importa es que el overlay topmost esté **listo para tipear**:
	 *   - `ion-modal` contenedor con `show-modal`;
	 *   - host `#cardNumber` presente, con `<input>` interno NO `readOnly` ni `disabled`
	 *     (`readOnly` es justo lo que probea `scripts/driver-charge-from-resume.ts:161`);
	 *   - y la señal de ACTIVACIÓN `has-focus` en ese host — la app enfoca el campo al abrir el modal,
	 *     y en el dump de 2 overlays sólo el VIVO la tenía (el stale no).
	 *
	 * Con `has-focus` el camino feliz sale en el primer poll. Si el build no autoenfoca, después de
	 * `ACTIVATION_GRACE_MS` se acepta el topmost listo igual (red de seguridad, logueada): esa espera
	 * mínima existe para no llenar el form ANTES de que la app lo re-abra y lo resetee.
	 */
	async waitForPaymentScreen(timeout = 30_000): Promise<boolean> {
		const driver = this.getDriver();
		const started = Date.now();
		const deadline = started + timeout;

		while (Date.now() < deadline) {
			await this.switchToWebView(3_000);
			const graced = Date.now() - started >= ACTIVATION_GRACE_MS;
			const kind = await this.markActiveChargeModal(graced);
			if (kind === 'focused' || kind === 'fresh') return true;
			if (kind === 'graced') {
				console.warn(
					`[DriverTripPaymentScreen] Modal de cobro sin señal has-focus tras ${ACTIVATION_GRACE_MS}ms; se usa el topmost listo.`
				);
				return true;
			}
			const stripeReady = await driver
				.execute<boolean, [string]>(iframeSel => !!document.querySelector(iframeSel), SEL.iframeNumber)
				.catch(() => false);
			if (stripeReady) return true;
			await driver.pause(300);
		}
		return false;
	}

	/**
	 * Marca el overlay de cobro ACTIVO con `data-qa-charge-modal="1"`, para que TODO lo que sigue
	 * (guard de rama, fill, readback, COBRAR) opere sobre el mismo form y nunca sobre un stale.
	 *
	 * Elegibilidad = visible (`ion-modal.show-modal`) **y listo para tipear** (host `#cardNumber` con
	 * `<input>` interno no `readOnly`/`disabled`). Entre los elegibles gana el ÚLTIMO en orden de DOM:
	 * en Ionic el último overlay es el de mayor z-index (medido: 20256 vivo > 20243 muerto).
	 *
	 * Devuelve la CALIDAD de la señal, para que el caller decida si ya puede actuar:
	 *   - `focused`  → tiene `has-focus`: la app acaba de abrirlo. Señal fuerte, actuar ya.
	 *   - `fresh`    → apareció después del baseline (overlay recién montado). Señal fuerte.
	 *   - `graced`   → sólo topmost-listo, sin foco ni novedad; válido recién pasada la gracia.
	 *   - `none`     → nada elegible (p.ej. rama Stripe: no hay `#cardNumber` nativo).
	 *
	 * El marcador es una anotación de TEST sobre el DOM, no un selector de la app (mismo criterio que
	 * el `style.pointerEvents = 'none'` que ya aplica `PassengerWalletScreen`).
	 */
	private async markActiveChargeModal(allowUnfocused = false): Promise<'focused' | 'fresh' | 'graced' | 'none'> {
		return this.executeInWebView(
			(attr: string, permitUnfocused: boolean, numberSel: string) => {
				const all = Array.from(document.querySelectorAll('credit-card-payment-data')) as HTMLElement[];

				const isVisible = (el: HTMLElement): boolean => {
					const overlay = el.closest('ion-modal');
					return overlay ? overlay.classList.contains('show-modal') : el.offsetParent !== null;
				};

				const numberHost = (el: HTMLElement): HTMLElement | null =>
					el.querySelector(numberSel) as HTMLElement | null;

				/** Listo para tipear: hay input interno y no está bloqueado. */
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
		).catch(() => 'none' as const);
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
		if (await this.hasNativeCardForm(10_000)) {
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
	 * ¿El overlay de cobro activo es el form NATIVO? Asegura que haya un overlay marcado como activo
	 * y verifica que exponga el HOST `#cardNumber`. Poleado: que el `credit-card-payment-data` exista
	 * no implica que sus `ion-input` ya estén hidratados.
	 *
	 * La detección va por `driver.execute` + `document.querySelector` y NO por `$$` de WebdriverIO:
	 * es la mecánica que TODO el resto del camino driver usa con éxito en este WebView
	 * (`jsTapActive`, `selectCreditCardMethod`, el probe `driver-charge-from-resume`).
	 */
	private async hasNativeCardForm(timeout: number): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			if ((await this.markActiveChargeModal(true)) !== 'none' && (await this.existsInWebView(NATIVE.number))) {
				return true;
			}
			await driver.pause(400);
		}
		return false;
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
		if (!(await this.fillWebInputField(NATIVE.number, number).catch(() => false))) {
			throw new Error(
				'[DriverTripPaymentScreen] No se pudo llenar #cardNumber en el form NATIVO ' +
					`(selectores: ${NATIVE.number.join(', ')}).`
			);
		}
		// Reveal progresivo: esperar a que el campo de vencimiento se MONTE (ng-if false → true) en
		// vez de dormir a ciegas. El fixed-pause de 2.5s de la receta del pasajero queda como piso
		// (la marca puede tardar en resolverse) y como techo el poll — si no monta, el diagnóstico de
		// `submitPayment` va a nombrar el campo faltante.
		await driver.pause(2_500);
		await this.waitForNativeField(NATIVE.expiry, 8_000);

		// 2) Vencimiento MM/AA. Se verifica por READBACK y, si la máscara del campo rechazó el
		//    formato con barra, se reintenta compacto (MMAA). No es un reintento a ciegas: el
		//    segundo intento sólo ocurre si el valor NO quedó escrito.
		const { combined, compact } = this.parseExpiryParts(card.expiry);
		await this.fillWebInputField(NATIVE.expiry, combined).catch(() => false);
		if (!(await this.hasDigits(NATIVE.expiry, 4))) {
			console.warn(
				`[DriverTripPaymentScreen] #cardExpirationDate quedó vacío con "${combined}" — reintentando compacto "${compact}".`
			);
			await this.fillWebInputField(NATIVE.expiry, compact).catch(() => false);
		}

		// 3) CVV / código de seguridad.
		await this.fillWebInputField(NATIVE.cvc, digits(card.cvc)).catch(() => false);

		// 4) Titular (sólo si el caso lo trae — el dato es del fixture de la pasarela).
		if (card.holderName) {
			await this.fillWebInputField(NATIVE.holder, card.holderName).catch(() => false);
		}

		// 5) Código postal SÓLO si el campo existe: el probe del driver no lo vio, el del pasajero sí.
		//    No se asume obligatorio (`postal` tampoco existe en todas las pasarelas).
		if (card.postal && (await this.existsInWebView(NATIVE.zip))) {
			await this.fillWebInputField(NATIVE.zip, card.postal).catch(() => false);
		}

		await driver.pause(500);
		const state = await this.readNativeFormState();
		console.log(
			`[DriverTripPaymentScreen] form NATIVO credit-card-payment-data completado (tarjeta ${number.slice(-4)}): ${JSON.stringify(state)}`
		);
	}

	/** ¿Alguno de `selectors` existe en el documento? (in-document, no `$$` de WebdriverIO). */
	private async existsInWebView(selectors: readonly string[]): Promise<boolean> {
		return this.executeInWebView((sel: string) => !!document.querySelector(sel), selectors.join(', ')).catch(
			() => false
		);
	}

	/** Espera a que alguno de `selectors` exista en el DOM (reveal progresivo). No lanza. */
	private async waitForNativeField(selectors: readonly string[], timeout: number): Promise<boolean> {
		const driver = this.getDriver();
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			if (await this.existsInWebView(selectors)) return true;
			await driver.pause(400);
		}
		return false;
	}

	/** ¿El primer campo que resuelva de `selectors` tiene al menos `min` dígitos? (readback). */
	private async hasDigits(selectors: readonly string[], min: number): Promise<boolean> {
		const state = await this.readFieldValue(selectors);
		return state.replace(/\D/g, '').length >= min;
	}

	/**
	 * Valor actual del primer campo que resuelva de `selectors` ('' si no existe). Los selectores
	 * apuntan al HOST `ion-input`, así que hay que bajar al `<input>` interno (shadow o light DOM):
	 * la property `value` del host no siempre refleja lo que ve el FormControl.
	 */
	private async readFieldValue(selectors: readonly string[]): Promise<string> {
		return this.executeInWebView((sels: string[]) => {
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
	 * Radiografía del form NATIVO: valor + validez por campo, clases del `<form>`, señales de
	 * cobro (`.header.end span.title` ⇒ válido / `span.invalid-charge` ⇒ inválido, medidas por
	 * `scripts/driver-charge-from-resume.ts`) y estado del botón COBRAR. Alimenta el log del fill y
	 * el mensaje de error de `submitPayment` — que es EXACTAMENTE donde el flujo moría a ciegas.
	 */
	private async readNativeFormState(): Promise<NativeFormState> {
		const groups: Array<[string, readonly string[]]> = [
			['cardNumber', NATIVE.number],
			['cardExpirationDate', NATIVE.expiry],
			['securityCode', NATIVE.cvc],
			['cardholderName', NATIVE.holder],
			['zipCode', NATIVE.zip]
		];

		return this.executeInWebView(
			(entries: Array<[string, readonly string[]]>, markedSel: string, cobrarFallback: string) => {
				// Todo lo que se lee va scopeado al overlay ACTIVO (marcado); sin eso, con un modal
				// stale en el DOM el diagnóstico describiría el form MUERTO y mandaría al analista
				// a perseguir un fantasma.
				const scope = (document.querySelector(markedSel) ?? document) as ParentNode;
				const fields: Record<string, { found: boolean; value: string; invalid: boolean }> = {};
				for (const [name, sels] of entries) {
					let host: (HTMLElement & { shadowRoot?: ShadowRoot | null }) | null = null;
					for (const sel of sels) {
						host = document.querySelector(sel) as (HTMLElement & { shadowRoot?: ShadowRoot | null }) | null;
						if (host) break;
					}
					if (!host) {
						fields[name] = { found: false, value: '', invalid: false };
						continue;
					}
					const inner = (
						host.matches('input, textarea')
							? host
							: (host.shadowRoot?.querySelector('input, textarea') ??
								host.querySelector('input, textarea'))
					) as HTMLInputElement | null;
					fields[name] = {
						found: true,
						value: String(inner?.value ?? ''),
						invalid: /\b(ng-invalid|ion-invalid)\b/.test(host.className)
					};
				}

				const form = scope.querySelector('form') as HTMLElement | null;
				const button = (scope.querySelector('button.btn.primary') ??
					document.querySelector(cobrarFallback)) as HTMLButtonElement | null;

				return {
					form: form ? form.className : '<no-form>',
					fields,
					chargeValidVisible: Array.from(scope.querySelectorAll('.header.end span.title')).some(s =>
						/cobrar/i.test((s as HTMLElement).innerText || '')
					),
					chargeInvalidVisible: !!scope.querySelector('span.invalid-charge'),
					submit: {
						found: !!button,
						disabled: button ? button.disabled || button.getAttribute('disabled') !== null : true,
						text: button ? String(button.innerText ?? '').trim() : ''
					}
				};
			},
			groups,
			NATIVE.marked,
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

		// El COBRAR del overlay ACTIVO primero (`NATIVE.cobrar`), con el selector histórico como
		// fallback para la rama Stripe. Sin el scope, con un modal de cobro stale en el DOM se
		// poleaba el botón del modal MUERTO — disabled para siempre ⇒ timeout garantizado.
		const deadline = Date.now() + enableTimeout;
		while (Date.now() < deadline) {
			const state = await driver
				.execute<{ found: boolean; disabled: boolean }, [string, string]>(
					(activeSel, fallbackSel) => {
						const b = (document.querySelector(activeSel) ??
							document.querySelector(fallbackSel)) as HTMLButtonElement | null;
						if (!b) return { found: false, disabled: true };
						return { found: true, disabled: b.disabled || b.getAttribute('disabled') !== null };
					},
					NATIVE.cobrar,
					SEL.cobrar
				)
				.catch(() => ({ found: false, disabled: true }));

			if (state.found && !state.disabled) {
				await driver
					.execute<boolean, [string, string]>(
						(activeSel, fallbackSel) => {
							const b = (document.querySelector(activeSel) ??
								document.querySelector(fallbackSel)) as HTMLElement | null;
							if (b) {
								b.click();
								return true;
							}
							return false;
						},
						NATIVE.cobrar,
						SEL.cobrar
					)
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
