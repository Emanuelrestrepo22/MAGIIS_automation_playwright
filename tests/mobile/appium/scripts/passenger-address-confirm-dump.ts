/**
 * EXPLORADOR address-picker (v2.5.17). Inyecta el destino con secuencia COMPLETA de eventos
 * (keydown/keypress/input/keyup/change/ionInput) para disparar el autocomplete de Angular, y vuelca
 * body.outerHTML a archivo → grep del item por su subtítulo de ciudad (ancla que no está en el input).
 *
 * Uso: APPIUM_SERVER_URL=http://localhost:4723 ENV=test \
 *   node --loader ts-node/esm -r dotenv/config tests/mobile/appium/scripts/passenger-address-confirm-dump.ts
 */

import { writeFileSync } from 'node:fs';
import { getPassengerAppConfig } from '../config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';
import { PassengerNewTripScreen } from '../passenger/PassengerNewTripScreen';
import { TEST_DATA } from '../../../features/gateway-pg/data/stripeTestData';

const log = (m: string): void => console.log(`[addr-dump] ${m}`);
const ORIGIN = process.env.E2E_ORIGIN ?? TEST_DATA.origin;
const DEST = process.env.E2E_DESTINATION ?? TEST_DATA.destination;

async function run(): Promise<void> {
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, { profileMode: 'personal' });
	try {
		await harness.ensurePassengerShell();
		const driver = harness.getDriver();
		const trip = new PassengerNewTripScreen(getPassengerAppConfig(), driver);
		await trip.openNewTrip();
		await trip
			.setOrigin(ORIGIN)
			.catch((e: unknown) => log(`setOrigin err (sigo): ${e instanceof Error ? e.message : String(e)}`));
		log('origen ok, inyectando destino con secuencia completa…');

		// Inyección con secuencia de teclado (simula tipeo real char a char en el último tramo).
		await driver.execute((value: string) => {
			const input = Array.from(document.querySelectorAll('input')).find(
				i => (i.getAttribute('placeholder') || '').trim().toLowerCase() === 'destino'
			) as HTMLInputElement | undefined;
			if (!input) return;
			input.focus();
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
			const fire = (type: string, extra?: EventInit) =>
				input.dispatchEvent(
					type.startsWith('key')
						? new KeyboardEvent(type, { bubbles: true, key: 'a', ...extra })
						: new Event(type, { bubbles: true, composed: true, ...extra })
				);
			// set gradual para gatillar valueChanges con debounce
			for (let n = 1; n <= value.length; n++) {
				setter?.call(input, value.slice(0, n));
				fire('keydown');
				fire('input');
				fire('keyup');
			}
			fire('change');
			fire('ionInput');
		}, DEST);
		await driver.pause(3000);

		// Volcar body.outerHTML a archivo (cap 220K) para grep del item de sugerencia.
		const html = await driver.execute(() => (document.body?.outerHTML || '').slice(0, 220_000));
		writeFileSync('evidence/ebiz/newtrip-dest-dropdown.html', String(html));
		log(`body.outerHTML → evidence/ebiz/newtrip-dest-dropdown.html (${String(html).length} chars)`);

		// Screenshot para verificación visual del dropdown.
		try {
			await (driver as unknown as { saveScreenshot: (p: string) => Promise<unknown> }).saveScreenshot(
				'evidence/ebiz/newtrip-dest-dropdown.png'
			);
			log('screenshot ok');
		} catch {
			/* noop */
		}
	} finally {
		await harness.endSession();
	}
}

run().catch((e: unknown) => {
	console.error(`[addr-dump] ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
