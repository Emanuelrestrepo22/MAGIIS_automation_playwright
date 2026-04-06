/**
 * Appium Runtime Config — MAGIIS
 * Resuelve configuración para cada actor mobile (driver, passenger) por ambiente.
 *
 * Apps ya instaladas en el emulador Pixel_7:
 *   test  → com.magiis.app.test.driver     / com.magiis.app.test.passenger
 *   uat   → com.magiis.app.uat.driver      / com.magiis.app.uat.passenger
 *   prod  → com.magiis.app.driver          / com.magiis.app.passenger
 *
 * Modo de lanzamiento (resuelto automáticamente):
 *   App instalada (default): usa appPackage + appActivity, no requiere APK.
 *   APK: si ANDROID_DRIVER_APP_PATH / ANDROID_PASSENGER_APP_PATH están definidos,
 *        Appium instala el APK antes de lanzar.
 *
 * Variables de entorno requeridas:
 *   APPIUM_SERVER_URL             — URL del servidor Appium (ej: http://localhost:4723)
 *
 * Variables opcionales:
 *   ENV                           — Ambiente: test | uat | prod (default: test)
 *   ANDROID_DRIVER_APP_PATH       — APK path driver (solo si la app NO está instalada)
 *   ANDROID_PASSENGER_APP_PATH    — APK path passenger (solo si la app NO está instalada)
 *   ANDROID_DRIVER_APP_PACKAGE    — Override del package driver
 *   ANDROID_PASSENGER_APP_PACKAGE — Override del package passenger
 *   ANDROID_DEVICE_NAME           — Nombre del emulador (default: Pixel_7)
 *   ANDROID_PLATFORM_VERSION      — Versión de Android (default: 15.0)
 *   ANDROID_UDID                  — UDID del dispositivo (ej: emulator-5554)
 *   APPIUM_BASE_PATH              — Base path del servidor (default: /)
 *   APPIUM_NEW_COMMAND_TIMEOUT    — Timeout comandos en segundos (default: 120)
 *   APPIUM_NO_RESET               — No resetear la app (default: true cuando app instalada)
 *   APPIUM_FULL_RESET             — Resetear completamente la app (default: false)
 */

export type MobileActor = 'driver' | 'passenger';
export type MobileEnvironment = 'test' | 'uat' | 'prod' | 'savio';

// ─── Package map — apps instaladas en emulador Pixel_7 y Galaxy A05 ──────────
// Descubiertos con: adb shell pm list packages | Select-String "magiis"
// Confirmados en: emulator-5554 (Pixel_7) y R92XB0B8F3J (Samsung Galaxy A05)
const APP_PACKAGES: Record<MobileEnvironment, Partial<Record<MobileActor, string>>> = {
	test: {
		driver:    'com.magiis.app.test.driver',
		passenger: 'com.magiis.app.test.passenger',
	},
	uat: {
		driver:    'com.magiis.app.uat.driver',
		passenger: 'com.magiis.app.uat.passenger',
	},
	prod: {
		driver:    'com.magiis.app.driver',
		passenger: 'com.magiis.app.passenger',
	},
	// Ambiente savio: solo passenger (white-label / cliente específico)
	// Confirmado en Samsung Galaxy A05 (R92XB0B8F3J)
	savio: {
		passenger: 'com.magiis.app.savio.passenger',
	},
};

// Activity principal de todas las apps MAGIIS (relativa al package)
const MAGIIS_MAIN_ACTIVITY = '.MainActivity';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type MobileActorConfig = {
	actor: MobileActor;
	environment: MobileEnvironment;
	appiumServerUrl: string;
	appiumBasePath: string;
	/** Ruta al APK. null cuando la app ya está instalada en el emulador. */
	appPath: string | null;
	appPackage: string | null;
	appActivity: string | null;
	deviceName: string;
	platformVersion: string;
	udid: string | null;
	newCommandTimeout: number;
	noReset: boolean;
	fullReset: boolean;
};

export type AppiumRemoteConnection = {
	protocol: 'http' | 'https';
	hostname: string;
	port: number;
	path: string;
};

// ─── Helpers de env ───────────────────────────────────────────────────────────

function readRequiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`Missing environment variable: ${name}`);
	}
	return value;
}

function readOptionalEnv(name: string): string | null {
	return process.env[name] ?? null;
}

function readOptionalBooleanEnv(name: string, defaultValue: boolean): boolean {
	const value = readOptionalEnv(name);
	if (value === null) return defaultValue;
	return value === 'true' || value === '1';
}

function readOptionalNumberEnv(name: string, defaultValue: number): number {
	const value = readOptionalEnv(name);
	if (value === null) return defaultValue;
	const parsed = Number(value);
	if (Number.isNaN(parsed)) {
		throw new Error(`Invalid numeric environment variable: ${name}=${value}`);
	}
	return parsed;
}

function normalizeBasePath(rawPath: string | null): string {
	if (!rawPath || rawPath === '/') return '/';
	const withLeadingSlash = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
	return withLeadingSlash.replace(/\/+$/, '') || '/';
}

function resolveBasePathFromServerUrl(serverUrl: string): string {
	const parsed = new URL(serverUrl);
	if (parsed.pathname && parsed.pathname !== '/') {
		return normalizeBasePath(parsed.pathname);
	}
	return normalizeBasePath(readOptionalEnv('APPIUM_BASE_PATH'));
}

function resolveEnvironment(): MobileEnvironment {
	const raw = (readOptionalEnv('ENV') ?? 'test').toLowerCase();
	if (raw === 'test' || raw === 'uat' || raw === 'prod' || raw === 'savio') {
		return raw;
	}
	console.warn(`[appiumRuntime] ENV="${raw}" desconocido — usando "test"`);
	return 'test';
}

// ─── Config builder ───────────────────────────────────────────────────────────

function buildActorConfig(
	actor: MobileActor,
	appPathEnvVar: string,
	appPackageEnvVar: string,
): MobileActorConfig {
	const appiumServerUrl = readRequiredEnv('APPIUM_SERVER_URL');
	const environment     = resolveEnvironment();

	// Si hay APK path en el entorno → modo instalación de APK
	const appPath = readOptionalEnv(appPathEnvVar);

	// Package: override de env var > package map por ambiente
	const appPackage =
		readOptionalEnv(appPackageEnvVar) ??
		APP_PACKAGES[environment][actor] ??
		null;

	// noReset: true por default cuando usamos app instalada (no APK)
	const usingInstalledApp = appPath === null;

	return {
		actor,
		environment,
		appiumServerUrl,
		appiumBasePath:    resolveBasePathFromServerUrl(appiumServerUrl),
		appPath,
		appPackage,
		appActivity:       MAGIIS_MAIN_ACTIVITY,
		deviceName:        readOptionalEnv('ANDROID_DEVICE_NAME')      ?? 'Pixel_7',
		platformVersion:   readOptionalEnv('ANDROID_PLATFORM_VERSION') ?? '15.0',
		udid:              readOptionalEnv('ANDROID_UDID'),
		newCommandTimeout: readOptionalNumberEnv('APPIUM_NEW_COMMAND_TIMEOUT', 120),
		noReset:           readOptionalBooleanEnv('APPIUM_NO_RESET', usingInstalledApp),
		fullReset:         readOptionalBooleanEnv('APPIUM_FULL_RESET', false),
	};
}

// ─── API pública ──────────────────────────────────────────────────────────────

export function getDriverAppConfig(): MobileActorConfig {
	return buildActorConfig('driver', 'ANDROID_DRIVER_APP_PATH', 'ANDROID_DRIVER_APP_PACKAGE');
}

export function getPassengerAppConfig(): MobileActorConfig {
	return buildActorConfig('passenger', 'ANDROID_PASSENGER_APP_PATH', 'ANDROID_PASSENGER_APP_PACKAGE');
}

export function buildAppiumRemoteConnection(config: MobileActorConfig): AppiumRemoteConnection {
	const appiumUrl = new URL(config.appiumServerUrl);
	return {
		protocol: (appiumUrl.protocol.replace(':', '') as 'http' | 'https') || 'http',
		hostname: appiumUrl.hostname,
		port:     Number(appiumUrl.port) || 4723,
		path:     config.appiumBasePath,
	};
}

/**
 * Construye las capabilities para WebdriverIO/Appium.
 *
 * Modo app instalada: usa appPackage + appActivity (no incluye appium:app).
 * Modo APK:           incluye appium:app + opcionalmente appPackage/appActivity.
 */
export function buildAndroidCapabilities(config: MobileActorConfig): Record<string, unknown> {
	const useInstalledApp = config.appPath === null && config.appPackage !== null;

	return {
		platformName:               'Android',
		'appium:deviceName':        config.deviceName,
		'appium:platformVersion':   config.platformVersion,
		'appium:automationName':    'UiAutomator2',
		'appium:newCommandTimeout': config.newCommandTimeout,
		'appium:noReset':           config.noReset,
		'appium:fullReset':         config.fullReset,
		...(config.udid ? { 'appium:udid': config.udid } : {}),
		...(useInstalledApp
			? {
				// App instalada: lanzar por package, sin instalar APK
				'appium:appPackage':  config.appPackage,
				'appium:appActivity': config.appActivity,
			}
			: {
				// APK: Appium instala la app antes de lanzar
				'appium:app': config.appPath,
				...(config.appPackage  ? { 'appium:appPackage':  config.appPackage }  : {}),
				...(config.appActivity ? { 'appium:appActivity': config.appActivity } : {}),
			}),
	};
}
