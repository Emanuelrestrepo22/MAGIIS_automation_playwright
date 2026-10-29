/**
 * EXPLORADOR flujo completo alta de viaje (v2.5.17) CON precondición de tarjeta.
 * Precondición: agrega tarjeta eBiz al wallet (sin medio de pago el CTA "Seleccionar Vehículo" no
 * avanza). Luego O+D → CTA nativo → vuelca el paso vehículo/medio de pago → mapear confirmTrip.
 *
 * Uso: APPIUM_SERVER_URL=http://localhost:4723 ENV=test WALLET_GATEWAY=ebizcharge \
 *   node --loader ts-node/esm -r dotenv/config tests/mobile/appium/scripts/passenger-newtrip-fullflow-dump.ts
 */

import { mkdirSync } from 'node:fs';
import { getPassengerAppConfig } from '../config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';
import { PassengerNewTripScreen } from '../passenger/PassengerNewTripScreen';
import type { CardInput } from '../passenger/PassengerWalletScreen';
import { resolveCard } from '../../../fixtures/gateways/_shared';
import { EBIZ_BILLING } from '../../../fixtures/gateways/ebizcharge/cards';
import { TEST_DATA } from '../../../features/gateway-pg/data/stripeTestData';

const log = (m: string): void => console.log(`[fullflow] ${m}`);

function walletCard(): CardInput & { last4: string } {
	// v2.5.19: el wallet del pax tokeniza vía STRIPE (rechaza tarjetas no-test-Stripe como la eBiz).
	// WALLET_GATEWAY resuelve la tarjeta; default 'stripe' (4242…). Solo eBiz agrega address/zip.
	const gateway = (process.env.WALLET_GATEWAY ?? 'stripe') as 'stripe' | 'ebizcharge' | 'authorize' | 'mercado-pago';
	const card = resolveCard({ gateway, intent: 'HAPPY_NO_AUTH' });
	const input: CardInput & { last4: string } = {
		number: card.number,
		expiry: card.expiry,
		cvc: card.cvc,
		holderName: card.holderName,
		zip: card.zip,
		last4: card.last4
	};
	if (gateway === 'ebizcharge') {
		input.address = EBIZ_BILLING.address;
		input.zip = EBIZ_BILLING.zip;
	}
	return input;
}

async function run(): Promise<void> {
	const card = walletCard();
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, { profileMode: 'personal' });
	try {
		await harness.ensurePassengerShell();

		// Precondición: tarjeta en wallet.
		const walletResult = await harness
			.ensureWalletCard(card)
			.catch((e: unknown) => `err:${e instanceof Error ? e.message : String(e)}`);
		log(`wallet: ${walletResult} (last4 ${card.last4})`);

		const driver = harness.getDriver();
		const trip = new PassengerNewTripScreen(getPassengerAppConfig(), driver);
		await trip.openNewTrip();
		// E2E_SKIP_ORIGIN=1 → dejar el origen pre-cargado por GPS (ubicación actual del device), para
		// que el driver físico en esa misma ubicación matchee el viaje difundido.
		if (process.env.E2E_SKIP_ORIGIN !== '1') {
			await trip.setOrigin(process.env.E2E_ORIGIN ?? TEST_DATA.origin);
		} else {
			log('E2E_SKIP_ORIGIN=1 → origen = ubicación GPS actual (pre-cargada)');
		}
		await trip.setDestination(process.env.E2E_DESTINATION ?? TEST_DATA.destination);
		log('O+D seleccionados, confirmTrip() (Seleccionar Vehículo → travel-info → Confirmar)…');

		// Flujo completo v2.5.17 via el POM.
		const code = await trip
			.confirmTrip()
			.catch((e: unknown) => `ERR:${e instanceof Error ? e.message : String(e)}`);
		log(`confirmTrip → código/resultado: ${code}`);
		await driver.pause(2500);

		try {
			mkdirSync('evidence/ebiz', { recursive: true });
			await (driver as unknown as { saveScreenshot: (p: string) => Promise<unknown> }).saveScreenshot(
				'evidence/ebiz/newtrip-fullflow-v2517.png'
			);
			log('screenshot ok');
		} catch {
			/* noop */
		}

		const dump = await driver.execute(() => {
			const isVisible = (el: Element): boolean => {
				const h = el as HTMLElement;
				const r = h.getBoundingClientRect();
				const s = getComputedStyle(h);
				return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
			};
			const pages = Array.from(document.querySelectorAll('ion-router-outlet > *, ion-modal, ion-modal > *'))
				.map(e => `${e.tagName.toLowerCase()}${(e as HTMLElement).offsetParent === null ? '(h)' : ''}`)
				.filter((v, i, a) => a.indexOf(v) === i)
				.slice(0, 15);
			const btns = (
				Array.from(
					document.querySelectorAll('button, ion-button, .btn, [role="button"], ion-item, ion-card')
				) as HTMLElement[]
			)
				.filter(isVisible)
				.map(e => ({
					tag: e.tagName.toLowerCase(),
					cls: (e.className || '').toString().slice(0, 55),
					text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 45)
				}))
				.filter(b => b.text || b.cls)
				.slice(0, 35);
			return {
				url: location.href,
				pages,
				bodyText: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 600),
				btns
			};
		});
		log(`PASO VEHÍCULO/PAGO:\n${JSON.stringify(dump, null, 2)}`);
	} finally {
		await harness.endSession();
	}
}

run().catch((e: unknown) => {
	console.error(`[fullflow] ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
