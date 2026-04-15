import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('https://apps-test.magiis.com/#/home');
  await page.getByRole('button', { name: '' }).click();
  await page.getByText('Cerrar Sesión').click();
  await page.getByRole('button', { name: '' }).click();
  await page.getByText('Cerrar Sesión').click();
  await page.goto('https://apps-test.magiis.com/#/home');
  await page.getByRole('button', { name: '' }).click();
  await page.getByText('Cerrar Sesión').dblclick();
  await page.goto('https://apps-test.magiis.com/#/');
});