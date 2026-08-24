/**
 * EXPLORADOR paso VEHÍCULO (v2.5.17). Desde O+D ya seleccionados (fillAndChooseAddress arreglado),
 * tapea "Seleccionar Vehículo" y vuelca la pantalla siguiente (selección de vehículo / medio de pago
 * / confirmar) → re-mapear PassengerNewTripScreen.confirmTrip().
 *
 * Uso: APPIUM_SERVER_URL=http://localhost:4723 ENV=test \
 *   node --loader ts-node/esm -r dotenv/config tests/mobile/appium/scripts/passenger-newtrip-vehicle-dump.ts
 */

import { mkdirSync } from 'node:fs';
import { getPassengerAppConfig } from '../config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';
import { PassengerNewTripScreen } from '../passenger/PassengerNewTripScreen';
import { TEST_DATA } from '../../../features/gateway-pg/data/stripeTestData';

const log = (m: string): void => console.log(`[veh-dump] ${m}`);

async function run(): Promise<void> {
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, { profileMode: 'personal' });
	try {
		await harness.ensurePassengerShell();
		const driver = harness.getDriver();
		const trip = new PassengerNewTripScreen(getPassengerAppConfig(), driver);
		await trip.openNewTrip();
		await trip.setOrigin(process.env.E2E_ORIGIN ?? TEST_DATA.origin);
		await trip.setDestination(process.env.E2E_DESTINATION ?? TEST_DATA.destination);
		log('O+D seleccionados, tapeando "Seleccionar Vehículo"…');

		// Tap del CTA "Seleccionar Vehículo" con click NATIVO de WdIO (el DOM .click() no dispara Ionic).
		let tapped = 'no-cta';
		const btns = await driver.$$('button, ion-button, .btn, [role="button"]');
		for (const b of btns) {
			const t = (await b.getText().catch(() => '')).toLowerCase();
			if (t.includes('seleccionar veh')) {
				await b.click().catch(() => undefined);
				tapped = 'clicked';
				break;
			}
		}
		log(`CTA: ${tapped}`);
		await driver.pause(3500);

		try { mkdirSync('evidence/ebiz', { recursive: true }); await (driver as unknown as { saveScreenshot: (p: string) => Promise<unknown> }).saveScreenshot('evidence/ebiz/newtrip-vehicle-v2517.png'); log('screenshot ok'); } catch { /* noop */ }

		const dump = await driver.execute(() => {
			const isVisible = (el: Element): boolean => { const h = el as HTMLElement; const r = h.getBoundingClientRect(); const s = getComputedStyle(h); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
			const pages = Array.from(document.querySelectorAll('ion-router-outlet > *, ion-modal > *, ion-app > *')).map(e => `${e.tagName.toLowerCase()}${(e as HTMLElement).offsetParent === null ? '(h)' : ''}`).filter((v, i, a) => a.indexOf(v) === i).slice(0, 15);
			const btns = (Array.from(document.querySelectorAll('button, ion-button, .btn, [role="button"], ion-item')) as HTMLElement[]).filter(isVisible).map(e => ({ tag: e.tagName.toLowerCase(), cls: (e.className || '').toString().slice(0, 60), text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 45) })).filter(b => b.text || b.cls).slice(0, 30);
			return { url: location.href, pages, bodyText: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 500), btns };
		});
		log(`PASO VEHÍCULO:\n${JSON.stringify(dump, null, 2)}`);
	} finally {
		await harness.endSession();
	}
}

run().catch((e: unknown) => { console.error(`[veh-dump] ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
