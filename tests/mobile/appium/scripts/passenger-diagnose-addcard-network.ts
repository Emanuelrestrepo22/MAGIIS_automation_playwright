/**
 * DIAGNÓSTICO: intercepta la red del alta de tarjeta (App PAX, form nativo MercadoPago) para
 * entender por qué NO persiste tras submit (sin toast). Llena el form con keystrokes reales,
 * captura las requests del webview alrededor del submit y las vuelca.
 *
 * Uso: ANDROID_UDID=R92XB0B8F3J APPIUM_SERVER_URL=http://localhost:4723 DOTENV_CONFIG_PATH=.env.test \
 *      npx tsx -r dotenv/config tests/mobile/appium/scripts/passenger-diagnose-addcard-network.ts
 */

import { STRIPE_TEST_CARDS } from '../../../features/gateway-pg/data/stripe-cards';
import { getPassengerAppConfig } from '../config/appiumRuntime';
import { dumpAppiumState } from '../helpers/appiumDebug';
import {
	clearWebViewNetworkCapture,
	dumpWebViewNetworkCapture,
	installWebViewNetworkCapture
} from '../helpers/webViewNetworkCapture';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';

const log = (m: string): void => console.log(`[diag-addcard] ${m}`);

async function run(): Promise<void> {
	const card =
		STRIPE_TEST_CARDS[(process.env.PASSENGER_CARD_KEY ?? 'visa_success') as keyof typeof STRIPE_TEST_CARDS];
	const zip = process.env.PASSENGER_ZIP ?? '76000';
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, { profileMode: 'personal' });

	try {
		await harness.ensurePassengerShell();
		const driver = harness.getDriver();
		const wallet = harness.getWalletScreen();
		await wallet.openWallet();

		const onCards = async (): Promise<boolean> =>
			driver.execute(() => window.location.href.includes('/cards')).catch(() => false);
		for (let i = 0; i < 4 && !(await onCards()); i++) {
			await driver
				.execute(() => {
					(
						document.querySelector(
							'#app-tab-bar ion-menu-toggle, ion-menu-toggle, ion-menu-button'
						) as HTMLElement | null
					)?.click();
				})
				.catch(() => {});
			await driver.pause(1_200);
			await driver
				.execute(() => {
					const b = (
						Array.from(
							document.querySelectorAll('ion-item, ion-label, a, button, span, div')
						) as HTMLElement[]
					).find(e => /^\s*billetera\s*$/i.test(e.textContent ?? '') && e.offsetParent !== null);
					b?.click();
				})
				.catch(() => {});
			await driver.pause(2_800);
		}
		if (!(await onCards())) throw new Error('No se llegó a /cards');
		log('En /cards.');

		// Instalar captura de red ANTES de abrir el form.
		await installWebViewNetworkCapture(driver);
		await clearWebViewNetworkCapture(driver);

		// AGREGAR + esperar #cardNumber.
		const cardInputPresent = async (): Promise<boolean> =>
			driver
				.execute(() => !!document.querySelector('ion-input[formcontrolname="cardNumber"] input'))
				.catch(() => false);
		let ready = false;
		for (let a = 0; a < 3 && !ready; a++) {
			await driver
				.execute(() => {
					const t = (Array.from(document.querySelectorAll('.btn.primary, ion-button')) as HTMLElement[]).find(
						b => /agregar/i.test(b.textContent ?? '') && b.offsetParent !== null
					);
					t?.click();
				})
				.catch(() => {});
			for (let w = 0; w < 30 && !ready; w++) {
				await driver.pause(500);
				ready = await cardInputPresent();
			}
		}
		if (!ready) throw new Error('form #cardNumber no montó');
		log('Form montado.');

		const typeField = async (fcn: string, value: string): Promise<void> => {
			await driver
				.execute((name: string) => {
					const n = document.querySelector(
						`ion-input[formcontrolname="${name}"] input`
					) as HTMLInputElement | null;
					n?.focus();
					n?.click();
				}, fcn)
				.catch(() => {});
			await driver.keys(value.split('')).catch(() => {});
			await driver.pause(600);
		};
		await typeField('cardNumber', card.number);
		await driver.pause(3_000);
		await typeField('cardExpirationDate', card.exp.replace(/\D/g, ''));
		await typeField('securityCode', card.cvc);
		await typeField('cardholderName', card.holderName);
		await typeField('zipCode', zip);
		await driver.pause(1_000);

		// Submit (poll enabled).
		let submitted = 'no-submit';
		for (let i = 0; i < 24 && submitted !== 'clicked'; i++) {
			submitted = await driver
				.execute(() => {
					const modal =
						(Array.from(document.querySelectorAll('app-credit-card-payment-data')) as HTMLElement[]).find(
							m => m.offsetParent !== null
						) ?? document.body;
					const b = (
						Array.from(
							modal.querySelectorAll(
								'button.btn.primary, ion-button.btn.primary, button[type="submit"], ion-button'
							)
						) as HTMLElement[]
					).find(
						x =>
							x.offsetParent !== null &&
							!((x as HTMLButtonElement).disabled || x.getAttribute('disabled') !== null) &&
							/agregar|guardar|confirmar|continuar|a[ñn]adir/i.test(x.textContent ?? '')
					);
					if (b) {
						b.click();
						return 'clicked';
					}
					return 'disabled';
				})
				.catch(() => 'err');
			if (submitted !== 'clicked') await driver.pause(500);
		}
		log(`submit → ${submitted}`);
		await driver.pause(6_000); // dejar que la request de alta se dispare

		const netPath = await dumpWebViewNetworkCapture(driver, 'diag-addcard-network');
		log(`network capture → ${netPath}`);
		await dumpAppiumState(driver, 'diag-addcard-after');
	} finally {
		await harness.endSession();
	}
}

run().catch((e: unknown) => {
	console.error(`[diag-addcard] ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
