/**
 * VALIDACIÓN EN DEVICE — DriverTripPaymentScreen (Cargo a Bordo decline).
 *
 * Adjunta a la sesión actual de la Driver App y, partiendo de la pantalla activa,
 * intenta recorrer: TravelConfirmPage → Aceptar → Empezar → Finalizar → Resume →
 * seleccionar CREDIT_CARD → "Ingresar tarjeta" → modal de cobro → fillAndSubmit(9995)
 * → capturar outcome. Dumpea el DOM en CADA pantalla (evidence/dom-dump) para
 * validar/ajustar los selectores del source contra la versión instalada.
 *
 * NO crea el viaje (usa el que esté activo/asignado en el device). Si no hay viaje
 * drivable, reporta el estado y sale.
 *
 * Uso:
 *   APPIUM_SERVER_URL=http://localhost:4723 ANDROID_UDID=R92XB0B8F3J ENV=test \
 *   npx ts-node --esm tests/mobile/appium/scripts/driver-cargo-payment-validate.ts
 */

import { remote } from 'webdriverio';
import type { MobileActorConfig } from '../config/appiumRuntime';
import type { AppiumDriver } from '../base/AppiumSessionBase';
import { DriverTripRequestScreen } from '../driver/DriverTripRequestScreen';
import { DriverTripNavigationScreen } from '../driver/DriverTripNavigationScreen';
import { DriverTripSummaryScreen } from '../driver/DriverTripSummaryScreen';
import { DriverTripPaymentScreen, type CardData } from '../driver/DriverTripPaymentScreen';
import { dumpAppiumState } from '../helpers/appiumDebug';

const APPIUM_URL = process.env.APPIUM_SERVER_URL ?? 'http://localhost:4723';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const APP_PACKAGE = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';

// Card decline (fondos insuficientes) — SoT: tests/fixtures/gateways/stripe/cards.ts
const DECLINE_CARD: CardData = {
	number: '4000000000009995',
	expiry: '12/34',
	cvc: '123',
	holderName: 'TEST DRIVER',
};

const log = (m: string) => console.log(`[validate] ${m}`);

async function currentUrl(driver: AppiumDriver): Promise<string> {
	const contexts = (await driver.getContexts().catch(() => [])) as string[];
	const wv = contexts.find((c) => c.startsWith('WEBVIEW'));
	if (!wv) return '';
	await driver.switchContext(wv);
	return driver.execute<string, []>(() => window.location.href).catch(() => '');
}

async function dumpResumePaymentInfo(driver: AppiumDriver): Promise<void> {
	const info = await driver.execute<Record<string, unknown>, []>(() => {
		const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
		const payBtns = Array.from(document.querySelectorAll('.travel-payment button.payment, button.payment')).map((b) => {
			const icon = b.querySelector('ion-icon');
			return { classes: (b as HTMLElement).className, iconSrc: icon?.getAttribute('src') ?? '', visible: (b as HTMLElement).offsetParent !== null };
		});
		const footer = Array.from(document.querySelectorAll('ion-footer button, button.btn.finish')).map((b) => ({
			classes: (b as HTMLElement).className, text: norm((b as HTMLElement).innerText), disabled: (b as HTMLButtonElement).disabled,
		}));
		return { url: window.location.href, payBtns, footer };
	}).catch((e) => ({ error: String(e) }));
	log(`RESUME payment info: ${JSON.stringify(info, null, 1)}`);
}

async function dumpPaymentModalInfo(driver: AppiumDriver): Promise<void> {
	const info = await driver.execute<Record<string, unknown>, []>(() => {
		const probe = (sel: string) => {
			const host = document.querySelector(sel) as (HTMLElement & { shadowRoot?: ShadowRoot }) | null;
			if (!host) return { found: false };
			const inner = (host.shadowRoot ? host.shadowRoot.querySelector('input') : host.querySelector('input')) as HTMLInputElement | null;
			return { found: true, hasShadow: !!host.shadowRoot, hasInner: !!inner, readOnly: inner?.readOnly ?? null, value: inner?.value ?? null };
		};
		const chargeSpans = Array.from(document.querySelectorAll('.header.end span, ion-header span')).map((s) => ({
			classes: (s as HTMLElement).className, text: String((s as HTMLElement).innerText ?? '').trim(),
		}));
		return {
			url: window.location.href,
			cardNumber: probe('#cardNumber'),
			cardExpirationDate: probe('#cardExpirationDate'),
			securityCode: probe('#securityCode'),
			cardholderName: probe('#cardholderName'),
			chargeSpans,
		};
	}).catch((e) => ({ error: String(e) }));
	log(`PAYMENT MODAL info: ${JSON.stringify(info, null, 1)}`);
}

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
			'appium:chromedriverAutodownload': true,
		} as Record<string, unknown>,
	});

	const config = { actor: 'driver', environment: 'test' } as unknown as MobileActorConfig;
	const request = new DriverTripRequestScreen(config, driver);
	const nav = new DriverTripNavigationScreen(config, driver);
	const summary = new DriverTripSummaryScreen(config, driver);
	const payment = new DriverTripPaymentScreen(config, driver);

	try {
		await driver.pause(2_000);
		log(`URL inicial: ${await currentUrl(driver)}`);
		await dumpAppiumState(driver, 'validate-00-initial');

		// 1. Aceptar (si estamos en TravelConfirmPage).
		let u = await currentUrl(driver);
		if (/TravelConfirmPage/i.test(u)) {
			log('En TravelConfirmPage → Aceptar viaje...');
			await request.acceptTrip();
			await driver.pause(3_000);
			u = await currentUrl(driver);
			log(`URL post-Aceptar: ${u}`);
			await dumpAppiumState(driver, 'validate-01-after-accept');
			if (/TravelConfirmPage/i.test(u)) {
				log('⚠ Sigue en TravelConfirmPage tras Aceptar — viaje posiblemente cancelado/stale. Abortando.');
				return;
			}
		} else {
			log(`⚠ No estamos en TravelConfirmPage (URL=${u}). No hay viaje entrante para validar. Abortando.`);
			return;
		}

		// 2. Empezar viaje.
		log('Empezar Viaje...');
		await nav.startTrip();
		const inProgress = await nav.waitForTravelInProgressPage(30_000);
		log(`In-progress alcanzado: ${inProgress}`);
		await dumpAppiumState(driver, 'validate-02-in-progress');

		// 3. Finalizar viaje.
		log('Finalizar Viaje...');
		await nav.endTrip();
		await nav.confirmEndTripPopup();
		const resume = await summary.waitForSummaryScreen(30_000);
		log(`Resume alcanzado: ${resume}`);
		await dumpAppiumState(driver, 'validate-03-resume');
		await dumpResumePaymentInfo(driver);

		// 4. Seleccionar CREDIT_CARD (Cargo a Bordo) por icono.
		log('Seleccionando método CREDIT_CARD...');
		const selected = await driver.execute<boolean, []>(() => {
			const btns = Array.from(document.querySelectorAll('.travel-payment button.payment, button.payment')) as HTMLElement[];
			for (const b of btns) {
				const icon = b.querySelector('ion-icon');
				const src = icon?.getAttribute('src') ?? '';
				if (/CREDIT_CARD/i.test(src) && b.offsetParent !== null) { b.click(); return true; }
			}
			return false;
		}).catch(() => false);
		log(`CREDIT_CARD seleccionado: ${selected}`);
		await driver.pause(2_500);
		await dumpAppiumState(driver, 'validate-04-after-select-cc');

		if (!selected) {
			log('⚠ No hay opción CREDIT_CARD en el resumen (¿viaje no es Cargo a Bordo?). Abortando antes del modal.');
			return;
		}

		// 5. Tap "Ingresar tarjeta" (button.btn.finish).
		log('Tap "Ingresar tarjeta"...');
		const enter = await driver.$$('ion-footer button.btn.finish, button.btn.finish');
		for (const b of enter) {
			if (await b.isDisplayed().catch(() => false)) { await b.click(); break; }
		}
		await driver.pause(3_000);
		await dumpAppiumState(driver, 'validate-05-after-enter-card');

		// 6. Modal de cobro.
		const modalReady = await payment.waitForPaymentScreen(20_000);
		log(`Modal de cobro presente (#cardNumber): ${modalReady}`);
		await dumpPaymentModalInfo(driver);
		await dumpAppiumState(driver, 'validate-06-payment-modal');
		if (!modalReady) { log('⚠ No apareció el modal de cobro. Abortando.'); return; }

		// 7. Llenar + verificar submit habilitado.
		log('Llenando tarjeta declinada...');
		await payment.fillCardForm(DECLINE_CARD);
		await driver.pause(1_500);
		await dumpPaymentModalInfo(driver);
		await dumpAppiumState(driver, 'validate-07-after-fill');

		// 8. Cobrar + esperar outcome.
		log('Cobrar...');
		await payment.submitPayment();
		const outcome = await payment.waitForPaymentOutcome(30_000);
		log(`OUTCOME: ${JSON.stringify(outcome)}`);
		await dumpAppiumState(driver, 'validate-08-outcome');
	} catch (err) {
		log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
		await dumpAppiumState(driver, 'validate-99-error').catch(() => undefined);
	} finally {
		await driver.deleteSession();
		log('Sesión cerrada');
	}
}

run().catch((e) => { console.error('[validate] fatal:', e); process.exit(1); });
