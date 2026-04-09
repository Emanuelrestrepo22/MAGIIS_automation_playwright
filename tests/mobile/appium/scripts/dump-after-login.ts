/**
 * Login en Driver App + dump del home WebView en una sola sesión.
 * No cierra la sesión entre login y dump para preservar el estado.
 *
 * Ejecutar:
 *   ANDROID_HOME="C:/Users/Erika/AppData/Local/Android/Sdk" \
 *   ANDROID_SDK_ROOT="C:/Users/Erika/AppData/Local/Android/Sdk" \
 *   JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" \
 *   DRIVER_EMAIL="nuevoemailyo12312213@yopmail.com" \
 *   DRIVER_PASSWORD="123" \
 *   npx ts-node --esm tests/mobile/appium/scripts/dump-after-login.ts
 */

import { remote } from 'webdriverio';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const UDID     = process.env.ANDROID_UDID      ?? 'R92XB0B8F3J';
const PACKAGE  = process.env.ANDROID_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const EMAIL    = process.env.DRIVER_EMAIL       ?? '';
const PASSWORD = process.env.DRIVER_PASSWORD    ?? '';

if (!EMAIL || !PASSWORD) {
	console.error('❌  Definir DRIVER_EMAIL y DRIVER_PASSWORD');
	process.exit(1);
}

const log = (msg: string) => console.log(`[dump] ${msg}`);

async function switchToWebView(driver: WebdriverIO.Browser): Promise<string | null> {
	const contexts = await driver.getContexts() as string[];
	log(`Contextos: ${contexts.join(', ')}`);
	const wv = contexts.find((c: string) => c.startsWith('WEBVIEW'));
	if (!wv) return null;
	await driver.switchContext(wv);
	log(`✓ → ${wv}`);
	return wv;
}

async function doLoginNative(driver: WebdriverIO.Browser): Promise<boolean> {
	// Cambiar a contexto nativo para usar UiAutomator2 (igual que driver-login-smoke.ts)
	await driver.switchContext('NATIVE_APP');
	log('→ NATIVE_APP para login');

	const emailField = driver.$('//android.widget.EditText[1]');
	await emailField.waitForDisplayed({ timeout: 10_000 });
	await emailField.clearValue();
	await emailField.setValue(EMAIL);
	log('✓ Email ingresado');

	await driver.hideKeyboard().catch(() => {});
	await driver.pause(800);

	const passSelectors = [
		'(//*[@password="true"])[1]',
		'//android.widget.EditText[2]',
	];
	let passField: ReturnType<typeof driver.$> | null = null;
	for (const sel of passSelectors) {
		const el = driver.$(sel);
		if (await el.isDisplayed().catch(() => false)) { passField = el; break; }
	}
	if (!passField) { log('⚠  Campo contraseña no encontrado'); return false; }
	await passField.clearValue();
	await passField.setValue(PASSWORD);
	log('✓ Contraseña ingresada');

	await driver.hideKeyboard().catch(() => {});
	await driver.pause(800);

	for (const sel of ['//*[@text="Entrar"]', '//*[contains(@text,"ntrar")]']) {
		const btn = driver.$(sel);
		if (await btn.isDisplayed().catch(() => false)) {
			await btn.click();
			log('✓ Botón Entrar presionado');
			await driver.pause(6000);
			const stillOnLogin = await driver.$('//android.widget.EditText[1]').isDisplayed().catch(() => false);
			return !stillOnLogin;
		}
	}
	log('⚠  Botón Entrar no encontrado');
	return false;
}

async function handleSessionExpiredIfPresent(driver: WebdriverIO.Browser): Promise<boolean> {
	const result = await driver.execute<string, []>(() => {
		const modal = document.querySelector('ion-modal.alert-modal-atention.show-modal');
		if (!modal) return 'no-modal';
		const allEls = Array.from(document.querySelectorAll('*'));
		for (const el of allEls) {
			if (el.textContent?.trim() === 'Aceptar' && (el as HTMLElement).click) {
				(el as HTMLElement).click();
				return 'clicked-aceptar';
			}
		}
		return 'modal-found-but-no-aceptar';
	}).catch(() => 'error');
	log(`Session expired check: ${result}`);
	if (result === 'clicked-aceptar') {
		await driver.pause(1500);
		return true;
	}
	return false;
}

async function reEnterPassword(driver: WebdriverIO.Browser): Promise<void> {
	log('Re-ingresando contraseña post sesión expirada...');
	await driver.pause(2500);
	const loginResult = await driver.execute<string, [string]>((pwd: string): string => {
		const passInput = document.querySelector('input[type="password"]') as HTMLInputElement | null;
		if (!passInput) return 'no-password-field';
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
		setter?.call(passInput, pwd);
		passInput.dispatchEvent(new Event('input', { bubbles: true }));
		passInput.dispatchEvent(new Event('change', { bubbles: true }));
		const btn = Array.from(document.querySelectorAll('button, [role="button"]'))
			.find(el => el.textContent?.trim() === 'Entrar') as HTMLElement | undefined;
		if (btn) { btn.click(); return 'login-submitted'; }
		return 'password-filled-no-button';
	}, PASSWORD).catch((e: Error) => `error: ${e.message}`);
	log(`Re-login result: ${loginResult}`);
	if (loginResult === 'login-submitted') await driver.pause(6000);
}

async function dumpWebView(driver: WebdriverIO.Browser): Promise<string> {
	const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
	log(`URL: ${url}`);

	const dom = await driver.execute<string, []>(() => {
		const out: string[] = [];

		document.querySelectorAll('[id]').forEach(el => {
			const text = (el as HTMLElement).innerText?.trim().slice(0, 100) ?? '';
			out.push(`[id="${el.id}"] tag=${el.tagName.toLowerCase()} text="${text}"`);
		});

		document.querySelectorAll('button, ion-button, [role="button"]').forEach(el => {
			const text = (el as HTMLElement).innerText?.trim().slice(0, 100) ?? '';
			const id   = el.id ?? '';
			const cls  = el.className?.toString().slice(0, 80) ?? '';
			if (text) out.push(`[BTN] id="${id}" class="${cls}" text="${text}"`);
		});

		document.querySelectorAll('ion-label, ion-title, h1, h2, h3, span, p').forEach(el => {
			const text = (el as HTMLElement).innerText?.trim().slice(0, 100) ?? '';
			const id   = el.id ?? '';
			if (text.length > 1 && text.length < 100)
				out.push(`[TEXT] ${el.tagName.toLowerCase()} id="${id}" text="${text}"`);
		});

		document.querySelectorAll('input, ion-input').forEach(el => {
			const id  = el.id ?? '';
			const ph  = (el as HTMLInputElement).placeholder ?? '';
			const typ = (el as HTMLInputElement).type ?? '';
			out.push(`[INPUT] id="${id}" type="${typ}" placeholder="${ph}"`);
		});

		return `URL: ${window.location.href}\n\n` + out.join('\n');
	}).catch(e => `JS error: ${e}`);

	return dom;
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
			'appium:forceAppLaunch':    true,
			'appium:newCommandTimeout': 120,
			'appium:chromedriverAutodownload': true,
		} as Record<string, unknown>,
	});

	log('✓ Sesión iniciada');
	await driver.pause(4000);

	try {
		// ── Cambiar a WebView y hacer login ───────────────────────────────────
		const wv = await switchToWebView(driver);
		if (!wv) { log('⚠  Sin WebView — app en pantalla nativa'); return; }

		await driver.pause(2000);
		const url0 = await driver.execute<string, []>(() => window.location.href).catch(() => '');
		log(`URL inicial: ${url0}`);

		if (url0.includes('/login') || url0.includes('localhost/login')) {
			log('Pantalla login detectada — haciendo login via nativo...');
			const ok = await doLoginNative(driver);
			if (!ok) { log('⚠  Login falló'); return; }
			log('Esperando post-login...');
			await driver.pause(4000);

			// Re-cambiar al WebView después del login
			await switchToWebView(driver);
			await driver.pause(2000);

			// Manejar popup "sesión expirada" si aparece
			const expired = await handleSessionExpiredIfPresent(driver);
			if (expired) {
				await reEnterPassword(driver);
				await switchToWebView(driver);
				await driver.pause(2000);
			}

			// Manejar pantalla de bienvenida si aparece (botón "Aceptar")
			const welcomed = await driver.execute<string, []>(() => {
				const btns = Array.from(document.querySelectorAll('button, ion-button, [role="button"]'));
				const aceptar = btns.find(b => b.textContent?.trim() === 'Aceptar') as HTMLElement | undefined;
				if (aceptar) { aceptar.click(); return 'clicked'; }
				return 'not-found';
			}).catch(() => 'error');
			log(`Welcome screen "Aceptar": ${welcomed}`);
			if (welcomed === 'clicked') await driver.pause(3000);
		}

		// ── Dump 1: Home ──────────────────────────────────────────────────────
		log('\n=== DUMP 1: HOME ===');
		const dump1 = await dumpWebView(driver);
		console.log(dump1);

		// ── Guardar ───────────────────────────────────────────────────────────
		mkdirSync('evidence/dom-dump', { recursive: true });
		const ts = new Date().toISOString().replace(/[:.]/g, '-');
		const f1 = join('evidence/dom-dump', `driver-home-logged-${ts}.txt`);
		writeFileSync(f1, dump1, 'utf-8');
		log(`✓ Guardado: ${f1}`);

	} finally {
		await driver.deleteSession();
		log('✓ Sesión cerrada');
	}
}

run().catch(e => {
	console.error('❌', e.message ?? e);
	process.exit(1);
});
