// @ts-nocheck
// Legacy compatibility file — NO usar para código nuevo. Usar appiumRuntime.ts.
// Este archivo se mantiene solo como referencia histórica.
/**
 * Mobile Runtime Config
 * Resuelve la configuración de Appium para cada actor mobile (driver, passenger).
 *
 * Variables de entorno requeridas:
 *   APPIUM_SERVER_URL          — URL del servidor Appium (ej: http://localhost:4723)
 *   ANDROID_DRIVER_APP_PATH    — Ruta al APK de la app Driver
 *   ANDROID_PASSENGER_APP_PATH — Ruta al APK de la app Passenger
 *   ANDROID_APP_PACKAGE        — Package base de la app (opcional, para reuso)
 *   ANDROID_DRIVER_ACTIVITY    — Activity de la Driver app (opcional)
 *   ANDROID_PASSENGER_ACTIVITY — Activity de la Passenger app (opcional)
 *   ANDROID_DEVICE_NAME        — Nombre del dispositivo/emulador (ej: Pixel_7_API_34)
 *   ANDROID_PLATFORM_VERSION   — Versión de Android (ej: 14.0)
 */

export type MobileActor = 'driver' | 'passenger';

export type MobileActorConfig = {
	actor: MobileActor;
	appiumServerUrl: string;
	appiumBasePath: string;
	appPath: string;
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
	if (value === null) {
		return defaultValue;
	}
	return value === 'true' || value === '1';
}

function readOptionalNumberEnv(name: string, defaultValue: number): number {
	const value = readOptionalEnv(name);
	if (value === null) {
		return defaultValue;
	}

	const parsed = Number(value);
	if (Number.isNaN(parsed)) {
		throw new Error(`Invalid numeric environment variable: ${name}=${value}`);
	}

	return parsed;
}

function normalizeBasePath(rawPath: string | null): string {
	if (!rawPath || rawPath === '/') {
		return '/';
	}

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

function getActorScopedEnv(actor: MobileActor, name: string): string | null {
	const actorKey = actor.toUpperCase();
	return readOptionalEnv(`ANDROID_${actorKey}_${name}`) ?? readOptionalEnv(`ANDROID_${name}`);
}

function buildActorConfig(
	actor: MobileActor,
	appPathEnv: string,
	activityEnv: string
): MobileActorConfig {
	const appiumServerUrl = readRequiredEnv('APPIUM_SERVER_URL');

	return {
		actor,
		appiumServerUrl,
		appiumBasePath: resolveBasePathFromServerUrl(appiumServerUrl),
		appPath: readRequiredEnv(appPathEnv),
		appPackage: getActorScopedEnv(actor, 'APP_PACKAGE') ?? readOptionalEnv('ANDROID_APP_PACKAGE'),
		appActivity: readOptionalEnv(activityEnv),
		deviceName: readOptionalEnv('ANDROID_DEVICE_NAME') ?? 'Pixel_7',
		platformVersion: readOptionalEnv('ANDROID_PLATFORM_VERSION') ?? '15.0',
		udid: getActorScopedEnv(actor, 'UDID'),
		newCommandTimeout: readOptionalNumberEnv('APPIUM_NEW_COMMAND_TIMEOUT', 120),
		noReset: readOptionalBooleanEnv('APPIUM_NO_RESET', false),
		fullReset: readOptionalBooleanEnv('APPIUM_FULL_RESET', false),
	};
}

export function getDriverAppConfig(): MobileActorConfig {
	return {
		appiumServerUrl:  readRequiredEnv('APPIUM_SERVER_URL'),
		appPath:          readRequiredEnv('ANDROID_DRIVER_APP_PATH'),
		appPackage:       readOptionalEnv('ANDROID_APP_PACKAGE'),
		appActivity:      readOptionalEnv('ANDROID_DRIVER_ACTIVITY'),
		// Pixel_7 (Android 35) — emulador disponible en este equipo, más estable para Appium
		deviceName:       readOptionalEnv('ANDROID_DEVICE_NAME') ?? 'Pixel_7',
		platformVersion:  readOptionalEnv('ANDROID_PLATFORM_VERSION') ?? '15.0',
	};
}

export function getPassengerAppConfig(): MobileActorConfig {
	return {
		appiumServerUrl:  readRequiredEnv('APPIUM_SERVER_URL'),
		appPath:          readRequiredEnv('ANDROID_PASSENGER_APP_PATH'),
		appPackage:       readOptionalEnv('ANDROID_APP_PACKAGE'),
		appActivity:      readOptionalEnv('ANDROID_PASSENGER_ACTIVITY'),
		deviceName:       readOptionalEnv('ANDROID_DEVICE_NAME') ?? 'Pixel_7',
		platformVersion:  readOptionalEnv('ANDROID_PLATFORM_VERSION') ?? '15.0',
	};
}

/**
 * Capabilities base para Appium + Android.
 * Se usa como input para el cliente WebdriverIO.
 */
export function buildAndroidCapabilities(config: MobileActorConfig): Record<string, unknown> {
	return {
		platformName:           'Android',
		'appium:deviceName':    config.deviceName,
		'appium:platformVersion': config.platformVersion,
		'appium:app':           config.appPath,
		...(config.appPackage   ? { 'appium:appPackage':  config.appPackage }  : {}),
		...(config.appActivity  ? { 'appium:appActivity': config.appActivity } : {}),
		'appium:automationName':  'UiAutomator2',
		'appium:noReset':         false,
		'appium:fullReset':       false,
	};
}
