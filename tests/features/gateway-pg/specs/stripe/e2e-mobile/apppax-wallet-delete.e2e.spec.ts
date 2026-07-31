/**
 * Passenger App — Wallet 3DS card DELETE lifecycle (asserted).
 *
 * Promotes the exploratory runner `tests/mobile/appium/scripts/passenger-wallet-3ds-delete.ts`
 * to an asserted spec: seed a 3DS-required card, assert it is present in the wallet UI,
 * delete it, then assert it is gone. Optional trifuerza DB assertion (gated) confirms the
 * physical delete via a passenger-scoped card count in Oracle.
 *
 * Flow (device required):
 *   1. ensurePassengerShell()
 *   2. ensureWalletCard(HAPPY_3DS)  → seed (idempotent: added | already-present)
 *   3. expect wallet.hasCard(last4) === true          (UI assertion)
 *   4. [gated] Oracle count BEFORE (>0)
 *   5. deleteWalletCard(last4)
 *   6. expect wallet.hasCard(last4) === false          (UI assertion)
 *   7. [gated] Oracle count AFTER  (< BEFORE)
 *
 * KATA conformance: DEFERRED a Fase 4 (capa mobile KATA). Runner = shell Playwright,
 * device automation = Appium/WebdriverIO (PassengerTripHappyPathHarness · tests/mobile/appium/*).
 * @TestFixture sólo expone Page/API/DB de Playwright — no existe tests/components/ui/mobile +
 * fixture Appium; forzarlo inventaría arquitectura, así que se preserva TestBase.
 * Normalizado no-destructivo: imports por alias (@TestBase/@features/@fixtures); los de
 * tests/mobile/appium quedan relativos (no hay alias @mobile — Fase 4).
 *
 * Trifuerza DB (gated): sólo corre si oracleConfigFromEnv() resuelve Y hay MG25_PAX_USER_ID.
 * Sin Oracle o sin pax id → se omite la aserción DB (no rompe, sólo UI).
 *
 * @atc idmap: wallet pax delete lifecycle -> área H (MG-172..174, MG-495-496, ATR MG-513).
 *   mapeo por área aceptado (idmap API-level, sin 1:1 con e2e-mobile UI).
 */

import { expect, test } from '@TestBase';
import { STRIPE_TEST_CARD_FIXTURES } from '@fixtures/stripe/cards';
import { countCardsByPassenger, oracleConfigFromEnv } from '@features/gateway-pg/helpers/oracle-wallet';
import { getPassengerAppConfig } from '../../../../../mobile/appium/config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../../../../../mobile/appium/harness/PassengerTripHappyPathHarness';

// HAPPY_3DS: 3DS determinístico (always_authenticate — 4000 0027 6000 3184).
const HAPPY_3DS = STRIPE_TEST_CARD_FIXTURES.always_authenticate;

test.describe
	.serial('Gateway PG · E2E Mobile · App Pax Wallet Delete (3DS) @gateway @stripe @e2e-hybrid @3ds @wallet @regression', () => {
	// Sin servidor Appium no se puede construir el harness (getPassengerAppConfig lanza) —
	// gate a nivel describe para que el grupo SKIPee (no ERRORE) cuando no hay device.
	test.skip(() => !process.env.APPIUM_SERVER_URL, 'Requiere servidor Appium Android activo (APPIUM_SERVER_URL).');

	test(
		'[wallet-delete-3ds] Vincular y desvincular tarjeta 3DS del wallet del pax',
		{
			annotation: [
				{ type: 'tms', description: 'MG-174' },
				{ type: 'tms', description: 'MG-495' }
			]
		},
		async () => {
			const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, {
				profileMode: 'personal'
			});
			const card = {
				number: HAPPY_3DS.number,
				expiry: HAPPY_3DS.exp,
				cvc: HAPPY_3DS.cvc,
				holderName: HAPPY_3DS.holderName
			};
			const last4 = HAPPY_3DS.last4;

			// Trifuerza DB gated: sólo si hay Oracle configurado Y un pax user id conocido.
			const oracleCfg = oracleConfigFromEnv();
			const paxUserId = process.env.MG25_PAX_USER_ID;
			const dbEnabled = oracleCfg !== null && Boolean(paxUserId);
			let cardsBefore: number | null = null;

			try {
				await test.step('[wallet-delete-3ds] start passenger shell', async () => {
					await harness.ensurePassengerShell();
				});

				await test.step('[wallet-delete-3ds] seed 3DS card in wallet', async () => {
					const walletState = await harness.ensureWalletCard(card);
					expect(walletState).toMatch(/added|already-present/);
					// Aserción UI: la tarjeta quedó vinculada y visible en el wallet.
					expect(await harness.getWalletScreen().hasCard(last4)).toBe(true);
				});

				if (dbEnabled) {
					await test.step('[wallet-delete-3ds] DB count BEFORE delete (trifuerza)', async () => {
						cardsBefore = await countCardsByPassenger(oracleCfg!, { passengerUserId: paxUserId!, last4 });
						expect(cardsBefore, 'la card sembrada debe existir en DB antes del borrado').toBeGreaterThan(0);
					});
				}

				await test.step('[wallet-delete-3ds] delete the 3DS card', async () => {
					await harness.deleteWalletCard(last4);
					// Aserción UI: la tarjeta desapareció del wallet.
					expect(await harness.getWalletScreen().hasCard(last4)).toBe(false);
				});

				if (dbEnabled && cardsBefore !== null) {
					const before = cardsBefore;
					await test.step('[wallet-delete-3ds] DB count AFTER delete (trifuerza)', async () => {
						const cardsAfter = await countCardsByPassenger(oracleCfg!, {
							passengerUserId: paxUserId!,
							last4
						});
						// El borrado físico debe reflejarse: el count baja respecto al estado previo.
						expect(cardsAfter, 'el borrado físico debe reducir el count de cards del pax').toBeLessThan(
							before
						);
					});
				}
			} finally {
				await harness.endSession();
			}
		}
	);
});
