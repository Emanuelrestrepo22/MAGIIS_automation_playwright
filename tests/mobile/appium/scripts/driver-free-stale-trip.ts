/**
 * Libera al driver de un viaje stale atascado en TravelResumePage: cicla los payment buttons
 * y cierra el viaje con el método que habilite el botón de cierre ("Cerrar Viaje"/"Firmar y
 * Cerrar"). NO usa "Ingresar tarjeta" (CREDIT_CARD) porque queda disabled si totalCostFinal=0.
 * Deja al driver de vuelta en /navigator/home para que futuras corridas reciban viajes nuevos.
 */
import { remote } from 'webdriverio';

const APPIUM_URL = process.env.APPIUM_SERVER_URL ?? 'http://localhost:4723';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const APP_PACKAGE = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const log = (m: string) => console.log(`[free] ${m}`);

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
	const switchWv = async () => {
		const ctx = (await driver.getContexts().catch(() => [])) as string[];
		const wv = ctx.find((c) => c.startsWith('WEBVIEW'));
		if (wv) await driver.switchContext(wv);
	};
	const footer = async () => driver.execute<{ text: string; disabled: boolean }, []>(() => {
		const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
		const r = document.querySelector('app-travel-resume:not(.ion-page-hidden)') || document.querySelector('app-travel-resume');
		const b = r?.querySelector('ion-footer button.btn.finish') as HTMLButtonElement | null;
		return { text: b ? norm(b.innerText) : '', disabled: b ? (b.disabled || b.getAttribute('disabled') !== null) : true };
	}).catch(() => ({ text: '', disabled: true }));

	try {
		await driver.pause(1500);
		await switchWv();
		let u = await driver.execute<string, []>(() => window.location.href).catch(() => '');
		log(`URL: ${u}`);
		if (!/TravelResumePage/i.test(u)) { log('No en TravelResumePage — nada que liberar.'); return; }

		let fs = await footer();
		log(`footer inicial: "${fs.text}" disabled=${fs.disabled}`);
		const payCount = await driver.execute<number, []>(() => {
			const r = document.querySelector('app-travel-resume:not(.ion-page-hidden)') || document.querySelector('app-travel-resume');
			return Array.from(r?.querySelectorAll('.travel-payment button.payment') || []).filter((b) => (b as HTMLElement).offsetParent !== null).length;
		}).catch(() => 0);
		log(`payment buttons: ${payCount}`);

		// Cicla botones; cierra con el primero que habilite un botón de cierre (no "Ingresar tarjeta").
		for (let i = 0; i < Math.max(payCount, 2); i++) {
			await driver.execute<boolean, [number]>((idx) => {
				const r = document.querySelector('app-travel-resume:not(.ion-page-hidden)') || document.querySelector('app-travel-resume');
				const pays = Array.from(r?.querySelectorAll('.travel-payment button.payment') || []).filter((b) => (b as HTMLElement).offsetParent !== null) as HTMLElement[];
				if (!pays.length) return false; pays[idx % pays.length].click(); return true;
			}, i).catch(() => false);
			await driver.pause(3000);
			fs = await footer();
			log(`  tras payment[${i}] → footer="${fs.text}" disabled=${fs.disabled}`);
			if (!/ingresar tarjeta/i.test(fs.text) && !fs.disabled && fs.text.length > 0) {
				log(`Cerrando viaje con footer="${fs.text}"...`);
				await driver.execute<boolean, []>(() => {
					const r = document.querySelector('app-travel-resume:not(.ion-page-hidden)') || document.querySelector('app-travel-resume');
					const b = r?.querySelector('ion-footer button.btn.finish') as HTMLElement | null;
					if (b) { b.click(); return true; } return false;
				}).catch(() => false);
				await driver.pause(4000);
				u = await driver.execute<string, []>(() => window.location.href).catch(() => '');
				log(`URL tras cerrar: ${u}`);
				break;
			}
		}
	} finally {
		await driver.deleteSession();
		log('Sesión cerrada');
	}
}
run().catch((e) => { console.error('[free] fatal:', e); process.exit(1); });
