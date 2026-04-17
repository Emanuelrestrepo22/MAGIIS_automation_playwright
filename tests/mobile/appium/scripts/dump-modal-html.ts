/**
 * Dump profundo del modal app-credit-card-payment-data: outerHTML + estado form + ngKeys.
 * Uso:
 *   DUMP_DIR=evidence/manual-capture/pax-hold/3ds SCREEN_LABEL=step-07-guardar-no-dispara-deep \
 *   ANDROID_APP_PACKAGE=com.magiis.app.test.passenger \
 *   NODE_OPTIONS=--experimental-specifier-resolution=node \
 *   node --loader ts-node/esm tests/mobile/appium/scripts/dump-modal-html.ts
 */
import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const UDID        = process.env.ANDROID_UDID        ?? 'R92XB0B8F3J';
const APP_PACKAGE = process.env.ANDROID_APP_PACKAGE ?? 'com.magiis.app.test.passenger';
const LABEL       = process.env.SCREEN_LABEL        ?? 'modal-deep';
const DUMP_DIR    = process.env.DUMP_DIR            ?? 'evidence/dom-dump';

async function run(): Promise<void> {
	const driver = await remote({
		protocol: 'http', hostname: 'localhost', port: 4723, path: '/',
		logLevel: 'warn',
		capabilities: {
			platformName:               'Android',
			'appium:automationName':    'UiAutomator2',
			'appium:deviceName':        'Pixel_7',
			'appium:udid':              UDID,
			'appium:appPackage':        APP_PACKAGE,
			'appium:appActivity':       '.MainActivity',
			'appium:noReset':           true,
			'appium:forceAppLaunch':    false,
			'appium:newCommandTimeout': 120,
			'appium:chromedriverAutodownload': true,
		} as Record<string, unknown>,
	});

	const contexts = await driver.getContexts() as string[];
	const webview = contexts.find(c => c.startsWith('WEBVIEW'));
	if (!webview) {
		console.error('No WEBVIEW context');
		await driver.deleteSession();
		process.exit(1);
	}
	await driver.switchContext(webview);

	const snapshot = await driver.execute<Record<string, unknown>, []>(() => {
		const host = document.querySelector('app-credit-card-payment-data') as HTMLElement | null;
		const form = host?.querySelector('form') as HTMLFormElement | null;
		const button = Array.from(host?.querySelectorAll('button, ion-button') ?? []).find(b => (b.textContent ?? '').trim().toUpperCase().includes('GUARDAR')) as HTMLElement | null;

		const errorCandidates = Array.from(host?.querySelectorAll('.error, .form-error, [class*="error"]') ?? []) as HTMLElement[];
		const errors = errorCandidates
			.filter(el => el.offsetParent !== null)
			.map(el => ({ class: el.className, text: (el.innerText ?? '').trim().slice(0, 200) }))
			.filter(e => e.text);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const ng = (window as any).ng;
		let ngKeys: string[] = [];
		let isStripeFormValid: unknown = null;
		if (host && typeof ng?.getComponent === 'function') {
			try {
				const component = ng.getComponent(host);
				if (component && typeof component === 'object') {
					ngKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(component))
						.concat(Object.keys(component))
						.filter((name, index, arr) => arr.indexOf(name) === index)
						.slice(0, 60);

					if (typeof (component as any).isStripeFormValid === 'function') {
						try { isStripeFormValid = (component as any).isStripeFormValid(); } catch { isStripeFormValid = 'threw'; }
					} else if ('isStripeFormValid' in component) {
						isStripeFormValid = (component as any).isStripeFormValid;
					}
				}
			} catch (error) {
				ngKeys = [`err: ${error instanceof Error ? error.message : String(error)}`];
			}
		}

		// Capture component flags and elementFromPoint at button center
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let componentFlags: Record<string, unknown> = {};
		if (host && typeof ng?.getComponent === 'function') {
			try {
				const component = ng.getComponent(host);
				if (component && typeof component === 'object') {
					for (const flag of ['disabledForm', 'stripeReady', 'stripeMounted', 'needCloseAllModal', 'isStripe', 'disabledDocNumber', 'showSecondSegment']) {
						try { componentFlags[flag] = (component as any)[flag]; } catch { componentFlags[flag] = 'threw'; }
					}
				}
			} catch { /* ignore */ }
		}

		let elementAtButtonCenter: string | null = null;
		if (button) {
			const rect = button.getBoundingClientRect();
			const cx = rect.left + rect.width / 2;
			const cy = rect.top + rect.height / 2;
			const elementAt = document.elementFromPoint(cx, cy);
			if (elementAt) {
				const tag = elementAt.tagName.toLowerCase();
				const cls = (elementAt as HTMLElement).className?.toString() ?? '';
				const id  = (elementAt as HTMLElement).id ?? '';
				elementAtButtonCenter = `${tag}#${id}.${cls.slice(0, 120)}`;
			} else {
				elementAtButtonCenter = '<null>';
			}
		}

		const clickListenerCount = button ? (() => {
			// getEventListeners is only available in DevTools, so we synthesize a test click and see if the form submits.
			return 'unknown';
		})() : 'no-button';

		return {
			url: window.location.href,
			hostPresent: Boolean(host),
			hostOuterHTML: host?.outerHTML?.slice(0, 12000) ?? null,
			formClass: form?.className ?? null,
			buttonDisabled: button ? (button as HTMLButtonElement).disabled ?? null : null,
			buttonRect: button?.getBoundingClientRect().toJSON() ?? null,
			modalErrors: errors,
			ngKeys,
			isStripeFormValid,
			componentFlags,
			elementAtButtonCenter,
			clickListenerCount,
			stripeElementsStatus: Array.from(document.querySelectorAll('.stripe-element')).map(el => el.className),
			ionModalVisible: Boolean(document.querySelector('ion-modal.show-modal')),
		};
	}) as Record<string, unknown>;

	mkdirSync(DUMP_DIR, { recursive: true });
	const ts  = new Date().toISOString().replace(/[:.]/g, '-');
	const out = join(DUMP_DIR, `${LABEL}-${ts}.json`);
	writeFileSync(out, JSON.stringify(snapshot, null, 2), 'utf-8');
	console.log(`✓ Guardado: ${out}`);
	console.log('--- RESUMEN ---');
	console.log('URL:', snapshot.url);
	console.log('hostPresent:', snapshot.hostPresent);
	console.log('formClass:', snapshot.formClass);
	console.log('buttonDisabled:', snapshot.buttonDisabled);
	console.log('buttonRect:', JSON.stringify(snapshot.buttonRect));
	console.log('isStripeFormValid:', snapshot.isStripeFormValid);
	console.log('stripeElementsStatus:', JSON.stringify(snapshot.stripeElementsStatus));
	console.log('modalErrors:', JSON.stringify(snapshot.modalErrors));
	console.log('ngKeys:', JSON.stringify(snapshot.ngKeys));

	await driver.deleteSession();
}

run().catch(e => {
	console.error('❌', e.message ?? e);
	process.exit(1);
});
