/**
 * Dump mínimo del estado de pago del TravelResumePage ACTUAL (attach, sin manejar viaje).
 * Sirve para determinar si paymentMethodShowList tiene CREDIT_CARD (Cargo a Bordo) o está vacío.
 */
import { remote } from 'webdriverio';

const APPIUM_URL = process.env.APPIUM_SERVER_URL ?? 'http://localhost:4723';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const APP_PACKAGE = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';

async function run(): Promise<void> {
	const url = new URL(APPIUM_URL);
	const driver = await remote({
		protocol: url.protocol.replace(':', '') as 'http' | 'https',
		hostname: url.hostname, port: Number(url.port) || 4723, path: '/', logLevel: 'warn',
		connectionRetryTimeout: 60_000, connectionRetryCount: 2,
		capabilities: {
			platformName: 'Android', 'appium:automationName': 'UiAutomator2',
			'appium:deviceName': 'SM-A055M', 'appium:platformVersion': '15.0', 'appium:udid': UDID,
			'appium:appPackage': APP_PACKAGE, 'appium:appActivity': '.MainActivity',
			'appium:noReset': true, 'appium:forceAppLaunch': false, 'appium:autoLaunch': false,
			'appium:newCommandTimeout': 120, 'appium:chromedriverAutodownload': true,
		} as Record<string, unknown>,
	});
	try {
		await driver.pause(1500);
		const ctx = (await driver.getContexts().catch(() => [])) as string[];
		const wv = ctx.find((c) => c.startsWith('WEBVIEW'));
		if (wv) await driver.switchContext(wv);
		const info = await driver.execute<Record<string, unknown>, []>(() => {
			const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
			const payBtns = Array.from(document.querySelectorAll('.travel-payment button.payment, button.payment')).map((b) => ({
				iconSrc: b.querySelector('ion-icon')?.getAttribute('src') ?? '',
				text: norm((b as HTMLElement).innerText),
				visible: (b as HTMLElement).offsetParent !== null,
			}));
			const ngForRow = document.querySelector('.travel-payment ion-row');
			const footer = Array.from(document.querySelectorAll('ion-footer button, button.btn.finish')).map((b) => norm((b as HTMLElement).innerText));
			return {
				url: window.location.href,
				payButtonsCount: payBtns.length,
				payBtns,
				travelPaymentNgFor: ngForRow ? ngForRow.getAttribute('ng-reflect-ng-for-of') : '(no travel-payment ion-row)',
				footer,
			};
		}).catch((e) => ({ error: String(e) }));
		console.log('[dump-resume-payment] ' + JSON.stringify(info, null, 1));
	} finally {
		await driver.deleteSession();
	}
}
run().catch((e) => { console.error('[dump-resume-payment] fatal:', e); process.exit(1); });
