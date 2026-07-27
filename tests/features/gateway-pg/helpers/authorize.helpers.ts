import { type Page } from '@playwright/test';

/**
 * Helper Authorize.Net para el form de tarjeta pre-autorizada del carrier (portal web).
 *
 * Mismo form NATIVO Angular de MAGIIS que MercadoPago ("Credit Card - Pre-Authorized",
 * NO Stripe Elements/iframes). Diferencias con MP:
 *   - El TRIGGER del outcome NO es el titular (como en MP=APRO) sino el NÚMERO + CVV + ZIP
 *     (doc sandbox Authorize.Net): 4111111111111111 + CVV 900 = aprobada; ZIP 46282 = decline.
 *   - Campo ZIP (US) en vez de tipo/número de documento (DNI, ARG/MP).
 * Selectores number/exp/cvv/holder por `formcontrolname` (compartidos con el form MP).
 * FRAGILE: el `formcontrolname` del ZIP no está confirmado en vivo → se intenta por FCN conocidos
 * y cae a rol/posición. Confirmar en la corrida (P3) y fijar el selector real.
 * Fuente de datos: fixture tests/fixtures/gateways/authorize/cards.ts + grabación authorize2e2_happypath.ts.
 */

export type AuthorizeNativeCardInput = {
	/** Número de tarjeta. Ej. 4111111111111111 (Visa aprobada), 5424000000000015 (MC), 370000000000002 (Amex). */
	number: string;
	/** CVV. 3 díg (Visa/MC) o 4 díg (Amex). Sandbox aprobado = 900 / 9000 (Amex). */
	cvv: string;
	/** Expiración MM/AA. Default '12/34'. */
	exp?: string;
	/** Titular. En Authorize NO es trigger; nombre cualquiera. */
	holderName?: string;
	/** Código postal (US). Ej. '10001' (aprobado), '46282' (decline RC2). */
	zip: string;
};

/**
 * Completa el form nativo de tarjeta pre-autorizada (Authorize) dentro del alta de viaje.
 * Requiere que el método de pago ya esté en "Preautorizada"
 * (`NewTravelPage.selectPaymentMethod('Preautorizada')`). NO hace click en "Validar".
 *
 * @deprecated SUPERSEDED por `NativeAngularCardForm` (`@ui/carrier/card-forms`) — sin
 * consumidores; retirar en la próxima limpieza.
 */
export async function fillAuthorizeNativeCard(page: Page, input: AuthorizeNativeCardInput): Promise<void> {
	const exp = input.exp ?? '12/34';
	const holder = input.holderName ?? 'QA Authorize';

	const numberField = page.locator('input[formcontrolname="creditCardNumber"]');
	await numberField.click();
	await numberField.pressSequentially(input.number, { delay: 60 });
	await page.locator('input[formcontrolname="expiryDate"]').pressSequentially(exp, { delay: 60 });
	await page.locator('input[formcontrolname="creditCardCVV"]').pressSequentially(input.cvv, { delay: 60 });
	await page.locator('input[formcontrolname="creditCardOwnerName"]').fill(holder);

	// ZIP (US) — FRAGILE: probar formcontrolnames candidatos; fallback al textbox posicional del recording.
	const zipCandidates = page.locator(
		'input[formcontrolname="creditCardOwnerZipCode"], input[formcontrolname="zipCode"], input[formcontrolname="postalCode"], input[formcontrolname="creditCardOwnerZip"]',
	);
	if (await zipCandidates.count()) {
		await zipCandidates.first().pressSequentially(input.zip, { delay: 40 });
	} else {
		// Fallback: en la grabación el ZIP era el 5º textbox del form.
		await page.getByRole('textbox').nth(4).pressSequentially(input.zip, { delay: 40 });
	}

	// Guard: re-tipear el número si un re-render reactivo lo limpió.
	if (!(await numberField.inputValue().catch(() => ''))) {
		await numberField.click();
		await numberField.pressSequentially(input.number, { delay: 60 });
	}
}
