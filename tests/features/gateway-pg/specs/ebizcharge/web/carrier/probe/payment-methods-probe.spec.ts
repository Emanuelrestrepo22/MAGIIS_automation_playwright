/**
 * [PROBE][TEMPORAL] Censo READ-ONLY de las Formas de Pago ofrecidas por cliente con
 * eBizCharge vinculada. Motivo (2026-07-31): la suite Cargo a Bordo falló porque el
 * dropdown mostró UNA sola opción (app pax → "Efectivo"; colaborador → "Cuenta
 * Corriente"), pero la suite HOLD del MISMO día seleccionó "Tarjeta de Crédito -
 * Preautorizada" con el mismo cliente. Este probe reproduce el camino del cargo y
 * vuelca TODAS las opciones con espera larga (poll 30s) para discriminar:
 *   (a) opciones async que el timeout de 10s cortaba → problema de espera del test;
 *   (b) lista realmente sin "Cargo a Bordo" → el método no se ofrece con eBiz
 *       (hallazgo de producto/config, NO bug de test).
 * No asserta comportamiento de negocio: imprime y pasa. Borrar al cerrar la campaña.
 */

import { expect } from '@playwright/test';
import { test } from '@TestFixture';
import { CargoABordoSteps } from '@steps/CargoABordoSteps';
import { journeyDefaultsFor } from '@features/gateway-pg/data/journey-defaults';

test.use({ storageState: undefined });
test.describe.configure({ timeout: 180_000 });

test.describe('[PROBE] eBiz — censo de Formas de Pago por cliente @gateway @ebizcharge @probe', () => {
	for (const who of ['appPax', 'colaborador', 'empresa'] as const) {
		test(`@probe opciones de Forma de Pago para ${who}`, async ({ page }) => {
			const defaults = journeyDefaultsFor('ebizcharge');
			const steps = new CargoABordoSteps({ page });
			await steps.login('ebizcharge');
			await page.goto('/#/home/carrier/travel/create');

			const client =
				who === 'appPax' ? defaults.appPaxPassenger : who === 'colaborador' ? defaults.contractorClient : defaults.client;
			const passenger = who === 'appPax' ? undefined : who === 'colaborador' ? defaults.contractorPassenger : defaults.passenger;

			// Mismo camino que fillCargoABordo, sin elegir método al final.
			const travel = steps.travel;
			await travel.fillPlain({ client, passenger, origin: defaults.origin, destination: defaults.destination });

			// Abrir el dropdown de Forma de Pago y POLLEAR las opciones hasta 30s.
			const select = page.locator('#add_travel_payment_methods');
			await select.locator('.below').first().click({ force: true });
			let options: string[] = [];
			await expect
				.poll(
					async () => {
						options = await select.locator('select-dropdown .options li').allInnerTexts();
						return options.length;
					},
					{ timeout: 30_000, message: 'el dropdown nunca renderizó opciones' }
				)
				.toBeGreaterThan(0);
			// 5s extra de asentamiento por si las opciones llegan en tandas (carga async).
			await page.waitForTimeout(5_000);
			options = await select.locator('select-dropdown .options li').allInnerTexts();

			console.log(`[PROBE][FORMAS-DE-PAGO] ${who} (cliente "${client}"): ${JSON.stringify(options.map(o => o.trim()))}`);
		});
	}
});
