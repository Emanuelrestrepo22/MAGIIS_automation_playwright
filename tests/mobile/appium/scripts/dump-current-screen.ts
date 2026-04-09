/**
 * Dump del DOM de la pantalla ACTUAL del driver (sin relanzar la app).
 * Usar cuando el driver ya está en la pantalla que queremos inspeccionar.
 *
 * Ejecutar:
 *   ANDROID_HOME="C:/Users/Erika/AppData/Local/Android/Sdk" \
 *   ANDROID_SDK_ROOT="C:/Users/Erika/AppData/Local/Android/Sdk" \
 *   JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" \
 *   SCREEN_LABEL="travel-confirm" \
 *   npx ts-node --esm tests/mobile/appium/scripts/dump-current-screen.ts
 */

import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const UDID        = process.env.ANDROID_UDID        ?? 'R92XB0B8F3J';
const APP_PACKAGE = process.env.ANDROID_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const LABEL       = process.env.SCREEN_LABEL        ?? 'screen';

const log = (msg: string) => console.log(`[dump] ${msg}`);

async function run(): Promise<void> {
	const driver = await remote({
		protocol: 'http', hostname: 'localhost', port: 4723, path: '/',
		logLevel: 'warn',
		capabilities: {
			platformName:               'Android',
			'appium:automationName':    'UiAutomator2',
			'appium:deviceName':        'SM-A055M',
			'appium:udid':              UDID,
			'appium:appPackage':        APP_PACKAGE,
			'appium:appActivity':       '.MainActivity',
			'appium:noReset':           true,
			'appium:forceAppLaunch':    false,   // NO relanzar — adjuntar a la sesión activa
			'appium:newCommandTimeout': 120,
			'appium:chromedriverAutodownload': true,
		} as Record<string, unknown>,
	});

	log('✓ Sesión adjuntada');
	await driver.pause(2000);

	// ── Listar contextos ──────────────────────────────────────────────────────
	const contexts = await driver.getContexts() as string[];
	log(`Contextos: ${contexts.join(', ')}`);

	const lines: string[] = [`CONTEXTOS: ${contexts.join(', ')}`];

	// ── Dump nativo ───────────────────────────────────────────────────────────
	await driver.switchContext('NATIVE_APP');
	const nativeSrc = await driver.getPageSource().catch(() => '');
	const nativeLines = nativeSrc.split('\n').filter((l: string) =>
		(l.includes('text="') || l.includes('content-desc="')) &&
		!l.includes('text=""') && !l.includes('content-desc=""')
	).map((l: string) => {
		const cls   = l.match(/class="([^"]+)"/)?.[1]?.split('.').pop() ?? '';
		const text  = l.match(/text="([^"]+)"/)?.[1] ?? '';
		const desc  = l.match(/content-desc="([^"]+)"/)?.[1] ?? '';
		const resId = l.match(/resource-id="([^"]+)"/)?.[1] ?? '';
		return `[NAT][${cls}]${resId ? ` id:${resId}` : ''} text="${text}"${desc ? ` desc="${desc}"` : ''}`;
	});

	log(`\n=== DUMP NATIVO (${nativeLines.length} elementos) ===`);
	nativeLines.forEach(l => console.log(l));
	lines.push('\n--- NATIVO ---', ...nativeLines);

	// ── Dump WebView ──────────────────────────────────────────────────────────
	const webview = contexts.find((c: string) => c.startsWith('WEBVIEW'));
	if (webview) {
		await driver.switchContext(webview);
		log(`\n✓ WebView: ${webview}`);
		await driver.pause(1000);

		const webDump = await driver.execute<string, []>(() => {
			const out: string[] = [`URL: ${window.location.href}`];

			// IDs
			document.querySelectorAll('[id]').forEach(el => {
				const text = (el as HTMLElement).innerText?.trim().replace(/\n/g, ' ').slice(0, 120) ?? '';
				out.push(`[WV][id="${el.id}"] tag=${el.tagName.toLowerCase()} text="${text}"`);
			});

			// Botones
			document.querySelectorAll('button, ion-button, [role="button"]').forEach(el => {
				const text = (el as HTMLElement).innerText?.trim().replace(/\n/g, ' ').slice(0, 120) ?? '';
				const id   = el.id ?? '';
				const cls  = el.className?.toString().slice(0, 80) ?? '';
				if (text) out.push(`[WV][BTN] id="${id}" class="${cls}" text="${text}"`);
			});

			// Textos relevantes
			document.querySelectorAll('ion-label, ion-title, h1, h2, h3, h4, span, p, ion-text').forEach(el => {
				const text = (el as HTMLElement).innerText?.trim().replace(/\n/g, ' ').slice(0, 120) ?? '';
				const id   = el.id ?? '';
				if (text.length > 1 && text.length < 120)
					out.push(`[WV][TEXT] ${el.tagName.toLowerCase()} id="${id}" text="${text}"`);
			});

			// Inputs
			document.querySelectorAll('input, ion-input, textarea').forEach(el => {
				const id  = el.id ?? '';
				const ph  = (el as HTMLInputElement).placeholder ?? '';
				const typ = (el as HTMLInputElement).type ?? '';
				out.push(`[WV][INPUT] id="${id}" type="${typ}" placeholder="${ph}"`);
			});

			// Clases de contenedores principales (para inferir componente Angular)
			document.querySelectorAll('[class*="page"], [class*="screen"], [class*="travel"], [class*="trip"], [class*="viaje"]').forEach(el => {
				const cls = el.className?.toString().slice(0, 100) ?? '';
				out.push(`[WV][CONTAINER] tag=${el.tagName.toLowerCase()} class="${cls}"`);
			});

			return out.join('\n');
		}).catch(e => `JS error: ${e}`);

		log(`\n=== DUMP WEBVIEW ===`);
		console.log(webDump);
		lines.push('\n--- WEBVIEW ---', webDump);
	} else {
		log('⚠  Sin contexto WebView disponible');
	}

	// ── Guardar ───────────────────────────────────────────────────────────────
	mkdirSync('evidence/dom-dump', { recursive: true });
	const ts  = new Date().toISOString().replace(/[:.]/g, '-');
	const out = join('evidence/dom-dump', `${LABEL}-${ts}.txt`);
	writeFileSync(out, lines.join('\n'), 'utf-8');
	log(`\n✓ Guardado: ${out}`);

	await driver.deleteSession();
	log('✓ Sesión cerrada');
}

run().catch(e => {
	console.error('❌', e.message ?? e);
	process.exit(1);
});
