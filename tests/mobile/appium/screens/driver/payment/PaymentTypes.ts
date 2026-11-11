/**
 * Tipos de dominio del cobro a bordo del chofer (datos puros, sin Appium).
 * Re-exportados por `driver/DriverTripPaymentScreen` para no romper a los consumidores actuales.
 */

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

export type NativeFieldState = { found: boolean; value: string; invalid: boolean };

/** Radiografía del form NATIVO — diagnóstico de por qué COBRAR sigue deshabilitado. */
export type NativeFormState = {
	/** classList del `<form>` (trae `ng-valid`/`ng-invalid` del FormGroup de Angular). */
	form: string;
	fields: Record<string, NativeFieldState>;
	/** `.header.end span.title` con texto /cobrar/i => el form se considera válido. */
	chargeValidVisible: boolean;
	/** `span.invalid-charge` presente => el form se considera inválido. */
	chargeInvalidVisible: boolean;
	submit: { found: boolean; disabled: boolean; text: string };
};

/** Estado de preparación del modal de cobro (señal que decide si ya se puede llenar). */
export type ChargeModalReadiness = 'ready' | 'ready-after-grace' | 'timeout';

/** Calidad de la señal al marcar el overlay activo. */
export type ChargeModalSignal = 'focused' | 'fresh' | 'graced' | 'none';

export type ChallengeAction = 'complete' | 'fail';

/** Ramas del form de tarjeta que puede renderizar el modal de cobro. */
export type CardFormBranch = 'native' | 'stripe';
