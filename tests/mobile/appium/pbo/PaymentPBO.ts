/**
 * PaymentPBO — cobro de un viaje por el chofer (Cargo a Bordo) con resultado tipado. Compone las
 * screens de `screens/driver/payment/*`; NO tiene locators ni selectores.
 *
 * Alcance real hoy: medio TARJETA (rama NATIVA y rama STRIPE, elegidas por PRESENCIA del campo nativo,
 * no por nombre de pasarela) + 3DS de Stripe + lectura del resultado. Efectivo y cuenta corriente no
 * tienen código en `DriverTripPaymentScreen` (el cierre sin tarjeta no pasa por este modal); se suman
 * como `chargeWith*` cuando exista su screen, sin tocar lo de acá.
 *
 * Los saltos de espera fijos (`REVEAL_FLOOR_MS`, etc.) preservan los tiempos validados en device de la
 * clase original: son piso de estabilización de la app, no sincronización.
 */

import type { MobileSession } from '../core/MobileSession';
import { sleep, tryUntil } from '../core/Waits';
import { ChallengeFrameScreen, type ChallengeFrame } from '../screens/driver/payment/ChallengeFrameScreen';
import { ChargeModalScreen } from '../screens/driver/payment/ChargeModalScreen';
import { ChargeSubmitScreen } from '../screens/driver/payment/ChargeSubmitScreen';
import { NativeCardFormScreen } from '../screens/driver/payment/NativeCardFormScreen';
import { PaymentResultScreen } from '../screens/driver/payment/PaymentResultScreen';
import { StripeCardFormScreen, type StripeCardFields } from '../screens/driver/payment/StripeCardFormScreen';
import type {
	CardData,
	CardFormBranch,
	ChallengeAction,
	NativeFormState,
	PaymentOutcome
} from '../screens/driver/payment/PaymentTypes';

/** Piso tras tipear el número: la marca tarda en resolverse y recién ahí se monta el resto del form. */
const REVEAL_FLOOR_MS = 2_500;
const EXPIRY_MOUNT_TIMEOUT_MS = 8_000;
const NATIVE_DETECT_TIMEOUT_MS = 10_000;
const STRIPE_AFTER_NUMBER_MS = 400;
const STRIPE_AFTER_EXPIRY_MS = 300;
const READBACK_SETTLE_MS = 500;
/** Defaults históricos del form Stripe (la rama nativa NO los usa). */
const DEFAULT_STRIPE_HOLDER = 'RESTREPO EMANUEL';
const DEFAULT_STRIPE_POSTAL = '1234567';

export class CardNumberFillError extends Error {
	constructor(readonly branch: CardFormBranch) {
		super(
			branch === 'native'
				? '[PaymentPBO] No se pudo llenar #cardNumber en el form NATIVO.'
				: '[PaymentPBO] No se pudo llenar el número (iframe Stripe). Verificar title del iframe.'
		);
		this.name = 'CardNumberFillError';
	}
}

/** COBRAR siguió deshabilitado: el mensaje incluye la radiografía del form (campo vacío/inválido/no montado). */
export class ChargeButtonDisabledError extends Error {
	constructor(
		readonly enableTimeoutMs: number,
		readonly formState: NativeFormState
	) {
		super(describeDisabledButton(enableTimeoutMs, formState));
		this.name = 'ChargeButtonDisabledError';
	}
}

export type ChargeResult = {
	method: 'card';
	/** Últimos 4 dígitos (nunca el PAN completo). */
	last4: string;
	branch: CardFormBranch;
	outcome: PaymentOutcome;
};

export type ChargeOptions = { outcomeTimeoutMs?: number; enableTimeoutMs?: number };

export type PaymentPboDeps = {
	modal: Pick<ChargeModalScreen, 'waitUntilShown' | 'alignToTopFrame' | 'exposesNativeForm'>;
	native: Pick<
		NativeCardFormScreen,
		| 'fillNumber'
		| 'fillExpiry'
		| 'fillCvc'
		| 'fillHolder'
		| 'fillPostal'
		| 'hasPostalField'
		| 'waitForExpiryMounted'
		| 'expiryDigitCount'
		| 'readFormState'
	>;
	stripe: StripeCardFields;
	submit: Pick<ChargeSubmitScreen, 'readState' | 'tap'>;
	result: Pick<PaymentResultScreen, 'readVisibleOutcome' | 'dismiss'>;
	challenge: ChallengeFrame;
};

export type PaymentPboRuntime = {
	log: (message: string) => void;
	warn: (message: string) => void;
	/** Pausa de estabilización (inyectable: en unit es instantánea). */
	settle: (ms: number) => Promise<void>;
	/** Tope para detectar el form nativo antes de caer a Stripe (default 10 s). */
	nativeDetectTimeoutMs?: number;
};

/** Vencimiento `MM/YY` o `MM/YYYY` en sus variantes. Fail-fast si no matchea. */
export function parseExpiry(expiry: string): { combined: string; compact: string } {
	const match = expiry
		.trim()
		.replace(/\s+/g, '')
		.match(/^(\d{1,2})\/(\d{2}|\d{4})$/);
	if (!match) throw new Error(`Invalid card expiry "${expiry}". Expected MM/YY or MM/YYYY.`);
	const month = match[1].padStart(2, '0');
	const year = match[2].slice(-2);
	return { combined: `${month}/${year}`, compact: `${month}${year}` };
}

export function describeDisabledButton(enableTimeoutMs: number, state: NativeFormState): string {
	const culprits = Object.entries(state.fields)
		.filter(([, f]) => f.found && (f.invalid || f.value.length === 0))
		.map(([name, f]) => `${name}(value="${f.value}"${f.invalid ? ',ng-invalid' : ',vacío'})`);
	const missing = Object.entries(state.fields)
		.filter(([, f]) => !f.found)
		.map(([name]) => name);
	return (
		`[PaymentPBO] COBRAR quedó deshabilitado en ${enableTimeoutMs}ms (form inválido/incompleto). ` +
		`form="${state.form}" | campos inválidos/vacíos: ${culprits.length ? culprits.join(', ') : 'ninguno'} ` +
		`| campos NO montados: ${missing.length ? missing.join(', ') : 'ninguno'} ` +
		`| señales: chargeValid=${state.chargeValidVisible} chargeInvalid=${state.chargeInvalidVisible} ` +
		`| botón: ${JSON.stringify(state.submit)}`
	);
}

export class PaymentPBO {
	constructor(
		private readonly deps: PaymentPboDeps,
		private readonly out: PaymentPboRuntime = {
			log: m => console.log(m),
			warn: m => console.warn(m),
			settle: sleep
		}
	) {}

	/** PBO real sobre una `MobileSession` (cada screen recibe la misma sesión). */
	static forSession(session: MobileSession, out?: PaymentPboRuntime): PaymentPBO {
		return new PaymentPBO(
			{
				modal: new ChargeModalScreen(session),
				native: new NativeCardFormScreen(session),
				stripe: new StripeCardFormScreen(session),
				submit: new ChargeSubmitScreen(session),
				result: new PaymentResultScreen(session),
				challenge: new ChallengeFrameScreen(session)
			},
			out
		);
	}

	/** Espera a que el modal de cobro esté listo para tipear. `false` si vence el timeout. */
	async waitForChargeModal(timeoutMs = 30_000): Promise<boolean> {
		const readiness = await this.deps.modal.waitUntilShown(timeoutMs);
		if (readiness === 'ready-after-grace') {
			this.out.warn('[PaymentPBO] Modal de cobro sin señal has-focus tras la gracia; se usa el topmost listo.');
		}
		return readiness !== 'timeout';
	}

	/** Llena la tarjeta; la rama se elige por PRESENCIA del campo nativo. Devuelve la rama usada. */
	async fillCard(card: CardData): Promise<CardFormBranch> {
		await this.deps.modal.alignToTopFrame();
		const native = await tryUntil(() => this.deps.modal.exposesNativeForm(), {
			timeout: this.out.nativeDetectTimeoutMs ?? NATIVE_DETECT_TIMEOUT_MS,
			interval: 400
		});
		if (native) {
			await this.fillNative(card);
			return 'native';
		}
		await this.fillStripe(card);
		return 'stripe';
	}

	/** Tapea COBRAR cuando la app lo habilita. Lanza `ChargeButtonDisabledError` si no se habilita. */
	async submit(enableTimeoutMs = 12_000): Promise<void> {
		const enabled = await tryUntil(
			async () => {
				const state = await this.deps.submit.readState();
				return state.found && !state.disabled;
			},
			{ timeout: enableTimeoutMs, interval: 500 }
		);
		if (!enabled) throw new ChargeButtonDisabledError(enableTimeoutMs, await this.deps.native.readFormState());
		await this.deps.submit.tap();
		this.out.log('[PaymentPBO] COBRAR tapeado');
	}

	/** Espera `declined` / `trip-lost`; sin modal en `timeoutMs` se asume que el viaje avanzó (`success`). */
	async waitForOutcome(timeoutMs = 25_000): Promise<PaymentOutcome> {
		const visible = await tryUntil(() => this.deps.result.readVisibleOutcome(), {
			timeout: timeoutMs,
			interval: 400
		});
		return visible ?? { status: 'success' };
	}

	/** Cierra el alert bloqueante o el attention modal. */
	dismissAttention(): Promise<boolean> {
		return this.deps.result.dismiss();
	}

	/** Una pasada del challenge 3DS por id de Stripe test; `true` si lo resolvió. */
	tryComplete3DS(action: ChallengeAction = 'complete'): Promise<boolean> {
		return this.deps.challenge.tryCompleteById(action);
	}

	/** Reintenta el challenge 3DS por texto hasta `timeoutMs`. `false` si no apareció el botón. */
	async handle3DS(action: ChallengeAction, timeoutMs = 30_000): Promise<boolean> {
		const done = await tryUntil(() => this.deps.challenge.tryCompleteByText(action), {
			timeout: timeoutMs,
			interval: 700
		});
		if (!done) this.out.warn(`[PaymentPBO] 3DS ${action}: no se encontró el botón de challenge en ${timeoutMs}ms.`);
		return done !== null;
	}

	/** Cobro completo con tarjeta: llenar -> COBRAR -> resultado. */
	async chargeWithCard(card: CardData, options: ChargeOptions = {}): Promise<ChargeResult> {
		const branch = await this.fillCard(card);
		await this.submit(options.enableTimeoutMs);
		const outcome = await this.waitForOutcome(options.outcomeTimeoutMs);
		return { method: 'card', last4: card.number.replace(/\D/g, '').slice(-4), branch, outcome };
	}

	private async fillNative(card: CardData): Promise<void> {
		const { native } = this.deps;
		const digits = (v: string) => v.replace(/\D/g, '');
		const number = digits(card.number);

		// 1) Número: dispara validación + reveal progresivo del resto del form.
		if (!(await native.fillNumber(number))) throw new CardNumberFillError('native');
		await this.out.settle(REVEAL_FLOOR_MS);
		await native.waitForExpiryMounted(EXPIRY_MOUNT_TIMEOUT_MS);

		// 2) Vencimiento MM/AA; si la máscara rechazó la barra (readback < 4 dígitos) se reintenta compacto.
		const { combined, compact } = parseExpiry(card.expiry);
		await native.fillExpiry(combined);
		if ((await native.expiryDigitCount()) < 4) {
			this.out.warn(
				`[PaymentPBO] #cardExpirationDate quedó vacío con "${combined}" — reintentando compacto "${compact}".`
			);
			await native.fillExpiry(compact);
		}

		// 3) CVV; 4) titular (sólo si el caso lo trae); 5) postal sólo si el campo existe.
		await native.fillCvc(digits(card.cvc));
		if (card.holderName) await native.fillHolder(card.holderName);
		if (card.postal && (await native.hasPostalField())) await native.fillPostal(card.postal);

		await this.out.settle(READBACK_SETTLE_MS);
		const state = await native.readFormState();
		this.out.log(`[PaymentPBO] form NATIVO completado (tarjeta ${number.slice(-4)}): ${JSON.stringify(state)}`);
	}

	private async fillStripe(card: CardData): Promise<void> {
		const { stripe } = this.deps;
		const digits = (v: string) => v.replace(/\D/g, '');
		if (!(await stripe.typeInField('number', digits(card.number)))) throw new CardNumberFillError('stripe');
		await this.out.settle(STRIPE_AFTER_NUMBER_MS);
		await stripe.typeInField('expiry', digits(card.expiry));
		await this.out.settle(STRIPE_AFTER_EXPIRY_MS);
		await stripe.typeInField('cvc', digits(card.cvc));
		await stripe.fillHolderAndPostal(
			card.holderName ?? DEFAULT_STRIPE_HOLDER,
			card.postal ?? DEFAULT_STRIPE_POSTAL
		);
		this.out.log(
			`[PaymentPBO] Tarjeta ${digits(card.number).slice(-4)} ingresada (Stripe: iframe por campo) + titular/postal`
		);
	}
}
