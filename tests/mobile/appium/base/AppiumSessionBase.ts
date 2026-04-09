/**
 * AppiumSessionBase
 * Clase base para gestionar sesiones Appium en Android con WebdriverIO.
 *
 * Dependencias instaladas:
 *   webdriverio v9 — cliente Appium
 *   uiautomator2 v7 — driver Android para Appium Server v3
 *
 * Prerequisitos del entorno (configurar una vez):
 *   1. Variables de entorno Windows (Panel de control → Sistema → Variables de entorno):
 *      ANDROID_HOME = C:\Users\Erika\AppData\Local\Android\Sdk
 *      JAVA_HOME    = C:\Program Files\Android\Android Studio\jbr
 *      PATH         += %ANDROID_HOME%\platform-tools  (para adb)
 *      PATH         += %ANDROID_HOME%\emulator
 *
 *   2. Appium Server corriendo (en terminal separada):
 *      npx appium
 *
 *   3. Emulador iniciado desde Android Studio:
 *      Device Manager → Pixel_7 → ▶ (Play)
 *      Verificar con: adb devices   (debe aparecer emulator-5554)
 *
 *   4. Variables en .env.test (ver .env.appium.example):
 *      APPIUM_SERVER_URL=http://localhost:4723
 *      ANDROID_DRIVER_APP_PATH=C:\ruta\al\driver-app.apk
 *      ANDROID_DEVICE_NAME=Pixel_7
 *      ANDROID_PLATFORM_VERSION=15.0
 */

import { remote } from 'webdriverio';
import type { Browser, ChainablePromiseElement } from 'webdriverio';
import type { MobileActorConfig } from '../config/appiumRuntime';
import { buildAndroidCapabilities, buildAppiumRemoteConnection } from '../config/appiumRuntime';

// Tipo del driver WebdriverIO para Android
export type AppiumDriver = Browser;
export type AppiumElement = ChainablePromiseElement;

export abstract class AppiumSessionBase {
	protected driver!: AppiumDriver;
	protected readonly config: MobileActorConfig;

	constructor(config: MobileActorConfig) {
		this.config = config;
	}

	/**
	 * Inicia la sesión Appium contra el emulador/dispositivo Android.
	 *
	 * Antes de llamar este método:
	 * - El emulador Pixel_7 debe estar corriendo (ver prerequisitos arriba)
	 * - Appium Server debe estar corriendo: npx appium
	 * - adb devices debe mostrar el dispositivo
	 */
	async startSession(): Promise<void> {
		const caps = buildAndroidCapabilities(this.config);
		const connection = buildAppiumRemoteConnection(this.config);

		console.log(`[AppiumSessionBase] Conectando a ${this.config.appiumServerUrl}...`);
		console.log(`[AppiumSessionBase] Dispositivo: ${this.config.deviceName} (Android ${this.config.platformVersion})`);
		console.log(`[AppiumSessionBase] Base path: ${connection.path}`);

		this.driver = await remote({
			protocol: connection.protocol,
			hostname: connection.hostname,
			port: connection.port,
			path: connection.path,
			capabilities: caps as Record<string, unknown>,
			logLevel: 'warn',
			connectionRetryTimeout: 60_000,
			connectionRetryCount: 3,
		});

		console.log('[AppiumSessionBase] ✓ Sesión Appium iniciada');
	}

	async endSession(): Promise<void> {
		if (this.driver) {
			await this.driver.deleteSession();
			console.log('[AppiumSessionBase] Sesión Appium cerrada');
		}
	}

	// ── Helpers de localización ─────────────────────────────────────────────

	/**
	 * Accessibility ID — el equivalente a data-testid en web.
	 * Es el selector más estable. Pedirle al equipo de dev que los agreguen.
	 * En Appium Inspector se ve como "accessibility id: nombre"
	 */
	protected byAccessibilityId(id: string): string {
		return `~${id}`;
	}

	/**
	 * Texto visible exacto en pantalla.
	 * Útil para botones y labels cuando no hay accessibility-id.
	 */
	protected byText(text: string): string {
		return `//*[@text="${text}"]`;
	}

	/**
	 * Resource ID de Android (id de la View).
	 * En Appium Inspector se ve como "resource-id: com.package:id/nombre"
	 */
	protected byResourceId(packageAndId: string): string {
		return `id:${packageAndId}`;
	}

	// ── Helpers de interacción ──────────────────────────────────────────────

	/**
	 * Espera a que un elemento sea visible.
	 * @param selector - resultado de byAccessibilityId() / byText() / byResourceId()
	 * @param timeout - tiempo máximo en ms (default 10s)
	 */
	protected async waitForElement(selector: string, timeout = 10_000): Promise<AppiumElement> {
		const el = this.driver.$(selector);
		await el.waitForDisplayed({ timeout });
		return el;
	}

	/**
	 * Toca (click/tap) un elemento esperando que esté visible primero.
	 */
	protected async tap(selector: string, timeout = 10_000): Promise<void> {
		const el = await this.waitForElement(selector, timeout);
		await el.click();
	}

	/**
	 * Escribe texto en un campo.
	 */
	protected async typeIn(selector: string, value: string): Promise<void> {
		const el = await this.waitForElement(selector);
		await el.setValue(value);
	}

	/**
	 * Lee el texto de un elemento.
	 */
	protected async getText(selector: string): Promise<string> {
		const el = await this.waitForElement(selector);
		return el.getText();
	}

	/**
	 * Pausa la ejecución. Usar solo cuando sea estrictamente necesario.
	 * Preferir waitForElement() sobre pause().
	 */
	protected async pause(ms: number): Promise<void> {
		await this.driver.pause(ms);
	}
}
