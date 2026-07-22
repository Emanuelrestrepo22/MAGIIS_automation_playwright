/**
 * VALIDACIÓN DIRECTA de DriverTripPaymentScreen desde un TravelResumePage ya abierto.
 * Tapea "Ingresar tarjeta" (CREDIT_CARD ya seleccionado) → modal de cobro Ionic →
 * fillAndSubmit(tarjeta declinada 9995) → captura outcome. Dumpea el modal + resultado.
 *
 * Precondición: el driver está en /TravelResumePage con el footer "Ingresar tarjeta".
 */
import { remote } from 'webdriverio';
import type { MobileActorConfig } from '../config/appiumRuntime';
import { DriverTripPaymentScreen, type CardData } from '../driver/DriverTripPaymentScreen';
import { dumpAppiumState } from '../helpers/appiumDebug';

const APPIUM_URL = process.env.APPIUM_SERVER_URL ?? 'http://localhost:4723';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const APP_PACKAGE = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const DECLINE_CARD: CardData = { number: '4000000000009995', expiry: '12/34', cvc: '123', holderName: 'TEST DRIVER' };
const log = (m: string) => console.log(`[charge] ${m}`);

async function run(): Promise<void> {
	const url = new URL(APPIUM_URL);
	const driver = await remote({
		protocol: url.protocol.replace(':', '') as 'http' | 'https',
		hostname: url.hostname,
		port: Number(url.port) || 4723,
		path: '/',
		logLevel: 'warn',
		connectionRetryTimeout: 60_000,
		connectionRetryCount: 2,
		capabilities: {
			platformName: 'Android',
			'appium:automationName': 'UiAutomator2',
			'appium:deviceName': 'SM-A055M',
			'appium:platformVersion': '15.0',
			'appium:udid': UDID,
			'appium:appPackage': APP_PACKAGE,
			'appium:appActivity': '.MainActivity',
			'appium:noReset': true,
			'appium:forceAppLaunch': false,
			'appium:autoLaunch': false,
			'appium:newCommandTimeout': 180,
			'appium:chromedriverAutodownload': true
		} as Record<string, unknown>
	});
	const config = { actor: 'driver', environment: 'test' } as unknown as MobileActorConfig;
	const payment = new DriverTripPaymentScreen(config, driver);
	const switchWv = async () => {
		const ctx = (await driver.getContexts().catch(() => [])) as string[];
		const wv = ctx.find(c => c.startsWith('WEBVIEW'));
		if (wv) await driver.switchContext(wv);
	};

	try {
		await driver.pause(1500);
		await switchWv();
		const url0 = await driver.execute<string, []>(() => window.location.href).catch(() => '');
		log(`URL: ${url0}`);
		if (!/TravelResumePage/i.test(url0)) {
			log('⚠ No estamos en TravelResumePage. Abortando.');
			return;
		}

		// NOTA: usar JS .click() vía execute() scopeado a la página ACTIVA — el click coordinado
		// de WebdriverIO es interceptado por el <ion-content> (hay ion-pages ocultas en el DOM).
		const footerState = async (): Promise<{ text: string; disabled: boolean }> =>
			driver
				.execute<{ text: string; disabled: boolean }, []>(() => {
					const norm = (v: unknown) =>
						String(v ?? '')
							.replace(/\s+/g, ' ')
							.trim();
					const resume =
						document.querySelector('app-travel-resume:not(.ion-page-hidden)') ||
						document.querySelector('app-travel-resume');
					const b = resume?.querySelector('ion-footer button.btn.finish') as HTMLButtonElement | null;
					return {
						text: b ? norm(b.innerText) : '',
						disabled: b ? b.disabled || b.getAttribute('disabled') !== null : true
					};
				})
				.catch(() => ({ text: '', disabled: true }));

		let fs = await footerState();
		log(`footer inicial: "${fs.text}" disabled=${fs.disabled}`);

		// PASO 1: click (JS) cada payment button hasta que el footer sea "Ingresar tarjeta"
		// (= CREDIT_CARD). NO cerramos con cash ("Cerrar Viaje"). El click dispara calculateCost.
		const payCount = await driver
			.execute<number, []>(() => {
				const resume =
					document.querySelector('app-travel-resume:not(.ion-page-hidden)') ||
					document.querySelector('app-travel-resume');
				return Array.from(resume?.querySelectorAll('.travel-payment button.payment') || []).filter(
					b => (b as HTMLElement).offsetParent !== null
				).length;
			})
			.catch(() => 0);
		log(`payment buttons (activos): ${payCount}`);
		for (let i = 0; i < Math.max(payCount, 2) && !/ingresar tarjeta/i.test(fs.text); i++) {
			await driver
				.execute<boolean, [number]>(idx => {
					const resume =
						document.querySelector('app-travel-resume:not(.ion-page-hidden)') ||
						document.querySelector('app-travel-resume');
					const pays = Array.from(resume?.querySelectorAll('.travel-payment button.payment') || []).filter(
						b => (b as HTMLElement).offsetParent !== null
					) as HTMLElement[];
					if (!pays.length) return false;
					pays[idx % pays.length].click();
					return true;
				}, i)
				.catch(() => false);
			await driver.pause(3000); // changePaymentMethod → calculateCost (loading)
			fs = await footerState();
			log(`  tras tap payment[${i}] → footer="${fs.text}" disabled=${fs.disabled}`);
		}

		// PASO 2: si el footer es "Ingresar tarjeta" y NO está disabled, tap → abre modal Stripe.
		fs = await footerState();
		log(`footer final: "${fs.text}" disabled=${fs.disabled}`);
		if (!/ingresar tarjeta/i.test(fs.text)) {
			log('⚠ No se logró footer="Ingresar tarjeta" (CREDIT_CARD). Abortando (NO cierro con otro método).');
			return;
		}
		if (fs.disabled) {
			log('⚠ "Ingresar tarjeta" DISABLED (totalCostFinal=0 en viaje stale). Abortando.');
			return;
		}
		log('Tap "Ingresar tarjeta"...');
		await driver
			.execute<boolean, []>(() => {
				const resume =
					document.querySelector('app-travel-resume:not(.ion-page-hidden)') ||
					document.querySelector('app-travel-resume');
				const b = resume?.querySelector('ion-footer button.btn.finish') as HTMLElement | null;
				if (b) {
					b.click();
					return true;
				}
				return false;
			})
			.catch(() => false);
		await driver.pause(3000);
		await dumpAppiumState(driver, 'charge-01-after-ingresar-tarjeta');

		// Modal de cobro.
		const ready = await payment.waitForPaymentScreen(20000);
		log(`Modal de cobro (#cardNumber) presente: ${ready}`);
		await switchWv();
		const modalInfo = await driver
			.execute<Record<string, unknown>, []>(() => {
				const probe = (sel: string) => {
					const h = document.querySelector(sel) as (HTMLElement & { shadowRoot?: ShadowRoot }) | null;
					if (!h) return { found: false };
					const inner = (
						h.shadowRoot ? h.shadowRoot.querySelector('input') : h.querySelector('input')
					) as HTMLInputElement | null;
					return {
						found: true,
						hasShadow: !!h.shadowRoot,
						hasInner: !!inner,
						readOnly: inner?.readOnly ?? null
					};
				};
				return {
					url: window.location.href,
					cardNumber: probe('#cardNumber'),
					cardExpirationDate: probe('#cardExpirationDate'),
					securityCode: probe('#securityCode'),
					cardholderName: probe('#cardholderName'),
					chargeSpans: Array.from(document.querySelectorAll('.header.end span, ion-header span')).map(s => ({
						cls: (s as HTMLElement).className,
						text: String((s as HTMLElement).innerText ?? '').trim()
					}))
				};
			})
			.catch(e => ({ error: String(e) }));
		log(`MODAL info: ${JSON.stringify(modalInfo)}`);
		if (!ready) {
			log('⚠ Modal no presente. Abortando.');
			return;
		}

		// Fill + submit.
		log('fillCardForm(9995)...');
		await payment.fillCardForm(DECLINE_CARD);
		await driver.pause(1500);
		await switchWv();
		const afterFill = await driver
			.execute<Record<string, unknown>, []>(() => {
				const val = (sel: string) => {
					const h = document.querySelector(sel) as (HTMLElement & { shadowRoot?: ShadowRoot }) | null;
					const inner =
						h &&
						((h.shadowRoot
							? h.shadowRoot.querySelector('input')
							: h.querySelector('input')) as HTMLInputElement | null);
					return inner ? inner.value : null;
				};
				const chargeValid = Array.from(document.querySelectorAll('.header.end span.title')).some(s =>
					/cobrar/i.test((s as HTMLElement).innerText || '')
				);
				const chargeInvalid = !!document.querySelector('span.invalid-charge');
				return {
					cardNumber: val('#cardNumber'),
					exp: val('#cardExpirationDate'),
					cvc: val('#securityCode'),
					holder: val('#cardholderName'),
					chargeValidVisible: chargeValid,
					chargeInvalidVisible: chargeInvalid
				};
			})
			.catch(e => ({ error: String(e) }));
		log(`AFTER FILL: ${JSON.stringify(afterFill)}`);
		await dumpAppiumState(driver, 'charge-02-after-fill');

		log('submitPayment...');
		await payment.submitPayment();
		const outcome = await payment.waitForPaymentOutcome(30000);
		log(`OUTCOME: ${JSON.stringify(outcome)}`);
		await dumpAppiumState(driver, 'charge-03-outcome');
		await payment.dismissAttentionModal().catch(() => false);
	} catch (err) {
		log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
		await dumpAppiumState(driver, 'charge-99-error').catch(() => undefined);
	} finally {
		await driver.deleteSession();
		log('Sesión cerrada');
	}
}
run().catch(e => {
	console.error('[charge] fatal:', e);
	process.exit(1);
});
