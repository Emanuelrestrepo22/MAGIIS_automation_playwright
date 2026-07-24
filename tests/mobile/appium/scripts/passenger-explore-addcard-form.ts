/**
 * EXPLORADOR (aprendizaje): abre el modal de alta de tarjeta del wallet PAX
 * (app-credit-card-payment-data, form nativo estilo MercadoPago), escribe el número
 * de tarjeta en #cardNumber y VUELCA los campos que aparecen (form progresivo:
 * expiry/cvv/titular se revelan tras detectar el emisor). No guarda nada.
 *
 * Uso: ANDROID_UDID=... APPIUM_SERVER_URL=... DOTENV_CONFIG_PATH=.env.test \
 *      npx tsx -r dotenv/config tests/mobile/appium/scripts/passenger-explore-addcard-form.ts
 */

import { getPassengerAppConfig } from '../config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';

const CARD = process.env.EXPLORE_CARD ?? '4000002500003155';
const log = (m: string): void => console.log(`[explore-addcard] ${m}`);

async function run(): Promise<void> {
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, { profileMode: 'personal' });
	try {
		await harness.ensurePassengerShell();
		const driver = harness.getDriver();
		const wallet = harness.getWalletScreen();
		await wallet.openWallet();

		// Tap AGREGAR (JS click en .btn.primary que diga "agregar").
		const tapped = await driver.execute(() => {
			const btns = Array.from(document.querySelectorAll('button.btn.primary, ion-button.btn.primary, button.primary, .btn.primary')) as HTMLElement[];
			const target = btns.find(b => /agregar/i.test((b.textContent ?? '') + (b.getAttribute('aria-label') ?? '')));
			if (!target) return false;
			target.click();
			return true;
		}).catch(() => false);
		log(`AGREGAR tapped=${tapped}`);
		await driver.pause(2_500);

		// Escribir el número en #cardNumber (ion-input → native-input) con eventos reales.
		const filled = await driver.execute((num: string) => {
			const host = document.querySelector('#cardNumber, ion-input[formcontrolname="cardNumber"]') as HTMLElement | null;
			if (!host) return 'no-host';
			const native = (host.querySelector('input.native-input') ?? host.querySelector('input')) as HTMLInputElement | null;
			if (!native) return 'no-native';
			native.focus();
			native.value = num;
			native.dispatchEvent(new Event('input', { bubbles: true }));
			native.dispatchEvent(new Event('change', { bubbles: true }));
			native.dispatchEvent(new Event('blur', { bubbles: true }));
			return 'ok';
		}, CARD).catch((e: unknown) => `err:${e instanceof Error ? e.message : String(e)}`);
		log(`fill cardNumber → ${filled}`);
		await driver.pause(3_500);

		// Volcar TODOS los inputs/selects/botones del modal ahora visibles.
		const fields = await driver.execute(() => {
			const modal = document.querySelector('app-credit-card-payment-data') ?? document;
			const els = Array.from(modal.querySelectorAll('ion-input, input, ion-select, select, button, ion-button')) as HTMLElement[];
			return els.map((e) => ({
				tag: e.tagName.toLowerCase(),
				id: e.id || '',
				fcn: e.getAttribute('formcontrolname') || '',
				checkout: e.getAttribute('data-checkout') || '',
				ph: e.getAttribute('placeholder') || (e.querySelector('input')?.getAttribute('placeholder') ?? ''),
				type: e.getAttribute('type') || '',
				text: (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 25),
				shown: (e as HTMLElement).offsetParent !== null,
			})).filter(f => f.id || f.fcn || f.checkout || f.text);
		}).catch(() => []);
		log(`CAMPOS DEL MODAL:\n${JSON.stringify(fields, null, 2)}`);
	}
	finally {
		await harness.endSession();
	}
}

run().catch((e: unknown) => { console.error(`[explore-addcard] ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
