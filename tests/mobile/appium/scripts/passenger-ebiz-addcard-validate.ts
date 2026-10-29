/**
 * GO/NO-GO eBizCharge — validador de alta de tarjeta en la Passenger App.
 *
 * La passenger app usa el form NATIVO Ionic `app-credit-card-payment-data` (gateway-agnóstico,
 * el mismo que MercadoPago). eBizCharge determina el outcome por el NÚMERO de tarjeta, sin 3DS,
 * y agrega el campo "Dirección de Facturación" (address) que autocompleta el ZIP.
 *
 * Este script NO usa PassengerWalletScreen.fillCardForm (roto para eBiz: detecta el form con
 * `input#cardNumber` en vez del `ion-input` host). Llena directo por `ion-input[formcontrolname]`
 * → `.native-input` con eventos reales, y reporta cada paso para calibrar el fix del POM.
 *
 * Uso:
 *   APPIUM_SERVER_URL=http://localhost:4723 ENV=test \
 *   ANDROID_PASSENGER_APP_PACKAGE=com.magiis.app.test.passenger \
 *   node --loader ts-node/esm -r dotenv/config tests/mobile/appium/scripts/passenger-ebiz-addcard-validate.ts
 */

import { getPassengerAppConfig } from '../config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';
import { EBIZ_CARDS } from '../../../fixtures/gateways/ebizcharge/card-policy';

const log = (m: string): void => console.log(`[ebiz-addcard] ${m}`);

// Tarjeta eBiz approved. exp '0930' (MMYY) → el form quiere MM/YY.
const CARD = EBIZ_CARDS.SUCCESS;
const EXP_MMYY = CARD.exp.length === 4 ? `${CARD.exp.slice(0, 2)}/${CARD.exp.slice(2)}` : CARD.exp;
const LAST4 = CARD.number.slice(-4);
// Dirección de facturación US. OJO: el control `address` del form eBiz tiene maxlength=30
// → mantener ≤30 chars o el FormGroup queda inválido y GUARDAR no habilita.
const BILLING_ADDRESS = process.env.EBIZ_ADDRESS ?? '123 Main St, Dallas TX';
const BILLING_ZIP = process.env.EBIZ_ZIP ?? '75201';

async function run(): Promise<void> {
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, { profileMode: 'personal' });
	try {
		await harness.ensurePassengerShell();
		const driver = harness.getDriver();
		const wallet = harness.getWalletScreen();

		await wallet.openWallet();
		const countBefore = await wallet.countCards().catch(() => -1);
		log(
			`wallet abierto. tarjetas antes = ${countBefore}. ¿ya existe last4 ${LAST4}? ${await wallet.hasCard(LAST4, 3_000)}`
		);

		// Precondición de persistencia: dejar el wallet con espacio (un wallet lleno impide persistir).
		if (countBefore > 3) {
			const trimmed = await harness.partialWalletCleanup(3).catch(() => 0);
			log(`limpieza parcial: ${trimmed} borradas (keepMax=3)`);
			await wallet.openWallet().catch(() => {});
		}

		// Tap AGREGAR (JS click sobre .btn.primary "agregar").
		const tapped = await driver
			.execute(() => {
				const btns = Array.from(
					document.querySelectorAll(
						'button.btn.primary, ion-button.btn.primary, button.primary, .btn.primary'
					)
				) as HTMLElement[];
				const target = btns.find(b =>
					/agregar/i.test((b.textContent ?? '') + (b.getAttribute('aria-label') ?? ''))
				);
				if (!target) return false;
				target.click();
				return true;
			})
			.catch(() => false);
		log(`AGREGAR tapped=${tapped}`);
		await driver.pause(2_500);

		// Fill genérico por formcontrolname (host ion-input → inner input real).
		// Ionic: el FormControl Angular se actualiza con los eventos `ionInput`/`ionChange`
		// del CUSTOM element, no solo con los eventos DOM nativos del input interno.
		const fillField = async (fcn: string, value: string): Promise<string> =>
			driver
				.execute(
					(controlName: string, val: string) => {
						const host = document.querySelector(
							`ion-input[formcontrolname="${controlName}"], #${controlName}, input[formcontrolname="${controlName}"]`
						) as HTMLElement | null;
						if (!host) return 'no-host';
						const input = (
							host.matches('input')
								? host
								: (host.querySelector('input.native-input') ?? host.querySelector('input'))
						) as HTMLInputElement | null;
						if (!input) return 'no-input';
						const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
						input.focus();
						setter?.call(input, val);
						input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
						input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
						// Eventos Ionic sobre el host ion-input (lo que Angular realmente bindea).
						try {
							(host as HTMLElement & { value?: string }).value = val;
						} catch {
							/* ion-input value prop */
						}
						host.dispatchEvent(
							new CustomEvent('ionInput', { bubbles: true, composed: true, detail: { value: val } })
						);
						host.dispatchEvent(
							new CustomEvent('ionChange', { bubbles: true, composed: true, detail: { value: val } })
						);
						input.dispatchEvent(new Event('blur', { bubbles: true, composed: true }));
						host.dispatchEvent(new CustomEvent('ionBlur', { bubbles: true, composed: true }));
						const readback =
							(host.querySelector('input.native-input, input') as HTMLInputElement | null)?.value ?? '';
						return `ok(readback="${readback}")`;
					},
					fcn,
					value
				)
				.catch((e: unknown) => `err:${e instanceof Error ? e.message : String(e)}`) as Promise<string>;

		log(`fill cardNumber(${CARD.number}) → ${await fillField('cardNumber', CARD.number)}`);
		await driver.pause(2_500); // reveal progresivo tras detectar emisor
		log(`fill cardExpirationDate(${EXP_MMYY}) → ${await fillField('cardExpirationDate', EXP_MMYY)}`);
		log(`fill securityCode(${CARD.cvc}) → ${await fillField('securityCode', CARD.cvc)}`);
		log(`fill cardholderName(${CARD.holderName}) → ${await fillField('cardholderName', CARD.holderName)}`);
		log(`fill address(${BILLING_ADDRESS}) → ${await fillField('address', BILLING_ADDRESS)}`);
		await driver.pause(1_500); // el address puede autocompletar el zip

		// ¿El zip se autocompletó? Si no, lo tipeamos.
		const zipNow = await driver
			.execute(() => {
				const host = document.querySelector(
					'ion-input[formcontrolname="zipCode"], #zipCode'
				) as HTMLElement | null;
				const input = host?.querySelector('input.native-input, input') as HTMLInputElement | null;
				return input?.value ?? '<no-zip-input>';
			})
			.catch(() => '<err>');
		log(`zipCode tras address = "${zipNow}"`);
		if (!zipNow || zipNow === '' || zipNow === '<no-zip-input>') {
			log(`fill zipCode(${BILLING_ZIP}) → ${await fillField('zipCode', BILLING_ZIP)}`);
		}

		await driver.pause(500);

		// Introspección del FormGroup Angular: qué controls quedan inválidos y por qué.
		const formInfo = await driver
			.execute(() => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const ng = (window as any).ng;
				const host = document.querySelector('app-credit-card-payment-data');
				if (!ng || !host || typeof ng.getComponent !== 'function') return { err: 'no-ng' };
				const cmp = ng.getComponent(host);
				if (!cmp || typeof cmp !== 'object') return { err: 'no-cmp' };
				const findGroup = (o: Record<string, unknown>): { name: string; group: any } | null => {
					for (const k of Object.keys(o)) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const v = (o as any)[k];
						if (v && typeof v === 'object' && v.controls && typeof v.controls === 'object')
							return { name: k, group: v };
					}
					return null;
				};
				const fg = findGroup(cmp as Record<string, unknown>);
				if (!fg) return { err: 'no-formgroup', keys: Object.keys(cmp as Record<string, unknown>).slice(0, 50) };
				const controls: Record<string, unknown> = {};
				for (const cn of Object.keys(fg.group.controls)) {
					const c = fg.group.controls[cn];
					controls[cn] = { value: c.value, valid: c.valid, errors: c.errors };
				}
				return { groupName: fg.name, formValid: fg.group.valid, controls };
			})
			.catch((e: unknown) => ({ err: `introspect-fail:${e instanceof Error ? e.message : String(e)}` }));
		log(`FORM Angular:\n${JSON.stringify(formInfo, null, 2)}`);

		// Estado del botón GUARDAR (¿habilitado?).
		const saveState = await driver
			.execute(() => {
				const host = document.querySelector('app-credit-card-payment-data') ?? document;
				const btns = Array.from(host.querySelectorAll('button, ion-button')) as HTMLElement[];
				const save = btns.find(b => /guardar/i.test(b.textContent ?? ''));
				if (!save) return { found: false, disabled: null };
				const disabled =
					save.getAttribute('disabled') !== null ||
					save.getAttribute('aria-disabled') === 'true' ||
					(save as HTMLButtonElement).disabled === true;
				return { found: true, disabled };
			})
			.catch(() => ({ found: false, disabled: null }));
		log(`GUARDAR: ${JSON.stringify(saveState)}`);

		// Tap GUARDAR (click nativo — para eBiz el submit lo maneja el ngSubmit del form).
		const saved = await driver
			.execute(() => {
				const host = document.querySelector('app-credit-card-payment-data') ?? document;
				const btns = Array.from(host.querySelectorAll('button, ion-button')) as HTMLElement[];
				const save = btns.find(b => /guardar/i.test(b.textContent ?? '')) as HTMLElement | undefined;
				if (!save) return false;
				save.scrollIntoView({ block: 'center' });
				save.click();
				return true;
			})
			.catch(() => false);
		log(`GUARDAR click=${saved}. Esperando outcome…`);

		// Observar outcome: modal cierra / aparece la tarjeta / error.
		const deadline = Date.now() + 25_000;
		let outcome = 'timeout';
		while (Date.now() < deadline) {
			const state = await driver
				.execute(() => {
					const modal = document.querySelector('app-credit-card-payment-data') as HTMLElement | null;
					const modalGone = !modal || (modal as HTMLElement).offsetParent === null;
					const bodyText = (document.body?.innerText ?? '').toLowerCase();
					const errorHit = /(rechaz|declined|inválid|invalid|error|no se pudo|failed)/i.test(
						bodyText.slice(0, 4000)
					);
					return { modalGone, errorHit };
				})
				.catch(() => ({ modalGone: false, errorHit: false }));
			if (state.modalGone) {
				outcome = 'modal-closed';
				break;
			}
			if (state.errorHit) {
				outcome = 'error-text-visible';
				break;
			}
			await driver.pause(750);
		}
		log(`outcome tras GUARDAR = ${outcome}`);

		await driver.pause(1_500);
		const appears = await wallet.hasCard(LAST4, 8_000).catch(() => false);
		const countAfter = await wallet.countCards().catch(() => -1);
		log(`RESULTADO: hasCard(${LAST4})=${appears} · countAntes=${countBefore} · countDespues=${countAfter}`);
		log(
			appears
				? '✅ GO — tarjeta eBiz vinculada y visible en el wallet'
				: '❌ NO-GO — la tarjeta eBiz no quedó visible en el wallet'
		);
	} finally {
		await harness.endSession();
	}
}

run().catch((e: unknown) => {
	console.error(`[ebiz-addcard] ${e instanceof Error ? e.message : String(e)}`);
	process.exit(1);
});
