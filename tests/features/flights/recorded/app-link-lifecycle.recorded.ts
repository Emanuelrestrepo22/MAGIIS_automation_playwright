// tests/features/flights/recorded/app-link-lifecycle.recorded.ts
//
// REFERENCIA (no se ejecuta — naming *.recorded.ts fuera de testMatch).
// Recording del CICLO COMPLETO del app-link de Vuelos (FlightAware/AVIATION) en Carrier V1, UAT.
// Explica el "cambio de comportamiento" API-vinculada vs manual y cubre múltiples escenarios:
//
//  1. Carrier SIN API vinculada → alta de viaje con vuelo en modo MANUAL (Número de Vuelo +
//     Arribos/Partidas), SIN getFlights (no hay búsqueda de vuelos reales).
//  2. MAGIIS Apps Store → card del servicio Vuelos → "Vincular" → al vincular OK la card cambia
//     su descripción a "Desvincular" (cambio de comportamiento observable).
//  3. Alta manual con nota; vincular el vuelo en la EDICIÓN del viaje programado; la
//     desvinculación de la card de vuelo impacta directamente en la NOTA del viaje.
//  4. Edición con dirección de AEROPUERTO como parada (no debe romper) + vinculación OK +
//     trackeo de horas según las preferencias operativas del carrier.
//  5. En la última edición la fecha del vuelo se cambia al DÍA ACTUAL → el viaje se despacha OK.
//
// Dos carriers: `remiseriamagiis` (SIN API → manual) y `uatremiseriamagiis` (contexto API).
// Ref: MX-5824/5825/5826, ATP MX-6120 (Bloque A getFlights + Bloque D AeroAPI + TC-03a/b gating
// API↔manual + TC-11 edición). getFlights = proxy AeroAPI (memoria magiis-getflights-aeroapi).
// Locators recorder-derived; la selección de fila y algunos clicks son ruido del recorder.

import { expect, test } from '@playwright/test';

test('recorded — app-link lifecycle: manual vs API, vincular/desvincular, nota, aeropuerto-parada, despacho (referencia)', async ({ page }) => {
	await page.goto('https://apps-uat.magiis.com/#/authentication/login/carrier');
	await page.getByRole('textbox', { name: 'Email' }).fill('remiseriamagiis@gmail.com');
	await page.getByRole('textbox', { name: 'Contraseña' }).fill('Mag11s2022');
	await page.getByRole('button', { name: 'Ingresar' }).click();
	await page.getByRole('textbox', { name: 'Email' }).fill('uatremiseriamagiis@gmail.com');
	await page.getByRole('textbox', { name: 'Contraseña' }).fill('123');
	await page.getByRole('button', { name: 'Ingresar' }).click();
	await page.goto('https://apps-uat.magiis.com/#/home/carrier/dashboard');
	await page.getByRole('banner').getByRole('link', { name: 'Gestión de Viajes' }).click();
	await page.getByRole('banner').getByRole('link', { name: 'Nuevo Viaje' }).click();
	await page.locator('#clientSelect').getByText('Seleccione Usuario').click();
	await page.getByRole('textbox', { name: 'Usuario a Buscar' }).fill('ema');
	await page.getByText('Restrepo, Emanuel (+549112404884)').click();
	await page.getByText('Cazadores 1987, Buenos Aires').click();
	await page.getByRole('textbox', { name: 'Ingrese una dirección' }).fill('eze');
	await page.getByText('Aeropuerto Internacional').click();
	await page.locator('.multiple-destination-container > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder').click();
	await page.getByRole('textbox', { name: 'Ingrese una dirección' }).fill('reconquista');
	await page.getByText('Reconquista, Ciudad Autónoma de Buenos Aires, Argentina', { exact: true }).click();
	// Modo MANUAL (sin API): Número de Vuelo + Arribos/Partidas, sin getFlights.
	await page.locator('.btn.btn-primary.rounded-btn.btn-flight-round').click();
	await page.getByText('Seleccione Aerolínea').click();
	await page.getByRole('textbox', { name: 'Aerolínea a buscar' }).fill('argentin');
	await page.getByText('AR - Aerolíneas Argentinas').click();
	await page.getByRole('textbox', { name: 'Número de Vuelo:' }).fill('123');
	await page.locator('.row.ng-star-inserted > div > .round-inline > div:nth-child(2) > .round > label').click();
	await page.getByRole('button', { name: 'Aceptar' }).click();
	await page.locator('.btn.btn-primary.rounded-btn.btn-flight-round').click();
	await page.getByText('Ahora').nth(1).click();
	await page.getByRole('dialog').getByText('22:05').click();
	await page.locator('.row.ng-star-inserted > div > .round-inline > div:nth-child(2) > .round').click();
	await page.getByRole('button', { name: 'Aceptar' }).click();
	await page.locator('.btn.btn-primary.rounded-btn.btn-flight-round').click();
	await page.getByRole('textbox', { name: 'Número de Vuelo:' }).fill('123');
	await page.locator('.row.ng-star-inserted > div > .round-inline > div:nth-child(2) > .round').click();
	await page.getByRole('button', { name: 'Aceptar' }).click();
	await page.getByRole('button', { name: 'Seleccionar Vehículo' }).click();
	await page.getByRole('button', { name: 'Enviar Servicio' }).click();
	// Apps Store → Vincular el servicio de Vuelos (la card pasa a "Desvincular").
	await page.getByText('MAGIIS Apps Store').click();
	await page.getByText('Vincular').first().click();
	// Alta manual con nota + parada aeropuerto (2do viaje).
	await page.getByRole('banner').getByRole('link', { name: 'Nuevo Viaje' }).click();
	await page.locator('#clientSelect').getByText('Seleccione Usuario').click();
	await page.getByRole('textbox', { name: 'Usuario a Buscar' }).fill('dar');
	await page.getByText('dark empire (+543456789)').click();
	await page.getByText('Seleccione Usuario').click();
	await page.getByRole('textbox', { name: 'Usuario a Buscar' }).fill('ana');
	await page.locator('.highlighted > .data-with-icon-col').click();
	await page.locator('.ng-tns-c37-12.ng-untouched > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder').first().click();
	await page.getByRole('textbox', { name: 'Ingrese una dirección' }).fill('ezeiza');
	await page.getByText('Aeropuerto Internacional').click();
	await page.locator('.multiple-destination-container > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder').click();
	await page.getByRole('textbox', { name: 'Ingrese una dirección' }).fill('reconquista 661');
	await page.getByText('Reconquista 661, Ciudad Autó').click();
	await page.getByText('Aeropuerto Internacional').click();
	await page.getByText('✕').nth(2).click();
	await page.getByText('✕').nth(2).click();
	await page.getByText('✕').nth(2).click();
	await page.locator('.focus > .single > .placeholder').click();
	await page.getByRole('listitem').filter({ hasText: 'Reconquista 661, Buenos Aires' }).click();
	await page.locator('.above > .single > .placeholder').click();
	await page.getByRole('textbox', { name: 'Ingrese una dirección' }).fill('ciudad de la paz 2231');
	await page.locator('.multiple-destination-container > div > .search-container > div:nth-child(3) > .btn').click();
	await page.locator('.above > .single > .placeholder').click();
	await page.getByText('Ciudad de la Paz 2231, Ciudad Autónoma de Buenos Aires, Argentina', { exact: true }).click();
	await page.getByText('Ahora').first().click();
	await page.locator('.fa.fa-calendar').first().click();
	await page.getByText('16', { exact: true }).click();
	await page.getByText(':00').first().click();
	await page.getByText('15:00').click();
	await page.getByRole('button', { name: 'Seleccionar Vehículo' }).click();
	await page.getByRole('button', { name: 'Enviar Servicio' }).click();
	// Edición del programado: vincular vuelo por API (Buscar), Recalcular + Guardar.
	await page.getByRole('banner').getByRole('link', { name: 'Gestión de Viajes' }).click();
	await page.getByRole('link', { name: 'Programados (1)' }).click();
	await page.locator('button[title="Editar"], button[aria-label="Editar"], button[aria-description="Editar"]').first().click();
	await page.locator('button').nth(5).click();
	await page.getByText('Partidas').click();
	await page.getByText('Arribos').click();
	await page.getByText('Seleccione Aerolínea').click();
	await page.getByRole('textbox', { name: 'Aerolínea a buscar' }).fill('delta');
	await page.getByText('DL - Delta Air Lines').click();
	await page.getByRole('button', { name: 'Buscar' }).click();
	await page.getByRole('table').filter({ hasText: 'KE7282 - Korean Air 2026-07-' }).click();
	await page.getByRole('button', { name: 'Aceptar' }).click();
	await page.getByRole('button', { name: 'Recalcular' }).click();
	await page.getByRole('button', { name: 'Aceptar' }).click();
	await page.getByRole('button', { name: 'Guardar' }).click();
	// Edición con aeropuerto como parada + vinculación GOL + fecha DÍA ACTUAL → despacho OK.
	await page.getByRole('link', { name: 'Programados (1)' }).click();
	await page.locator('button[title="Editar"], button[aria-label="Editar"], button[aria-description="Editar"]').first().click();
	await page.locator('.btn.btn-primary.rounded-btn.btn-flight-round').click();
	await page.getByText('Seleccione Aerolínea').click();
	await page.getByRole('textbox', { name: 'Aerolínea a buscar' }).fill('gol');
	await page.getByText('G3 - Gol Linhas Aéreas').click();
	await page.getByRole('button', { name: 'Buscar' }).click();
	await page.locator('div:nth-child(3) > table > tbody > tr:nth-child(3) > td:nth-child(4)').click();
	await page.getByRole('button', { name: 'Aceptar' }).click();
	await page.getByText('14/07/2026 18:25', { exact: true }).click();
	await page.getByRole('button', { name: 'Recalcular' }).click();
	await page.getByRole('button', { name: 'Aceptar' }).click();
	await page.getByRole('button', { name: 'Guardar' }).click();
	// Verificación de estados: el/los viajes se despachan (Asignar / En curso).
	await page.getByRole('link', { name: 'Asignar (4)' }).click();
	await page.getByRole('link', { name: 'En curso (4)' }).click();
	await expect(page).toHaveURL(/travel\/dashboard/);
});
