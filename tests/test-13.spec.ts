import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://apps-test.magiis.com/#/home/carrier');
  await page.getByRole('banner').getByRole('link', { name: 'Nuevo Viaje' }).click();
  await page.locator('#clientSelect').getByText('Seleccione Usuario').click();
  await page.getByRole('textbox', { name: 'Usuario a Buscar' }).fill('fast');
  await page.getByText('fast car (+12545555555)').click();
  await page.getByText('Seleccione Usuario').click();
  await page.getByRole('textbox', { name: 'Usuario a Buscar' }).fill('ema');
  await page.getByText('smith, Emanuel (+54124048846)').click();
  await page.locator('.ng-tns-c16-2.ng-untouched > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder').first().click();
  await page.getByText('Reconquista 661, Buenos Aires').click();
  await page.locator('.multiple-destination-container > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder').click();
  await page.getByText('Cazadores 1987, Ciudad Autó').click();
  await page.locator('.data-with-icon-col.option-content-container.ng-tns-c16-2').click();
  await page.getByText('Tarjeta de Crédito - Cargo a').click();
  await page.getByRole('button', { name: 'Seleccionar Vehículo' }).click();
  await page.getByText('Standard $ 163.92 (2)').click();
  await page.getByRole('button', { name: 'Enviar Servicio' }).click();
});