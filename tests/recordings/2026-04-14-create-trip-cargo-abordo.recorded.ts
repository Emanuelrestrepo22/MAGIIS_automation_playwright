/**
 * RECORDING — no ejecutable (*.recorded.ts no matchea Playwright testMatch).
 *
 * Fecha captura: 2026-04-14
 * Flow capturado: Alta viaje completa desde carrier — usuario "eman" + direcciones + método "Cargo a Bordo" + seleccionar vehículo + enviar servicio
 * Capturado con: npx playwright codegen https://apps-test.magiis.com/
 *
 * Spec productivo equivalente:
 *   tests/features/gateway-pg/specs/stripe/web/carrier/cargo-a-bordo/apppax-cargo-happy.spec.ts
 *
 * Por qué se conserva: flow más completo y bien definido de los codegens de Cargo a Bordo. Selectores getByRole robustos — útiles como referencia si se rompe el productivo.
 *
 * Status: REFERENCIA — revisar antes de reusar selectores.
 * Ver: tests/recordings/README.md
 */
import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://apps-test.magiis.com/#/authentication/login/carrier');
  await page.getByRole('textbox', { name: 'Email' }).click();
  await page.getByRole('textbox', { name: 'Email' }).fill('remises.eeuu@yopmail.com');
  await page.getByRole('textbox', { name: 'Contraseña' }).click();
  await page.getByRole('textbox', { name: 'Contraseña' }).fill('123');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.goto('https://apps-test.magiis.com/#/home/carrier/dashboard');
  await page.getByRole('banner').getByRole('link', { name: 'Nuevo Viaje' }).click();
  await page.locator('#clientSelect').getByText('Seleccione Usuario').click();
  await page.getByRole('textbox', { name: 'Usuario a Buscar' }).fill('eman');
  await page.getByText('Restrepo, Emanuel (+').click();
  await page.getByText('✕').nth(2).click();
  await page.locator('.focus > .single > .placeholder').click();
  await page.getByRole('listitem').filter({ hasText: 'Reconquista 661, Buenos Aires' }).click();
  await page.locator('.bootstrap.width-combo.input-search.ng-untouched.ng-pristine.ng-valid > .below > .single > .placeholder').click();
  await page.getByText('Cazadores 1987, Buenos Aires').click();
  await page.locator('.data-with-icon-col.option-content-container.ng-tns-c28-3').click();
  await page.getByText('Tarjeta de Crédito - Cargo a').click();
  await page.getByRole('button', { name: 'Seleccionar Vehículo' }).click();
  await page.getByRole('button', { name: 'Enviar Servicio' }).click();
  await page.goto('https://apps-test.magiis.com/#/home/carrier/travel/create?limitExceeded=false');
});