import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const actor = process.argv[2];

if (actor === '--help' || actor === '-h' || !actor) {
  console.log([
    'Usage:',
    '  node tests/mobile/appium/scripts/generateAppiumMcpConfig.mjs <driver|passenger>',
    '',
    'Optional environment:',
    '  APP_ENV_FILE=.env.test',
    '  APPIUM_MCP_NO_UI=true',
  ].join('\n'));
  process.exit(0);
}

if (!['driver', 'passenger'].includes(actor)) {
  console.error(`Unsupported actor "${actor}". Use "driver" or "passenger".`);
  process.exit(1);
}

const repoRoot = process.cwd();
const envFile = process.env.APP_ENV_FILE || '.env.test';
dotenv.config({ path: path.resolve(repoRoot, envFile), override: true });

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name) {
  return process.env[name] || null;
}

function optionalBoolean(name, defaultValue) {
  const value = optionalEnv(name);
  if (value === null) {
    return defaultValue;
  }
  return value === 'true' || value === '1';
}

function optionalNumber(name, defaultValue) {
  const value = optionalEnv(name);
  if (value === null) {
    return defaultValue;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric environment variable: ${name}=${value}`);
  }
  return parsed;
}

function actorScopedEnv(baseName) {
  const upperActor = actor.toUpperCase();
  return optionalEnv(`ANDROID_${upperActor}_${baseName}`) || optionalEnv(`ANDROID_${baseName}`);
}

const generatedDir = path.resolve(repoRoot, 'tests', 'mobile', 'appium', '.generated');
const screenshotsDir = path.resolve(repoRoot, 'evidence', 'appium-mcp', actor);
fs.mkdirSync(generatedDir, { recursive: true });
fs.mkdirSync(screenshotsDir, { recursive: true });

const actorConfig = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  'appium:app': requiredEnv(actor === 'driver' ? 'ANDROID_DRIVER_APP_PATH' : 'ANDROID_PASSENGER_APP_PATH'),
  'appium:deviceName': optionalEnv('ANDROID_DEVICE_NAME') || 'Pixel_7',
  'appium:platformVersion': optionalEnv('ANDROID_PLATFORM_VERSION') || '15.0',
  'appium:newCommandTimeout': optionalNumber('APPIUM_NEW_COMMAND_TIMEOUT', 120),
  'appium:noReset': optionalBoolean('APPIUM_NO_RESET', false),
  'appium:fullReset': optionalBoolean('APPIUM_FULL_RESET', false),
};

const appPackage = actorScopedEnv('APP_PACKAGE') || optionalEnv('ANDROID_APP_PACKAGE');
const appActivity = optionalEnv(actor === 'driver' ? 'ANDROID_DRIVER_ACTIVITY' : 'ANDROID_PASSENGER_ACTIVITY');
const udid = actorScopedEnv('UDID');

if (appPackage) {
  actorConfig['appium:appPackage'] = appPackage;
}

if (appActivity) {
  actorConfig['appium:appActivity'] = appActivity;
}

if (udid) {
  actorConfig['appium:udid'] = udid;
}

const capabilitiesPath = path.resolve(generatedDir, `appium-mcp.${actor}.capabilities.json`);
const serverConfigPath = path.resolve(generatedDir, `appium-mcp.${actor}.server.json`);

const capabilitiesConfig = {
  android: actorConfig,
  general: {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
  },
};

const serverEnv = {
  ANDROID_HOME: requiredEnv('ANDROID_HOME'),
  CAPABILITIES_CONFIG: capabilitiesPath,
  SCREENSHOTS_DIR: screenshotsDir,
  NO_UI: process.env.APPIUM_MCP_NO_UI || 'false',
};

for (const key of [
  'AI_VISION_API_BASE_URL',
  'AI_VISION_API_TOKEN',
  'AI_VISION_MODEL',
  'AI_VISION_COORD_TYPE',
  'AI_VISION_IMAGE_MAX_WIDTH',
  'AI_VISION_IMAGE_QUALITY',
  'REMOTE_SERVER_URL_ALLOW_REGEX',
]) {
  if (process.env[key]) {
    serverEnv[key] = process.env[key];
  }
}

const serverConfig = {
  mcpServers: {
    [`appium-mcp-${actor}`]: {
      disabled: false,
      timeout: 100,
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'appium-mcp@latest'],
      env: serverEnv,
    },
  },
};

fs.writeFileSync(capabilitiesPath, `${JSON.stringify(capabilitiesConfig, null, 2)}\n`);
fs.writeFileSync(serverConfigPath, `${JSON.stringify(serverConfig, null, 2)}\n`);

console.log(`Generated Appium MCP capabilities: ${capabilitiesPath}`);
console.log(`Generated Appium MCP server config: ${serverConfigPath}`);
