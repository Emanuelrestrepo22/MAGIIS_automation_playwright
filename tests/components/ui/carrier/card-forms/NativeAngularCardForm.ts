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
 *   - 'zip' (Authorize.Net): código postal US, que ADEMÁS es trigger de outcome
 *     (46282 → decline). Se TIPEA. FRAGILE — el `formcontrolname` del ZIP NO está
 *     confirmado en vivo → candidatos + fallback posicional (ver abajo).
 *   - 'address-zip' (eBizCharge): un autocomplete de DIRECCIÓN que se comporta igual
 *     que los campos pick-up/drop-off del alta de viaje — se escribe, aparecen
 *     sugerencias, y al elegir la que matchea **el sistema autocompleta el ZIP**.
 *     Verificado en vivo por el líder de QA (2026-07-30). Consecuencia de diseño: para
 *     eBiz el ZIP **no es dato de entrada sino valor DERIVADO**, así que no se tipea —
 *     se ASSERTA que llegó. Esa aserción ES la verificación del autocompletado, y es un
 *     oráculo más fuerte que cualquier fill.
 *
 * El form es reactivo con máscara → number/expiry/cvv/zip/doc se tipean carácter a
 * carácter (`pressSequentially`); `.fill()` NO dispara la máscara. Triggers de
 * outcome por pasarela: MP = holderName (APRO/OTHE/…), Authorize = number+CVV+ZIP,
 * eBiz = number — la estrategia NO decide el outcome, solo llena lo que recibe.
 */

import type { Page } from '@playwright/test';
import type { CardFormFillInput, CardFormStrategy } from './CardFormStrategy';

import { expect } from '@playwright/test';

/** Normaliza un valor de campo para comparar ignorando la máscara (espacios). */
function unmasked(value: string): string {
	return value.replace(/\s/g, '');
}

/** 5° campo del form nativo (espejo de `adapter.nativeExtraField`). */
export type NativeAngularExtraField = 'zip' | 'document' | 'address-zip';

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
		} else if (this.options.extraField === 'address-zip') {
			await this.fillAddressField(page, card);
		}

		// Guard: re-tipear el número si quedó vacío (algún re-render reactivo lo pudo limpiar).
		if (!(await numberField.inputValue().catch(() => ''))) {
			await numberField.click();
			await numberField.pressSequentially(card.number, { delay: 60 });
		}
	}

	/**
	 * Verifica que los 5 campos quedaron con el valor esperado, re-tipeando el NÚMERO si el
	 * re-render reactivo lo limpió (hasta 3 intentos). Ver el JSDoc de `CardFormStrategy.expectFilled`
	 * para el caso que motivó esto (TS-AUTHORIZE-TC1061, 2026-07-27).
	 */
	async expectFilled(page: Page, card: CardFormFillInput): Promise<void> {
		const numberField = page.locator('input[formcontrolname="creditCardNumber"]');

		// El número es el único campo que se observó perdiéndose: re-tipear antes de aseverar.
		for (let attempt = 0; attempt < 3; attempt++) {
			if (unmasked(await numberField.inputValue().catch(() => '')) === unmasked(card.number)) {
				break;
			}
			await numberField.click();
			await numberField.fill('');
			await numberField.pressSequentially(card.number, { delay: 60 });
		}

		// Debería tener el número completo tras el fill (la máscara agrega espacios).
		await expect
			.poll(async () => unmasked(await numberField.inputValue().catch(() => '')), {
				message: `El número de tarjeta quedó vacío o incompleto tras el fill (el form reactivo lo limpió). Esperado ${card.number}.`,
				timeout: 10_000,
			})
			.toBe(unmasked(card.number));

		// Debería conservar vencimiento, CVV y titular.
		await expect(page.locator('input[formcontrolname="expiryDate"]'), 'vencimiento').toHaveValue(card.expiry);
		await expect(page.locator('input[formcontrolname="creditCardCVV"]'), 'CVV').toHaveValue(card.cvc);
		await expect(page.locator('input[formcontrolname="creditCardOwnerName"]'), 'titular').toHaveValue(card.holderName);

		// El 5° campo sólo si la pasarela lo exige; el ZIP se resuelve igual que en fill().
		if (this.options.extraField === 'zip' && card.zip) {
			await expect(this.zipField(page), 'código postal').toHaveValue(card.zip);
		}

		if (this.options.extraField === 'address-zip') {
			await this.expectAddressAndDerivedZip(page, card);
		}
	}

	/**
	 * 5° campo eBizCharge: autocomplete de DIRECCIÓN que deriva el ZIP.
	 *
	 * Mismo patrón que los campos pick-up/drop-off del alta de viaje: escribir el texto, esperar
	 * la lista de sugerencias del geocoder y **elegir la opción que matchea**. El ZIP NO se
	 * escribe: lo completa el sistema al seleccionar la sugerencia.
	 *
	 * `addressOption` es opcional a propósito: si el fixture no declara qué sugerencia elegir, se
	 * toma la primera de la lista. Se prefiere la declarada porque el geocoder devuelve varias y
     * elegir "la primera" hace que el ZIP derivado dependa de un orden que no controlamos.
	 */
	private async fillAddressField(page: Page, card: CardFormFillInput): Promise<void> {
		if (!card.address) {
			throw new Error(
				"NativeAngularCardForm: la tarjeta no trae `address` pero la pasarela exige el 5° campo de dirección (extraField: 'address-zip'). " +
					'En eBizCharge la dirección es obligatoria y el ZIP se deriva de ella.'
			);
		}

		const field = this.addressField(page);
		await field.click();
		await field.pressSequentially(card.address, { delay: 60 });

		// Sugerencias del geocoder: mismo control que usa el alta de viaje para origen/destino.
		const option = card.addressOption
			? page.getByRole('listitem').filter({ hasText: card.addressOption }).first()
			: page.getByRole('listitem').first();
		await option.click();
	}

	/**
	 * Oráculo del autocompletado — la aserción más valiosa de esta estrategia.
	 *
	 * Verifica que (a) la dirección quedó cargada y (b) el ZIP llegó **sin haberse tipeado**. El
	 * poll es necesario porque el geocoder resuelve de forma asíncrona tras elegir la sugerencia:
	 * una aserción inmediata sobre el ZIP se evaluaría antes de que el valor exista (es la
	 * trampa de vacuidad #1 catalogada en el RUN-LOG de Authorize).
	 *
	 * Si el fixture declara `expectedZip`, se asserta ese valor exacto; si no, se exige al menos
	 * que el campo dejó de estar vacío. Lo segundo es un piso deliberado: acredita que el
	 * autocompletado ocurrió sin fijar un ZIP que no observamos.
	 */
	private async expectAddressAndDerivedZip(page: Page, card: CardFormFillInput): Promise<void> {
		if (card.address) {
			await expect(this.addressField(page), 'dirección de facturación').not.toHaveValue('');
		}

		const zip = this.zipField(page, { allowPositionalFallback: false });

		if (card.expectedZip) {
			await expect
				.poll(async () => (await zip.inputValue().catch(() => '')).trim(), {
					message: `El ZIP debía autocompletarse a "${card.expectedZip}" al elegir la dirección "${card.address}", y no llegó.`,
					timeout: 15_000
				})
				.toBe(card.expectedZip);
			return;
		}

		await expect
			.poll(async () => (await zip.inputValue().catch(() => '')).trim().length, {
				message: `El ZIP debía autocompletarse al elegir la dirección "${card.address}" y quedó vacío. El sistema lo deriva de la dirección: si está vacío, el autocompletado no ocurrió.`,
				timeout: 15_000
			})
			.toBeGreaterThan(0);
	}

	/**
	 * Locator del campo de DIRECCIÓN del form de tarjeta (eBizCharge).
	 *
	 * ⚠️ Scopeado al contenedor del form de tarjeta a propósito: el nombre accesible
	 * "Enter an address" / "Ingrese una dirección" lo comparten los campos de ORIGEN y DESTINO
	 * del alta de viaje, que viven en la MISMA página. Sin scope, el locator es ambiguo y
	 * Playwright falla por strict mode — o peor, escribe la dirección de facturación en el
	 * origen del viaje.
	 */
	private addressField(page: Page) {
		const cardFormScope = page
			.locator('form, .modal, [role="dialog"], #add_travel_payment_methods')
			.filter({ has: page.locator('input[formcontrolname="creditCardNumber"]') })
			.first();

		const byFormControl = cardFormScope.locator(
			'input[formcontrolname="address"], input[formcontrolname="creditCardOwnerAddress"], input[formcontrolname="billingAddress"]'
		);
		const byLabel = cardFormScope.getByRole('textbox', { name: /enter an address|ingrese una direcci[oó]n|direcci[oó]n/i });

		return byFormControl.first().or(byLabel.first()).first();
	}

	/** 5° campo Mercado Pago: tipo de documento (custom select) + número. */
	private async fillDocumentField(page: Page, card: CardFormFillInput): Promise<void> {
		// Documento del fixture MP (identificationType/Number propagados por el resolver
		// como docType/docNumber — post-review A11); literales SOLO como fallback.
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

		await this.zipField(page).pressSequentially(card.zip, { delay: 40 });
	}

	/**
	 * Locator del campo ZIP. Compartido por `fill()` y `expectFilled()` para que ambos apunten
	 * exactamente al mismo campo — si divergieran, `expectFilled` podría aseverar un campo
	 * distinto del que llenó `fill`.
	 *
	 * Orden de resolución: (1) `formcontrolname` conocido; (2) por etiqueta accesible, bilingüe
	 * — en el portal en ES es "Codigo Postal de Facturación de la Tarjeta" (sin tilde en "Codigo",
	 * verificado en el snapshot de la corrida TC1011 del 2026-07-27); (3) fallback posicional del
	 * recording (5º textbox), que funcionó en vivo pero es frágil: el orden depende de cuántos
	 * textbox haya montados y de si el CVV expone role textbox (varía según idioma del portal).
	 */
	private zipField(page: Page, options: { allowPositionalFallback?: boolean } = {}) {
		const byFormControl = page.locator(
			'input[formcontrolname="creditCardOwnerZipCode"], input[formcontrolname="zipCode"], input[formcontrolname="postalCode"], input[formcontrolname="creditCardOwnerZip"]',
		);
		const byLabel = page.getByRole('textbox', { name: /c[oó]digo postal|postal code|zip/i });
		const resolved = byFormControl.first().or(byLabel.first());

		// El fallback posicional (5º textbox) sólo vale para Authorize, donde el conteo de inputs
		// del form es el del recording. En eBizCharge el campo de DIRECCIÓN agrega un textbox más,
		// así que `nth(4)` apuntaría al campo equivocado y el oráculo del ZIP derivado mediría otra
		// cosa. Por eso `address-zip` lo desactiva explícitamente.
		if (options.allowPositionalFallback === false) {
			return resolved.first();
		}

		return resolved.or(page.getByRole('textbox').nth(4)).first();
	}
}
