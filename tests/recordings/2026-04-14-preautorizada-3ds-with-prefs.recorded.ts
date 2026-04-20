/**
 * RECORDING — no ejecutable (*.recorded.ts no matchea Playwright testMatch).
 *
 * Fecha captura: 2026-04-14
 * Flow capturado: Toggle "Cobros con Tarjeta" en preferencias operativas + guardar + crear viaje + Preautorizada + 3DS
 * Capturado con: npx playwright codegen https://apps-test.magiis.com/
 *
 * Spec productivo equivalente:
 *   tests/features/gateway-pg/specs/stripe/web/carrier/hold/*.spec.ts
 *   tests/pages/carrier/OperationalPreferencesPage.ts (setup toggle)
 *
 * Por qué se conserva: setup completo de preferencias + pago. Buen candidato para refactor a spec productivo con POM (OperationalPreferencesPage ya existe).
 *
 * Status: REFERENCIA — flow E2E completo setup + ejecución.
 * Ver: tests/recordings/README.md
 */
import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://apps-test.magiis.com/#/home/carrier');
  await page.locator('a').filter({ hasText: 'Configuración' }).click();
  await page.getByRole('link', { name: 'Preferencias Operativas' }).click();
  await page.getByRole('heading', { name: 'Cobros con Tarjeta ►' }).click();
  await page.locator('.switch-handle').click();
  await page.locator('.form-group').first().click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('banner').getByRole('link', { name: 'Nuevo Viaje' }).click();
  await page.locator('#clientSelect').getByText('Seleccione Usuario').click();
  await page.getByRole('textbox', { name: 'Usuario a Buscar' }).fill('fast');
  await page.getByText('fast car (+12545555555)').click();
  await page.getByText('Seleccione Usuario').click();
  await page.getByRole('textbox', { name: 'Usuario a Buscar' }).fill('em');
  await page.getByText('smith, Emanuel (+54124048846)').click();
  await page.locator('.ng-tns-c28-2.ng-untouched > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder').first().click();
  await page.getByText('Reconquista 661, Buenos Aires').click();
  await page.locator('.multiple-destination-container > div > .search-container > .search-container-input > .bootstrap > .below > .single > .placeholder').click();
  await page.getByText('Cazadores 1987, Ciudad Autó').click();
  await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-2').click();
  await page.getByText('Tarjeta de Crédito - Preautorizada').click();
  await page.locator('iframe[name="__privateStripeFrame6073"]').contentFrame().getByRole('textbox', { name: 'Credit or debit card number' }).click();
  await page.locator('iframe[name="__privateStripeFrame6073"]').contentFrame().getByRole('textbox', { name: 'Credit or debit card number' }).fill('4000002760003184');
  await page.locator('.stripe-element-wrapper.stripe-element-small').first().click();
  await page.locator('iframe[name="__privateStripeFrame6074"]').contentFrame().getByRole('textbox', { name: 'Credit or debit card' }).click();
  await page.locator('iframe[name="__privateStripeFrame6074"]').contentFrame().getByRole('textbox', { name: 'Credit or debit card' }).fill('12 / 34');
  await page.locator('.form-group.form-group-cvv > .stripe-element-wrapper').click();
  await page.locator('iframe[name="__privateStripeFrame6075"]').contentFrame().getByRole('textbox', { name: 'Credit or debit card CVC/CVV' }).click();
  await page.locator('iframe[name="__privateStripeFrame6075"]').contentFrame().getByRole('textbox', { name: 'Credit or debit card CVC/CVV' }).fill('123');
  await page.getByRole('textbox').first().click();
  await page.getByRole('textbox').first().fill('emanuel');
  await page.getByRole('textbox').nth(1).click();
  await page.getByRole('textbox').nth(1).fill('123');
  await page.getByRole('button', { name: 'Validar' }).click();
  await page.locator('iframe[name="__privateStripeFrame60711"]').contentFrame().locator('iframe[name="stripe-challenge-frame"]').contentFrame().getByText('3D Secure 2Test Page Complete').click();
  await page.locator('iframe[name="__privateStripeFrame60711"]').contentFrame().locator('iframe[name="stripe-challenge-frame"]').contentFrame().getByRole('button', { name: 'Complete' }).click();
  await page.getByRole('button', { name: 'Seleccionar Vehículo' }).click();
  await page.getByRole('button', { name: 'Enviar Servicio' }).click();
});