/**
 * NativeCardFormScreen — rama NATIVA del modal de cobro: form Ionic propio (`#cardNumber`,
 * `#cardExpirationDate`, `#securityCode`, `#cardholderName`), sin iframes (pasarelas que no montan
 * Stripe Elements: Authorize, eBizCharge, Mercado Pago). Acciones atómicas; el orden y los reintentos
 * los decide el PBO.
 *
 * REVEAL PROGRESIVO: al abrir sólo existe `#cardNumber`; el resto se monta (`ng-if`) cuando un número
 * válido resuelve la marca. De ahí `waitForExpiryMounted`.
 */

import type { MobileSession } from '../../../core/MobileSession';
import { tryUntil } from '../../../core/Waits';
import { NATIVE, NATIVE_FIELD_GROUPS, SEL } from './PaymentLocators';
import { PaymentWebContext } from './PaymentWebContext';
import type { NativeFieldState, NativeFormState } from './PaymentTypes';

export class NativeCardFormScreen {
	private readonly web: PaymentWebContext;

	constructor(session: MobileSession) {
		this.web = new PaymentWebContext(session);
	}

	fillNumber(digits: string): Promise<boolean> {
		return this.web.fillInput(NATIVE.number, digits);
	}

	fillExpiry(value: string): Promise<boolean> {
		return this.web.fillInput(NATIVE.expiry, value);
	}

	fillCvc(digits: string): Promise<boolean> {
		return this.web.fillInput(NATIVE.cvc, digits);
	}

	fillHolder(name: string): Promise<boolean> {
		return this.web.fillInput(NATIVE.holder, name);
	}

	fillPostal(zip: string): Promise<boolean> {
		return this.web.fillInput(NATIVE.zip, zip);
	}

	hasPostalField(): Promise<boolean> {
		return this.web.exists(NATIVE.zip);
	}

	/** Espera (por condición) a que se monte el campo de vencimiento. No lanza. */
	async waitForExpiryMounted(timeoutMs: number): Promise<boolean> {
		return (await tryUntil(() => this.web.exists(NATIVE.expiry), { timeout: timeoutMs, interval: 400 })) !== null;
	}

	/** Cantidad de dígitos que quedaron en el vencimiento (readback). */
	async expiryDigitCount(): Promise<number> {
		return (await this.web.readValue(NATIVE.expiry)).replace(/\D/g, '').length;
	}

	/**
	 * Radiografía del form: valor + validez por campo, clases del `<form>`, señales de cobro
	 * (`.header.end span.title` => válido / `span.invalid-charge` => inválido) y estado de COBRAR.
	 * Todo scopeado al overlay ACTIVO (marcado).
	 */
	async readFormState(): Promise<NativeFormState> {
		return this.web
			.exec(
				(entries: Array<[string, readonly string[]]>, markedSel: string, cobrarFallback: string) => {
					const scope = (document.querySelector(markedSel) ?? document) as ParentNode;
					const fields: Record<string, NativeFieldState> = {};
					for (const [name, sels] of entries) {
						let host: (HTMLElement & { shadowRoot?: ShadowRoot | null }) | null = null;
						for (const sel of sels) {
							host = document.querySelector(sel) as
								| (HTMLElement & { shadowRoot?: ShadowRoot | null })
								| null;
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
							/cobrar|collect/i.test((s as HTMLElement).innerText || '')
						),
						chargeInvalidVisible: !!scope.querySelector('span.invalid-charge'),
						submit: {
							found: !!button,
							disabled: button ? button.disabled || button.getAttribute('disabled') !== null : true,
							text: button ? String(button.innerText ?? '').trim() : ''
						}
					};
				},
				NATIVE_FIELD_GROUPS,
				NATIVE.marked,
				SEL.cobrar
			)
			.catch(
				(): NativeFormState => ({
					form: '<unavailable>',
					fields: {},
					chargeValidVisible: false,
					chargeInvalidVisible: false,
					submit: { found: false, disabled: true, text: '' }
				})
			);
	}
}
