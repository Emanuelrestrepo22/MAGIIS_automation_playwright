/**
 * Dump del DOM desde contexto WebView — Driver App
 * Captura: URL, IDs, textos, botones, clases relevantes
 *
 * Ejecutar desde Git Bash (con Appium server corriendo):
 *   ANDROID_HOME="C:/Users/Erika/AppData/Local/Android/Sdk" \
 *   ANDROID_SDK_ROOT="C:/Users/Erika/AppData/Local/Android/Sdk" \
 *   JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" \
 *   npx ts-node --esm tests/mobile/appium/scripts/dump-webview.ts
 */

import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const UDID        = process.env.ANDROID_UDID        ?? 'R92XB0B8F3J';
const APP_PACKAGE = process.env.ANDROID_APP_PACKAGE ?? 'com.magiis.app.test.driver';

async function run(): Promise<void> {
	const driver = await remote({
		protocol: 'http',
		hostname: 'localhost',
		port: 4723,
		path: '/',
		logLevel: 'warn',
		capabilities: {
			platformName:               'Android',
			'appium:automationName':    'UiAutomator2',
			'appium:deviceName':        'SM-A055M',
			'appium:udid':              UDID,
			'appium:appPackage':        APP_PACKAGE,
			'appium:appActivity':       '.MainActivity',
			'appium:noReset':           true,
			'appium:forceAppLaunch':    false,
			'appium:newCommandTimeout': 120,
			'appium:chromedriverAutodownload': true,
		} as Record<string, unknown>,
	});

	console.log('✓ Sesión Appium iniciada');
	await driver.pause(3000);

	// ── 1. Listar contextos disponibles ──────────────────────────────────────
	const contexts = await driver.getContexts() as string[];
	console.log('\n=== CONTEXTOS DISPONIBLES ===');
	contexts.forEach(c => console.log(' -', c));

	// ── 2. Cambiar a WebView ──────────────────────────────────────────────────
	const webview = contexts.find((c: string) => c.startsWith('WEBVIEW'));
	if (!webview) {
		console.log('\n⚠  No se encontró contexto WebView. App posiblemente en login (nativo).');
		console.log('   Correr driver-login-smoke.ts primero para hacer login y llegar al home.\n');
		await driver.deleteSession();
		return;
	}

	await driver.switchContext(webview);
	console.log(`\n✓ Contexto → ${webview}`);
	await driver.pause(1500);

	// ── 3. URL actual ─────────────────────────────────────────────────────────
	const url = await driver.execute<string, []>(() => window.location.href).catch(() => 'error');
	console.log(`\n=== URL ACTUAL ===\n${url}`);

	// ── 4. Dump completo del DOM WebView ──────────────────────────────────────
	const domDump = await driver.execute<string, []>(() => {
		const results: string[] = [];

		// Todos los elementos con id
		document.querySelectorAll('[id]').forEach(el => {
			const text = (el as HTMLElement).innerText?.trim().slice(0, 80) ?? '';
			results.push(`[id="${el.id}"] tag=${el.tagName.toLowerCase()} text="${text}"`);
		});

		// Botones y elementos clickeables
		document.querySelectorAll('button, ion-button, [role="button"], a[href]').forEach(el => {
			const text = (el as HTMLElement).innerText?.trim().slice(0, 80) ?? '';
			const id   = el.id ?? '';
			const cls  = el.className?.toString().slice(0, 60) ?? '';
			if (text) results.push(`[BUTTON] id="${id}" class="${cls}" text="${text}"`);
		});

		// Labels con texto visible
		document.querySelectorAll('ion-label, ion-title, h1, h2, h3, p, span').forEach(el => {
			const text = (el as HTMLElement).innerText?.trim().slice(0, 80) ?? '';
			const id   = el.id ?? '';
			if (text.length > 2 && text.length < 100) {
				results.push(`[TEXT] tag=${el.tagName.toLowerCase()} id="${id}" text="${text}"`);
			}
		});

		// Inputs
		document.querySelectorAll('input, ion-input').forEach(el => {
			const id          = el.id ?? '';
			const placeholder = (el as HTMLInputElement).placeholder ?? '';
			const type        = (el as HTMLInputElement).type ?? '';
			results.push(`[INPUT] id="${id}" type="${type}" placeholder="${placeholder}"`);
		});

		return results.join('\n');
	}).catch(e => `error al ejecutar JS: ${e}`);

	console.log('\n=== DOM WEBVIEW ===');
	console.log(domDump);
	console.log('\n=== FIN DOM WEBVIEW ===');

	// ── 5. Guardar en archivo ─────────────────────────────────────────────────
	const outDir = 'evidence/dom-dump';
	mkdirSync(outDir, { recursive: true });
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const outFile   = join(outDir, `driver-home-${timestamp}.txt`);
	const content   = `URL: ${url}\n\nCONTEXTOS: ${contexts.join(', ')}\n\n${domDump}`;
	writeFileSync(outFile, content, 'utf-8');
	console.log(`\n✓ Guardado en ${outFile}`);

	await driver.deleteSession();
	console.log('✓ Sesión cerrada');
}

run().catch(e => {
	console.error('❌  Error:', e.message ?? e);
	process.exit(1);
});
