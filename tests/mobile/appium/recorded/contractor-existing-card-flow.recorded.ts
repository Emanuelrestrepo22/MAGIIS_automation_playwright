import { test, expect } from '@playwright/test';

function requireEnv(key: string): string {
	const value = process.env[key]?.trim();
	if (!value) throw new Error(`Falta ${key} en el entorno (ver .env.example); no hay valor por defecto.`);
	return value;
}

test('test', async ({ page }) => {
	await page.goto('https://apps-test.magiis.com/#/home');
	await page.getByRole('button', { name: '' }).click();
	await page.getByText('Cerrar Sesión').click();
	await page.goto('https://apps-test.magiis.com/#/authentication/login/contractor');
	await page.getByRole('textbox', { name: 'Email' }).click();
	await page.getByRole('textbox', { name: 'Email' }).fill(requireEnv('USER_CONTRACTOR'));
	await page.getByRole('textbox', { name: 'Contraseña' }).click();
	await page.getByRole('textbox', { name: 'Contraseña' }).fill(requireEnv('PASS_CONTRACTOR'));
	await page.getByRole('button', { name: 'Ingresar' }).click();
	await page.getByRole('banner').getByText('Nuevo Viaje').click();
	await page.getByText('Seleccione un usuario').click();
	await page.getByRole('textbox', { name: 'Seleccione un usuario' }).fill('eman');
	await page.getByText('smith, Emanuel').click();
	await page.getByText('Reconquista 661, Buenos Aires').click();
	await page.locator('.placeholder').first().click();
	await page.getByText('Cazadores 1987, Ciudad Autó').click();
	await page.locator('#add_travel_payment_methods > .below > .single > .value > .data-with-icon-col').click();
	await page.getByText('Tarjeta de crédito VISA ***').click();
	await page.getByRole('button', { name: 'Seleccionar Vehículo' }).click();
	await page.getByRole('button', { name: 'Enviar Servicio' }).click();
});
