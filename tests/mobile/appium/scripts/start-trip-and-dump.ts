/**
 * Acepta el viaje + toca "Empezar Viaje" + dumpea la pantalla de navegación.
 * Ejecutar cuando el driver tenga un viaje pendiente de aceptar en TravelConfirmPage.
 *
 *   ANDROID_HOME="C:/Users/Erika/AppData/Local/Android/Sdk" \
 *   ANDROID_SDK_ROOT="C:/Users/Erika/AppData/Local/Android/Sdk" \
 *   JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" \
 *   npx ts-node --esm tests/mobile/appium/scripts/start-trip-and-dump.ts
 */

import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const UDID    = process.env.ANDROID_UDID        ?? 'R92XB0B8F3J';
const PACKAGE = process.env.ANDROID_APP_PACKAGE ?? 'com.magiis.app.test.driver';

const log = (msg: string) => console.log(`[start-trip] ${msg}`);

async function switchToWebView(driver: WebdriverIO.Browser): Promise<boolean> {
	const contexts = await driver.getContexts() as string[];
	log(`Contextos: ${contexts.join(', ')}`);
	const wv = contexts.find((c: string) => c.startsWith('WEBVIEW'));
	if (!wv) return false;
	await driver.switchContext(wv);
	return true;
}

async function tapButtonByText(driver: WebdriverIO.Browser, text: string): Promise<boolean> {
	let allBtns: any[] = [];
	try {
		allBtns = (await driver.$$('button.btn.primary')) as unknown as any[];
	} catch {
		allBtns = [];
	}
	for (const btn of allBtns) {
		const btnText  = (await btn.getText().catch(() => '')).trim();
		const visible  = await btn.isDisplayed().catch(() => false);
		log(`  btn: "${btnText}" visible=${visible}`);
		if (btnText === text && visible) {
			await btn.click();
			log(`✓ Tap "${text}"`);
			return true;
		}
	}
	return false;
}

async function dumpWebView(driver: WebdriverIO.Browser, label: string): Promise<void> {
	const dump = await driver.execute<string, []>(() => {
		const out: string[] = [`URL: ${window.location.href}`];
		document.querySelectorAll('[id]').forEach(el => {
			const text = (el as HTMLElement).innerText?.trim().replace(/\n/g, ' ').slice(0, 120) ?? '';
			out.push(`[id="${el.id}"] tag=${el.tagName.toLowerCase()} text="${text}"`);
		});
		document.querySelectorAll('button, ion-button, [role="button"]').forEach(el => {
			const text = (el as HTMLElement).innerText?.trim().replace(/\n/g, ' ').slice(0, 120) ?? '';
			const cls  = el.className?.toString().slice(0, 80) ?? '';
			if (text) out.push(`[BTN] id="${el.id}" class="${cls}" text="${text}"`);
		});
		document.querySelectorAll('span, h1, h2, h3, ion-label, ion-title').forEach(el => {
			const text = (el as HTMLElement).innerText?.trim().replace(/\n/g, ' ').slice(0, 100) ?? '';
			if (text.length > 1 && text.length < 100)
				out.push(`[TEXT] ${el.tagName.toLowerCase()} text="${text}"`);
		});
		document.querySelectorAll('[class*="page"], [class*="travel"], [class*="trip"], [class*="navigation"]').forEach(el => {
			out.push(`[CONTAINER] ${el.tagName.toLowerCase()} class="${el.className?.toString().slice(0, 100)}"`);
		});
		return out.join('\n');
	}).catch(e => `JS error: ${e}`);

	console.log(`\n=== DUMP: ${label} ===\n${dump}\n=== FIN ===`);
	mkdirSync('evidence/dom-dump', { recursive: true });
	const ts  = new Date().toISOString().replace(/[:.]/g, '-');
	writeFileSync(join('evidence/dom-dump', `${label}-${ts}.txt`), dump, 'utf-8');
	log(`✓ Guardado: evidence/dom-dump/${label}-${ts}.txt`);
}

async function run(): Promise<void> {
	const driver = await remote({
		protocol: 'http', hostname: 'localhost', port: 4723, path: '/',
		logLevel: 'warn',
		capabilities: {
			platformName:               'Android',
			'appium:automationName':    'UiAutomator2',
			'appium:deviceName':        'SM-A055M',
			'appium:udid':              UDID,
			'appium:appPackage':        PACKAGE,
			'appium:appActivity':       '.MainActivity',
			'appium:noReset':           true,
			'appium:forceAppLaunch':    false,
			'appium:newCommandTimeout': 120,
			'appium:chromedriverAutodownload': true,
		} as Record<string, unknown>,
	});
	log('✓ Sesión adjuntada');
	await driver.pause(2000);

	const ok = await switchToWebView(driver);
	if (!ok) { log('⚠  Sin WebView'); await driver.deleteSession(); return; }
	await driver.pause(1000);

	const url0 = await driver.execute<string, []>(() => window.location.href).catch(() => '');
	log(`URL: ${url0}`);

	// ── PASO 1: Aceptar si estamos en TravelConfirmPage ───────────────────────
	if (url0.includes('TravelConfirmPage')) {
		log('Paso 1: Aceptar viaje...');
		const accepted = await tapButtonByText(driver, 'Aceptar');
		if (!accepted) { log('⚠  Botón Aceptar no encontrado'); await driver.deleteSession(); return; }
		await driver.pause(4000);
		await switchToWebView(driver);
		await driver.pause(1000);
	}

	// ── PASO 2: Verificar TravelToStartPage ───────────────────────────────────
	const url1 = await driver.execute<string, []>(() => window.location.href).catch(() => '');
	log(`URL post-aceptar: ${url1}`);
	await dumpWebView(driver, 'travel-to-start');

	if (!url1.includes('TravelToStartPage')) {
		log(`⚠  URL inesperada: ${url1}`);
		await driver.deleteSession();
		return;
	}

	// ── PASO 3: Empezar Viaje ─────────────────────────────────────────────────
	log('Paso 2: Empezar Viaje...');
	const started = await tapButtonByText(driver, 'Empezar Viaje');
	if (!started) { log('⚠  Botón "Empezar Viaje" no encontrado'); await driver.deleteSession(); return; }
	await driver.pause(4000);
	await switchToWebView(driver);
	await driver.pause(1000);

	// ── PASO 4: Dump pantalla de navegación ───────────────────────────────────
	const url2 = await driver.execute<string, []>(() => window.location.href).catch(() => '');
	log(`URL post-empezar: ${url2}`);
	await dumpWebView(driver, 'travel-navigation');

	await driver.deleteSession();
	log('✓ Sesión cerrada');
}

run().catch(e => {
	console.error('❌', e.message ?? e);
	process.exit(1);
});
