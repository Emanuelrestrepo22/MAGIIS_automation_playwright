/**
 * Dump del estado DOM cuando aparece el popup 3DS en TravelResumePage.
 * Detecta: iframe Stripe, modal ion-modal, cambio de URL, nuevo contexto WebView.
 *
 * Ejecutar MIENTRAS la app muestra el popup 3DS (después de seleccionar tarjeta 3DS):
 *   npx ts-node --esm tests/mobile/appium/scripts/dump-3ds-popup.ts
 */

import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const UDID    = process.env.ANDROID_UDID        ?? 'R92XB0B8F3J';
const PACKAGE = process.env.ANDROID_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const log     = (m: string) => console.log(`[3ds-dump] ${m}`);

function save(label: string, content: string): void {
	mkdirSync('evidence/dom-dump', { recursive: true });
	const ts   = new Date().toISOString().replace(/[:.]/g, '-');
	const path = join('evidence/dom-dump', `3ds-${label}-${ts}.txt`);
	writeFileSync(path, content, 'utf-8');
	log(`✓ Guardado: ${path}`);
}

async function run(): Promise<void> {
	const driver = await remote({
		protocol: 'http', hostname: 'localhost', port: 4723, path: '/',
		logLevel: 'warn',
		capabilities: {
			platformName:                      'Android',
			'appium:automationName':           'UiAutomator2',
			'appium:deviceName':               'SM-A055M',
			'appium:udid':                     UDID,
			'appium:appPackage':               PACKAGE,
			'appium:appActivity':              '.MainActivity',
			'appium:noReset':                  true,
			'appium:forceAppLaunch':           false,
			'appium:newCommandTimeout':        120,
			'appium:chromedriverAutodownload': true,
		} as Record<string, unknown>,
	});
	log('✓ Sesión adjuntada');

	// ── 1. Listar todos los contextos disponibles ──────────────────────────────
	const contexts = await driver.getContexts() as string[];
	log(`Contextos disponibles: ${contexts.join(', ')}`);
	save('00-contexts', contexts.join('\n'));

	// ── 2. Dump del contexto NATIVE (buscar overlays, dialogs, Chrome Custom Tabs) ──
	await driver.switchContext('NATIVE_APP');
	const nativeDump = await driver.execute('mobile: getPageSource').catch(() => '') as string;
	if (nativeDump) {
		log('✓ Dump NATIVE_APP obtenido');
		save('01-native-full', nativeDump.slice(0, 50000));
	}

	// Buscar elementos nativos visibles (botones, texto)
	try {
		const nativeBtns = await driver.$$('//*[@clickable="true"]') as unknown as any[];
		const btnTexts: string[] = [];
		for (const btn of nativeBtns) {
			const text = await btn.getText().catch(() => '');
			if (text) btnTexts.push(`[NATIVE BTN] "${text}"`);
		}
		log(`Botones nativos clickeables: ${btnTexts.length}`);
		save('02-native-buttons', btnTexts.join('\n'));
	} catch (e) {
		log(`Error en botones nativos: ${e}`);
	}

	// ── 3. Dump de cada contexto WebView ──────────────────────────────────────
	for (const ctx of contexts.filter(c => c.startsWith('WEBVIEW'))) {
		log(`\nAnalizando contexto: ${ctx}`);
		try {
			await driver.switchContext(ctx);
			await driver.pause(1000);

			const url    = await driver.execute<string, []>(() => window.location.href).catch(() => 'error');
			const title  = await driver.execute<string, []>(() => document.title).catch(() => '');
			log(`  URL: ${url}`);
			log(`  Title: ${title}`);

			// Dump completo del contexto
			const content = await driver.execute<string, []>(() => {
				const lines = [`URL: ${window.location.href}`, `TITLE: ${document.title}`];

				// Buscar iframes (Stripe usa iframes para 3DS)
				const iframes = Array.from(document.querySelectorAll('iframe')) as HTMLIFrameElement[];
				iframes.forEach((f, i) => {
					lines.push(`[IFRAME ${i}] name="${f.name}" src="${f.src}" id="${f.id}"`);
				});

				// Botones visibles
				(document.querySelectorAll('button, [role="button"], a[href]') as NodeListOf<HTMLElement>)
					.forEach(el => {
						const txt = (el.innerText ?? el.textContent ?? '').trim().slice(0, 100);
						const cls = (el.className ?? '').toString().slice(0, 60);
						const vis = el.offsetParent !== null;
						if (txt) lines.push(`[BTN vis=${vis}] class="${cls}" text="${txt}"`);
					});

				// Textos visibles
				(document.querySelectorAll('h1,h2,h3,p,span,div,ion-label') as NodeListOf<HTMLElement>)
					.forEach(el => {
						const txt = (el.innerText ?? '').trim().replace(/\n/g, ' ').slice(0, 120);
						if (txt.length > 3 && txt.length < 120 && el.offsetParent !== null)
							lines.push(`[TEXT] ${el.tagName} text="${txt}"`);
					});

				// Modals / overlays
				['ion-modal', 'ion-alert', 'ion-popover', '[class*="modal"]', '[class*="overlay"]',
				 '[class*="3ds"]', '[class*="stripe"]', 'app-confirm-modal'].forEach(sel => {
					document.querySelectorAll(sel).forEach(el => {
						const cls = (el.className ?? '').toString().slice(0, 80);
						const vis = (el as HTMLElement).offsetParent !== null;
						lines.push(`[OVERLAY vis=${vis}] ${sel} class="${cls}"`);
					});
				});

				return lines.join('\n');
			}).catch(e => `JS error: ${e}`);

			const ctxLabel = ctx.replace(/[^a-zA-Z0-9]/g, '-');
			save(`03-webview-${ctxLabel}`, content);

			// Detectar si es un contexto 3DS (URL Stripe, hooks, ACS)
			if (url.match(/stripe|hooks|acs|3ds|authenticate|verify/i)) {
				log(`  🚨 CONTEXTO 3DS DETECTADO: ${ctx}`);
				log(`  URL: ${url}`);
				save(`04-3DS-CONTEXT-${ctxLabel}`, content);
			}
		} catch (e) {
			log(`  Error en contexto ${ctx}: ${e}`);
		}
	}

	// ── 4. Volver al WebView principal y buscar 3DS inline ────────────────────
	const mainWV = contexts.find(c => c.includes(PACKAGE));
	if (mainWV) {
		await driver.switchContext(mainWV);
		const inlineCheck = await driver.execute<string, []>(() => {
			const lines = [`URL: ${window.location.href}`];

			// Stripe 3DS suele inyectar un iframe con src de stripe.com o ACS del banco
			const frames = Array.from(document.querySelectorAll('iframe')) as HTMLIFrameElement[];
			frames.forEach((f, i) => {
				lines.push(`[IFRAME ${i}] name="${f.name}" src="${f.src?.slice(0, 200)}" visible=${f.offsetParent !== null}`);
			});

			// Buscar overlays con texto típico de 3DS
			const all = Array.from(document.querySelectorAll('*')) as HTMLElement[];
			const threeDSKeywords = /complete|fail|authenticate|verif|3d|secure|visa|mastercard|autorizar/i;
			all.forEach(el => {
				const txt = (el.innerText ?? '').trim().slice(0, 100);
				if (threeDSKeywords.test(txt) && el.offsetParent !== null && txt.length < 100)
					lines.push(`[3DS-CANDIDATE] ${el.tagName} class="${(el.className ?? '').toString().slice(0,40)}" text="${txt}"`);
			});

			return lines.join('\n');
		}).catch(e => `JS error: ${e}`);

		log('\n── Búsqueda de 3DS inline ──');
		log(inlineCheck.split('\n').slice(0, 20).join('\n'));
		save('05-inline-3ds-check', inlineCheck);
	}

	await driver.deleteSession();
	log('\n✓ Dump 3DS completo. Revisar evidence/dom-dump/3ds-*.txt');
	log('Buscar archivo "04-3DS-CONTEXT-*" para el contexto activo del popup.');
}

run().catch(e => {
	console.error('❌', e.message ?? e);
	process.exit(1);
});
