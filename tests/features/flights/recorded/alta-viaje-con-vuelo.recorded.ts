// tests/features/flights/recorded/alta-viaje-con-vuelo.recorded.ts
//
// REFERENCIA (no se ejecuta en la suite — naming *.recorded.ts fuera de testMatch).
// Recording de codegen del ALTA DE VIAJE CON VUELO SATISFACTORIA (Carrier V1, UAT).
// Es la fuente de verdad de los locators que funcionan (login → nuevo viaje →
// cliente/pax → origen → destino=aeropuerto EZE → botón vuelo → aerolínea → seleccionar
// vuelo → Aceptar → vehículo → Enviar → verificar en Programados).
//
// El POM estable derivado vive en `../pages/FlightInfoModal.ts`; la spec ejecutable
// en `../specs/alta-viaje-con-vuelo.spec.ts`. Feature: MX-5824/5825/5826, ATP MX-6120.
// getFlights = proxy FlightAware AeroAPI (ver memoria magiis-getflights-aeroapi).

import { test } from '@playwright/test';

test('recorded — alta de viaje con vuelo satisfactoria (referencia)', async ({ page }) => {
	await page.goto('https://apps-uat.magiis.com/#/authentication/login/carrier');
	await page.getByRole('textbox', { name: 'Email' }).click();
	await page.getByRole('textbox', { name: 'Email' }).fill('uatremiseriamagiis@gmail.com');
	await page.getByRole('textbox', { name: 'Contraseña' }).click();
	await page.getByRole('textbox', { name: 'Contraseña' }).fill('123');
	await page.getByRole('button', { name: 'Ingresar' }).click();
	await page.goto('https://apps-uat.magiis.com/#/home/carrier/dashboard');
	await page.getByRole('banner').getByRole('link', { name: 'Nuevo Viaje' }).click();
	await page.locator('#clientSelect').getByText('Seleccione Usuario').click();
	await page.getByRole('textbox', { name: 'Usuario a Buscar' }).fill('eman');
	await page.locator('.data-with-icon-col').first().click();
	await page.getByText('Seleccione Usuario').click();
	await page.getByRole('textbox', { name: 'Usuario a Buscar' }).fill('eman');
	await page.getByText('Restrepo, Emanuel (+').click();
	await page.locator('.ng-tns-c28-3.ng-untouched > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder').first().click();
	await page.getByText('Reconquista 661, C1002 Cdad.').click();
	await page.locator('.multiple-destination-container > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder').click();
	await page.getByRole('textbox', { name: 'Ingrese una dirección' }).fill('eze');
	await page.getByText('Aeropuerto Internacional').click();
	await page.locator('.btn.btn-primary.rounded-btn.btn-flight-round').click();
	await page.getByText('Seleccione Aerolínea').click();
	await page.getByRole('textbox', { name: 'Aerolínea a buscar' }).fill('argentina');
	await page.getByText('AR - Aerolíneas Argentinas').click();
	await page.getByRole('button', { name: 'Buscar' }).click();
	await page.locator('.table-responsive > div:nth-child(20)').click();
	await page.getByRole('table').filter({ hasText: 'LY8836 - EL AL 2026-07-14' }).click();
	await page.locator('.card.card-widget.card-flight.ng-star-inserted.tr-select > table > tbody > tr:nth-child(2) > .text-left').click();
	await page.getByRole('cell', { name: 'LY8836 - EL AL' }).click();
	await page.locator('.card.card-widget.card-flight.ng-star-inserted.tr-select > table > tbody > tr:nth-child(3) > td:nth-child(3)').click();
	await page.locator('div:nth-child(23) > table > tbody > tr:nth-child(3) > td:nth-child(3)').click();
	await page.getByRole('button', { name: 'Aceptar' }).click();
	await page.getByRole('button', { name: 'Seleccionar Vehículo' }).click();
	await page.getByRole('button', { name: 'Enviar Servicio' }).click();
	await page.getByRole('banner').getByRole('link', { name: 'Gestión de Viajes' }).click();
	await page.getByRole('link', { name: 'Programados (8)' }).click();
	await page.locator('button[title="Editar"], button[aria-label="Editar"], button[aria-description="Editar"]').first().click();
	await page.getByText('Vuelo Asociado Sin vuelo').click();
	await page.getByRole('banner').getByRole('link', { name: 'Gestión de Viajes' }).click();
	await page.getByRole('link', { name: 'En curso (0)' }).click();
	await page.getByRole('link', { name: 'Programados (0)' }).click();
});
