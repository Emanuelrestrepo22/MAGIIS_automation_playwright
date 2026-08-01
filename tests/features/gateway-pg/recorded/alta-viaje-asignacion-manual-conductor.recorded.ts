// tests/features/gateway-pg/recorded/alta-viaje-asignacion-manual-conductor.recorded.ts
//
// REFERENCIA (no se ejecuta — el naming *.recorded.ts queda fuera de testMatch).
// Grabación original: tests/test-5.spec.ts · capturada el 2026-07-21.
//
// FLUJO: alta de viaje desde Carrier con ASIGNACIÓN MANUAL de conductor
//        ("Send Manual" + "Assign") en lugar del envío normal ("Send Service").
// TRAZABILIDAD: sin TC de matriz — es una TÉCNICA de setup, no un caso de prueba.
//
// El login se OMITE a propósito (las recordings versionadas no llevan credenciales).
//
// ─── PARA QUÉ SIRVE ESTA TÉCNICA ──────────────────────────────────────────────────────
// Es el approach que desbloqueó los E2E híbridos Carrier↔Driver App: "Send Service" publica el
// viaje y espera que un driver lo tome por el timer de oferta-candidatos, lo que hace el test
// no-determinista. "Send Manual" + "Assign" ASIGNA el conductor directamente, bypasseando ese
// timer — el viaje llega al device del driver de inmediato.
// Documentado en el handoff de la sesión E2E Cargo a Bordo como "ASIGNACIÓN MANUAL (bypass del
// timer de oferta-candidatos)".
//
// ⚠️ Notar que en este flujo NO se selecciona método de pago: el viaje se crea PLANO. Eso es
// deliberado — en Cargo a Bordo el cobro ocurre después, desde la App Driver.
//
// ─── DATOS QUE CONFIRMA ───────────────────────────────────────────────────────────────
//  · Cliente/pasajero: se busca "emanuel" → "Restrepo, Emanuel (+…".
//  · Botón de envío: "Send Manual" (no "Send Service").
//  · Después aparece un selector de conductor y se confirma con el botón "Assign".
//    El `getByText('Assign').nth(1)` previo al botón es la fila del conductor en la lista.

import { test } from '@playwright/test';

test('recorded — alta de viaje con asignación manual de conductor (referencia)', async ({ page }) => {
	// Login omitido: en el spec lo hace loginAsDispatcher(page).
	await page.goto('https://apps-test.magiis.com/#/home/carrier/dashboard');
	await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();

	// Cliente/pasajero.
	await page.locator('#clientSelect').getByText('Select User').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('emanuel');
	await page.getByText('Restrepo, Emanuel (+').click();

	// Origen (viaje PLANO: sin método de pago — el cobro va por App Driver).
	await page.locator('.bootstrap.width-combo.input-search.ng-untouched.ng-pristine.ng-valid > .below > .single > .placeholder').click();
	await page.getByText('Reconquista 661, Buenos Aires').click();
	await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-3').click();
	await page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').click();

	// Vehículo → envío MANUAL + asignación directa del conductor (bypass del timer de oferta).
	await page.getByRole('button', { name: 'Select Vehicle' }).click();
	await page.getByRole('button', { name: 'Send Manual' }).click();
	await page.getByText('Assign').nth(1).click();
	await page.getByRole('button', { name: 'Assign' }).click();
});
