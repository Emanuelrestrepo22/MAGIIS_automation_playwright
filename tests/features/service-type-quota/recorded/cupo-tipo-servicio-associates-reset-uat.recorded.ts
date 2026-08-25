// tests/features/service-type-quota/recorded/cupo-tipo-servicio-associates-reset-uat.recorded.ts
//
// REFERENCIA (no se ejecuta — el naming *.recorded.ts queda fuera de testMatch).
// Grabación original: tests/test-1.spec.ts · capturada el 2026-07-16.
//
// FLUJO: cupo de TIPO DE SERVICIO en el portal Carrier — alta de viajes hasta agotar el cupo de un
//        colaborador, tabla "Associates" con el contador de uso, y "Confirm Reset" para resetearlo.
// AMBIENTE: **UAT** (`apps-uat.magiis.com`), sobre el build v1.72.6.
// TRAZABILIDAD: MX-6057 (ATP MX-6120) — la feature vive en `tests/features/service-type-quota/`.
//   Ver BL-046 y BL-047 del BACKLOG: la discovery de selectores y la validación del blueprint UI
//   están pendientes de un ambiente estable, y esta grabación es la evidencia de referencia.
//
// El login se OMITE a propósito (política del repo: las recordings versionadas no llevan
// credenciales). En un spec lo resuelve `loginAsDispatcher(page)` con las creds de UAT.
//
// ─── QUÉ CUBRE ────────────────────────────────────────────────────────────────────────
//  · Alta de viaje repetida para el mismo colaborador hasta consumir el cupo de su tipo de servicio.
//    Los pasajeros usados son de prueba: "anakin", "arturito", "darth".
//  · Sección **Associates** (Gestión de Empresas): tabla con el contador de uso por colaborador —
//    el endpoint de lectura de ese contador es justamente lo que BL-046 propone descubrir para
//    aseverar el efecto sin depender de la capa Oracle (firewalleada desde local).
//  · **"Confirm Reset"**: reseteo del cupo. Es la acción cuyo efecto (uso → 0, aislamiento entre
//    colaboradores) hay que verificar.
//  · Direcciones usadas: "reconquista 661" y "tucuman 1".
//
// ⚠️ Es una grabación LARGA y con muchos locators posicionales/CSS del codegen
// (`#id_tab_add_travel > div:nth-child(7)`, `.ng-tns-c28-3…`). Sirve como mapa del flujo, NO como
// base para copiar selectores a un spec: el blueprint UI de la feature está en
// `tests/features/service-type-quota/` y ahí se estabilizan los locators.

import { test } from '@playwright/test';

test('recorded — cupo de tipo de servicio: Associates + Confirm Reset en UAT (referencia)', async ({ page }) => {
	// Login omitido: en un spec lo hace loginAsDispatcher(page).
	await page.goto('https://apps-uat.magiis.com/#/home/carrier/dashboard');
	await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();
	await page.locator('#id_tab_add_travel > div:nth-child(7)').click();
	await page.locator('#clientSelect').getByText('Select User').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('anakin');
	await page.locator('.data-with-icon-col').first().click();
	await page.getByText('Select User').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('anakin');
	await page.locator('.highlighted > .data-with-icon-col').click();
	await page.getByText('Regular').click();
	await page.getByText('v1.72.6', { exact: true }).click();
	await page.getByText('v1.72.6', { exact: true }).click();
	await page.getByRole('listitem').filter({ hasText: 'v1.72.6' }).click();
	await page
		.locator(
			'.ng-tns-c28-3.ng-untouched > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
		)
		.first()
		.click();
	await page.getByText('Reconquista 661, Buenos Aires').click();
	await page.getByText('Reconquista 661, Buenos Aires').click();
	await page.getByText('Ciudad de la Paz 2238, Buenos').first().click();
	await page.getByText('Ciudad de la Paz 2238, Buenos').click();
	await page.getByText('Reconquista 661, Buenos Aires').click();
	await page.getByText('Avoid Tolls Avoid Highways').click();
	await page
		.locator(
			'.multiple-destination-container > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
		)
		.click();
	await page.getByText('Ciudad de la Paz 2238, Buenos').first().click();
	await page.getByRole('button', { name: 'Select Vehicle' }).click();
	await page.getByRole('button', { name: 'Send Manual' }).click();
	await page.getByText('Assign').nth(2).click();
	await page.getByRole('link', { name: 'In Progress (1)' }).click();
	await page.getByRole('link', { name: 'Assign (2)' }).click();
	await page.getByRole('link', { name: 'In Progress (2)' }).click();
	await page.getByRole('link', { name: 'Assign (1)' }).click();
	await page.getByRole('link', { name: 'In Progress (2)' }).click();
	await page.locator('a').filter({ hasText: 'Customers' }).first().click();
	await page.getByRole('link', { name: 'Corporations Management' }).click();
	await page.getByRole('textbox', { name: 'Search...' }).click();
	await page.getByRole('textbox', { name: 'Search...' }).fill('dark');
	await page
		.locator('tr:nth-child(2) > .acciones-container > span > .action-btn.action-btn-sm.action-btn-default > .fa')
		.click();
	await page.getByRole('link', { name: 'Associates', exact: true }).click();
	await page.locator('span:nth-child(3) > .fa').first().click();
	await page.getByRole('cell', { name: 'v1.72.6' }).click();
	await page.locator('td').filter({ hasText: /^1$/ }).click();
	await page.getByRole('cell', { name: '1', exact: true }).nth(1).click();
	await page.getByRole('cell', { name: 'v1.72.6' }).click();
	await page.getByRole('cell', { name: '1', exact: true }).nth(1).click();
	await page.getByRole('cell', { name: '2', exact: true }).dblclick();
	await page.getByRole('cell', { name: '2', exact: true }).click();
	await page.getByRole('dialog').getByText('Close').click();
	await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();
	await page.locator('#clientSelect').getByText('Select User').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('anakin');
	await page.locator('.data-with-icon-col').first().click();
	await page.getByText('Select User').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('anakin');
	await page.locator('.highlighted > .data-with-icon-col').click();
	await page
		.locator(
			'.ng-tns-c28-19.ng-untouched > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
		)
		.first()
		.click();
	await page.getByText('Reconquista 661, Buenos Aires').click();
	await page
		.locator(
			'.multiple-destination-container > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
		)
		.click();
	await page.getByText('Ciudad de la Paz 2238, Buenos').nth(1).click();
	await page.getByRole('button', { name: 'Select Vehicle' }).click();
	await page.getByRole('button', { name: 'Send Service' }).click();
	await page.getByRole('banner').getByRole('link', { name: 'Trips Management' }).click();
	await page.locator('tr:nth-child(2) > td:nth-child(16) > .text-nowrap > .action-btn.color-gray').click();
	await page.locator('tr:nth-child(2) > td:nth-child(16) > .text-nowrap > button:nth-child(4)').click();
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.locator('button').nth(3).click();
	await page.goto(
		'https://apps-uat.magiis.com/#/home/carrier/travel/dashboard?find=&startDate=2026-07-16&endDate=2026-08-15'
	);
	await page.locator('button:nth-child(4)').click();
	await page.getByRole('button', { name: 'Continue' }).click();
	await page.getByRole('link', { name: 'Programmed (4)' }).click();
	await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('anakin');
	await page.locator('.data-with-icon-col').first().click();
	await page.getByText('Select User').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('arturi');
	await page.locator('.highlighted > .data-with-icon-col').click();
	await page.getByText('Regular').click();
	await page.getByText('skiwalker, Arturitu (+').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('artu');
	await page.locator('.highlighted > .data-with-icon-col').click();
	await page.getByText('Regular').click();
	await page.locator('.data-with-icon-col').first().click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('dark');
	await page.getByRole('listitem').filter({ hasText: 'dark empire (+543456789)' }).click();
	await page.getByText('skiwalker, Arturitu (+').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('anakin');
	await page.getByText('skywaker, Anakin (+543456789)').click();
	await page.getByText('Regular').click();
	await page.getByText('v1.72.6', { exact: true }).click();
	await page.getByText('v1.72.6', { exact: true }).click();
	await page.getByText('Pick-Up *').click();
	await page.getByText('Pick-Up *').click();
	await page.locator('app-input-search-place').nth(3).click();
	await page.getByText('Reconquista 661, Buenos Aires').click();
	await page.getByText('Reconquista 661, Buenos Aires').nth(1).click();
	await page.getByRole('textbox', { name: 'Enter an address' }).fill('tucuman 1');
	await page.getByText('Tucumán 1, Buenos Aires,').click();
	await page.getByText('Avoid Tolls Avoid Highways').click();
	await page.getByText('Wedding').click();
	await page.getByText('v1.72.6', { exact: true }).click();
	await page.getByText('Tucumán 1, Moreno, Buenos').click();
	await page.getByRole('button', { name: 'Select Vehicle' }).click();
	await page.getByRole('button', { name: 'Send Manual' }).click();
	await page.getByText('Assign').nth(2).click();
	await page.getByRole('link', { name: 'In Progress (2)' }).click();
	await page.locator('a').filter({ hasText: 'Customers' }).first().click();
	await page.getByRole('link', { name: 'Corporations Management' }).click();
	await page.getByRole('textbox', { name: 'Search...' }).click();
	await page.getByRole('textbox', { name: 'Search...' }).fill('dark');
	await page
		.locator('tr:nth-child(2) > .acciones-container > span > .action-btn.action-btn-sm.action-btn-default > .fa')
		.click();
	await page.getByRole('link', { name: 'Preferences', exact: true }).click();
	await page.getByRole('link', { name: 'Associates', exact: true }).click();
	await page.locator('span:nth-child(3) > .fa').first().click();
	await page.getByRole('cell', { name: '2', exact: true }).nth(1).click();
	await page.getByRole('cell', { name: '2', exact: true }).nth(1).click();
	await page.getByRole('dialog').getByText('Close').click();
	await page.locator('tr:nth-child(2) > .acciones-container > span:nth-child(3) > .fa').click();
	await page.getByRole('dialog').getByText('Close').click();
	await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('anakin');
	await page.locator('.data-with-icon-col').first().click();
	await page.getByText('Select User').click();
	await page.getByText('Select User').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('anakin');
	await page.getByText('skywaker, Anakin (+543456789)').click();
	await page
		.locator(
			'.ng-tns-c28-60.ng-untouched > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
		)
		.first()
		.click();
	await page.getByText('Regular').click();
	await page.getByText('Regular').click();
	await page.getByText('v1.72.6', { exact: true }).click();
	await page
		.locator(
			'.bootstrap.width-combo.input-search.ng-pristine.ng-valid.ng-touched > .below > .single > .placeholder'
		)
		.click();
	await page.getByText('Reconquista 661, Buenos Aires').click();
	await page
		.locator(
			'.multiple-destination-container > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
		)
		.click();
	await page.getByText('Ciudad de la Paz 2238, Buenos').first().click();
	await page.getByText('Ciudad de la Paz 2238, Buenos').first().click();
	await page.getByText('Ciudad de la Paz 2238, Buenos').nth(1).click();
	await page.getByRole('button', { name: 'Select Vehicle' }).click();
	await page.getByRole('button', { name: 'Select Vehicle' }).click();
	await page.getByText('Service Usage Limit Exceeded').click();
	await page.getByText('skywaker, Anakin (+543456789)').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('arturi');
	await page.getByText('skiwalker, Arturitu (+').click();
	await page.getByRole('textbox', { name: 'Enter an address' }).fill('reconquista 661');
	await page.getByText('Reconquista 661, Buenos Aires').click();
	await page.locator('.focus > .single > .placeholder').click();
	await page.getByText('Mendoza 2002, Buenos Aires,').click();
	await page.getByRole('button', { name: 'Select Vehicle' }).click();
	await page.getByRole('button', { name: 'Send Manual' }).click();
	await page.getByText('Assign').nth(2).click();
	await page.locator('a').filter({ hasText: 'Customers' }).first().click();
	await page.getByRole('link', { name: 'Corporations Management' }).click();
	await page.getByRole('textbox', { name: 'Search...' }).click();
	await page.getByRole('textbox', { name: 'Search...' }).fill('dar');
	await page
		.locator('tr:nth-child(2) > .acciones-container > span > .action-btn.action-btn-sm.action-btn-default > .fa')
		.click();
	await page.getByRole('link', { name: 'Associates', exact: true }).click();
	await page.locator('tr:nth-child(2) > .acciones-container > span:nth-child(3) > .fa').click();
	await page.getByRole('dialog').getByRole('button', { name: '' }).click();
	await page.getByRole('dialog').getByRole('button', { name: '' }).click();
	await page.getByRole('dialog').getByRole('button', { name: '' }).click();
	await page.getByRole('dialog').getByText('Close').click();
	await page.locator('tr:nth-child(2) > .acciones-container > span:nth-child(3) > .fa').click();
	await page.getByRole('dialog').getByText('Close').click();
	await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('anakin');
	await page.getByText('dark empire (+543456789)').click();
	await page.getByText('Select User').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('artu');
	await page.getByText('skiwalker, Arturitu (+').click();
	await page.getByText('Regular').click();
	await page.getByText('v1.72.6', { exact: true }).click();
	await page
		.locator(
			'.ng-tns-c28-76.ng-untouched > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
		)
		.first()
		.click();
	await page.getByText('Reconquista 661, Buenos Aires').click();
	await page
		.locator(
			'.multiple-destination-container > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
		)
		.click();
	await page.getByText('Mendoza 2002, Buenos Aires,').click();
	await page.getByRole('button', { name: 'Select Vehicle' }).click();
	await page.getByRole('heading', { name: '► Fixed Fees' }).click();
	await page.getByRole('button', { name: 'Send Manual' }).click();
	await page.getByText('Assign').nth(2).click();
	await page.locator('a').filter({ hasText: 'Customers' }).first().click();
	await page.getByRole('link', { name: 'Corporations Management' }).click();
	await page.getByRole('textbox', { name: 'Search...' }).click();
	await page.getByRole('textbox', { name: 'Search...' }).fill('dar');
	await page
		.locator('tr:nth-child(2) > .acciones-container > span > .action-btn.action-btn-sm.action-btn-default > .fa')
		.click();
	await page.getByRole('link', { name: 'Associates', exact: true }).click();
	await page.locator('tr:nth-child(2) > .acciones-container > span:nth-child(3)').click();
	await page.getByRole('cell', { name: 'v1.72.6' }).click();
	await page.getByRole('cell', { name: '2', exact: true }).dblclick();
	await page.getByRole('cell', { name: '2', exact: true }).dblclick();
	await page.getByRole('dialog').getByText('Close').click();
	await page.getByRole('cell', { name: '  ', exact: true }).click();
	await page.locator('.acciones-container > span:nth-child(3)').first().click();
	await page.getByRole('button', { name: '' }).nth(1).click();
	await page.getByRole('button', { name: 'Accept' }).click();
	await page.getByRole('dialog').getByText('Close').click();
	await page.getByRole('banner').getByRole('link', { name: 'New trip' }).click();
	await page.locator('#clientSelect').getByText('Select User').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('anakin');
	await page.locator('.data-with-icon-col').first().click();
	await page.getByText('Select User').click();
	await page.getByRole('textbox', { name: 'User to Search' }).fill('anak');
	await page.locator('.highlighted > .data-with-icon-col').click();
	await page.getByText('Regular').click();
	await page.getByText('v1.72.6', { exact: true }).click();
	await page
		.locator(
			'.ng-tns-c28-92.ng-untouched > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
		)
		.first()
		.click();
	await page.getByText('Reconquista 661, Buenos Aires').click();
	await page
		.locator(
			'.multiple-destination-container > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder'
		)
		.click();
	await page.getByText('Ciudad de la Paz 2238, Buenos').first().click();
	await page.getByRole('button', { name: 'Select Vehicle' }).click();
	await page.getByRole('button', { name: 'Send Manual' }).click();
	await page.getByText('Assign').nth(2).click();
	await page.locator('a').filter({ hasText: 'Customers' }).first().click();
	await page.getByRole('link', { name: 'Corporations Management' }).click();
	await page.getByRole('textbox', { name: 'Search...' }).click();
	await page.getByRole('textbox', { name: 'Search...' }).fill('dark');
	await page
		.locator('tr:nth-child(2) > .acciones-container > span > .action-btn.action-btn-sm.action-btn-default > .fa')
		.click();
	await page.getByRole('link', { name: 'Associates', exact: true }).click();
	await page.locator('span:nth-child(3) > .fa').first().click();
	await page.getByRole('dialog').click();
	await page.getByRole('dialog').getByText('Close').click();
	await page.locator('a').filter({ hasText: 'Configuration' }).click();
	await page.getByRole('link', { name: 'Service Types' }).click();
	await page.locator('tr:nth-child(22) > .text-right > .row > button').first().click();
	await page.goto('https://apps-uat.magiis.com/#/home/carrier/settings/servicesType/list');
	await page.getByRole('button', { name: '' }).nth(1).click();
	await page.getByText('If you perform this action,').click();
	await page.getByRole('button', { name: 'Confirm Reset' }).click();
	await page.locator('a').filter({ hasText: 'Customers' }).first().click();
	await page.getByRole('link', { name: 'Customers Management' }).click();
	await page.getByRole('link', { name: 'Corporations Management' }).click();
	await page.getByRole('textbox', { name: 'Search...' }).click();
	await page.getByRole('textbox', { name: 'Search...' }).fill('dark');
	await page
		.locator('tr:nth-child(2) > .acciones-container > span > .action-btn.action-btn-sm.action-btn-default > .fa')
		.click();
	await page.getByRole('link', { name: 'Associates', exact: true }).click();
	await page.locator('span:nth-child(3) > .fa').first().click();
	await page.getByRole('cell', { name: '2', exact: true }).nth(2).click();
	await page.getByRole('cell', { name: '2', exact: true }).nth(2).dblclick();
	await page.getByRole('cell', { name: '2', exact: true }).nth(2).dblclick();
	await page.getByRole('cell', { name: '2', exact: true }).nth(2).dblclick();
	await page.getByRole('dialog').getByText('Close').click();
	await page.locator('tr:nth-child(2) > .acciones-container > span:nth-child(3) > .fa').click();
	await page.getByRole('cell', { name: 'v1.72.6' }).click();
	await page.getByRole('cell', { name: '2', exact: true }).nth(1).click();
	await page.getByRole('dialog').getByText('Close').click();
});
