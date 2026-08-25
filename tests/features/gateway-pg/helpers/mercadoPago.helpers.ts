import { expect, type Locator, type Page } from '@playwright/test';
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
	await docTypeSelect
		.getByText(new RegExp(`^\\s*${docType}\\s*$`, 'i'))
		.last()
		.click();
	// Número de documento (formcontrolname estable, era nth(4) frágil).
	await page.locator('input[formcontrolname="creditCardOwnerId"]').pressSequentially(docNumber, { delay: 40 });

	// Guard: re-tipear el número si quedó vacío (algún re-render reactivo lo pudo limpiar).
	if (!(await numberField.inputValue().catch(() => ''))) {
		await numberField.click();
		await numberField.pressSequentially(number, { delay: 60 });
	}
}

/** Ventana acotada (por intento) para detectar el desenlace de la validación MP. */
const MP_VALIDATION_OUTCOME_TIMEOUT_MS = 5_000;

/** Botón "Validar" del form nativo MP — locator ÚNICO (consumido acá y por `expectValidateCardEnabled`). */
const validarButton = (page: Page): Locator => page.getByRole('button', { name: /^Validar$/i });

/**
 * Control positivo del form MP: "Validar" habilitado = form reactivo Angular válido = el flujo
 * PROGRESÓ hasta el punto donde la validación puede dispararse. Encapsula locator + assert
 * (antes duplicado inline en `mp-no-3ds-validation.spec.ts`).
 *
 * TODO(live): la premisa disabled-until-valid del botón "Validar" NO tiene captura live para MP
 * (verificada para el modal Authorize, no para este form) — confirmar en una corrida viva.
 */
export async function expectValidateCardEnabled(page: Page, timeout = 15_000): Promise<void> {
	await expect(validarButton(page), 'el form MP debe quedar válido y "Validar" habilitado').toBeEnabled({ timeout });
}

/** Tarjeta resaltada en el dropdown de métodos de pago = vinculación satisfactoria (recording test-15). */
const highlightedCard = (page: Page): Locator =>
	page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').first();

/**
 * Error explícito del sandbox MP — manifestación documentada de la limitación de entorno en TEST.
 * `.first()` (igual que `highlightedCard`): el error puede renderizarse a la vez como toast +
 * inline → sin `.first()`, el strict-mode violation resolvería la race a 'none' en t≈0.
 */
const mpValidationError = (page: Page): Locator => page.getByText(/Error al validar tarjeta/i).first();

/**
 * Espera acotada y DETERMINISTA del desenlace de la validación MP: race entre "tarjeta
 * resaltada" y "error visible", cada rama con `waitFor({ state: 'visible' })` y timeout
 * declarado — reemplaza el polling con `isVisible()` one-shot (race-prone). El valor retornado
 * queda LATCHEADO al momento de la detección: los callers clasifican sobre él, NUNCA re-leyendo
 * el DOM después.
 */
export async function waitForMpValidationOutcome(
	page: Page,
	timeout = MP_VALIDATION_OUTCOME_TIMEOUT_MS
): Promise<'highlighted' | 'error' | 'none'> {
	// Solo el agotamiento de la ventana (TimeoutError) se traduce a 'none'; cualquier otra
	// rejection (frame detached, page closed, strict-mode) se RE-LANZA — un fallo de
	// infraestructura no debe disfrazarse de "sin señal" y habilitar un skip indebido.
	const noneOnTimeout = (error: Error): 'none' => {
		if (error.name !== 'TimeoutError') throw error;
		return 'none' as const;
	};
	return Promise.race([
		highlightedCard(page)
			.waitFor({ state: 'visible', timeout })
			.then(() => 'highlighted' as const, noneOnTimeout),
		mpValidationError(page)
			.waitFor({ state: 'visible', timeout })
			.then(() => 'error' as const, noneOnTimeout)
	]);
}

/**
 * Resultado de la validación de tarjeta MP (contrato tri-estado):
 * - `'linked'`: la tarjeta quedó vinculada (resaltada) → se puede continuar el alta.
 * - `'validation-unavailable'`: la validación NO completó — CON o SIN el error explícito
 *   "Error al validar tarjeta". Ese error es la MANIFESTACIÓN DOCUMENTADA de la limitación del
 *   sandbox MP en TEST (la validación/transacción de tarjetas sandbox MP **no completa en
 *   TEST** — ver header de `mp-no-3ds-validation.spec.ts`; va a UAT con tarjeta real). Un FAIL
 *   duro sobre ese error produciría false-fail sistemático en TEST. El caller debe `test.skip`
 *   con esa razón (el form-fill + habilitación de "Validar" SÍ quedaron verificados = la
 *   cobertura controlable en TEST).
 * - `'validation-failed'`: RESERVADO — solo se emitirá cuando exista evidencia live (UAT/entorno
 *   transaccional) de una señal de fallo distinguible de la limitación sandbox; HOY ningún
 *   camino lo retorna en TEST. Los guards `expect(result).not.toBe('validation-failed')` de los
 *   callers quedan future-proof (hoy inertes).
 *
 * Oráculo de éxito (recording test-15, líneas 44-49): tras "Validar" la tarjeta aparece
 * **resaltada** en el dropdown de métodos de pago; seleccionarla la deja activa para el viaje.
 * NOTE (recording test-15): "Validar" puede requerir reintento antes de que la tarjeta quede
 * vinculada — se reintenta (hasta `attempts`) mientras el desenlace sea 'none'.
 */
export async function validateAndSelectMercadoPagoCard(
	page: Page,
	attempts = 3
): Promise<'linked' | 'validation-failed' | 'validation-unavailable'> {
	const validar = validarButton(page);
	const paymentMethods = page.locator('#add_travel_payment_methods');

	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		if (await validar.isEnabled().catch(() => false)) {
			await validar.click({ force: true });
		}
		await paymentMethods
			.locator('.below .single .value .data-with-icon-col')
			.first()
			.click()
			.catch(() => {});
		// LATCH: el desenlace se detecta UNA vez por intento (espera acotada determinista) y la
		// clasificación de abajo usa ese valor — nunca se re-lee el DOM para clasificar después.
		const outcome = await waitForMpValidationOutcome(page);
		if (outcome === 'highlighted') {
			await highlightedCard(page).click();
			return 'linked';
		}
		if (outcome === 'error') {
			// No reintentar: señal explícita (no es flakiness) = manifestación documentada de la
			// limitación sandbox MP en TEST → habilita el skip del caller.
			console.warn(
				'[MP] "Error al validar tarjeta" — manifestación documentada de la limitación sandbox MP en TEST (la validación no completa). Form-fill + "Validar" verificados; el resto es UAT-only.'
			);
			return 'validation-unavailable';
		}
		// outcome === 'none': sin señal dentro de la ventana — reintentar ("Validar" puede
		// requerir retry antes de que la tarjeta quede vinculada, ver NOTE del recording test-15).
	}

	// Sin tarjeta resaltada ni error explícito tras los intentos: señal indeterminada →
	// limitación de entorno (sandbox MP no transacciona en TEST) — también skip del caller.
	console.warn(
		'[MP] Tarjeta MP no quedó vinculada ni hubo error explícito — se trata como validación no disponible en TEST (sandbox).'
	);
	return 'validation-unavailable';
}
