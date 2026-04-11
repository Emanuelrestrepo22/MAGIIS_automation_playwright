/**
 * Finaliza el viaje activo desde TravelNavigationPage (app-page-travel-in-progress).
 * Ejecutar cuando el driver esté en la pantalla de navegación con el botón "Finalizar Viaje".
 *
 *   npx ts-node --esm tests/mobile/appium/scripts/end-trip-and-dump.ts
 */

import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const UDID    = process.env.ANDROID_UDID        ?? 'R92XB0B8F3J';
const PACKAGE = process.env.ANDROID_APP_PACKAGE ?? 'com.magiis.app.test.driver';

const log = (msg: string) => console.log(`[end-trip] ${msg}`);

async function switchToWebView(driver: WebdriverIO.Browser): Promise<boolean> {
	const contexts = await driver.getContexts() as string[];
	log(`Contextos: ${contexts.join(', ')}`);
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
		document.querySelectorAll('[class*="page"], [class*="travel"], [class*="trip"], [class*="navigation"], [class*="finish"], [class*="complete"]').forEach(el => {
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
	await driver.pause(2000);

	const ok = await switchToWebView(driver);
	if (!ok) { log('⚠  Sin WebView'); await driver.deleteSession(); return; }
	await driver.pause(1000);

	const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
	log(`URL actual: ${url}`);

	// ── Dump estado actual ────────────────────────────────────────────────────
	await dumpWebView(driver, '05-before-end-trip');

	// ── Tap "Finalizar Viaje" — selector confirmado: button.btn.finish ────────
	log('Buscando botón "Finalizar Viaje"...');
	let clicked = false;

	try {
		const btn = await driver.$('button.btn.finish');
		if (await btn.isDisplayed().catch(() => false)) {
			const text = (await btn.getText().catch(() => '')).trim();
			log(`  Encontrado: "${text}"`);
			await btn.click();
			clicked = true;
			log('✓ Tap "Finalizar Viaje"');
		}
	} catch (e) {
		log(`Error con selector .btn.finish: ${e}`);
	}

	// Fallback por texto
	if (!clicked) {
		log('Fallback: buscando por texto en todos los botones...');
		const allBtns = await driver.$$('button') as unknown as any[];
		for (const b of allBtns) {
			const text    = (await b.getText().catch(() => '')).trim();
			const visible = await b.isDisplayed().catch(() => false);
			log(`  btn: "${text}" visible=${visible}`);
			if (text === 'Finalizar Viaje' && visible) {
				await b.click();
				clicked = true;
				log('✓ Tap "Finalizar Viaje" (fallback)');
				break;
			}
		}
	}

	if (!clicked) {
		log('⚠  Botón "Finalizar Viaje" no encontrado — dump para diagnóstico');
		await dumpWebView(driver, '05-end-trip-failed');
		await driver.deleteSession();
		return;
	}

	// ── Paso 2: Confirmar modal "¿Finalizar Viaje?" → Si ─────────────────────
	// Selector confirmado dump 2026-04-09:
	//   [id="ion-overlay-70"] ion-modal text="¿Finalizar Viaje? Si No"
	//   [BTN] class="btn primary" text="Si"
	//   [BTN] class="btn-outlined-red" text="No"
	await driver.pause(1500);
	await switchToWebView(driver);

	log('Confirmando modal "¿Finalizar Viaje?" → Si...');
	let confirmed = false;

	try {
		const modalBtns = await driver.$$('app-confirm-modal button, ion-modal button') as unknown as any[];
		for (const btn of modalBtns) {
			const text    = (await btn.getText().catch(() => '')).trim();
			const visible = await btn.isDisplayed().catch(() => false);
			log(`  modal btn: "${text}" visible=${visible}`);
			if (text === 'Si' && visible) {
				await btn.click();
				confirmed = true;
				log('✓ Tap "Si" en modal Finalizar Viaje');
				break;
			}
		}

		if (!confirmed) {
			const allBtns = await driver.$$('button.btn.primary') as unknown as any[];
			for (const btn of allBtns) {
				const text    = (await btn.getText().catch(() => '')).trim();
				const visible = await btn.isDisplayed().catch(() => false);
				if (text === 'Si' && visible) {
					await btn.click();
					confirmed = true;
					log('✓ Tap "Si" (fallback)');
					break;
				}
			}
		}
	} catch (e) {
		log(`Error confirmando modal: ${e}`);
	}

	if (!confirmed) {
		log('⚠  Modal "¿Finalizar Viaje?" no encontrado o "Si" no visible');
		await dumpWebView(driver, '06-confirm-modal-failed');
	}

	// ── Esperar pantalla post-finalización ────────────────────────────────────
	await driver.pause(5000);
	await switchToWebView(driver);
	await driver.pause(1000);

	const urlAfter = await driver.execute<string, []>(() => window.location.href).catch(() => '');
	log(`URL post-finalizar: ${urlAfter}`);

	// ── Dump pantalla de resumen/cobro ────────────────────────────────────────
	await dumpWebView(driver, '07-trip-completion-summary');

	await driver.deleteSession();
	log('✓ Sesión cerrada');
}

run().catch(e => {
	console.error('❌', e.message ?? e);
	process.exit(1);
});
