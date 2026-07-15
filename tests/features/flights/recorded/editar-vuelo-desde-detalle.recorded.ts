// tests/features/flights/recorded/editar-vuelo-desde-detalle.recorded.ts
//
// REFERENCIA (no se ejecuta — naming *.recorded.ts fuera de testMatch).
// Recording de codegen de la EDICIÓN DE VUELO DESDE EL DETALLE (Carrier V1, UAT):
// Gestión de Viajes → Programados → Editar → cambiar aerolínea/vuelo (search "delta") →
// Recalcular → Aceptar → Guardar; luego Eliminar vuelo → Recalcular; re-asociar (AR).
// Mapea a TC-11 del ATP MX-6120 (precarga edición mode=3) + el defecto recalc (Recalcular).
//
// NOTE recorder: la línea 1 va a apps.magiis.com (PROD) por error del recorder; el flujo real
// corre contra apps-uat. La doble sesión de login y los clicks nth/celda son ruido del recorder.
// El POM estable derivado vive en `../pages/FlightInfoModal.ts` (open/searchAirline/selectFlightByLabel/
// accept/deleteAssociatedFlight) + `TravelDetailPage` (clickRecalculate/clickSave); la spec ejecutable
// en `../specs/editar-vuelo-desde-detalle.spec.ts`.

import { test } from '@playwright/test';

test('recorded — edición de vuelo desde detalle (referencia)', async ({ page }) => {
	await page.goto('https://apps.magiis.com/#/authentication/login/carrier');
	await page.getByRole('textbox', { name: 'Email' }).click();
	await page.getByRole('textbox', { name: 'Email' }).fill('uatremiseriamagiis@gmail.com');
	await page.getByRole('textbox', { name: 'Contraseña' }).click();
	await page.getByRole('textbox', { name: 'Contraseña' }).fill('123');
	await page.getByRole('button', { name: 'Ingresar' }).click();
	await page.goto('https://apps-uat.magiis.com/#/authentication/login/carrier');
	await page.getByRole('textbox', { name: 'Email' }).click();
	await page.getByRole('textbox', { name: 'Email' }).fill('uatremiseriamagiis@gmail.com');
	await page.getByRole('textbox', { name: 'Email' }).click();
	await page.getByRole('textbox', { name: 'Contraseña' }).click();
	await page.getByRole('textbox', { name: 'Contraseña' }).fill('123');
	await page.getByRole('button', { name: 'Ingresar' }).click();
	await page.getByRole('banner').getByRole('link', { name: 'Gestión de Viajes' }).click();
	await page.locator('a').filter({ hasText: 'Configuración' }).click();
	await page.getByRole('link', { name: 'Programados (8)' }).click();
	await page.locator('button[title="Editar"], button[aria-label="Editar"], button[aria-description="Editar"]').first().click();
	await page.getByText('Aerolíneas Argentinas AR7340').click();
	await page.getByText('Aerolíneas Argentinas AR7340').click();
	await page.getByText('Aerolíneas Argentinas AR7340').click();
	await page.getByText('Aerolíneas Argentinas AR7340').dblclick();
	await page.getByText('14/07/2026 23:25', { exact: true }).click();
	await page.getByText('14/07/2026 23:25', { exact: true }).click();
	await page.getByText('Aerolíneas Argentinas', { exact: true }).click();
	await page.locator('.fic-headline').click();
	await page.locator('.btn.btn-primary.rounded-btn.btn-flight-round').click();
	await page.getByText('Seleccione Aerolínea').click();
	await page.getByRole('textbox', { name: 'Aerolínea a buscar' }).fill('delta');
	await page.locator('.ng-star-inserted.highlighted > .data-with-icon-col').click();
	await page.getByRole('button', { name: 'Buscar' }).click();
	await page.locator('.table-responsive > div:nth-child(2)').click();
	await page.getByRole('button', { name: 'Aceptar' }).click();
	await page.getByRole('button', { name: 'Recalcular' }).click();
	await page.getByRole('button', { name: 'Aceptar' }).click();
	await page.getByRole('button', { name: 'Guardar' }).click();
	await page.locator('button[title="Editar"], button[aria-label="Editar"], button[aria-description="Editar"]').first().click();
	await page.locator('button[title="Eliminar vuelo"], button[aria-label="Eliminar vuelo"], button[aria-description="Eliminar vuelo"]').first().click();
	await page.getByRole('button', { name: 'Recalcular' }).click();
	await page.getByRole('button', { name: 'Aceptar' }).click();
	await page.locator('button[title="Modificar Nota"], button[aria-label="Modificar Nota"], button[aria-description="Modificar Nota"]').first().click();
	await page.getByRole('button', { name: 'Close' }).click();
	await page.locator('button').nth(5).click();
	await page.getByText('Seleccione Aerolínea').click();
	await page.getByRole('textbox', { name: 'Aerolínea a buscar' }).fill('argentina');
	await page.getByText('AR - Aerolíneas Argentinas').click();
	await page.getByRole('button', { name: 'Buscar' }).click();
	await page.locator('div:nth-child(16) > table > tbody > tr:nth-child(3) > td:nth-child(4)').click();
	await page.getByRole('button', { name: 'Aceptar' }).click();
});
