/**
 * PROBE go/no-go — alta de viaje eBiz seleccionando la tarjeta previamente vinculada.
 *
 * Re-vincula la tarjeta eBiz approved, crea un viaje seleccionándola y reporta el outcome.
 * `createTrip` lanza ENV_BLOCKER si el pax ya tiene un viaje activo / NO_AUTORIZADO (dato sucio),
 * lo cual clasificamos como bloqueo de ENTORNO (no de código).
 *
 * Uso:
 *   APPIUM_SERVER_URL=http://localhost:4723 ENV=test \
 *   ANDROID_PASSENGER_APP_PACKAGE=com.magiis.app.test.passenger \
 *   node --loader ts-node/esm -r dotenv/config tests/mobile/appium/scripts/passenger-ebiz-newtrip-validate.ts
 */

import { getPassengerAppConfig } from '../config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';
import { EBIZ_CARDS } from '../../../fixtures/gateways/ebizcharge/card-policy';
import { EBIZ_BILLING } from '../../../fixtures/gateways/ebizcharge/cards';
import { TEST_DATA } from '../../../features/gateway-pg/data/stripeTestData';

const log = (m: string): void => console.log(`[ebiz-newtrip] ${m}`);

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
const ORIGIN = process.env.E2E_ORIGIN ?? TEST_DATA.origin;
const DESTINATION = process.env.E2E_DESTINATION ?? TEST_DATA.destination;

async function run(): Promise<void> {
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, { profileMode: 'personal' });
	try {
		await harness.ensurePassengerShell();
		const wallet = harness.getWalletScreen();

		const state = await harness.ensureWalletCard(card);
		log(`wallet: ${state} · hasCard(${last4})=${await wallet.hasCard(last4, 5_000)}`);

		log(`creando viaje… origin="${ORIGIN}" destino="${DESTINATION}" tarjeta=…${last4}`);
		try {
			const tripId = await harness.createTrip(ORIGIN, DESTINATION, last4);
			log(`tripId/código = ${tripId ?? '(sin id estable)'}`);
			log(tripId ? '✅ GO — alta de viaje eBiz con tarjeta vinculada creada' : '⚠️ viaje creado pero sin id/código estable (revisar build)');
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (msg.includes('ENV_BLOCKER')) {
				log(`⛔ ENV_BLOCKER (no es fallo de código): ${msg}`);
			} else {
				log(`❌ error en alta de viaje: ${msg}`);
				throw e;
			}
		}
	} finally {
		await harness.endSession();
	}
}

run().catch((e: unknown) => { console.error(`[ebiz-newtrip] ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
