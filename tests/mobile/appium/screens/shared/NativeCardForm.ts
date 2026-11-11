/**
 * NativeCardForm — form NATIVO `app-credit-card-payment-data` (eBizCharge / MercadoPago, Ionic reactive-forms,
 * sin iframe Stripe): llenado por `formcontrolname`, validez del FormGroup y estado de GUARDAR. Compartido.
 */

import { sleep } from '../../core/Waits';
import type { CardInput } from './CardInput';
import type { WebViewKit } from './WebViewKit';

export class NativeCardForm {
	constructor(private readonly kit: WebViewKit) {}

	/**
	 * Llena un control del form nativo Ionic por `formcontrolname`.
	 *
	 * eBizCharge/MercadoPago montan `ion-input[formcontrolname="..."]` (Ionic web components):
	 * el `<input>` real es `.native-input` DENTRO del host `ion-input`. Setear `input.value` +
	 * eventos DOM `input/change` NO alcanza — el `FormControl` de Angular reactive-forms se
	 * actualiza por los eventos `ionInput`/`ionChange` que emite el CUSTOM element. Sin ellos,
	 * el control queda vacío/untouched → el FormGroup es inválido → GUARDAR no habilita.
	 * (Verificado en device 2026-07-30 introspeccionando el `formGroup` del componente.)
	 */
	async fillIonInputControl(controlName: string, value: string): Promise<boolean> {
		return this.kit
			.executeInWebView(
				(fcn: string, val: string) => {
					const host = document.querySelector(
						`ion-input[formcontrolname="${fcn}"], #${fcn}, input[formcontrolname="${fcn}"]`
					) as HTMLElement | null;
					if (!host) {
						return false;
					}

					const input = (
						host.matches('input')
							? host
							: (host.querySelector('input.native-input') ?? host.querySelector('input'))
					) as HTMLInputElement | null;
					if (!input) {
						return false;
					}

					const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
					input.focus();
					setter?.call(input, val);
					input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
					input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

					// Actualizar el FormControl Angular vía los eventos del ion-input host.
					try {
						(host as HTMLElement & { value?: string }).value = val;
					} catch {
						// La prop `value` del ion-input puede ser de sólo lectura en algunos builds; los eventos igual disparan.
					}
					host.dispatchEvent(
						new CustomEvent('ionInput', { bubbles: true, composed: true, detail: { value: val } })
					);
					host.dispatchEvent(
						new CustomEvent('ionChange', { bubbles: true, composed: true, detail: { value: val } })
					);

					input.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
					host.dispatchEvent(new CustomEvent('ionBlur', { bubbles: true, composed: true }));
					return true;
				},
				controlName,
				value
			)
			.catch(() => false) as Promise<boolean>;
	}

	/**
	 * Lee el valor actual de un control del form nativo (por `formcontrolname`).
	 */
	async readIonInputControl(controlName: string): Promise<string> {
		return this.kit
			.executeInWebView((fcn: string) => {
				const host = document.querySelector(
					`ion-input[formcontrolname="${fcn}"], #${fcn}`
				) as HTMLElement | null;
				const input = host?.querySelector('input.native-input, input') as HTMLInputElement | null;
				return input?.value ?? '';
			}, controlName)
			.catch(() => '') as Promise<string>;
	}

	/**
	 * Introspecciona el FormGroup Angular del form nativo (`app-credit-card-payment-data`) vía
	 * `ng.getComponent()`. Devuelve la validez global y los controls inválidos con sus errores.
	 * Útil para los casos NEGATIVOS de alta de tarjeta (número incompleto, fecha vencida, CVV/ZIP
	 * inválido): la app debe dejar el FormGroup inválido → GUARDAR deshabilitado.
	 * `formValid = null` cuando no hay form nativo (p.ej. gateway Stripe con iframes).
	 */
	async readFormValidity(): Promise<{
		formValid: boolean | null;
		invalidControls: Array<{ name: string; errors: unknown }>;
	}> {
		return this.kit
			.executeInWebView(() => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const ng = (window as any).ng;
				const host = document.querySelector('app-credit-card-payment-data');
				if (!ng || !host || typeof ng.getComponent !== 'function') {
					return { formValid: null, invalidControls: [] };
				}

				const cmp = ng.getComponent(host);
				if (!cmp || typeof cmp !== 'object') {
					return { formValid: null, invalidControls: [] };
				}

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				let group: any = null;
				for (const k of Object.keys(cmp as Record<string, unknown>)) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const v = (cmp as any)[k];
					if (v && typeof v === 'object' && v.controls && typeof v.controls === 'object') {
						group = v;
						break;
					}
				}

				if (!group) {
					return { formValid: null, invalidControls: [] };
				}

				const invalidControls: Array<{ name: string; errors: unknown }> = [];
				for (const name of Object.keys(group.controls)) {
					const c = group.controls[name];
					if (c && c.valid === false) {
						invalidControls.push({ name, errors: c.errors });
					}
				}

				return { formValid: Boolean(group.valid), invalidControls };
			})
			.catch(() => ({
				formValid: null as boolean | null,
				invalidControls: [] as Array<{ name: string; errors: unknown }>
			}));
	}

	/**
	 * ¿El botón GUARDAR del form de alta de tarjeta está habilitado? (FormGroup válido).
	 * Para los casos negativos se espera `false`.
	 */
	async isSaveEnabled(): Promise<boolean> {
		return this.kit
			.executeInWebView(() => {
				const host = (document.querySelector('app-credit-card-payment-data') as ParentNode | null) ?? document;
				const btns = Array.from(host.querySelectorAll('button, ion-button')) as HTMLElement[];
				const save = btns.find(b => /guardar/i.test(b.textContent ?? ''));
				if (!save) {
					return false;
				}

				const disabled =
					save.getAttribute('disabled') !== null ||
					save.getAttribute('aria-disabled') === 'true' ||
					(save as HTMLButtonElement).disabled === true;
				return !disabled;
			})
			.catch(() => false);
	}

	/**
	 * Llena el form NATIVO de alta de tarjeta (`app-credit-card-payment-data`), común a
	 * eBizCharge y MercadoPago (Ionic reactive-forms, NO iframe Stripe). El form es progresivo:
	 * al registrar un número válido emergen expiry/cvv/cardholderName y — sólo en eBizCharge —
	 * los campos `address` (Dirección de Facturación, maxlength=30) y `zipCode`.
	 *
	 * Estandarización multi-gateway: mismos pasos, sólo cambian los datos de entrada. Los controls
	 * ausentes en una pasarela (p.ej. `address` no existe en MercadoPago) se saltan sin romper.
	 */
	async fillNativeCardForm(card: CardInput, sanitizedNumber: string): Promise<void> {
		await this.kit.switchToWebView().catch(() => {});
		await this.kit.switchFrameTarget(null).catch(() => {});

		// 1) cardNumber → dispara la validación/reveal progresivo del form reactivo.
		if (!(await this.fillIonInputControl('cardNumber', sanitizedNumber))) {
			throw new Error(
				'PassengerWalletScreen.fillNativeCardForm() - no se pudo llenar cardNumber nativo (control ion-input no encontrado)'
			);
		}
		await sleep(2_500);

		// 2-4) Campos que EXISTEN en ambos gateways nativos (eBiz + MercadoPago). Se capturan los
		// booleans para diagnosticar temprano si un control no se pudo llenar (p.ej. el reveal
		// progresivo tardó más que el pause fijo) en vez de fallar tarde en saveCard() con un
		// mensaje genérico de "GUARDAR disabled".
		const { combined } = this.kit.parseExpiryParts(card.expiry);
		const expiryOk = await this.fillIonInputControl('cardExpirationDate', combined);
		const cvcOk = await this.fillIonInputControl('securityCode', card.cvc.replace(/\s+/g, ''));

		const holderName = card.holderName?.trim();
		const holderOk = holderName ? await this.fillIonInputControl('cardholderName', holderName) : true;

		if (!expiryOk || !cvcOk || !holderOk) {
			console.warn(
				`[PassengerWalletScreen] fillNativeCardForm: control(es) sin llenar → expiry=${expiryOk} cvc=${cvcOk} holder=${holderOk} (¿reveal progresivo tardó más que el pause?)`
			);
		}

		// 5) Dirección de Facturación (sólo eBizCharge). maxlength=30 → truncar para no invalidar
		//    el control (44>30 dejaba el FormGroup inválido y GUARDAR deshabilitado).
		const address = (card.address ?? '123 Main St').slice(0, 30);
		const addressFilled = await this.fillIonInputControl('address', address);
		if (addressFilled) {
			await sleep(800); // el address puede autocompletar el zip en algunos builds
		}

		// 6) Código Postal — sólo si el form lo expone y no quedó autocompletado por la dirección.
		const zipNow = await this.readIonInputControl('zipCode');
		if (!zipNow) {
			await this.fillIonInputControl('zipCode', card.zip ?? '75201');
		}

		await sleep(300);
		console.log(
			'[PassengerWalletScreen] form NATIVO app-credit-card-payment-data completado (ion-input + ionInput/ionChange)'
		);
	}
}
