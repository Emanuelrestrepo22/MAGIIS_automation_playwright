/**
 * Dump del home del Driver App en estado LIMPIO (sin viaje asignado, driver disponible).
 * Objetivo: encontrar el selector correcto del botón de "viaje calle" (nuevo viaje desde driver).
 *
 * Ejecutar con driver online y sin viajes pendientes:
 *   npx ts-node --esm tests/mobile/appium/scripts/dump-home-viaje-calle.ts
 */

import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const UDID    = process.env.ANDROID_UDID        ?? 'R92XB0B8F3J';
const PACKAGE = process.env.ANDROID_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const log     = (m: string) => console.log(`[home-viaje-calle] ${m}`);

function save(label: string, content: string): void {
	mkdirSync('evidence/dom-dump', { recursive: true });
	const ts   = new Date().toISOString().replace(/[:.]/g, '-');
	const path = join('evidence/dom-dump', `home-viaje-calle-${label}-${ts}.txt`);
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

	const ctxs = await driver.getContexts() as string[];
	log(`Contextos: ${ctxs.join(', ')}`);
	const wv = ctxs.find((c: string) => c.startsWith('WEBVIEW'));
	if (wv) await driver.switchContext(wv);

	// Ir al tab home
	await driver.execute<void, []>(() => {
		const tab = document.querySelector('#tab-button-home') as HTMLElement | null;
		if (tab) tab.click();
	});
	await driver.pause(1500);

	const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
	log(`URL actual: ${url}`);

	// ── Dump 1: TODOS los botones en todo el DOM (incluyendo páginas ocultas) ──
	const allBtnsDump = await driver.execute<string, []>(() => {
		const lines = [`URL: ${window.location.href}`, ''];
		lines.push('=== TODOS LOS BOTONES EN DOM (incluyendo ion-page-hidden) ===');
		(document.querySelectorAll('button, ion-button, [role="button"], ion-fab-button') as NodeListOf<HTMLElement>)
			.forEach(el => {
				const text    = (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
				const cls     = (el.className ?? '').toString().slice(0, 100);
				const id      = el.id ?? '';
				const visible = el.offsetParent !== null;
				const page    = el.closest('ion-page, page-home, app-navigator');
				const pageHidden = page?.classList.contains('ion-page-hidden') ?? false;
				lines.push(`[BTN visible=${visible} hidden=${pageHidden}] id="${id}" class="${cls}" text="${text}"`);
			});
		return lines.join('\n');
	});
	save('01-all-buttons', allBtnsDump);
	log('\n' + allBtnsDump.split('\n').slice(0, 40).join('\n'));

	// ── Dump 2: Solo página activa (no ion-page-hidden) ──
	const activePageDump = await driver.execute<string, []>(() => {
		const lines = [`URL: ${window.location.href}`, ''];
		lines.push('=== PÁGINA ACTIVA (sin ion-page-hidden) ===');

		// Buscar contenedor activo
		const selectors = [
			'page-home:not(.ion-page-hidden)',
			'app-home:not(.ion-page-hidden)',
			'ion-page:not(.ion-page-hidden)',
			'.ion-page:not(.ion-page-hidden)',
		];
		let activePage: Element | null = null;
		for (const sel of selectors) {
			activePage = document.querySelector(sel);
			if (activePage) {
				lines.push(`[ACTIVE CONTAINER] ${activePage.tagName} id="${activePage.id}" class="${(activePage.className ?? '').toString().slice(0, 80)}"`);
				break;
			}
		}

		const scope: Document | Element = activePage ?? document;

		// Botones en página activa
		lines.push('\n--- Botones visibles ---');
		(scope.querySelectorAll('button, ion-button, [role="button"], ion-fab-button') as NodeListOf<HTMLElement>)
			.forEach(el => {
				const text    = (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
				const cls     = (el.className ?? '').toString().slice(0, 100);
				const id      = el.id ?? '';
				const visible = el.offsetParent !== null;
				if (visible || text) lines.push(`[BTN vis=${visible}] id="${id}" class="${cls}" text="${text}"`);
			});

		// ion-fab y ion-fab-button (botones flotantes de acción)
		lines.push('\n--- FABs (floating action buttons) ---');
		document.querySelectorAll('ion-fab, ion-fab-button').forEach(el => {
			const text    = ((el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
			const cls     = (el.className ?? '').toString().slice(0, 100);
			const icon    = el.querySelector('ion-icon')?.getAttribute('name') ?? '';
			const vis     = (el as HTMLElement).offsetParent !== null;
			lines.push(`[FAB vis=${vis}] ${el.tagName} class="${cls}" icon="${icon}" text="${text}"`);
		});

		// Textos visibles (para identificar qué pantalla es)
		lines.push('\n--- Textos visibles ---');
		(scope.querySelectorAll('h1, h2, h3, ion-title, ion-label, span, p') as NodeListOf<HTMLElement>)
			.forEach(el => {
				const text = (el.innerText ?? '').trim().replace(/\n/g, ' ').slice(0, 120);
				if (text.length > 2 && el.offsetParent !== null)
					lines.push(`[TEXT] ${el.tagName} "${text}"`);
			});

		// Elementos con clase que contenga "home", "viaje", "calle", "trip", "passenger", "pax"
		lines.push('\n--- Elementos con clase home/viaje/trip/pax ---');
		document.querySelectorAll('[class*="home"],[class*="viaje"],[class*="calle"],[class*="trip"],[class*="pax"],[class*="passenger"]')
			.forEach(el => {
				const text = ((el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
				const cls  = (el.className ?? '').toString().slice(0, 100);
				const vis  = (el as HTMLElement).offsetParent !== null;
				lines.push(`[HOME/PAX vis=${vis}] ${el.tagName} class="${cls}" text="${text}"`);
			});

		return lines.join('\n');
	});
	save('02-active-page', activePageDump);
	log('\n' + activePageDump.split('\n').slice(0, 60).join('\n'));

	// ── Dump 3: page source nativo (XML) para ver estructura nativa ──
	try {
		await driver.switchContext('NATIVE_APP');
		const nativeSrc = await driver.getPageSource();
		save('03-native-page-source', nativeSrc.slice(0, 60000));
		log('✓ Page source nativo guardado');
		if (wv) await driver.switchContext(wv);
	} catch (e) {
		log(`Error dump nativo: ${e}`);
	}

	await driver.deleteSession();
	log('\n✓ Dump completo. Revisar evidence/dom-dump/home-viaje-calle-*.txt');
}

run().catch(e => {
	console.error('❌', e.message ?? e);
	process.exit(1);
});
