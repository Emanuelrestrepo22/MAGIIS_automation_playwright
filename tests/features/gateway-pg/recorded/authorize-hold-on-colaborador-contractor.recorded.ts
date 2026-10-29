// tests/features/gateway-pg/recorded/authorize-hold-on-colaborador-contractor.recorded.ts
//
// REFERENCIA (no se ejecuta — el naming *.recorded.ts queda fuera de testMatch).
// Grabación original: tests/test-4.spec.ts · capturada y VALIDADA EN PASS por QA el 2026-07-27.
//
// FLUJO: alta de viaje desde Carrier con tarjeta Authorize.Net preautorizada, HOLD ON,
//        para COLABORADOR DE CONTRACTOR (cliente y pasajero DIFIEREN).
// TRAZABILIDAD: TS-AUTHORIZE-TC1051 (docs/gateway-pg/authorize/matriz_cases.md §3.1)
//   Card flow de la matriz: "new (seed)" — el pax NO tenía tarjetas registradas al grabar.
// SPEC DERIVADO: specs/authorize/web/carrier/hold/colaborador-hold-on-happy.spec.ts
//
// El login se OMITE a propósito (política del repo: las recordings versionadas no llevan
// credenciales). En el spec lo resuelve `loginAsDispatcher(page, { gateway: 'authorize' })`.
//
// ─── DATOS QUE ESTA GRABACIÓN CONFIRMÓ ────────────────────────────────────────────────
//  · Cliente:  "fast car (+12545555555)"      → JOURNEY_DEFAULTS.contractorClient
//  · Pasajero: "smith, Emanuel (+54124048846)" → JOURNEY_DEFAULTS.contractorPassenger
//    A diferencia de personal/empresa, acá cliente ≠ pasajero ⇒ el pasajero SÍ se selecciona.
//  · Celda en la grilla: "Fast Car (pax) smith, Emanuel" — muestra CLIENTE + "(pax)" + PASAJERO.
//    El match del POM es token-based, así que buscar "smith, Emanuel" acierta igual.
//  · Destino elegido: "Cazadores 1987, Ciudad Autó…" — sufijo de localidad DISTINTO del string
//    canónico de JOURNEY_DEFAULTS ("…Buenos Aires, Argentina"). De acá salió el bug del filtro de
//    grilla: pasar el destino completo hacía fallar el match por los tokens "buenos"/"argentina".
//    El helper usa `shortDestination()` por esto.
//  · Método de pago (texto literal): "Credit Card - Pre-Authorized".
//  · Tras "Send Service" la URL queda en `travel/create?limitExceeded=false` — el viaje SÍ se creó
//    (comportamiento normal del producto documentado en BL-001, no un error).
//  · Estado final en la grilla: "Searching Driver".
//
// ⚠️ Los `nth(3)` / `nth(4)` son locators posicionales del codegen (titular y ZIP). En el spec se
// traducen a `cardFormFor('authorize')` — nunca copiar esto tal cual a un spec.

import { test } from '@playwright/test';

test('recorded — Authorize hold ON · colaborador de contractor (referencia)', async ({ page }) => {
	// Login omitido: en el spec lo hace loginAsDispatcher(page, { gateway: 'authorize' }).
	await page.goto('https://apps-test.magiis.com/#/home/carrier/dashboard');
	await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();
	await page.locator('.row.justify-content-sm-end').click();

	// Cliente = empresa contractor.
	await page.locator('#clientSelect').getByText('Select User').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('fast');
	await page.getByText('fast car (+12545555555)').click();

	// Pasajero = colaborador CON tarjeta activa (distinto del cliente).
	await page.getByText('Select User').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('eman');
	await page.getByText('smith, Emanuel (+54124048846)').click();

	// Origen y destino.
	await page
		.locator(
			'.ng-tns-c28-3.ng-untouched > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
		)
		.first()
		.click();
	await page.getByText('Reconquista 661, Buenos Aires').click();
	await page
		.locator(
			'.multiple-destination-container > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
		)
		.click();
	await page.getByText('Cazadores 1987, Ciudad Autó').click();

	// Método de pago → tarjeta preautorizada. El pax no tenía tarjetas (card flow "new seed"),
	// así que NO hizo falta el borrado previo de BL-050.
	await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-3').click();
	await page.getByText('Credit Card - Pre-Authorized').click();

	// Form nativo Angular: número · MM/AA · CVV (input[type=password]) · titular · ZIP.
	await page.getByRole('textbox', { name: 'Card number *' }).fill('4111 1111 1111 1111');
	await page.getByRole('textbox', { name: 'MM/AA' }).fill('12/30');
	await page.locator('input[type="password"]').fill('900');
	await page.getByRole('textbox').nth(3).fill('Tester Qa PruebaDos');
	await page.getByRole('textbox').nth(4).fill('90210');

	// Validación de tarjeta → HOLD DE VINCULACIÓN (primera transacción; ver BL-051).
	await page.getByRole('button', { name: 'Valid' }).click();

	// Armado y envío del servicio → HOLD DEL VIAJE (segunda transacción).
	await page.getByRole('button', { name: 'Select Vehicle' }).click();
	await page.getByRole('button', { name: 'Send Service' }).click();

	// Verificación: fila "Fast Car (pax) smith, Emanuel" con estado "Searching Driver".
	await page.getByRole('banner').getByRole('link', { name: 'Trips Management' }).click();
	await page.getByRole('cell', { name: 'Fast Car (pax) smith, Emanuel' }).click();
	await page.getByText('Searching Driver').nth(1).dblclick();
});
