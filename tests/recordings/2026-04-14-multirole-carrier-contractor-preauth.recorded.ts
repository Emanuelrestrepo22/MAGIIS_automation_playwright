/**
 * RECORDING — no ejecutable (*.recorded.ts no matchea Playwright testMatch).
 *
 * Fecha captura: 2026-04-14
 * Flow capturado: Logout de carrier + login contractor + crear viaje con pago "Preautorizada" + validación 3DS
 * Capturado con: npx playwright codegen https://apps-test.magiis.com/
 *
 * Spec productivo equivalente:
 *   tests/features/gateway-pg/specs/stripe/web/contractor/*.spec.ts
 *   tests/TestBase.ts (fixtures de role-switching)
 *
 * Por qué se conserva: único recording que cubre switch carrier→contractor + pago preautorizado 3DS. Referencia útil para tests multi-role.
 *
 * Status: REFERENCIA — la secuencia de logout/login es específica, contrastar con storageState fixture moderno.
 * Ver: tests/recordings/README.md
 */
import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://apps-test.magiis.com/#/home/carrier/dashboard');
  await page.getByRole('button', { name: '' }).click();
  await page.getByText('Cerrar Sesión').click();
  await page.goto('https://apps-test.magiis.com/#/authentication/login/contractor');
  await page.getByRole('textbox', { name: 'Email' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('emanuel.smith@yopmail.com');
  await page.getByRole('textbox', { name: 'Contraseña' }).click();
  await page.getByRole('textbox', { name: 'Contraseña' }).fill('P5qhv');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByRole('banner').getByText('Nuevo Viaje').click();
  await page.getByText('Seleccione un usuario').click();
  await page.getByRole('textbox', { name: 'Seleccione un usuario' }).fill('ema');
  await page.getByText('smith, Emanuel').click();
  await page.getByText('Reconquista 661, Buenos Aires').click();
  await page.locator('.placeholder').first().click();
  await page.getByText('Cazadores 1987, Ciudad Autó').click();
  await page.locator('#add_travel_payment_methods > .below > .single > .value > .data-with-icon-col').click();
  await page.getByText('Tarjeta de Crédito - Preautorizada').click();
  await page.locator('iframe[name="__privateStripeFrame5203"]').contentFrame().getByRole('textbox', { name: 'Credit or debit card number' }).dblclick();
  await page.locator('iframe[name="__privateStripeFrame5203"]').contentFrame().getByRole('textbox', { name: 'Credit or debit card number' }).fill('4000002760003184');
  await page.locator('iframe[name="__privateStripeFrame5204"]').contentFrame().getByRole('textbox', { name: 'Credit or debit card' }).click();
  await page.locator('iframe[name="__privateStripeFrame5204"]').contentFrame().getByRole('textbox', { name: 'Credit or debit card' }).fill('12 / 34');
  await page.locator('iframe[name="__privateStripeFrame5205"]').contentFrame().getByRole('textbox', { name: 'Credit or debit card CVC/CVV' }).click();
  await page.locator('iframe[name="__privateStripeFrame5205"]').contentFrame().getByRole('textbox', { name: 'Credit or debit card CVC/CVV' }).fill('123');
  await page.getByRole('textbox').first().click();
  await page.getByRole('textbox').first().fill('emanuel smith');
  await page.getByRole('textbox').nth(1).click();
  await page.getByRole('textbox').nth(1).fill('12345');
  await page.getByRole('button', { name: 'Validar' }).click();
  await page.locator('iframe[name="__privateStripeFrame52011"]').contentFrame().locator('iframe[name="stripe-challenge-frame"]').contentFrame().getByText('3D Secure 2Test Page Complete').click();
  await page.locator('iframe[name="__privateStripeFrame52011"]').contentFrame().locator('iframe[name="stripe-challenge-frame"]').contentFrame().getByRole('button', { name: 'Complete' }).click();
  await page.getByRole('button', { name: 'Seleccionar Vehículo' }).click();
  await page.getByRole('button', { name: 'Enviar Servicio' }).click();
  await page.locator('iframe[name="__privateStripeFrame52014"]').contentFrame().locator('iframe[name="stripe-challenge-frame"]').contentFrame().getByText('3D Secure 2Test Page Complete').click();
  await page.locator('iframe[name="__privateStripeFrame52014"]').contentFrame().locator('iframe[name="stripe-challenge-frame"]').contentFrame().getByRole('button', { name: 'Complete' }).click();
});