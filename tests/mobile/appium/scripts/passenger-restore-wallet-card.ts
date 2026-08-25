/**
 * Restaura la tarjeta del pasajero en su wallet (App PAX), borrada/desactivada por el cascade
 * de la desvinculación de pasarela (TC-GATEWAY-UNLINK-STRIPE-01). Precondición de la suite
 * cargo-a-bordo/hold apppax.
 *
 * IMPORTANTE (aprendido del DOM 2026-07-22): el alta NO usa el iframe de Stripe — es un form
 * NATIVO Ionic (`app-credit-card-payment-data`, estilo MercadoPago) con ion-inputs por
 * `formcontrolname`: cardNumber · cardExpirationDate · securityCode · cardholderName · zipCode,
 * form progresivo (los últimos aparecen tras el número). Por eso NO se usa
 * PassengerWalletScreen.tapAddCard/fillCardForm (asumen Stripe iframe).
 *
 * Uso: ANDROID_UDID=... APPIUM_SERVER_URL=... DOTENV_CONFIG_PATH=.env.test \
 *      npx tsx -r dotenv/config tests/mobile/appium/scripts/passenger-restore-wallet-card.ts
 */

import { STRIPE_TEST_CARDS } from '../../../features/gateway-pg/data/stripe-cards';
import { getPassengerAppConfig } from '../config/appiumRuntime';
import { dumpAppiumState } from '../helpers/appiumDebug';
import { handleThreeDsPopup } from '../helpers/threeDsChallenge';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';

const log = (m: string): void => console.log(`[passenger-restore-card] ${m}`);

async function run(): Promise<void> {
	const cardKey = (process.env.PASSENGER_CARD_KEY ?? 'visa_3ds_success') as keyof typeof STRIPE_TEST_CARDS;
	const card = STRIPE_TEST_CARDS[cardKey];
	const zip = process.env.PASSENGER_ZIP ?? '76000';
	log(`Tarjeta objetivo: ${cardKey} (••••${card.last4}) exp=${card.exp} holder="${card.holderName}"`);

	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, { profileMode: 'personal' });

	try {
		await harness.ensurePassengerShell();
		const driver = harness.getDriver();
		const wallet = harness.getWalletScreen();
		await wallet.openWallet();

		// ENDURECIDO: openWallet hace early-return por el TEXTO "AGREGAR", que TAMBIÉN existe en
		// HomePage → false-positive. Verificar por URL real `/cards` y navegar menú→Billetera si no.
		const onCards = async (): Promise<boolean> =>
			driver.execute(() => window.location.href.includes('/cards')).catch(() => false);
		for (let i = 0; i < 4 && !(await onCards()); i++) {
			log(`No estamos en /cards (intento ${i + 1}) — navegando menú→Billetera...`);
			await driver
				.execute(() => {
					const t = document.querySelector(
						'#app-tab-bar ion-menu-toggle, ion-menu-toggle, ion-menu-button'
					) as HTMLElement | null;
					t?.click();
				})
				.catch(() => {});
			await driver.pause(1_200);
			await driver
				.execute(() => {
					const els = Array.from(
						document.querySelectorAll('ion-item, ion-label, a, button, span, div')
					) as HTMLElement[];
					const b = els.find(
						e => /^\s*billetera\s*$/i.test(e.textContent ?? '') && (e as HTMLElement).offsetParent !== null
					);
					(b as HTMLElement | undefined)?.click();
				})
				.catch(() => {});
			await driver.pause(2_800);
		}
		if (!(await onCards())) {
			await dumpAppiumState(driver, 'passenger-restore-not-on-cards');
			throw new Error('No se pudo llegar a /cards (wallet). Ver dump.');
		}
		log('En /cards (wallet) confirmado por URL.');

		if (await wallet.hasCard(card.last4).catch(() => false)) {
			log(`La tarjeta ••••${card.last4} ya está presente — nada que restaurar.`);
			return;
		}

		// Cerrar modales de alta APILADOS (residuo de noReset) para arrancar con uno solo limpio.
		for (let i = 0; i < 4; i++) {
			const closed = await driver
				.execute(() => {
					const modals = Array.from(
						document.querySelectorAll('app-credit-card-payment-data')
					) as HTMLElement[];
					const open = modals.find(m => (m as HTMLElement).offsetParent !== null);
					if (!open) return false;
					const back = open.querySelector(
						'.arrow-back, ion-icon[name="arrow-back-outline"]'
					) as HTMLElement | null;
					if (back) {
						back.click();
						return true;
					}
					return false;
				})
				.catch(() => false);
			if (!closed) break;
			await driver.pause(1_200);
		}
		log('Modales de alta previos cerrados (si había).');

		// PRECONDICIÓN (aprendida): el wallet tiene un LÍMITE de tarjetas. Si está lleno, el alta
		// no persiste (sin error visible). Limpieza PARCIAL: borrar N tarjetas para hacer lugar.
		const cleanupCount = Number.parseInt(process.env.PARTIAL_CLEANUP_COUNT ?? '5', 10);
		let deleted = 0;
		for (let i = 0; i < cleanupCount; i++) {
			const removed = await wallet.deleteFirstVisibleCard().catch(() => null);
			if (!removed) break;
			deleted++;
			await driver.pause(800);
		}
		log(`Limpieza parcial: ${deleted} tarjeta(s) eliminada(s) para hacer lugar.`);

		// Tap AGREGAR → modal nativo. FLAKY: a veces el form no monta → reintentar AGREGAR
		// hasta que exista el input #cardNumber (poll), no solo asumir que abrió.
		const tapAgregar = async (): Promise<boolean> =>
			driver
				.execute(() => {
					const btns = Array.from(
						document.querySelectorAll(
							'button.btn.primary, ion-button.btn.primary, button.primary, .btn.primary, ion-button'
						)
					) as HTMLElement[];
					const t = btns.find(
						b =>
							/agregar/i.test((b.textContent ?? '') + (b.getAttribute('aria-label') ?? '')) &&
							(b as HTMLElement).offsetParent !== null
					);
					if (!t) return false;
					t.click();
					return true;
				})
				.catch(() => false);
		const cardInputPresent = async (): Promise<boolean> =>
			driver
				.execute(
					() => !!document.querySelector('ion-input[formcontrolname="cardNumber"] input, #cardNumber input')
				)
				.catch(() => false);

		let formReady = false;
		for (let attempt = 0; attempt < 3 && !formReady; attempt++) {
			const tapped = await tapAgregar();
			log(`AGREGAR intento ${attempt + 1} tapped=${tapped}`);
			for (let w = 0; w < 30 && !formReady; w++) {
				// hasta 15s esperando el form
				await driver.pause(500);
				formReady = await cardInputPresent();
			}
		}
		if (!formReady) {
			await dumpAppiumState(driver, 'passenger-restore-addcard-no-form');
			throw new Error('El form de alta (#cardNumber) no montó tras AGREGAR (3 intentos). Ver dump.');
		}
		log('Form de alta montado (#cardNumber presente).');

		// Fill de ion-input disparando los eventos que escucha el ControlValueAccessor de Ionic:
		// set del native + `input`, y set del host.value + `ionInput`/`ionChange` en el HOST.
		// (El set-value crudo solo-nativo no registraba en cvv/titular/zip; WDIO click se intercepta.)
		const fill = async (fcn: string, value: string): Promise<string> =>
			driver
				.execute(
					(name: string, val: string) => {
						const host = document.querySelector(`ion-input[formcontrolname="${name}"]`) as
							| (HTMLElement & { value?: unknown })
							| null;
						if (!host) return 'no-host';
						const native = host.querySelector('input') as HTMLInputElement | null;
						if (native) {
							native.focus();
							native.value = val;
							native.dispatchEvent(new Event('input', { bubbles: true }));
						}
						host.value = val;
						host.dispatchEvent(new CustomEvent('ionInput', { bubbles: true, detail: { value: val } }));
						host.dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { value: val } }));
						if (native) {
							native.dispatchEvent(new Event('change', { bubbles: true }));
							native.dispatchEvent(new Event('blur', { bubbles: true }));
						}
						host.dispatchEvent(new CustomEvent('ionBlur', { bubbles: true }));
						return 'ok';
					},
					fcn,
					value
				)
				.catch((e: unknown) => `err:${e instanceof Error ? e.message.slice(0, 50) : String(e)}`);

		// cardNumber: TAP en el campo + TIPEO REAL de los dígitos → el sistema valida el emisor
		// y RECIÉN AHÍ emergen los demás campos (comportamiento confirmado por el usuario).
		const focused = await driver
			.execute(() => {
				const n = document.querySelector(
					'ion-input[formcontrolname="cardNumber"] input'
				) as HTMLInputElement | null;
				if (!n) return false;
				n.focus();
				n.click();
				return true;
			})
			.catch(() => false);
		await driver.keys(card.number.split('')).catch(() => {});
		log(`cardNumber (tap+type, focused=${focused}) → tipeado`);
		await driver.pause(3_500); // validación del emisor → revela expiry/cvv/titular/zip

		// TIPEO REAL en TODOS los campos: el form es MercadoPago SDK (data-checkout) → tokeniza
		// desde SU captura interna, no del modelo Angular. El JS value-set no alimenta el SDK;
		// solo los keystrokes reales sí. Focus del native-input por JS + driver.keys.
		const typeField = async (fcn: string, value: string): Promise<string> => {
			const ok = await driver
				.execute((name: string) => {
					const host = document.querySelector(`ion-input[formcontrolname="${name}"]`) as HTMLElement | null;
					const n = host?.querySelector('input') as HTMLInputElement | null;
					if (!n) return false;
					n.focus();
					n.click();
					return true;
				}, fcn)
				.catch(() => false);
			if (!ok) return 'no-host';
			await driver.keys(value.split('')).catch(() => {});
			await driver.pause(600);
			return 'typed';
		};
		log(`cardExpirationDate → ${await typeField('cardExpirationDate', card.exp.replace(/\D/g, ''))}`);
		log(`securityCode → ${await typeField('securityCode', card.cvc)}`);
		log(`cardholderName → ${await typeField('cardholderName', card.holderName)}`);
		log(`zipCode → ${await typeField('zipCode', zip)}`);
		await driver.pause(1_000);

		await dumpAppiumState(driver, 'passenger-restore-card-filled');

		// Submit: la validación del form es ASYNC → el botón primario tarda en habilitarse.
		// Poll hasta ~12s a que un botón primario del modal quede ENABLED y recién ahí click.
		let submitted = 'no-submit';
		for (let i = 0; i < 24; i++) {
			const r = await driver
				.execute(() => {
					const modals = Array.from(
						document.querySelectorAll('app-credit-card-payment-data')
					) as HTMLElement[];
					const modal =
						modals.find(m => (m as HTMLElement).offsetParent !== null) ??
						modals[modals.length - 1] ??
						document.body;
					const btns = Array.from(
						modal.querySelectorAll(
							'button.btn.primary, ion-button.btn.primary, button[type="submit"], ion-button'
						)
					) as HTMLElement[];
					const enabled = btns.find(
						b =>
							(b as HTMLElement).offsetParent !== null &&
							!((b as HTMLButtonElement).disabled || b.getAttribute('disabled') !== null) &&
							/agregar|guardar|confirmar|continuar|a[ñn]adir|siguiente/i.test(b.textContent ?? '')
					);
					if (enabled) {
						enabled.click();
						return 'clicked';
					}
					return 'disabled';
				})
				.catch((e: unknown) => `err:${e instanceof Error ? e.message.slice(0, 40) : String(e)}`);
			submitted = r;
			if (r === 'clicked') break;
			await driver.pause(500);
		}
		log(`submit → ${submitted}`);
		await driver.pause(1_200);
		// Capturar toast inmediato (razón backend si el alta se rechaza).
		const toast = await driver
			.execute(() => {
				const t = document.querySelector('ion-toast');
				const msg =
					t?.shadowRoot?.querySelector('.toast-message')?.textContent ??
					document.querySelector('.toast-message, .toast-wrapper')?.textContent ??
					'';
				return (msg ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
			})
			.catch(() => '');
		log(`toast post-submit: "${toast}"`);
		await driver.pause(2_000);

		// 3155 es 3DS → el alta puede disparar un challenge Stripe. Completarlo.
		const tds = await handleThreeDsPopup(
			driver,
			label => dumpAppiumState(driver, label),
			60_000,
			'passenger-restore-3ds'
		);
		log(`3DS challenge → ${tds}`);
		await driver.pause(5_000);

		await harness.ensurePassengerShell();
		await wallet.openWallet();
		const ok = await wallet.hasCard(card.last4).catch(() => false);
		await dumpAppiumState(driver, 'passenger-restore-card-after');
		log(
			ok
				? `✅ Tarjeta ••••${card.last4} restaurada.`
				: `⚠️ No se confirmó ••••${card.last4} en el wallet tras submit (revisar dump).`
		);
	} finally {
		await harness.endSession();
	}
}

run().catch((error: unknown) => {
	console.error(`[passenger-restore-card] ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
