// tests/features/gateway-pg/recorded/mercadopago-alta-viaje-dni-en-conflicto-uat.recorded.ts
//
// REFERENCIA (no se ejecuta — el naming *.recorded.ts queda fuera de testMatch).
// Grabación original: tests/test-10.spec.ts · capturada el 2026-07-23.
//
// FLUJO: alta de viaje desde Carrier con tarjeta MERCADO PAGO (ARG) en **UAT**, incluyendo el 5°
//        campo DNI, costos extras (Fixed Fees) y envío del servicio.
// AMBIENTE: **UAT** (`apps-uat.magiis.com`), carrier ARG — NO es el carrier 1521 de TEST.
//   Coherente con la política del repo: Mercado Pago no transacciona en el sandbox de TEST, su
//   validación real se hace en UAT (deuda documentada del handoff MG-178).
//
// ⚠️⚠️ ESTA GRABACIÓN TERMINA EN "In Conflict (1)" — NO ES UN HAPPY PATH ⚠️⚠️
// Según el oráculo canónico definido por el líder de QA, "En conflicto" significa que el pago NO se
// hizo con datos válidos. Es el ÚNICO recording del repo que documenta ese estado, así que sirve
// como evidencia de referencia del caso negativo — pero NO debe derivarse un spec de happy path
// de acá. Antes de usarlo hay que determinar si el conflicto fue:
//   (a) un rechazo esperado de la tarjeta MP usada, o
//   (b) un defecto real del producto (en ese caso → reportar en DEV/MX, nunca en MG).
//
// ─── DATOS QUE ESTA GRABACIÓN CONFIRMÓ ────────────────────────────────────────────────
//  · Tarjeta MP: `4540 7300 6301 4410` · exp `03/31` · CVV `283`. NO es una tarjeta de Authorize
//    (4111) ni de Stripe (4242).
//  · **El 5° campo del form nativo es DNI, no ZIP**: `#creditCardOwnerIdType` → opción "DNI" →
//    número `95653886`. Confirma en vivo el `extraField: 'document'` que `NativeAngularCardForm`
//    implementa para Mercado Pago (vs `'zip'` para Authorize). El resto del form es IDÉNTICO:
//    número · MM/AA · CVV en `input[type="password"]` · titular.
//  · BL-050 también aplica a MP: la primera validación se hizo, luego se BORRÓ la tarjeta
//    (`.deselect-payment-method` → "Delete") y se repitió el llenado completo — el duplicado
//    bloquea igual que en Authorize.
//  · Costos extras: switches del form + `spinbutton` = 100 + sección "► Fixed Fees" +
//    `.fa.fa-trash.trash-one-shot` (eliminar un costo one-shot).
//  · Origen pre-cargado del cliente: "220 Center Ave, Brownwood" → reemplazado.
//
// ⚠️ Los `nth(3)` / `nth(4)` son locators posicionales del codegen (titular y DNI). En un spec se
// traducen a `cardFormFor('mercado-pago')` — nunca copiar esto tal cual.

import { test } from '@playwright/test';

test('recorded — Mercado Pago alta de viaje con DNI en UAT → terminó En Conflicto (referencia)', async ({ page }) => {
	// Login omitido (las recordings versionadas no llevan credenciales).
	// En un spec: loginAsDispatcher(page, { gateway: 'mercado-pago' }) — resuelve el carrier ARG.
	await page.goto('https://apps-uat.magiis.com/#/home/carrier/dashboard');
	await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();

	// Cliente/pasajero.
	await page.getByRole('textbox', { name: 'User to Search' }).fill('EMAN');
	await page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').click();

	// El origen viene pre-cargado ("220 Center Ave, Brownwood") → se reemplaza.
	await page.getByText('220 Center Ave, Brownwood,').click();
	await page.getByText('Ciudad de la Paz 2238, Buenos').first().click();
	await page.locator('.bootstrap.width-combo.input-search.ng-untouched.ng-pristine.ng-valid > .below > .single > .placeholder').click();
	await page.getByText('Reconquista 661, Buenos Aires').click();

	// Método de pago → tarjeta preautorizada.
	await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-3').click();
	await page.getByText('Credit Card - Pre-Authorized').click();

	// Form nativo Angular con 5° campo = DNI (Mercado Pago), no ZIP.
	await page.getByRole('textbox', { name: 'Card number *' }).fill('4540 7300 6301 4410');
	await page.getByRole('textbox', { name: 'MM/AA' }).fill('03/31');
	await page.locator('input[type="password"]').fill('283');
	await page.getByRole('textbox').nth(3).fill('EMANUEL RESTREPO');
	await page.locator('#creditCardOwnerIdType > .below > .single > .placeholder').click();
	await page.getByRole('listitem').filter({ hasText: 'DNI' }).click();
	await page.getByRole('textbox').nth(4).fill('95653886');
	await page.getByRole('button', { name: 'Valid' }).click();

	// BL-050: se borra la tarjeta recién vinculada y se repite el llenado completo.
	await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-3').click();
	await page.locator('.ng-star-inserted.highlighted > .data-with-icon-col > .deselect-payment-method > .fa').click();
	await page.getByRole('button', { name: 'Delete' }).click();
	await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-3').click();
	await page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').click();
	await page.getByRole('textbox', { name: 'Card number *' }).fill('4540 7300 6301 4410');
	await page.getByRole('textbox', { name: 'MM/AA' }).fill('03/31');
	await page.locator('input[type="password"]').fill('283');
	await page.getByRole('textbox').nth(3).fill('EMANUEL RESTREPO');
	await page.locator('#creditCardOwnerIdType > .below > .single > .placeholder').click();
	await page.getByRole('listitem').filter({ hasText: 'DNI' }).click();
	await page.getByRole('textbox').nth(4).fill('95653886');
	await page.getByRole('button', { name: 'Valid' }).click();

	// Vehículo + costos extras (switches, monto 100, Fixed Fees, eliminar costo one-shot).
	await page.getByRole('button', { name: 'Select Vehicle' }).click();
	await page.locator('.form-group > .form-group > .switch > .switch-label').first().click();
	await page.locator('.form-group > .form-group > .switch > .switch-label').first().click();
	await page.getByRole('spinbutton').fill('100');
	await page.getByRole('heading', { name: '► Fixed Fees' }).click();
	await page.locator('.fa.fa-trash.trash-one-shot').click();
	await page.getByRole('button', { name: 'Send Service' }).click();

	// ⚠️ RESULTADO: el viaje cayó en "In Conflict" — el pago NO se completó con datos válidos.
	await page.getByRole('banner').getByRole('link', { name: 'Trips Management' }).click();
	await page.getByRole('link', { name: 'In Conflict (1)' }).click();
});
