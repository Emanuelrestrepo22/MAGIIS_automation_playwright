/**
 * Login Driver App — solo ingresa la contraseña (email ya está en el campo).
 * Ejecutar:
 *   npx ts-node --esm tests/mobile/appium/scripts/driver-login-password-only.ts
 */

import { remote } from 'webdriverio';

const UDID        = process.env.ANDROID_UDID        ?? 'R92XB0B8F3J';
const PACKAGE     = process.env.ANDROID_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const PASSWORD    = process.env.DRIVER_PASSWORD     ?? '123';

const log = (msg: string) => console.log(`[login] ${msg}`);

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

	// Cambiar a WebView
	const contexts = await driver.getContexts() as string[];
	const wv = contexts.find((c: string) => c.startsWith('WEBVIEW'));
	if (!wv) { log('⚠ Sin WebView'); await driver.deleteSession(); return; }
	await driver.switchContext(wv);
	log(`✓ Contexto → ${wv}`);

	const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
	log(`URL: ${url}`);

	if (!url.includes('login')) {
		log('✓ Ya está logueado — no se necesita login');
		await driver.deleteSession();
		return;
	}

	// Buscar campo contraseña (el email ya está completado)
	log('Buscando campo contraseña...');
	const pwdInput = await driver.$('input[type="password"]');
	if (!await pwdInput.isDisplayed().catch(() => false)) {
		log('⚠ Campo contraseña no encontrado');
		await driver.deleteSession();
		return;
	}

	await pwdInput.click();
	await pwdInput.clearValue();
	await pwdInput.setValue(PASSWORD);
	log(`✓ Contraseña ingresada`);
	await driver.pause(500);

	// Tap botón "Entrar" — via JS click para evitar intercepción de ion-footer
	const clicked = await driver.execute<boolean, []>(() => {
		const btns = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
		const btn = btns.find(b => b.innerText?.trim() === 'Entrar');
		if (btn) { btn.click(); return true; }
		return false;
	});
	if (clicked) {
		log('✓ Tap "Entrar" (JS click)');
	} else {
		log('⚠ Botón "Entrar" no encontrado');
		await driver.deleteSession();
		return;
	}

	// Esperar home
	await driver.pause(5000);
	await driver.switchContext(wv).catch(() => {});
	const urlAfter = await driver.execute<string, []>(() => window.location.href).catch(() => '');
	log(`URL post-login: ${urlAfter}`);

	if (urlAfter.includes('home') || urlAfter.includes('navigator')) {
		log('✅ Login exitoso — driver en home');
	} else {
		log(`⚠ URL inesperada: ${urlAfter}`);
	}

	await driver.deleteSession();
	log('✓ Sesión cerrada');
}

run().catch(e => {
	console.error('❌', e.message ?? e);
	process.exit(1);
});
