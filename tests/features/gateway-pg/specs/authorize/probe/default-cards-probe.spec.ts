/**
 * PROBE — las tarjetas por defecto del sandbox de Authorize.net contra el form de MAGIIS.
 * =======================================================================================
 *
 * Corre el MISMO flujo de alta de tarjeta que la matriz de outcomes, pero recorriendo la
 * lista oficial de tarjetas de prueba de Authorize.net, incluidas las **dos Visa de 13
 * dígitos** que la matriz no cubre.
 *
 * Lo que viene a contestar: ¿el form de MAGIIS acepta cada marca y cada LARGO de número
 * que la pasarela declara válido? Es análisis de valor límite sobre el largo del PAN, que
 * el fixture no modela (todas sus entradas son de 16 dígitos salvo Amex, de 15).
 *
 * NO asserta: reporta. Un fallo de validación acá es dato para decidir si se agrega
 * cobertura permanente o si se reporta como defecto — no se convierte en oráculo sin
 * antes discutirlo.
 *
 * Tag `@probe` a propósito: fuera de `@gateway`/`@authorize`, no entra en la regresión.
 */
import { test } from '@TestFixture';
import { CarrierDashboardPage, CarrierNewTravelPage } from '@ui/carrier';
import { cardFormFor } from '@ui/carrier/card-forms';
import { getGatewayPgAdapter } from '@features/gateway-pg/helpers/adapters';
import { loginAsDispatcher } from '@features/gateway-pg/fixtures/gateway.fixtures';
import { cleanupGatewayCardByLast4 } from '@features/gateway-pg/helpers/card-precondition';

/** Lista oficial del sandbox Authorize.net + las variantes de largo. */
const DEFAULT_CARDS = [
	{ label: 'Visa 16 dígitos (canónica del fixture)', number: '4111111111111111', cvc: '900', digits: 16 },
	{ label: 'Visa 13 dígitos (variante A)', number: '4007000000027', cvc: '900', digits: 13 },
	{ label: 'Visa 13 dígitos (variante B)', number: '4012888818888', cvc: '900', digits: 13 },
	{ label: 'Mastercard 16 dígitos', number: '5424000000000015', cvc: '900', digits: 16 },
	{ label: 'American Express 15 dígitos', number: '370000000000002', cvc: '9000', digits: 15 },
	{ label: 'Discover 16 dígitos', number: '6011000000000012', cvc: '900', digits: 16 }
] as const;

test.describe('[PROBE] tarjetas por defecto de Authorize.net en el form de MAGIIS @probe', () => {
	test.describe.configure({ mode: 'serial', timeout: 240_000 });
	test.use({ storageState: { cookies: [], origins: [] } });

	for (const card of DEFAULT_CARDS) {
		test(`@probe ${card.label} — ${card.number}`, async ({ page }) => {
			const adapter = getGatewayPgAdapter('authorize');
			const defaults = adapter.journeyDefaults;
			const last4 = card.number.slice(-4);

			await loginAsDispatcher(page, { gateway: 'authorize' });
			await cleanupGatewayCardByLast4(page, defaults.paxSearchQueries, last4);

			const dashboard = new CarrierDashboardPage({ page });
			const travel = new CarrierNewTravelPage({ page });
			await dashboard.openNewTravel();
			await travel.ensureLoaded();
			await travel.selectClient(defaults.walletClient);
			await travel.setDestination(defaults.walletDestination);
			await travel.selectPaymentMethod('Preautorizada');

			await cardFormFor('authorize').fill(page, {
				number: card.number,
				expiry: '12/30',
				cvc: card.cvc,
				holderName: 'MAGIIS QA Test',
				zip: '90210'
			});

			const validar = page.getByRole('button', { name: /^(Valid|Validar)$/i });
			const habilitado = await validar.isEnabled();
			console.log(`[PROBE][DEFAULTS] ${card.digits}d ${card.number} → botón Validar habilitado: ${habilitado}`);

			if (!habilitado) {
				console.log(`[PROBE][DEFAULTS] ${card.number} → el form NO da por válido el número. Fin del caso.`);
				return;
			}

			await validar.click();
			// `isVisible()` es un chequeo INMEDIATO: mediría antes de que llegue la respuesta de
			// la pasarela. Hay que esperar explícitamente el estado.
			const exito = page.getByText(/Tarjeta v[áa]lida|Valid card|Card valid/i).first();
			const validada = await exito
				.waitFor({ state: 'visible', timeout: 25_000 })
				.then(() => true)
				.catch(() => false);
			console.log(`[PROBE][DEFAULTS] ${card.number} → tarjeta validada por la pasarela: ${validada}`);
		});
	}
});
