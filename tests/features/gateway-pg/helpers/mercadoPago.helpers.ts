import { type Page } from '@playwright/test';
import { MP_CARD_CATALOG, MP_DEFAULT_CVV, MP_DEFAULT_EXPIRY } from '@fixtures/gateways/mercado-pago/cards';

/**
 * Helpers de Mercado Pago para el form de tarjeta del carrier (portal web).
 *
 * ⚠️ Diferencia clave con Stripe: Mercado Pago NO usa Stripe Elements (iframes).
 * El form es **nativo Angular** de MAGIIS y el **nombre del titular (`holderName`)
 * ES EL TRIGGER** del outcome (APRO=approved, OTHE=rejected, ...). Número/CVV/exp
 * son fijos; el resultado no depende de ellos.
 *
 * Fuente de locators: recording `test-14.spec.ts` (carrier ARG, TEST, 2026-07-22).
 * SUPERSEDED (post-review A7): la estrategia de card form por gateway YA existe en
 * `@ui/carrier/card-forms` (`NativeAngularCardForm`) — el TODO(variante-MP-POM · BL-038)
 * quedó cumplido por esa vía. `fillMercadoPagoNativeCard` queda SOLO para su único
 * consumidor (`specs/mercado-pago/web/carrier/mp-no-3ds-validation.spec.ts`) — migrar
 * ese spec a la estrategia y retirar este fill en la próxima limpieza.
 */

export type MpNativeCardInput = {
	/** El TRIGGER: keyword de estado como nombre del titular (ej. 'APRO', 'OTHE'). */
	holderName: string;
	/** Número de tarjeta. Default: Visa crédito del catálogo MP. */
	number?: string;
	/** Expiración MM/AA. Default '11/30'. */
	exp?: string;
	/** CVV. Default '123'. */
	cvv?: string;
	/** Tipo de documento. Default 'DNI'. */
	docType?: string;
	/** Número de documento. Default '12345678' (requerido por APRO/OTHE). */
	docNumber?: string;
};

/**
 * Completa el form nativo de tarjeta de Mercado Pago dentro del alta de viaje del carrier.
 * Requiere que el método de pago ya esté en "Preautorizada"
 * (`NewTravelPage.selectPaymentMethod('Preautorizada')`). NO hace click en "Validar"
 * (dejar que el caller use `NewTravelPage.clickValidateCard()`).
 */
export async function fillMercadoPagoNativeCard(page: Page, input: MpNativeCardInput): Promise<void> {
	const number = input.number ?? MP_CARD_CATALOG.visaCredit.number;
	const exp = input.exp ?? MP_DEFAULT_EXPIRY;
	const cvv = input.cvv ?? MP_DEFAULT_CVV;
	const docType = input.docType ?? 'DNI';
	const docNumber = input.docNumber ?? '12345678';

	// Locators ESTABLES por `formcontrolname` (confirmados vía DOM dump 2026-07-22). El form MP es
	// nativo Angular con máscara/validación reactiva → se tipea carácter por carácter
	// (`pressSequentially`) para disparar la máscara (`.fill()` no la dispara).
	const numberField = page.locator('input[formcontrolname="creditCardNumber"]');
	await numberField.click();
	await numberField.pressSequentially(number, { delay: 60 });
	await page.locator('input[formcontrolname="expiryDate"]').pressSequentially(exp, { delay: 60 });
	await page.locator('input[formcontrolname="creditCardCVV"]').pressSequentially(cvv, { delay: 60 });
	// Titular = TRIGGER del outcome.
	await page.locator('input[formcontrolname="creditCardOwnerName"]').fill(input.holderName);
	// Tipo de documento: custom select `#creditCardOwnerIdType`. Abrir y elegir la opción por texto
	// (scopeada al select para no matchear el placeholder). Requerido: sin esto MP rechaza "revise los datos".
	const docTypeSelect = page.locator('#creditCardOwnerIdType');
	await docTypeSelect.click();
	await docTypeSelect.getByText(new RegExp(`^\\s*${docType}\\s*$`, 'i')).last().click();
	// Número de documento (formcontrolname estable, era nth(4) frágil).
	await page.locator('input[formcontrolname="creditCardOwnerId"]').pressSequentially(docNumber, { delay: 40 });

	// Guard: re-tipear el número si quedó vacío (algún re-render reactivo lo pudo limpiar).
	if (!(await numberField.inputValue().catch(() => ''))) {
		await numberField.click();
		await numberField.pressSequentially(number, { delay: 60 });
	}
}

/**
 * Valida la tarjeta MP y confirma la **vinculación satisfactoria**.
 *
 * Oráculo de éxito (recording test-15, líneas 44-49): tras "Validar" la tarjeta
 * aparece **resaltada** (`.ng-star-inserted.highlighted`) en el dropdown de métodos de
 * pago; abrir el dropdown y seleccionarla deja la tarjeta activa para el viaje.
 *
 * NOTE: el recorder mostró que "Validar" puede requerir reintento antes de que la
 * tarjeta quede vinculada — se reintenta hasta que la tarjeta resaltada sea visible.
 */
/**
 * Resultado de la validación de tarjeta MP (contrato endurecido — auditoría R2, separa
 * fallo real de limitación de entorno; antes ambos convergían en el skip):
 * - `'linked'`: la tarjeta quedó vinculada (resaltada) → se puede continuar el alta.
 * - `'validation-failed'`: la UI mostró un ERROR EXPLÍCITO de validación ("Error al validar
 *   tarjeta") — señal observable de fallo. Los callers deben tratarlo como FALLO del test
 *   (`expect(result).not.toBe('validation-failed')`), NUNCA como skip: skipear un error
 *   visible ocultaría una regresión real del backend/pasarela.
 * - `'validation-unavailable'`: sin tarjeta resaltada NI error explícito — señal indeterminada
 *   atribuible a la limitación de entorno (la validación/transacción de tarjetas sandbox MP
 *   **no completa en TEST**; va a UAT con tarjeta real). Solo este valor habilita el
 *   `test.skip` del caller (el form-fill + habilitación de "Validar" SÍ quedaron verificados
 *   = la cobertura controlable en TEST).
 */
export async function validateAndSelectMercadoPagoCard(
	page: Page,
	attempts = 3
): Promise<'linked' | 'validation-failed' | 'validation-unavailable'> {
	const validar = page.getByRole('button', { name: /^Validar$/i });
	const paymentMethods = page.locator('#add_travel_payment_methods');
	const highlighted = page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').first();
	const validationError = page.getByText(/Error al validar tarjeta/i);

	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		if (await validar.isEnabled().catch(() => false)) {
			await validar.click({ force: true });
		}
		// Esperar el desenlace: tarjeta vinculada (resaltada) o error de validación (sandbox TEST).
		await paymentMethods.locator('.below .single .value .data-with-icon-col').first().click().catch(() => {});
		if (await highlighted.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await highlighted.click();
			return 'linked';
		}
		if (await validationError.isVisible().catch(() => false)) {
			break; // no reintentar: hay señal explícita de error (no es flakiness)
		}
	}

	if (await validationError.isVisible().catch(() => false)) {
		console.warn('[MP] "Error al validar tarjeta" visible — señal EXPLÍCITA de fallo de validación; el caller debe FALLAR el test (no skipear).');
		return 'validation-failed';
	}
	// Sin tarjeta resaltada ni error explícito: señal indeterminada → limitación de entorno
	// (sandbox MP no transacciona en TEST) — único camino que habilita el skip del caller.
	console.warn('[MP] Tarjeta MP no quedó vinculada ni hubo error explícito — se trata como validación no disponible en TEST (sandbox).');
	return 'validation-unavailable';
}
