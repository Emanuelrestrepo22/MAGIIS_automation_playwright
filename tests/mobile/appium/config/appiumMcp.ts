import path from 'node:path';
import { buildAndroidCapabilities, getDriverAppConfig, getPassengerAppConfig, type MobileActor } from './appiumRuntime';

export type AppiumMcpServerEntry = {
	disabled: boolean;
	timeout: number;
	type: 'stdio';
	command: 'npx';
	args: string[];
	env: Record<string, string>;
};

export type AppiumMcpServerConfig = {
	mcpServers: Record<string, AppiumMcpServerEntry>;
};

function getActorConfig(actor: MobileActor) {
	return actor === 'driver' ? getDriverAppConfig() : getPassengerAppConfig();
}

function repoPath(...segments: string[]): string {
	return path.resolve(process.cwd(), ...segments);
}

export function getAppiumMcpCapabilitiesPath(actor: MobileActor): string {
	return repoPath('tests', 'mobile', 'appium', '.generated', `appium-mcp.${actor}.capabilities.json`);
}

export function getAppiumMcpServerConfigPath(actor: MobileActor): string {
	return repoPath('tests', 'mobile', 'appium', '.generated', `appium-mcp.${actor}.server.json`);
}

export function getAppiumMcpScreenshotsDir(actor: MobileActor): string {
	return repoPath('evidence', 'appium-mcp', actor);
}

export function buildAppiumMcpCapabilitiesConfig(actor: MobileActor): Record<string, unknown> {
	const config = getActorConfig(actor);

	return {
		android: buildAndroidCapabilities(config),
		general: {
			platformName: 'Android',
			'appium:automationName': 'UiAutomator2'
		}
	};
}

function buildMcpEnv(actor: MobileActor): Record<string, string> {
	const env: Record<string, string> = {
		ANDROID_HOME: process.env.ANDROID_HOME ?? 'SET_ANDROID_HOME',
		CAPABILITIES_CONFIG: getAppiumMcpCapabilitiesPath(actor),
		SCREENSHOTS_DIR: getAppiumMcpScreenshotsDir(actor),
		// `true` por defecto, a proposito. `NO_UI` invertido (`false`) HABILITA los componentes de UI
		// HTML del server: `mcp-apps.js` evalua `NO_UI !== 'true' && NO_UI !== '1'`. El README del
		// paquete recomienda `true` ("faster responses, fewer tokens") y su propio script de auditoria
		// lo fija en `true`. El default anterior era `false`, que es el valor NO recomendado, y quedo
		// como sospechoso principal de que los servers de appium no completaran el arranque bajo un
		// cliente MCP stdio (investigado 2026-08-14). Se puede volver a activar con APPIUM_MCP_NO_UI=false.
		NO_UI: process.env.APPIUM_MCP_NO_UI ?? 'true',
		// El paquete documenta este flag para clientes que "disconnect briefly (reconnect, reload,
		// proxy)": con `skip`, las sesiones sobreviven a una desconexion breve del cliente en vez de
		// que se caigan los drivers. Encaja con el server de driver, que aparecio y luego se reporto
		// `disconnected` en la sesion del 2026-08-14.
		APPIUM_MCP_ON_CLIENT_DISCONNECT: process.env.APPIUM_MCP_ON_CLIENT_DISCONNECT ?? 'skip'
	};

	const passthroughEnv = [
		'AI_VISION_API_BASE_URL',
		'AI_VISION_API_TOKEN',
		'AI_VISION_MODEL',
		'AI_VISION_COORD_TYPE',
		'AI_VISION_IMAGE_MAX_WIDTH',
		'AI_VISION_IMAGE_QUALITY',
		'REMOTE_SERVER_URL_ALLOW_REGEX'
	];

	for (const key of passthroughEnv) {
		const value = process.env[key];
		if (value) {
			env[key] = value;
		}
	}

	return env;
}

export function buildAppiumMcpServerConfig(actor: MobileActor): AppiumMcpServerConfig {
	const serverName = `appium-mcp-${actor}`;

	return {
		mcpServers: {
			[serverName]: {
				disabled: false,
				timeout: 100,
				type: 'stdio',
				command: 'npx',
				args: ['-y', 'appium-mcp@latest'],
				env: buildMcpEnv(actor)
			}
		}
	};
}
