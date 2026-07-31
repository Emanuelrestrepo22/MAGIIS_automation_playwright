/**
 * EXPLORADOR business — ¿el pax puede entrar a modo Business (Compañía) y qué wallet ve ahí?
 *
 * Verifica: (1) el toggle Personal↔Compañía está habilitado (requiere colaborador/empresa vinculada),
 * (2) el wallet en modo Business (aislamiento vs Personal), (3) alta de tarjeta eBiz en Business.
 * Reporta el estado sin forzar nada. Si el toggle está deshabilitado → business bloqueado por datos.
 *
 * Uso:
 *   APPIUM_SERVER_URL=http://localhost:4723 ENV=test \
 *   ANDROID_PASSENGER_APP_PACKAGE=com.magiis.app.test.passenger \
 *   node --loader ts-node/esm -r dotenv/config tests/mobile/appium/scripts/passenger-ebiz-business-explore.ts
 */

import { getPassengerAppConfig } from '../config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';
import { EBIZ_CARDS } from '../../../fixtures/gateways/ebizcharge/card-policy';
import { EBIZ_BILLING } from '../../../fixtures/gateways/ebizcharge/cards';

const log = (m: string): void => console.log(`[ebiz-business] ${m}`);

const c = EBIZ_CARDS.SUCCESS;
const card = {
	number: c.number,
	expiry: c.exp.length === 4 ? `${c.exp.slice(0, 2)}/${c.exp.slice(2)}` : c.exp,
	cvc: c.cvc,
	holderName: c.holderName,
	address: EBIZ_BILLING.address,
	zip: EBIZ_BILLING.zip
};
const last4 = c.number.slice(-4);

async function run(): Promise<void> {
	// Empezar en business: ensurePassengerShell intentará togglear a Compañía.
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, { profileMode: 'business' });
	try {
		await harness.startSession();

		// 1) Estado inicial del perfil + wallet Personal (referencia de aislamiento).
		try {
			await harness.ensureProfileMode('personal');
			await harness.getWalletScreen().openWallet();
			const personalCount = await harness.getWalletScreen().countCards().catch(() => -1);
			const personalHasCard = await harness.getWalletScreen().hasCard(last4, 3_000).catch(() => false);
			log(`PERSONAL: wallet count=${personalCount} · hasCard(${last4})=${personalHasCard}`);
		} catch (e) {
			log(`no pude leer wallet Personal: ${e instanceof Error ? e.message : String(e)}`);
		}

		// 2) Intentar entrar a Business (Compañía).
		try {
			await harness.ensureProfileMode('business');
			log('✅ toggle a modo Business (Compañía) OK — el pax TIENE perfil business');
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			log(`⛔ NO se pudo entrar a Business: ${msg}`);
			log('→ business lane BLOQUEADO por datos (pax sin colaborador/empresa vinculada). Reportar y diferir.');
			return;
		}

		// 3) Wallet en Business: aislamiento + alta DIRECTA (sin re-togglear el perfil mid-flow;
		//    ensureWalletCard re-hace ensurePassengerShell→ensureProfileMode y el toggle queda
		//    deshabilitado transitoriamente tras navegar desde /cards).
		const wallet = harness.getWalletScreen();
		await wallet.openWallet();
		const bizCountBefore = await wallet.countCards().catch(() => -1);
		const bizHasBefore = await wallet.hasCard(last4, 3_000).catch(() => false);
		log(`BUSINESS: wallet count=${bizCountBefore} · hasCard(${last4})=${bizHasBefore} (aislamiento: debería diferir del Personal)`);

		log('alta de tarjeta eBiz en Business (directo)…');
		try {
			await wallet.tapAddCard();
			await wallet.fillCardForm(card);
			await wallet.saveCard();
		} catch (e) {
			log(`add business error: ${e instanceof Error ? e.message : String(e)}`);
		}
		const bizHasAfter = await wallet.hasCard(last4, 12_000).catch(() => false);
		const bizCountAfter = await wallet.countCards().catch(() => -1);
		log(`BUSINESS add: hasCard(${last4})=${bizHasAfter} · count ${bizCountBefore}→${bizCountAfter}`);
		log(bizHasAfter ? '✅ alta eBiz en Business OK' : '❌ alta eBiz en Business no visible');
	} finally {
		await harness.endSession();
	}
}

run().catch((e: unknown) => { console.error(`[ebiz-business] ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
