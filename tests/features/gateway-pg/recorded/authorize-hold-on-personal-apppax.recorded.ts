// tests/features/gateway-pg/recorded/authorize-hold-on-personal-apppax.recorded.ts
//
// REFERENCIA (no se ejecuta — el naming *.recorded.ts queda fuera de testMatch).
// Grabación original: tests/test-3.spec.ts · capturada y VALIDADA EN PASS por QA el 2026-07-27.
//
// FLUJO: alta de viaje desde Carrier con tarjeta Authorize.Net preautorizada, HOLD ON,
//        para usuario PERSONAL / APP PAX (el cliente ES el pasajero).
// TRAZABILIDAD: TS-AUTHORIZE-TC1011 (docs/gateway-pg/authorize/matriz_cases.md §2.1)
// SPEC DERIVADO: specs/authorize/web/carrier/hold/personal-hold-on-happy.spec.ts
//
// El login se OMITE a propósito (política del repo para recordings versionadas: no llevan
// credenciales). En el spec lo resuelve `loginAsDispatcher(page, { gateway: 'authorize' })`.
//
// ─── DATOS QUE ESTA GRABACIÓN CONFIRMÓ ────────────────────────────────────────────────
//  · Cliente/pasajero: se busca "eman" → "Restrepo, Emanuel". Usuario personal ⇒ cliente = pasajero,
//    y el campo de pasajero queda AUTO-ASIGNADO (no se toca).
//  · Form de tarjeta: NATIVO Angular, sin iframe (los locators salen directo de `page`).
//    Refuta la sección "Accept.js iframe" de matriz_cases2.md §7 → ver defecto M3 del plan.
//  · El CVV NO es un textbox: es `input[type="password"]`. Por eso el orden posicional de los
//    textbox salta de nth(1) a nth(3).
//  · ZIP = `getByRole('textbox').nth(4)`. Confirmó que el fallback posicional de
//    `NativeAngularCardForm.fillZipField()` acierta — el `formcontrolname` sigue sin confirmarse.
//  · Botón de validación: "Valid" (portal en inglés en sesión manual; el spec corre en ES porque
//    `loginAsDispatcher` fuerza `ensureSpanishLanguage`).
//  · Estado final en la grilla: "Searching Driver".
//
// ─── BL-050 · PRECONDICIÓN DE TARJETA DUPLICADA ───────────────────────────────────────
// Las líneas de borrado (`.deselect-payment-method` → "Delete") NO son ruido: si el cliente ya
// tiene vinculada una tarjeta con el MISMO NÚMERO, el botón "Validar" NO se habilita. Hay que
// eliminarla y recién después adicionarla. Notar que el locator del trash va SIN `.highlighted`:
// una tarjeta vinculada pero no seleccionada bloquea igual. Ese detalle fue el que destapó el bug
// de `deleteHighlightedSavedCard()`, que sólo miraba la resaltada.
//
// ⚠️ Los `nth(3)` / `nth(4)` son locators posicionales del codegen. En el spec se traducen a
// `cardFormFor('authorize')` — nunca copiar esto tal cual a un spec.

import { test } from '@playwright/test';

test('recorded — Authorize hold ON · usuario personal/app pax (referencia)', async ({ page }) => {
	// Login omitido: en el spec lo hace loginAsDispatcher(page, { gateway: 'authorize' }).
	await page.goto('https://apps-test.magiis.com/#/home/carrier/dashboard');
	await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();

	// Cliente = pasajero (usuario personal). El campo de pasajero se auto-asigna.
	await page.locator('#clientSelect').getByText('Select User').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('emanu');
	await page.locator('.data-with-icon-col').first().click();

	// Origen y destino.
	await page.getByText('Ciudad de la Paz 2238, Buenos').click();
	await page.getByText('Reconquista 661, Buenos Aires').click();
	await page.locator('.bootstrap.width-combo.input-search.ng-untouched.ng-pristine.ng-valid > .below > .single > .placeholder').click();
	await page.getByText('Cazadores 1987, Buenos Aires').click();

	// Método de pago → tarjeta preautorizada.
	await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-3').click();
	await page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').click();

	// BL-050: la tarjeta 4111 ya estaba vinculada → primer intento con "Validar" deshabilitado.
	// Se elimina del wallet para poder adicionarla de nuevo.
	await page.locator('.deselect-payment-method').first().click();
	await page.getByRole('button', { name: 'Delete' }).click();
	await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-3').click();
	await page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').click();

	// Form nativo Angular: número · MM/AA · CVV (input[type=password]) · titular · ZIP.
	await page.getByRole('textbox', { name: 'Card number *' }).fill('4111 1111 1111 1111');
	await page.getByRole('textbox', { name: 'MM/AA' }).fill('12/30');
	await page.locator('input[type="password"]').fill('900');
	await page.getByRole('textbox').nth(3).fill('MAGIIS QA TESTER');
	await page.getByRole('textbox').nth(4).fill('90210');

	// Validación de tarjeta → dispara el HOLD DE VINCULACIÓN (no es una validación de formato).
	await page.getByRole('button', { name: 'Valid' }).click();

	// Armado y envío del servicio → HOLD DEL VIAJE (segunda transacción; ver BL-051).
	await page.getByRole('button', { name: 'Select Vehicle' }).click();
	await page.getByRole('button', { name: 'Send Service' }).click();

	// Verificación: el viaje queda en gestión con estado "Searching Driver".
	await page.getByRole('banner').getByRole('link', { name: 'Trips Management' }).click();
	await page.getByRole('cell', { name: '-W ' }).click();
	await page.getByText('Searching Driver').click();
});
