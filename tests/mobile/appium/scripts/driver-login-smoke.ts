/**
 * Smoke: Login + Disponibilidad — Driver App (dispositivo físico)
 *
 * Flujo:
 *   1. Lanza la Driver App TEST en el Samsung Galaxy A05
 *   2. Maneja sesión expirada si aparece el popup (known bug en TEST)
 *   3. Hace login con email y contraseña
 *   4. Cambia a WebView (Angular/Ionic) para acceder al home
 *   5. Verifica/cambia el estado de disponibilidad a "Disponible"
 *
 * Ejecutar (desde la terminal de VS Code — NO desde Codex):
 *   $env:ANDROID_HOME="C:\Users\Erika\AppData\Local\Android\Sdk"
 *   $env:ANDROID_SDK_ROOT="C:\Users\Erika\AppData\Local\Android\Sdk"
 *   $env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
 *   $env:APPIUM_SERVER_URL="http://localhost:4723"
 *   $env:ANDROID_UDID="R92XB0B8F3J"
 *   $env:ENV="test"
 *   $env:DRIVER_EMAIL="nuevoemailyo12312213@yopmail.com"
 *   $env:DRIVER_PASSWORD="123"
 *   npx ts-node --esm tests/mobile/appium/scripts/driver-login-smoke.ts
 */

import { remote } from 'webdriverio';

const APPIUM_URL  = process.env.APPIUM_SERVER_URL          ?? 'http://localhost:4723';
const UDID        = process.env.ANDROID_UDID               ?? 'R92XB0B8F3J';
const APP_PACKAGE = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const EMAIL       = process.env.DRIVER_EMAIL               ?? '';
const PASSWORD    = process.env.DRIVER_PASSWORD            ?? '';

if (!EMAIL || !PASSWORD) {
	console.error('❌  Definir DRIVER_EMAIL y DRIVER_PASSWORD como variables de entorno.');
	process.exit(1);
}

const log = (msg: string): void => console.log(`[smoke] ${msg}`);

// ─── Helpers de contexto ──────────────────────────────────────────────────────

async function switchToWebView(driver: WebdriverIO.Browser): Promise<boolean> {
	const contexts = await driver.getContexts() as string[];
	log(`Contextos: ${contexts.join(', ')}`);
	const webview = contexts.find((c: string) => c.startsWith('WEBVIEW'));
	if (!webview) { log('⚠  Sin contexto WebView'); return false; }
	await driver.switchContext(webview);
	log(`✓ Contexto → ${webview}`);
	return true;
}

async function switchToNative(driver: WebdriverIO.Browser): Promise<void> {
	await driver.switchContext('NATIVE_APP');
	log('✓ Contexto → NATIVE_APP');
}

// ─── Handler: sesión expirada ─────────────────────────────────────────────────

async function handleSessionExpiredIfPresent(driver: WebdriverIO.Browser): Promise<boolean> {
	const result = await driver.execute<string, []>(() => {
		const modal = document.querySelector('ion-modal.alert-modal-atention.show-modal');
		if (!modal) return 'no-modal';
		// Recorrer shadow roots para encontrar el botón Aceptar
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
		log('✓ Popup sesión expirada cerrado — re-ingresando contraseña...');
		await driver.pause(1000);
		return true;
	}
	return false;
}

// ─── Re-login desde modal de sesión expirada ──────────────────────────────────

async function reEnterPasswordAndLogin(driver: WebdriverIO.Browser): Promise<void> {
	log('Esperando que el formulario aparezca en WebView...');
	await driver.pause(2500);

	// Llenar contraseña via JS síncrono (execute no soporta Promises)
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

	if (loginResult === 'login-submitted') {
		log('✓ Contraseña re-ingresada y Entrar presionado via WebView');
		await driver.pause(6000);
	} else {
		// Fallback: intentar via native
		log(`⚠  ${loginResult} — fallback via native...`);
		await switchToNative(driver);
		await driver.pause(2000);
		const passNative = driver.$('(//*[@password="true"])[1]');
		if (await passNative.isDisplayed().catch(() => false)) {
			await passNative.clearValue();
			await passNative.setValue(PASSWORD);
			await driver.hideKeyboard().catch(() => {});
			await driver.pause(500);
			const loginBtn = driver.$('//*[@text="Entrar"]');
			await loginBtn.click();
			log('✓ Fallback native OK');
			await driver.pause(6000);
			await switchToWebView(driver);
		}
	}
}

// ─── Polling en Node para encontrar #availability ─────────────────────────────
// (execute() de WebdriverIO no acepta callbacks async/Promise)

async function pollForAvailability(
	driver: WebdriverIO.Browser,
	timeoutMs = 15_000,
): Promise<string> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const result = await driver.execute<string, []>(() => {
			const btn  = document.querySelector('#availability');
			const span = btn?.querySelector('.available-label') ?? btn?.querySelector('span');
			if (btn && span) return 'found:' + (span.textContent?.trim() ?? '');
			// Diagnóstico: qué IDs hay en el DOM
			const ids = Array.from(document.querySelectorAll('[id]'))
				.map(e => (e as HTMLElement).id)
				.filter((id: string) => id.length > 0)
				.slice(0, 10)
				.join(', ');
			return 'waiting. IDs: ' + (ids || 'ninguno');
		}).catch(() => 'error');

		if (result.startsWith('found:')) return result;
		log(`  polling: ${result}`);
		await driver.pause(1000);
	}
	return 'timeout';
}

// ─── Verificar y activar disponibilidad ───────────────────────────────────────

async function checkAndSetAvailable(driver: WebdriverIO.Browser): Promise<void> {
	const switched = await switchToWebView(driver);
	if (!switched) { log('⚠  No se pudo cambiar a WebView'); return; }
	await driver.pause(2000);

	// Manejar sesión expirada si aparece
	const sessionExpired = await handleSessionExpiredIfPresent(driver);
	if (sessionExpired) {
		await reEnterPasswordAndLogin(driver);
		const ok = await switchToWebView(driver);
		if (!ok) { log('⚠  No se pudo volver al WebView'); return; }
		await driver.pause(2000);
	}

	// URL diagnóstico
	const url = await driver.execute<string, []>(() => window.location.href).catch(() => '');
	log(`URL home: ${url}`);

	// Esperar que #availability aparezca (polling en Node)
	log('Esperando button#availability...');
	const statusResult = await pollForAvailability(driver);
	log(`Resultado polling: ${statusResult}`);

	if (!statusResult.startsWith('found:')) {
		log('⚠  No se encontró button#availability en 15s');
		return;
	}

	const currentStatus = statusResult.replace('found:', '');
	log(`Estado actual: "${currentStatus}"`);

	if (currentStatus.toLowerCase().includes('no disponible')) {
		log('Cambiando a Disponible...');
		await driver.execute<void, []>(() => {
			(document.querySelector('#availability') as HTMLElement)?.click();
		});
		await driver.pause(2500);

		const newStatus = await driver.execute<string, []>(() => {
			const span = document.querySelector('#availability .available-label')
				?? document.querySelector('#availability span');
			return span?.textContent?.trim() ?? '';
		}).catch(() => '');

		if (newStatus && !newStatus.toLowerCase().includes('no disponible')) {
			log(`✅  Driver disponible: "${newStatus}"`);
		} else {
			log(`⚠  Estado no cambió: "${newStatus}" — verificar en el teléfono`);
		}
	} else {
		log(`✅  Driver ya disponible: "${currentStatus}"`);
	}
}

// ─── Login flow ───────────────────────────────────────────────────────────────

const LOGIN_BUTTON_SELECTORS = [
	'//*[@text="Entrar"]',
	'//*[contains(@text,"ntrar")]',
	'//*[@text="Iniciar sesión"]',
	'//*[@text="Login"]',
];

async function doLogin(driver: WebdriverIO.Browser): Promise<boolean> {
	log('Buscando campo de email...');
	const emailField = driver.$('//android.widget.EditText[1]');
	await emailField.waitForDisplayed({ timeout: 10_000 });
	await emailField.clearValue();
	await emailField.setValue(EMAIL);
	log('✓ Email ingresado');

	await driver.hideKeyboard().catch(() => {});
	await driver.pause(1500);

	log('Buscando campo de contraseña...');
	const passSelectors = [
		'(//*[@password="true"])[1]',
		'//android.widget.EditText[2]',
		'//*[contains(@hint,"ontraseña")]',
	];

	let passField: ReturnType<typeof driver.$> | null = null;
	for (const sel of passSelectors) {
		const el = driver.$(sel);
		if (await el.isDisplayed().catch(() => false)) {
			passField = el;
			log(`✓ Contraseña encontrada: ${sel}`);
			break;
		}
	}
	if (!passField) { log('⚠  Campo contraseña no encontrado'); return false; }

	await passField.clearValue();
	await passField.setValue(PASSWORD);
	log('✓ Contraseña ingresada');

	await driver.hideKeyboard().catch(() => {});
	await driver.pause(800);

	for (const sel of LOGIN_BUTTON_SELECTORS) {
		const el = driver.$(sel);
		if (await el.isDisplayed().catch(() => false)) {
			await el.click();
			log(`✓ Botón login presionado: ${sel}`);
			await driver.pause(6000);
			const stillOnLogin = await driver.$('//android.widget.EditText[1]')
				.isDisplayed().catch(() => false);
			if (!stillOnLogin) {
				log('✅  Login exitoso');
				return true;
			}
			log('⚠  Pantalla login sigue visible');
			return false;
		}
	}
	log('⚠  Botón login no encontrado');
	return false;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
	const appiumUrl = new URL(APPIUM_URL);
	log(`Conectando: ${APPIUM_URL} | Dispositivo: ${UDID} | App: ${APP_PACKAGE}`);

	const driver = await remote({
		protocol: appiumUrl.protocol.replace(':', '') as 'http' | 'https',
		hostname: appiumUrl.hostname,
		port:     Number(appiumUrl.port) || 4723,
		path:     '/',
		logLevel: 'warn',
		connectionRetryTimeout: 60_000,
		connectionRetryCount:   2,
		capabilities: {
			platformName:                  'Android',
			'appium:automationName':       'UiAutomator2',
			'appium:deviceName':           'SM-A055M',
			'appium:platformVersion':      '15.0',
			'appium:udid':                 UDID,
			'appium:appPackage':           APP_PACKAGE,
			'appium:appActivity':          '.MainActivity',
			'appium:noReset':              true,
			'appium:forceAppLaunch':       true,
			'appium:newCommandTimeout':    120,
			'appium:autoGrantPermissions': true,
			'appium:chromedriverAutodownload': true,
		} as Record<string, unknown>,
	});

	log('✓ Sesión Appium iniciada');

	try {
		log('Esperando que la app cargue...');
		await driver.pause(4000);

		const onLoginScreen = await driver.$('//android.widget.EditText[1]')
			.isDisplayed().catch(() => false);

		if (onLoginScreen) {
			log('Pantalla de login detectada');
			const ok = await doLogin(driver);
			if (!ok) { log('⚠  Login falló'); return; }
			log('Esperando que Angular home cargue...');
			await driver.pause(5000);
		} else {
			log('App ya en home');
			await driver.pause(3000);
		}

		await checkAndSetAvailable(driver);

	} finally {
		await driver.deleteSession();
		log('Sesión cerrada');
	}
}

run().catch(err => {
	console.error('❌  Error:', err.message ?? err);
	process.exit(1);
});
