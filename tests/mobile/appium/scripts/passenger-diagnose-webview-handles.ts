/**
 * DIAGNÓSTICO (frame flake): tras abrir el modal de alta de tarjeta, enumera los
 * WINDOW HANDLES (páginas que chromedriver ve dentro del contexto WEBVIEW) y, por cada
 * uno, vuelca href / título / si contiene el form nativo (app-credit-card-payment-data
 * / #cardNumber). Objetivo: confirmar que existe >1 página (app vs iframe firebase-auth)
 * y cuál tiene el form → base del fix determinístico en switchToWebView.
 *
 * Uso: ANDROID_UDID=R92XB0B8F3J APPIUM_SERVER_URL=http://localhost:4723 DOTENV_CONFIG_PATH=.env.test \
 *      npx tsx -r dotenv/config tests/mobile/appium/scripts/passenger-diagnose-webview-handles.ts
 */

import { getPassengerAppConfig } from '../config/appiumRuntime';
import { PassengerTripHappyPathHarness } from '../harness/PassengerTripHappyPathHarness';

const log = (m: string): void => console.log(`[diag-handles] ${m}`);

async function run(): Promise<void> {
	const harness = new PassengerTripHappyPathHarness(getPassengerAppConfig(), undefined, { profileMode: 'personal' });
	try {
		await harness.ensurePassengerShell();
		const driver = harness.getDriver();
		const wallet = harness.getWalletScreen();
		await wallet.openWallet();

		const contexts = (await driver.getContexts()) as string[];
		log(`contexts=${JSON.stringify(contexts)}`);
		const webview = contexts.find(c => String(c).startsWith('WEBVIEW'));
		if (!webview) { log('NO webview context'); return; }
		await driver.switchContext(webview);

		// Poll del render de /cards a lo largo de 20s: qué componentes/botones/spinner hay.
		const snap = () => driver.execute(() => {
			const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
			const btns = Array.from(document.querySelectorAll('button, ion-button, [role="button"], a.btn, .btn')) as HTMLElement[];
			return {
				href: window.location.href,
				bodyLen: (document.body?.innerText ?? '').length,
				appCards: !!document.querySelector('app-cards'),
				appRoot: !!document.querySelector('app-root'),
				ionContent: document.querySelectorAll('ion-content').length,
				loading: document.querySelectorAll('ion-loading:not(.overlay-hidden), app-spinner, ion-spinner').length,
				component: !!document.querySelector('app-credit-card-payment-data'),
				cardNumber: !!document.querySelector('#cardNumber, input[formcontrolname="cardNumber"], [data-checkout="cardNumber"]'),
				buttons: btns.map(b => norm((b.textContent ?? '') + '|' + (b.getAttribute('aria-label') ?? ''))).filter(t => t.replace(/\|/g, '').length).slice(0, 25),
			};
		}).catch((e: unknown) => ({ err: e instanceof Error ? e.message : String(e) }));

		log(`PRE-TAP → ${JSON.stringify(await snap())}`);

		// Tap AGREGAR por texto (button/ion-button), no por clase.
		const tapped = await driver.execute(() => {
			const btns = Array.from(document.querySelectorAll('button, ion-button, [role="button"]')) as HTMLElement[];
			const t = btns.find(b => /agregar/i.test((b.textContent ?? '') + (b.getAttribute('aria-label') ?? '')));
			if (!t) return false;
			(t.querySelector('button') as HTMLElement ?? t).click();
			return true;
		}).catch(() => false);
		log(`AGREGAR tapped=${tapped}`);

		await driver.pause(2_500);
		log(`POST-TAP component=${JSON.stringify(await driver.execute(() => ({
			component: !!document.querySelector('app-credit-card-payment-data'),
			cardNumberHost: !!document.querySelector('#cardNumber'),
		})).catch(() => 'err'))}`);

		// Dump del DOM ANTES de tipear (solo cardNumber visible).
		const dumpInputs = () => driver.execute(() => {
			const scope = document.querySelector('app-credit-card-payment-data') ?? document.body;
			const els = Array.from(scope.querySelectorAll('ion-input, input, ion-select, select')) as HTMLElement[];
			return els.map(e => {
				const inner = e.tagName === 'INPUT' ? e : (e.querySelector('input.native-input, input') as HTMLElement | null);
				return {
					tag: e.tagName.toLowerCase(),
					id: e.id || '',
					fcn: e.getAttribute('formcontrolname') || '',
					checkout: e.getAttribute('data-checkout') || '',
					innerTag: inner ? inner.tagName.toLowerCase() : '',
					innerClass: inner ? (inner.className || '').slice(0, 30) : '',
					innerFcn: inner ? (inner.getAttribute('formcontrolname') || '') : '',
					val: inner ? ((inner as HTMLInputElement).value || '') : '',
				};
			});
		}).catch((e: unknown) => [{ err: e instanceof Error ? e.message : String(e) }]);

		log(`PRE-TYPE inputs=${JSON.stringify(await dumpInputs())}`);

		// TIPEO vía SETTER NATIVO del prototipo + evento input (así actualiza el reactive form Ionic).
		const typeRes = await driver.execute((num: string) => {
			const host = document.querySelector('#cardNumber, ion-input[formcontrolname="cardNumber"]') as HTMLElement | null;
			const inp = (host?.querySelector('input.native-input, input') ?? host) as HTMLInputElement | null;
			if (!inp) return 'no-input';
			inp.focus();
			const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
			proto?.set?.call(inp, num);
			inp.dispatchEvent(new Event('input', { bubbles: true }));
			inp.dispatchEvent(new Event('change', { bubbles: true }));
			inp.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
			inp.dispatchEvent(new Event('blur', { bubbles: true }));
			return `val=${inp.value}`;
		}, '4242424242424242').catch((e: unknown) => `err:${e instanceof Error ? e.message : String(e)}`);
		log(`TYPE(proto-setter) → ${typeRes}`);
		await driver.pause(3_500); // reveal progresivo

		log(`POST-TYPE inputs=${JSON.stringify(await dumpInputs())}`);
	} catch (e) {
		log(`FATAL ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
	} finally {
		await harness.endSession().catch(() => undefined);
	}
}

void run();
