/**
 * Tap "Cerrar Viaje" en TravelResumePage + dump post-cierre.
 * npx ts-node --esm tests/mobile/appium/scripts/close-trip-summary.ts
 */
import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const UDID    = process.env.ANDROID_UDID        ?? 'R92XB0B8F3J';
const PACKAGE = process.env.ANDROID_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const log = (msg: string) => console.log(`[close-trip] ${msg}`);

async function switchToWebView(driver: WebdriverIO.Browser): Promise<boolean> {
	const contexts = await driver.getContexts() as string[];
	const wv = contexts.find((c: string) => c.startsWith('WEBVIEW'));
	if (!wv) return false;
	await driver.switchContext(wv);
	return true;
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
		document.querySelectorAll('span, h1, h2, h3, ion-label, ion-title, p').forEach(el => {
			const text = (el as HTMLElement).innerText?.trim().replace(/\n/g, ' ').slice(0, 100) ?? '';
			if (text.length > 1 && text.length < 100)
				out.push(`[TEXT] ${el.tagName.toLowerCase()} text="${text}"`);
		});
		document.querySelectorAll('[class*="page"], [class*="travel"], [class*="resume"], [class*="completion"]').forEach(el => {
			out.push(`[CONTAINER] ${el.tagName.toLowerCase()} class="${el.className?.toString().slice(0, 100)}"`);
		});
		return out.join('\n');
	}).catch(e => `JS error: ${e}`);

	console.log(`\n=== DUMP: ${label} ===\n${dump}\n=== FIN ===`);
	mkdirSync('evidence/dom-dump', { recursive: true });
	const ts  = new Date().toISOString().replace(/[:.]/g, '-');
	const out = join('evidence/dom-dump', `${label}-${ts}.txt`);
	writeFileSync(out, dump, 'utf-8');
	log(`✓ Guardado: ${out}`);
}

async function run(): Promise<void> {
	const driver = await remote({
		protocol: 'http', hostname: 'localhost', port: 4723, path: '/',
		logLevel: 'warn',
		capabilities: {
			platformName:                     'Android',
			'appium:automationName':          'UiAutomator2',
			'appium:deviceName':              'SM-A055M',
			'appium:udid':                    UDID,
			'appium:appPackage':              PACKAGE,
			'appium:appActivity':             '.MainActivity',
			'appium:noReset':                 true,
			'appium:forceAppLaunch':          false,
			'appium:newCommandTimeout':       120,
			'appium:chromedriverAutodownload': true,
		} as Record<string, unknown>,
	});
	log('✓ Sesión adjuntada');
	await driver.pause(1500);

	const ok = await switchToWebView(driver);
	if (!ok) { log('⚠  Sin WebView'); await driver.deleteSession(); return; }

	const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
	log(`URL actual: ${url}`);

	if (!url.includes('TravelResumePage')) {
		log('⚠  No estamos en TravelResumePage — dump diagnóstico');
		await dumpWebView(driver, '08-wrong-screen');
		await driver.deleteSession();
		return;
	}

	// ── Tap "Cerrar Viaje" ────────────────────────────────────────────────────
	log('Buscando "Cerrar Viaje" (button.btn.finish dentro de app-travel-resume)...');
	let clicked = false;

	try {
		const btn = await driver.$('app-travel-resume button.btn.finish');
		if (await btn.isDisplayed().catch(() => false)) {
			const text = (await btn.getText().catch(() => '')).trim();
			log(`  Encontrado: "${text}"`);
			if (text === 'Cerrar Viaje') {
				await btn.click();
				clicked = true;
				log('✓ Tap "Cerrar Viaje"');
			}
		}
	} catch (e) {
		log(`Error con selector específico: ${e}`);
	}

	// Fallback: iterar button.btn.finish
	if (!clicked) {
		const allBtns = await driver.$$('button.btn.finish') as unknown as any[];
		for (const b of allBtns) {
			const text    = (await b.getText().catch(() => '')).trim();
			const visible = await b.isDisplayed().catch(() => false);
			log(`  btn.finish: "${text}" visible=${visible}`);
			if (text === 'Cerrar Viaje' && visible) {
				await b.click();
				clicked = true;
				log('✓ Tap "Cerrar Viaje" (fallback)');
				break;
			}
		}
	}

	if (!clicked) {
		log('⚠  "Cerrar Viaje" no encontrado — dump diagnóstico');
		await dumpWebView(driver, '08-close-trip-failed');
		await driver.deleteSession();
		return;
	}

	// ── Esperar pantalla post-cierre ──────────────────────────────────────────
	await driver.pause(5000);
	await switchToWebView(driver);
	await driver.pause(1000);

	const urlAfter = await driver.execute<string, []>(() => window.location.href).catch(() => '');
	log(`URL post-cierre: ${urlAfter}`);

	await dumpWebView(driver, '09-post-close-trip');

	await driver.deleteSession();
	log('✓ Sesión cerrada');
}

run().catch(e => {
	console.error('❌', e.message ?? e);
	process.exit(1);
});
