/**
 * KATA Component (Layer 3) — Carrier · Card Form Strategy: form nativo Angular.
 *
 * Seam S3 (carrier/gateway-standardization): unifica el form nativo de MAGIIS que
 * comparten Mercado Pago / Authorize.Net / eBizCharge (NO usa Stripe Elements).
 * Los 4 campos comunes van por `formcontrolname` estable (confirmados vía DOM dump
 * 2026-07-22): creditCardNumber, expiryDate, creditCardCVV, creditCardOwnerName.
 * El 5° campo varía por pasarela (`adapter.nativeExtraField`):
 *   - 'document' (Mercado Pago): tipo + número de documento (custom select
 *     #creditCardOwnerIdType + input creditCardOwnerId). Requerido: sin esto MP
 *     rechaza "revise los datos".
 *   - 'zip' (Authorize.Net): código postal US. FRAGILE — el `formcontrolname` del ZIP
 *     NO está confirmado en vivo → candidatos + fallback posicional (ver abajo).
 *   - ausente (eBizCharge): sin 5° campo confirmado (campos del modal eBiz NO
 *     verificados live — TODO).
 *
 * El form es reactivo con máscara → number/expiry/cvv/zip/doc se tipean carácter a
 * carácter (`pressSequentially`); `.fill()` NO dispara la máscara. Triggers de
 * outcome por pasarela: MP = holderName (APRO/OTHE/…), Authorize = number+CVV+ZIP,
 * eBiz = number — la estrategia NO decide el outcome, solo llena lo que recibe.
 */

import type { Page } from '@playwright/test';
import type { CardFormFillInput, CardFormStrategy } from './CardFormStrategy';

/** 5° campo del form nativo (espejo de `adapter.nativeExtraField`). */
export type NativeAngularExtraField = 'zip' | 'document';

export class NativeAngularCardForm implements CardFormStrategy {
	readonly kind = 'native-angular' as const;

	constructor(private readonly options: { extraField?: NativeAngularExtraField } = {}) {}

	async fill(page: Page, card: CardFormFillInput): Promise<void> {
		const numberField = page.locator('input[formcontrolname="creditCardNumber"]');
		await numberField.click();
		await numberField.pressSequentially(card.number, { delay: 60 });
		await page.locator('input[formcontrolname="expiryDate"]').pressSequentially(card.expiry, { delay: 60 });
		await page.locator('input[formcontrolname="creditCardCVV"]').pressSequentially(card.cvc, { delay: 60 });
		// Titular: en MP es el TRIGGER del outcome (keyword APRO/OTHE/…); en Authorize/eBiz es inerte.
		await page.locator('input[formcontrolname="creditCardOwnerName"]').fill(card.holderName);

		if (this.options.extraField === 'document') {
			await this.fillDocumentField(page, card);
		} else if (this.options.extraField === 'zip') {
			await this.fillZipField(page, card);
		}

		// Guard: re-tipear el número si quedó vacío (algún re-render reactivo lo pudo limpiar).
		if (!(await numberField.inputValue().catch(() => ''))) {
			await numberField.click();
			await numberField.pressSequentially(card.number, { delay: 60 });
		}
	}

	/** 5° campo Mercado Pago: tipo de documento (custom select) + número. */
	private async fillDocumentField(page: Page, card: CardFormFillInput): Promise<void> {
		const docType = card.docType ?? 'DNI';
		const docNumber = card.docNumber ?? '12345678';

		// Custom select `#creditCardOwnerIdType`: abrir y elegir la opción por texto
		// (scopeada al select para no matchear el placeholder).
		const docTypeSelect = page.locator('#creditCardOwnerIdType');
		await docTypeSelect.click();
		await docTypeSelect.getByText(new RegExp(`^\\s*${docType}\\s*$`, 'i')).last().click();
		// Número de documento (formcontrolname estable, era nth(4) frágil).
		await page.locator('input[formcontrolname="creditCardOwnerId"]').pressSequentially(docNumber, { delay: 40 });
	}

	/**
	 * 5° campo Authorize: ZIP (US). FRAGILE — `formcontrolname` NO confirmado en vivo:
	 * se intenta por candidatos conocidos y cae al textbox posicional del recording
	 * (`authorize2e2_happypath.ts`, 5º textbox). Confirmar en corrida viva y fijar el real.
	 */
	private async fillZipField(page: Page, card: CardFormFillInput): Promise<void> {
		if (!card.zip) {
			throw new Error("NativeAngularCardForm: la tarjeta no trae `zip` pero la pasarela exige el 5° campo ZIP (extraField: 'zip').");
		}

		const zipCandidates = page.locator(
			'input[formcontrolname="creditCardOwnerZipCode"], input[formcontrolname="zipCode"], input[formcontrolname="postalCode"], input[formcontrolname="creditCardOwnerZip"]',
		);
		if (await zipCandidates.count()) {
			await zipCandidates.first().pressSequentially(card.zip, { delay: 40 });
		} else {
			// Fallback: en la grabación el ZIP era el 5º textbox del form.
			await page.getByRole('textbox').nth(4).pressSequentially(card.zip, { delay: 40 });
		}
	}
}
