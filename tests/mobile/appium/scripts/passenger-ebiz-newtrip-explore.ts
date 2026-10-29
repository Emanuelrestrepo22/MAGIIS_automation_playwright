/**
 * EXPLORADOR alta de viaje (v2.5.17) — captura el paso posterior a origen+destino.
 *
 * En v2.5.17 el flujo de alta de viaje cambió: tras setOrigin/setDestination ya no aparece el botón
 * "Seleccionar Vehiculo". Este script llena origen+destino y VUELCA la pantalla siguiente
 * (screenshot + botones/CTAs visibles) para re-mapear PassengerNewTripScreen.confirmTrip().
 *
 * Uso:
 *   APPIUM_SERVER_URL=http://localhost:4723 ENV=test \
 *   ANDROID_PASSENGER_APP_PACKAGE=com.magiis.app.test.passenger \
 *   node --loader ts-node/esm -r dotenv/config tests/mobile/appium/scripts/passenger-ebiz-newtrip-explore.ts
 */

import { mkdirSync } from 'node:fs';
import { getPassengerAppConfig } from '../config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';
import { PassengerNewTripScreen } from '../passenger/PassengerNewTripScreen';
import { TEST_DATA } from '../../../features/gateway-pg/data/stripeTestData';

const log = (m: string): void => console.log(`[newtrip-explore] ${m}`);
const ORIGIN = process.env.E2E_ORIGIN ?? TEST_DATA.origin;
const DESTINATION = process.env.E2E_DESTINATION ?? TEST_DATA.destination;

async function run(): Promise<void> {
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, { profileMode: 'personal' });
	try {
		await harness.ensurePassengerShell();
		const driver = harness.getDriver();
		const trip = new PassengerNewTripScreen(getPassengerAppConfig(), driver);

		await trip.openNewTrip();
		log('home ok, seteando origen…');
		await trip
			.setOrigin(ORIGIN)
			.catch((e: unknown) => log(`setOrigin err: ${e instanceof Error ? e.message : String(e)}`));
		log('seteando destino…');
		await trip
			.setDestination(DESTINATION)
			.catch((e: unknown) => log(`setDestination err: ${e instanceof Error ? e.message : String(e)}`));
		await driver.pause(2_500);

		// Screenshot del paso siguiente.
		try {
			mkdirSync('evidence/ebiz', { recursive: true });
			await (driver as unknown as { saveScreenshot: (p: string) => Promise<unknown> }).saveScreenshot(
				'evidence/ebiz/newtrip-after-od-v2517.png'
			);
			log('screenshot → evidence/ebiz/newtrip-after-od-v2517.png');
		} catch (e) {
			log(`screenshot err: ${e instanceof Error ? e.message : String(e)}`);
		}

		// Dump de botones / CTAs / componentes visibles.
		const dump = await driver
			.execute(() => {
				const isVisible = (el: Element): boolean => {
					const h = el as HTMLElement;
					const r = h.getBoundingClientRect();
					const s = window.getComputedStyle(h);
					return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
				};
				const url = location.href;
				const apps = Array.from(
					document.querySelectorAll(
						'ion-router-outlet > *, app-home, app-travel-info, app-travel-summary, app-vehicle-selection, app-select-vehicle'
					)
				)
					.map(e => `${e.tagName.toLowerCase()}${(e as HTMLElement).offsetParent === null ? '(hidden)' : ''}`)
					.filter((v, i, a) => a.indexOf(v) === i);
				const buttons = Array.from(
					document.querySelectorAll('button, ion-button, [role="button"], ion-fab-button')
				)
					.filter(isVisible)
					.map(
						e =>
							(e.textContent || '').replace(/\s+/g, ' ').trim() ||
							e.getAttribute('aria-label') ||
							'[icon]'
					)
					.filter(Boolean)
					.slice(0, 25);
				const primary = Array.from(
					document.querySelectorAll('.btn.primary, button.primary, ion-button[color="primary"]')
				)
					.filter(isVisible)
					.map(e => (e.textContent || '').replace(/\s+/g, ' ').trim() || '[icon]')
					.slice(0, 10);
				const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 500);
				return { url, apps, buttons, primary, bodyText };
			})
			.catch((e: unknown) => ({ err: e instanceof Error ? e.message : String(e) }));
		log(`PASO POST ORIGEN+DESTINO:\n${JSON.stringify(dump, null, 2)}`);
	} finally {
		await harness.endSession();
	}
}

run().catch((e: unknown) => {
	console.error(`[newtrip-explore] ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
