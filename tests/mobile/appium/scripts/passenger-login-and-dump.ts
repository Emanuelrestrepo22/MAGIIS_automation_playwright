/**
 * Passenger login + dump del home WebView.
 * Útil cuando la sesión expira y el app abre en /login.
 *
 * Ejecutar desde la raíz del repo:
 *   $env:ANDROID_UDID="R92XB0B8F3J"
 *   $env:PASSENGER_EMAIL="emanuel.restrepo@yopmail.com"
 *   $env:PASSENGER_PASSWORD="123"
 *   pnpm exec ts-node --esm tests/mobile/appium/scripts/passenger-login-and-dump.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { remote } from 'webdriverio';

const APPIUM_URL = process.env.APPIUM_SERVER_URL ?? 'http://localhost:4723';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const PACKAGE = process.env.ANDROID_APP_PACKAGE ?? 'com.magiis.app.test.passenger';
const EMAIL = process.env.PASSENGER_EMAIL ?? process.env.DRIVER_EMAIL ?? '';
const PASSWORD = process.env.PASSENGER_PASSWORD ?? process.env.DRIVER_PASSWORD ?? '';
const LABEL = process.env.SCREEN_LABEL ?? 'passenger-home-logged';

if (!EMAIL || !PASSWORD) {
	console.error('❌  Definir PASSENGER_EMAIL y PASSENGER_PASSWORD como variables de entorno.');
	process.exit(1);
}

const appiumUrl = new URL(APPIUM_URL);
const log = (msg: string): void => console.log(`[passenger-login] ${msg}`);

async function switchToWebView(driver: WebdriverIO.Browser): Promise<string | null> {
	const contexts = await driver.getContexts() as string[];
	log(`Contextos: ${contexts.join(', ')}`);
	const webview = contexts.find((c: string) => c.startsWith('WEBVIEW'));
	if (!webview) return null;
	await driver.switchContext(webview);
	log(`✓ Contexto → ${webview}`);
	return webview;
}

async function closeExpiredModalIfPresent(driver: WebdriverIO.Browser): Promise<string> {
	return driver.execute<string, []>(() => {
		const modal = Array.from(document.querySelectorAll('ion-modal')).find(el =>
			(el.textContent ?? '').includes('Su sesión ha expirado')
		);
		if (!modal) return 'no-modal';

		const buttons = Array.from(document.querySelectorAll('button, ion-button, [role="button"]'));
		const aceptar = buttons.find(el => el.textContent?.trim() === 'Aceptar') as HTMLElement | undefined;
		if (aceptar) {
			aceptar.click();
			return 'clicked-aceptar';
		}

		return 'modal-without-aceptar';
	}).catch(() => 'error');
}

async function fillLoginAndSubmit(driver: WebdriverIO.Browser): Promise<string> {
	return driver.execute<string, [string, string]>((email: string, password: string): string => {
		const emailInput = document.querySelector('input[type="email"], input[placeholder="Email"]') as HTMLInputElement | null;
		const passwordInput = document.querySelector('input[type="password"], input[placeholder="Contraseña"]') as HTMLInputElement | null;

		if (!emailInput || !passwordInput) return 'missing-fields';

		const setValue = (el: HTMLInputElement, value: string): void => {
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
			setter?.call(el, value);
			el.dispatchEvent(new Event('input', { bubbles: true }));
			el.dispatchEvent(new Event('change', { bubbles: true }));
		};

		setValue(emailInput, email);
		setValue(passwordInput, password);

		const buttons = Array.from(document.querySelectorAll('button, ion-button, [role="button"]'));
		const submit = buttons.find(el => {
			const text = el.textContent?.trim();
			return text === 'Ingresar' || text === 'Entrar' || text === 'Login' || text === 'Iniciar sesión';
		}) as HTMLElement | undefined;

		if (submit) {
			submit.click();
			return 'clicked-submit';
		}

		return 'fields-filled-no-button';
	}, EMAIL, PASSWORD).catch((error: Error) => `error:${error.message}`);
}

async function waitForPassengerHome(driver: WebdriverIO.Browser, timeoutMs = 20_000): Promise<string> {
	const deadline = Date.now() + timeoutMs;
	let lastUrl = '';

	while (Date.now() < deadline) {
		await driver.pause(1500);
		await switchToWebView(driver);
		lastUrl = await driver.execute<string, []>(() => window.location.href).catch(() => '');
		if (lastUrl.includes('/navigator/HomePage')) {
			return lastUrl;
		}
	}

	return lastUrl;
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
			const id = el.id ?? '';
			const cls = el.className?.toString().slice(0, 80) ?? '';
			if (text) out.push(`[BTN] id="${id}" class="${cls}" text="${text}"`);
		});

		document.querySelectorAll('ion-label, ion-title, h1, h2, h3, span, p').forEach(el => {
			const text = (el as HTMLElement).innerText?.trim().slice(0, 100) ?? '';
			const id = el.id ?? '';
			if (text.length > 1 && text.length < 100) {
				out.push(`[TEXT] ${el.tagName.toLowerCase()} id="${id}" text="${text}"`);
			}
		});

		document.querySelectorAll('input, ion-input').forEach(el => {
			const id = el.id ?? '';
			const ph = (el as HTMLInputElement).placeholder ?? '';
			const typ = (el as HTMLInputElement).type ?? '';
			out.push(`[INPUT] id="${id}" type="${typ}" placeholder="${ph}"`);
		});

		return `URL: ${window.location.href}\n\n` + out.join('\n');
	}).catch((error: Error) => `JS error: ${error.message}`);

	return dom;
}

async function run(): Promise<void> {
	const driver = await remote({
		protocol: (appiumUrl.protocol.replace(':', '') as 'http' | 'https') || 'http',
		hostname: appiumUrl.hostname,
		port: Number(appiumUrl.port) || 4723,
		path: appiumUrl.pathname || '/',
		logLevel: 'warn',
		capabilities: {
			platformName: 'Android',
			'appium:automationName': 'UiAutomator2',
			'appium:deviceName': 'SM-A055M',
			'appium:udid': UDID,
			'appium:appPackage': PACKAGE,
			'appium:appActivity': '.MainActivity',
			'appium:noReset': true,
			'appium:forceAppLaunch': true,
			'appium:newCommandTimeout': 120,
			'appium:chromedriverAutodownload': true,
		} as Record<string, unknown>,
	});

	log('✓ Sesión iniciada');
	await driver.pause(4000);

	try {
		const webview = await switchToWebView(driver);
		if (!webview) {
			throw new Error('No se encontró WEBVIEW en la app passenger');
		}

		await driver.pause(1500);
		let url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
		log(`URL inicial: ${url}`);

		if (url.includes('/login') || url.includes('localhost/login')) {
			const modalResult = await closeExpiredModalIfPresent(driver);
			log(`Modal sesión expirada: ${modalResult}`);
			if (modalResult === 'clicked-aceptar') {
				await driver.pause(1200);
			}

			const loginResult = await fillLoginAndSubmit(driver);
			log(`Login result: ${loginResult}`);

			url = await waitForPassengerHome(driver);
			log(`URL post-login: ${url}`);
			if (url.includes('/login') || url.includes('localhost/login')) {
				throw new Error('La app passenger siguió en login después de enviar credenciales');
			}
		}

		log('\n=== DUMP HOME PASAJERO ===');
		const dump = await dumpWebView(driver);
		console.log(dump);

		mkdirSync('evidence/dom-dump', { recursive: true });
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const file = join('evidence/dom-dump', `${LABEL}-${timestamp}.txt`);
		writeFileSync(file, dump, 'utf-8');
		log(`✓ Guardado: ${file}`);
	} finally {
		await driver.deleteSession();
		log('✓ Sesión cerrada');
	}
}

run().catch((error: Error) => {
	console.error(`❌ ${error.message}`);
	process.exit(1);
});
