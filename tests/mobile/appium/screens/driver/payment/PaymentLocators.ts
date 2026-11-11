/**
 * Locators y constantes del modal de cobro a bordo (`credit-card-payment-data`).
 *
 * Hechos medidos (dumps 2026-07-21 y 2026-07-29, `evidence/dom-dump/`):
 *  1. Rama NATIVA: `id`/`formcontrolname`/`data-checkout` viven en el HOST `<ion-input>`, no en el
 *     `<input>` interno => hay que apuntar al host y bajar al input interno.
 *  2. Pueden coexistir VARIOS `credit-card-payment-data` con `show-modal` (cada corrida que muere en
 *     el cobro deja su overlay huérfano y los `id` quedan duplicados) => todo se scopea al overlay
 *     TOPMOST vía el marcador de test `data-qa-charge-modal`.
 *  3. Rama STRIPE: cada campo en SU propio iframe `__privateStripeFrame`, identificado por `title`
 *     (texto i18n de Stripe en ES; deuda: depende del locale del WebView).
 */

export const CHARGE_MODAL_MARK = 'data-qa-charge-modal';
export const MARKED = `[${CHARGE_MODAL_MARK}="1"]`;

/**
 * Gracia antes de aceptar un modal de cobro que NO da la señal `has-focus`: `closeTravel ->
 * payTravelCreditCard` tarda ~2.5 s medidos, 6 s da margen 2x.
 */
export const ACTIVATION_GRACE_MS = 6_000;

export const SEL = {
	modal: 'credit-card-payment-data',
	iframeNumber: 'iframe[title="Cuadro de entrada seguro del número de tarjeta"]',
	iframeExpiry: 'iframe[title="Cuadro de entrada seguro de la fecha de vencimiento"]',
	iframeCvc: 'iframe[title="Cuadro de entrada seguro del CVC"]',
	// Dentro de cada iframe hay un input DECOY oculto (`StripeField--fake`): targetear el real.
	stripeInput: 'input.InputElement, input:not(.StripeField--fake):not([aria-hidden="true"]):not([disabled])',
	// Botón COBRAR (fuera del iframe) — selector histórico, fallback de la rama Stripe.
	cobrar: 'credit-card-payment-data ion-content form button, credit-card-payment-data button.btn.primary',
	attentionModal: 'ion-modal.alert-modal-atention.show-modal',
	blockingAlert: 'app-alert-modal'
} as const;

/** Variantes del HOST `ion-input` de `name`, relativas al overlay que las contiene. */
const hostVariantsRaw = (name: string): readonly string[] => [
	`#${name}`,
	`ion-input#${name}`,
	`ion-input[formcontrolname="${name}"]`,
	`ion-input[data-checkout="${name}"]`
];

/** Idem, scopeadas al overlay ACTIVO (marcado). */
const hostVariants = (name: string): readonly string[] => hostVariantsRaw(name).map(sel => `${MARKED} ${sel}`);

export const NATIVE = {
	marked: MARKED,
	/** Host de `cardNumber` SIN scope — para buscar DENTRO de un overlay candidato. */
	numberHostAny: hostVariantsRaw('cardNumber').join(', '),
	number: hostVariants('cardNumber'),
	expiry: hostVariants('cardExpirationDate'),
	cvc: hostVariants('securityCode'),
	holder: hostVariants('cardholderName'),
	/** El probe del driver no vio `zipCode`: se llena SÓLO si aparece en vivo. */
	zip: hostVariants('zipCode'),
	/** COBRAR del overlay ACTIVO — sin scopear pegaría en el botón (disabled eterno) del stale. */
	cobrar: `${MARKED} button.btn.primary`
} as const;

/** Campos que se diagnostican en `NativeCardFormScreen.readFormState`. */
export const NATIVE_FIELD_GROUPS: ReadonlyArray<readonly [string, readonly string[]]> = [
	['cardNumber', NATIVE.number],
	['cardExpirationDate', NATIVE.expiry],
	['securityCode', NATIVE.cvc],
	['cardholderName', NATIVE.holder],
	['zipCode', NATIVE.zip]
];
