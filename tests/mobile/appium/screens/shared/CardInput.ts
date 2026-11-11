/**
 * CardInput y helpers PUROS de datos de tarjeta (sin Appium): testeables con unit.
 */

export interface CardInput {
	number: string;
	expiry: string;
	cvc: string;
	holderName?: string;
	/** Código postal para el form nativo (app-credit-card-payment-data zipCode). Default '75201' (alineado con EBIZ_BILLING.zip). */
	zip?: string;
	/**
	 * Dirección de Facturación — REQUERIDA por el form nativo eBizCharge
	 * (control `address`, maxlength=30). Se trunca a 30 chars al llenar.
	 * Inexistente en Stripe/otros; se ignora si el control no está presente.
	 */
	address?: string;
}

export type ExpiryParts = { month: string; year: string; combined: string; compact: string };

/** Parte un vencimiento `MM/YY` o `MM/YYYY` en sus variantes de formato. Fail-fast si no matchea. */
export function parseExpiryParts(expiry: string): ExpiryParts {
	const normalized = expiry.trim().replace(/\s+/g, '');
	const match = normalized.match(/^(\d{1,2})\/(\d{2}|\d{4})$/);
	if (!match) {
		throw new Error(`Invalid card expiry "${expiry}". Expected MM/YY or MM/YYYY.`);
	}

	const month = match[1].padStart(2, '0');
	const year = match[2].slice(-2);
	return { month, year, combined: `${month}/${year}`, compact: `${month}${year}` };
}

/** Ultimos 4 digitos de un valor (acepta `VISA ****4242`, `4242`, etc.). */
export function last4DigitsOf(value: string): string {
	return value.replace(/\D/g, '').slice(-4);
}

/** Numero sin espacios. */
export function sanitizeCardNumber(number: string): string {
	return number.replace(/\s+/g, '');
}
