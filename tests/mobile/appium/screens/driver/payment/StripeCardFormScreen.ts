/**
 * StripeCardFormScreen — rama STRIPE ELEMENTS del modal de cobro: CADA campo (número, vencimiento,
 * CVC) vive en SU PROPIO iframe `__privateStripeFrame` (llenar los tres en un solo iframe falla con
 * "element not interactable"). Titular y código postal son `ion-input` NATIVOS del form MAGIIS.
 *
 * PUNTO DE UNIÓN: el form de tarjeta coincide con el del pasajero; cuando exista
 * `screens/shared/CardForm` esta clase se reemplaza por esa (misma interfaz `StripeCardFields`).
 */

import type { MobileSession } from '../../../core/MobileSession';
import { SEL } from './PaymentLocators';
import { PaymentWebContext } from './PaymentWebContext';

export type StripeField = 'number' | 'expiry' | 'cvc';

/** Interfaz mínima que el PBO necesita del form Stripe (reemplazable por `shared/CardForm`). */
export type StripeCardFields = {
	typeInField(field: StripeField, digits: string): Promise<boolean>;
	fillHolderAndPostal(holder: string, postal: string): Promise<boolean>;
};

const IFRAME_BY_FIELD: Record<StripeField, string> = {
	number: SEL.iframeNumber,
	expiry: SEL.iframeExpiry,
	cvc: SEL.iframeCvc
};

export class StripeCardFormScreen implements StripeCardFields {
	private readonly web: PaymentWebContext;

	constructor(session: MobileSession) {
		this.web = new PaymentWebContext(session);
	}

	/** Tipeo REAL (`addValue`, Stripe escucha key events) en el iframe del campo; vuelve al top-frame. */
	async typeInField(field: StripeField, digits: string): Promise<boolean> {
		await this.web.switchToWebView();
		await this.web.toTopFrame(); // garantizar top-frame antes de buscar el iframe
		const frame = this.web.$(IFRAME_BY_FIELD[field]);
		const exists = await frame
			.waitForExist({ timeout: 8_000 })
			.then(() => true)
			.catch(() => false);
		if (!exists) return false;
		try {
			await this.web.switchFrame(frame);
			const input = this.web.$(SEL.stripeInput);
			await input.waitForExist({ timeout: 6_000 });
			await input.click().catch(() => undefined);
			// Sin retry por valor: re-tipear en Stripe hace append => inválido.
			await input.addValue(digits);
			return true;
		} catch {
			return false;
		} finally {
			await this.web.toTopFrame(); // volver al top-frame para el próximo campo
		}
	}

	/**
	 * Titular y postal (`ion-input` por id): setter nativo en el `<input>` interno (shadow o light) +
	 * `input`/`change` + `ionInput`/`ionChange` para que el FormControl de Angular se entere.
	 */
	async fillHolderAndPostal(holder: string, postal: string): Promise<boolean> {
		await this.web.switchToWebView();
		return this.web
			.execHere(
				(holderName: string, zip: string) => {
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
	}
}
