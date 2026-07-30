/**
 * Passenger App — Wallet CRUD parametrizado por PASARELA (add-card + delete).
 *
 * Estandarización multi-gateway (BL-024): *el comportamiento del sistema es constante; sólo
 * cambian los datos ingresados al formulario*. Estos son los MISMOS step-by-step ya automatizados
 * para Stripe (`apppax-wallet-management` / `apppax-wallet-delete`), parametrizados para correr
 * contra la pasarela que el backend tenga configurada en la Passenger App.
 *
 * Pasarela activa: `WALLET_GATEWAY` (default `ebizcharge` — go/no-go eBizCharge 2026-07-30).
 * Los datos de tarjeta salen del resolver cross-gateway `resolveCard({ gateway, intent })`.
 * eBizCharge agrega los campos de facturación `address`/`zipCode` (EBIZ_BILLING) que el form
 * nativo `app-credit-card-payment-data` exige (address maxlength=30).
 *
 * El form es el mismo componente Ionic nativo para eBizCharge y MercadoPago; Stripe usa iframes.
 * `PassengerWalletScreen.fillCardForm` autodetecta la variante y llena en consecuencia.
 *
 * KATA conformance: DEFERRED a Fase 4 (capa mobile KATA) — device automation vía Appium/WebdriverIO,
 * shell Playwright con @TestBase (igual que apppax-wallet-delete/management).
 */

import { mkdirSync } from 'node:fs';
import { expect, test } from '@TestBase';
import { resolveCard } from '@fixtures/gateways/_shared/resolver';
import type { GatewayName } from '@fixtures/gateways/_shared/types';
import { EBIZ_BILLING } from '@fixtures/gateways/ebizcharge/cards';
import { getPassengerAppConfig } from '../../../../mobile/appium/config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../../../../mobile/appium/harness/PassengerTripHappyPathHarness';
import type { CardInput } from '../../../../mobile/appium/passenger/PassengerWalletScreen';

/** Captura un screenshot del device como evidencia (best-effort, no rompe el test). */
async function snap(harness: PassengerTripHappyPathHarness, name: string): Promise<void> {
	try {
		mkdirSync('evidence/ebiz', { recursive: true });
		await (harness.getDriver() as unknown as { saveScreenshot: (p: string) => Promise<unknown> }).saveScreenshot(`evidence/ebiz/${name}.png`);
	} catch {
		// La evidencia visual es best-effort; su ausencia no invalida las aserciones.
	}
}

const GATEWAY = (process.env.WALLET_GATEWAY ?? 'ebizcharge') as GatewayName;

// Tag de dominio por pasarela (SoT docs/ci/TAGS.md — no inventar). MercadoPago = @mercadopago.
const GATEWAY_TAG: Record<GatewayName, string> = {
	stripe: '@stripe',
	authorize: '@authorize',
	ebizcharge: '@ebizcharge',
	'mercado-pago': '@mercadopago'
};

// Falla temprano con mensaje claro ante un WALLET_GATEWAY inválido (evita un tag "undefined"
// en el título y el críptico "Gateway desconocido" del resolver al colectar el archivo).
if (!Object.prototype.hasOwnProperty.call(GATEWAY_TAG, GATEWAY)) {
	throw new Error(`WALLET_GATEWAY="${GATEWAY}" no es una pasarela válida. Válidas: ${Object.keys(GATEWAY_TAG).join(', ')}.`);
}

/**
 * Resuelve el `CardInput` para el form del wallet a partir del resolver cross-gateway,
 * agregando los datos de facturación específicos de la pasarela cuando el form los exige.
 */
function walletCardInput(gateway: GatewayName): CardInput & { last4: string } {
	const card = resolveCard({ gateway, intent: 'HAPPY_NO_AUTH' });
	const input: CardInput & { last4: string } = {
		number: card.number,
		expiry: card.expiry,
		cvc: card.cvc,
		holderName: card.holderName,
		zip: card.zip,
		last4: card.last4
	};

	// eBizCharge: el form nativo pide Dirección de Facturación + Código Postal.
	if (gateway === 'ebizcharge') {
		input.address = EBIZ_BILLING.address;
		input.zip = EBIZ_BILLING.zip;
	}

	return input;
}

test.describe.serial(`Gateway PG · E2E Mobile · App Pax Wallet CRUD [${GATEWAY}] @gateway ${GATEWAY_TAG[GATEWAY]} @e2e-hybrid @wallet @regression`, () => {
	// Sin servidor Appium el harness no se puede construir → SKIP a nivel describe (no ERROR).
	test.skip(() => !process.env.APPIUM_SERVER_URL, 'Requiere servidor Appium Android activo (APPIUM_SERVER_URL).');

	const card = walletCardInput(GATEWAY);
	const last4 = card.last4;

	test('[wallet-add] empty-state → alta de tarjeta + listado (visible por last4)', {
		annotation: [
			{ type: 'tms', description: 'MG-148' }, // Vinculación de tarjeta (TC-PAY-C-01)
			{ type: 'tms', description: 'MG-295' }  // Eliminar última tarjeta → estado vacío (TC-PAY-WAL-12)
		]
	}, async () => {
		const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, { profileMode: 'personal' });
		const wallet = harness.getWalletScreen();

		try {
			await test.step('start passenger shell', async () => {
				await harness.ensurePassengerShell();
			});

			// Empty-state (MG-295 / TC-PAY-WAL-12): borrar TODAS las tarjetas — incluida la última —
			// y verificar estado vacío (count 0) sin crash ni error 500. Además es precondición del
			// alta: un wallet lleno impide que el gateway persista la tarjeta nueva (BL-055).
			await test.step('[MG-295] empty-state — borrar hasta vaciar + estado vacío sin crash', async () => {
				await harness.cleanWallet();
				expect(await wallet.countCards(), 'tras borrar la última, el wallet debe quedar vacío (estado vacío)').toBe(0);
				expect(await wallet.hasCard(last4), 'ninguna tarjeta debe seguir visible tras el vaciado').toBe(false);
			});

			await test.step(`alta de tarjeta ${GATEWAY} (…${last4}) desde vacío + listado`, async () => {
				const state = await harness.ensureWalletCard(card);
				expect(state, 'debe poder agregarse una tarjeta partiendo del wallet vacío').toBe('added');
				expect(await wallet.hasCard(last4), 'la tarjeta recién agregada debe listarse en el wallet').toBe(true);
				expect(await wallet.countCards(), 'el wallet debe tener al menos 1 tarjeta tras el alta').toBeGreaterThan(0);
				await snap(harness, `wallet-add-${GATEWAY}-${last4}`); // evidencia: tarjeta vinculada visible
			});
		} finally {
			await harness.endSession();
		}
	});

	test('[wallet-delete] desvincular la tarjeta vinculada + verificar que desaparece', {
		annotation: [
			{ type: 'tms', description: 'MG-293' } // Eliminar tarjeta desde App PAX (TC-PAY-WAL-10)
		]
	}, async () => {
		const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, { profileMode: 'personal' });
		const wallet = harness.getWalletScreen();

		try {
			await test.step('start passenger shell', async () => {
				await harness.ensurePassengerShell();
			});

			// Precondición: la tarjeta debe existir (la sembró el test anterior en la misma serie).
			// Si no está (corrida aislada), la sembramos para que el delete tenga objetivo.
			await test.step('asegurar tarjeta a borrar', async () => {
				const state = await harness.ensureWalletCard(card);
				expect(state).toMatch(/added|already-present/);
				expect(await wallet.hasCard(last4), 'la tarjeta debe estar vinculada antes del borrado').toBe(true);
				await snap(harness, `wallet-before-delete-${GATEWAY}-${last4}`); // evidencia: tarjeta presente
			});

			await test.step(`borrar la tarjeta …${last4} y verificar que desaparece`, async () => {
				await harness.deleteWalletCard(last4);
				expect(await wallet.hasCard(last4), 'la tarjeta debe desaparecer del wallet tras el borrado').toBe(false);
				await snap(harness, `wallet-after-delete-${GATEWAY}-${last4}`); // evidencia: wallet sin la tarjeta
			});
		} finally {
			await harness.endSession();
		}
	});
});
