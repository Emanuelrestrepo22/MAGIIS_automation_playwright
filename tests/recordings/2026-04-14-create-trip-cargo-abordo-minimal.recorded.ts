/**
 * RECORDING — no ejecutable (*.recorded.ts no matchea Playwright testMatch).
 *
 * Fecha captura: 2026-04-14
 * Flow capturado: Flow mínimo de alta viaje — usuario "eman" + direcciones + Cargo a Bordo + vehículo + enviar. Versión más concisa que create-trip-cargo-abordo.
 * Capturado con: npx playwright codegen https://apps-test.magiis.com/
 *
 * Spec productivo equivalente:
 *   tests/features/gateway-pg/specs/stripe/web/carrier/cargo-a-bordo/apppax-cargo-happy.spec.ts
 *
 * Por qué se conserva: selectores muy limpios — útil para simplificar un POM existente si tiene complejidad innecesaria.
 *
 * Status: REFERENCIA — duplica semánticamente a create-trip-cargo-abordo.recorded.ts pero más conciso.
 * Ver: tests/recordings/README.md
 */
import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://apps-test.magiis.com/#/home/carrier');
  await page.getByRole('banner').getByRole('link', { name: 'Nuevo Viaje' }).click();
  await page.locator('#clientSelect').getByText('Seleccione Usuario').click();
  await page.getByRole('textbox', { name: 'Usuario a Buscar' }).fill('ema');
  await page.getByText('Restrepo, Emanuel (+').click();
  await page.getByText('Cazadores 1987, Buenos Aires').click();
  await page.getByText('Reconquista 661, Buenos Aires').click();
  await page.locator('.bootstrap.width-combo.input-search.ng-untouched.ng-pristine.ng-valid > .below > .single > .placeholder').click();
  await page.getByRole('listitem').filter({ hasText: 'Reconquista 661, Buenos Aires' }).click();
  await page.locator('.data-with-icon-col.option-content-container.ng-tns-c16-2').click();
  await page.getByText('Tarjeta de Crédito - Cargo a').click();
  await page.getByRole('button', { name: 'Seleccionar Vehículo' }).click();
  await page.getByRole('button', { name: 'Enviar Servicio' }).click();
});