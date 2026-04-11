/**
 * Acepta el viaje activo en TravelConfirmPage y dumpea la pantalla de navegación.
 * Ejecutar cuando el driver tenga un viaje pendiente de aceptar.
 *
 *   ANDROID_HOME="C:/Users/Erika/AppData/Local/Android/Sdk" \
 *   ANDROID_SDK_ROOT="C:/Users/Erika/AppData/Local/Android/Sdk" \
 *   JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" \
 *   npx ts-node --esm tests/mobile/appium/scripts/accept-trip-and-dump.ts
 */

import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const UDID    = process.env.ANDROID_UDID        ?? 'R92XB0B8F3J';
const PACKAGE = process.env.ANDROID_APP_PACKAGE ?? 'com.magiis.app.test.driver';

const log = (msg: string) => console.log(`[accept] ${msg}`);

async function switchToWebView(driver: WebdriverIO.Browser): Promise<boolean> {
	const contexts = await driver.getContexts() as string[];
	log(`Contextos: ${contexts.join(', ')}`);
	const wv = contexts.find((c: string) => c.startsWith('WEBVIEW'));
	if (!wv) return false;
	await driver.switchContext(wv);
	log(`✓ → ${wv}`);
	return true;
}

async function dumpCurrentWebView(driver: WebdriverIO.Browser, label: string): Promise<void> {
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
		document.querySelectorAll('[class*="page"], [class*="travel"], [class*="trip"], [class*="navigation"]').forEach(el => {
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

	// ── 1. Verificar que estamos en TravelConfirmPage ─────────────────────────
	const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
	log(`URL actual: ${url}`);

	if (!url.includes('TravelConfirmPage')) {
		log('⚠  No estamos en TravelConfirmPage — verificar que el viaje llegó al driver');
		await driver.deleteSession();
		return;
	}

	// Extraer travelId de la URL
	const travelIdMatch = url.match(/"travelId":(\d+)/);
	const travelId = travelIdMatch?.[1] ?? 'unknown';
	log(`travelId: ${travelId}`);

	// ── 2. Dump ANTES de aceptar ──────────────────────────────────────────────
	await dumpCurrentWebView(driver, `travel-confirm-before-accept-${travelId}`);

	// ── 3. Tap en Aceptar via WebdriverIO (no execute — Angular requiere tap real) ──
	// Selector confirmado: button.btn.primary (DOM dump + devtools 2026-04-09)
	// El atributo _ngcontent-* cambia por build, no usarlo como selector.
	// Hay dos button.btn.primary en el DOM: "Entrar" (login oculto) y "Aceptar"
	// Filtrar por texto para evitar tapear el botón equivocado.
	let clicked = false;
	try {
		const allBtns = await driver.$$('button.btn.primary');
		log(`Botones btn.primary encontrados: ${allBtns.length}`);
		for (const btn of allBtns) {
			const text = (await btn.getText().catch(() => '')).trim();
			const displayed = await btn.isDisplayed().catch(() => false);
			log(`  - "${text}" displayed=${displayed}`);
			if (text === 'Aceptar' && displayed) {
				await btn.click();
				log('✓ Tap en botón "Aceptar"');
				clicked = true;
				break;
			}
		}
	} catch (e) {
		log(`Error buscando botones: ${e}`);
	}

	log(`Click Aceptar: ${clicked ? '✓' : '⚠  no encontrado'}`);

	if (!clicked) {
		log('Dump del estado actual para diagnóstico...');
		await dumpCurrentWebView(driver, `travel-confirm-accept-failed-${travelId}`);
		await driver.deleteSession();
		return;
	}

	// ── 4. Esperar navegación post-aceptar ────────────────────────────────────
	log('Esperando pantalla post-aceptar...');
	await driver.pause(5000);

	await switchToWebView(driver);
	await driver.pause(1500);

	// ── 5. Dump DESPUÉS de aceptar ────────────────────────────────────────────
	await dumpCurrentWebView(driver, `travel-navigation-after-accept-${travelId}`);

	await driver.deleteSession();
	log('✓ Sesión cerrada');
}

run().catch(e => {
	console.error('❌', e.message ?? e);
	process.exit(1);
});
