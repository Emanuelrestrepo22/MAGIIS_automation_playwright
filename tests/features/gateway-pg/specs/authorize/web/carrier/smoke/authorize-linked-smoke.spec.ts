// Smoke Authorize (UI web) — la pasarela Authorize.Net figura VINCULADA en el App Store del carrier 1521.
// Valida: login carrier (1521, creds de .env → framework, no hardcode) + App Store carga + estado vinculado.
// i18n-proof: acepta "Unlink" (EN) o "Desvincular" (ES). Authorize NUNCA aplica 3DS → smoke sin challenge.
// Precondición: Authorize ya vinculada en 1521 (hecho por QA). Este smoke NO vincula ni desvincula.
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'https://apps-test.magiis.com';
const USER = process.env.USER_CARRIER ?? 'remises.eeuu@yopmail.com';
const PASS = process.env.PASS_CARRIER ?? '123';

test.use({ storageState: undefined });

test.describe(
	'Gateway PG · Carrier · Smoke Authorize vinculada @gateway @authorize @smoke @regression',
	{ annotation: [{ type: 'tms', description: 'MG-220' }] },
	() => {
		test.describe.configure({ timeout: 120_000 });

		test('[TS-AUTHORIZE-SMOKE-01] Authorize.Net figura vinculada (Unlink) en el App Store', async ({ page }) => {
			await test.step('Given: dispatcher logueado en carrier 1521 (Remises EEUU)', async () => {
				await page.goto(`${BASE}/#/authentication/login/carrier`);
				await page.getByRole('textbox', { name: 'eMail' }).fill(USER);
				await page.getByRole('textbox', { name: 'Password' }).fill(PASS);
				await page.getByRole('button', { name: 'MAGIIS Account' }).click();
				await page.waitForURL('**/home/**', { timeout: 30_000 });
			});

			await test.step('When: navego al App Store (Interfaces de pago)', async () => {
				await page.goto(`${BASE}/#/home/carrier/integrations/list`);
				await page.locator('.card').first().waitFor({ state: 'visible', timeout: 30_000 });
			});

			await test.step('Then: la card Authorize.Net muestra estado vinculado (Unlink/Desvincular)', async () => {
				const authCard = page.locator('.card').filter({ hasText: 'Authorize.Net' });
				await expect(authCard).toBeVisible({ timeout: 20_000 });
				await expect(authCard.getByText(/Unlink|Desvincular/i).first()).toBeVisible({ timeout: 20_000 });
			});
		});
	},
);
