// tests/features/gateway-pg/recorded/authorize-hold-on-empresa-individuo.recorded.ts
//
// REFERENCIA (no se ejecuta — el naming *.recorded.ts queda fuera de testMatch).
// Grabación original: tests/test-6.spec.ts · capturada y VALIDADA EN PASS por QA el 2026-07-27.
//
// FLUJO: alta de viaje desde Carrier con tarjeta Authorize.Net preautorizada, HOLD ON,
//        para cliente EMPRESA INDIVIDUO.
// TRAZABILIDAD: TS-AUTHORIZE-TC1061 (docs/gateway-pg/authorize/matriz_cases.md §4.1)
// SPEC DERIVADO: specs/authorize/web/carrier/hold/empresa-hold-on-happy.spec.ts
//
// El login se OMITE a propósito (política del repo: las recordings versionadas no llevan
// credenciales). En el spec lo resuelve `loginAsDispatcher(page, { gateway: 'authorize' })`.
//
// ─── DATOS QUE ESTA GRABACIÓN CONFIRMÓ ────────────────────────────────────────────────
//  · Cliente: se busca "marce" → "Stripe, Marcelle (+9398989887)". El portal muestra el nombre en
//    formato "apellido, nombre"; la fixture dice 'Marcelle Stripe' y matchea igual porque el match
//    del POM es token-based (verificado).
//  · PASAJERO AUTO-ASIGNADO: el dropdown muestra "Customer Stripe, Marcelle" — el cliente empresa
//    individuo se asigna a sí mismo como pasajero. Confirma la heurística `client === passenger`
//    del helper, que en ese caso NO toca el campo (el POM legacy falla si está deshabilitado).
//  · Celda en la grilla: "Stripe, Marcelle" — el CLIENTE titular, no un sub-pasajero (BL-003).
//  · ⚠️ ORIGEN PRE-CARGADO: al elegir el cliente, el origen viene con
//    "3500 Paradise Road, Las Vegas" (dirección por defecto del cliente) y hay que REEMPLAZARLO.
//    En la corrida automatizada de TC1061 el paso de origen pasó en verde SIN reemplazarlo —
//    `setOrigin()` presiona Escape y retorna si el autocomplete no responde. De ahí salió
//    `assertOriginSet()`: el viaje se estaba armando con Las Vegas en lugar de Reconquista 661.
//  · Método de pago (texto literal): "Credit Card - Pre-Authorized".
//  · "Select Vehicle" fue clickeado DOS veces — puede que el primer click no tome, o ruido del
//    recorder. El spec lo clickea una vez, después de `waitForVehicleSelectionReady()`.
//  · Estado final en la grilla: "Searching Driver".
//
// ⚠️ Los `nth(3)` / `nth(4)` son locators posicionales del codegen (titular y ZIP). En el spec se
// traducen a `cardFormFor('authorize')` — nunca copiar esto tal cual a un spec.

import { test } from '@playwright/test';

test('recorded — Authorize hold ON · cliente empresa individuo (referencia)', async ({ page }) => {
	// Login omitido: en el spec lo hace loginAsDispatcher(page, { gateway: 'authorize' }).
	await page.goto('https://apps-test.magiis.com/#/home/carrier/dashboard');
	await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();

	// Cliente empresa individuo. El pasajero se AUTO-ASIGNA ("Customer Stripe, Marcelle").
	await page.locator('#clientSelect').getByText('Select User').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('marce');
	await page.getByText('Stripe, Marcelle (+9398989887)').click();

	// El origen viene PRE-CARGADO con la dirección del cliente → hay que reemplazarlo.
	await page.getByText('3500 Paradise Road, Las Vegas').click();
	await page.getByText('Marcela Usa Peru Juan Not Configured Customer Stripe, Marcelle (+9398989887').click();
	await page.locator('.focus > .single > .placeholder').click();
	await page.getByRole('listitem').filter({ hasText: 'Reconquista 661, C1002 Cdad.' }).click();

	// Destino.
	await page.locator('.multiple-destination-container > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder').click();
	await page.getByText('Cazadores 1987, Buenos Aires').click();

	// Método de pago → tarjeta preautorizada.
	await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-11').click();
	await page.getByText('Credit Card - Pre-Authorized').click();

	// Form nativo Angular: número · MM/AA · CVV (input[type=password]) · titular · ZIP.
	await page.getByRole('textbox', { name: 'Card number *' }).fill('4111 1111 1111 1111');
	await page.getByRole('textbox', { name: 'MM/AA' }).fill('12/30');
	await page.locator('input[type="password"]').fill('900');
	await page.getByRole('textbox').nth(3).fill('MAGIIS QA TESTTRES');
	await page.getByRole('textbox').nth(4).fill('90210');

	// Validación de tarjeta → HOLD DE VINCULACIÓN (primera transacción; ver BL-051).
	await page.getByRole('button', { name: 'Valid' }).click();

	// Armado y envío del servicio → HOLD DEL VIAJE (segunda transacción).
	await page.getByRole('button', { name: 'Select Vehicle' }).click();
	await page.getByRole('button', { name: 'Send Service' }).click();

	// Verificación: fila "Stripe, Marcelle" con estado "Searching Driver".
	await page.getByRole('banner').getByRole('link', { name: 'Trips Management' }).click();
	await page.getByRole('cell', { name: 'Stripe, Marcelle' }).dblclick();
	await page.getByText('Searching Driver').nth(2).dblclick();
});
