/**
 * DOM dump for the current TravelConfirmPage in the Driver App.
 *
 * Expected usage:
 *   $env:ANDROID_HOME="C:\Users\Erika\AppData\Local\Android\Sdk"
 *   $env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
 *   $env:APPIUM_SERVER_URL="http://localhost:4723"
 *   $env:ANDROID_UDID="R92XB0B8F3J"
 *   npx ts-node --esm tests/mobile/appium/scripts/dump-travel-confirm.ts
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { remote } from 'webdriverio';

type WebElementSummary = {
	tag: string;
	id: string;
	accessibilityId: string;
	text: string;
	className: string;
	role: string;
	visible: boolean;
};

type TravelConfirmWebDump = {
	url: string;
	elements: WebElementSummary[];
	highlights: WebElementSummary[];
	buttonTexts: string[];
	keywordMatches: string[];
	travelIdMatches: string[];
};

const APPIUM_URL = process.env.APPIUM_SERVER_URL ?? 'http://localhost:4723';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const DEVICE_NAME = process.env.ANDROID_DEVICE_NAME ?? 'SM-A055M';
const PLATFORM_VERSION = process.env.ANDROID_PLATFORM_VERSION ?? '15.0';
const APP_PACKAGE = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const APP_ACTIVITY = process.env.ANDROID_DRIVER_APP_ACTIVITY ?? '.MainActivity';
const TRAVEL_ID = process.env.TRAVEL_ID ?? '61542';
const TRAVEL_CONFIRM_URL = process.env.TRAVEL_CONFIRM_URL ?? '';
const OUTPUT_DIR = path.join(process.cwd(), 'evidence', 'dom-dump');

async function ensureOutputDir(): Promise<void> {
	await mkdir(OUTPUT_DIR, { recursive: true });
}

async function switchToWebView(driver: WebdriverIO.Browser): Promise<string | null> {
	const contexts = (await driver.getContexts()) as string[];
	console.log(`[dump-travel-confirm] Contexts: ${contexts.join(', ')}`);
	const webview = contexts.find(context => context.startsWith('WEBVIEW'));
	if (!webview) {
		console.warn('[dump-travel-confirm] No WEBVIEW context found');
		return null;
	}

	await driver.switchContext(webview);
	console.log(`[dump-travel-confirm] Switched to ${webview}`);
	return webview;
}

async function switchToNative(driver: WebdriverIO.Browser): Promise<void> {
	await driver.switchContext('NATIVE_APP');
	console.log('[dump-travel-confirm] Switched to NATIVE_APP');
}

async function collectWebDump(driver: WebdriverIO.Browser, travelId: string): Promise<TravelConfirmWebDump | null> {
	const switched = await switchToWebView(driver);
	if (!switched) {
		return null;
	}

	if (TRAVEL_CONFIRM_URL) {
		console.log(`[dump-travel-confirm] Navigating to ${TRAVEL_CONFIRM_URL}`);
		await driver.url(TRAVEL_CONFIRM_URL);
		await driver.pause(2_000);
	}

	const dump = await driver.execute((targetTravelId: string) => {
		const normalize = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();
		const isVisible = (element: Element): boolean => {
			const html = element as HTMLElement;
			const rect = html.getBoundingClientRect();
			const style = window.getComputedStyle(html);
			return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
		};
		const textOf = (element: Element): string => normalize((element as HTMLElement).innerText || element.textContent);
		const attrOf = (element: Element, name: string): string => normalize(element.getAttribute(name));

		const elements = Array.from(document.querySelectorAll('*')).map(element => {
			const html = element as HTMLElement;
			return {
				tag: html.tagName.toLowerCase(),
				id: normalize(html.id),
				accessibilityId: attrOf(html, 'aria-label') || attrOf(html, 'content-desc') || attrOf(html, 'data-testid'),
				text: textOf(html),
				className: normalize(typeof html.className === 'string' ? html.className : ''),
				role: attrOf(html, 'role'),
				visible: isVisible(html),
			};
		}).filter(item => item.id || item.accessibilityId || item.text || item.className || item.role);

		const focusTerms = [
			'iniciar',
			'cerrar',
			'finalizar',
			'viaje',
			'trip',
			'status',
			'state',
			targetTravelId,
		].map(term => term.toLowerCase());

		const highlights = elements.filter(item => {
			const haystacks = [item.id, item.accessibilityId, item.text, item.className, item.role]
				.map(value => value.toLowerCase());
			return focusTerms.some(term => haystacks.some(value => value.includes(term)));
		});

		const buttonTexts = Array.from(document.querySelectorAll('button, [role="button"], ion-button'))
			.map(textOf)
			.filter(Boolean);

		const keywordMatches = elements
			.filter(item => /iniciar|cerrar|finalizar|viaje|trip|status|state/i.test(`${item.id} ${item.accessibilityId} ${item.text} ${item.className} ${item.role}`))
			.map(item => `${item.tag} | id=${item.id} | aria=${item.accessibilityId} | text=${item.text} | class=${item.className} | role=${item.role} | visible=${item.visible}`);

		const travelIdMatches = elements
			.filter(item => [item.id, item.accessibilityId, item.text, item.className, item.role]
				.some(value => value.toLowerCase().includes(targetTravelId.toLowerCase())))
			.map(item => `${item.tag} | id=${item.id} | aria=${item.accessibilityId} | text=${item.text} | class=${item.className} | role=${item.role} | visible=${item.visible}`);

		return {
			url: window.location.href,
			elements,
			highlights,
			buttonTexts,
			keywordMatches,
			travelIdMatches,
		};
	}, travelId) as TravelConfirmWebDump;

	return dump;
}

async function collectNativeDump(driver: WebdriverIO.Browser): Promise<string> {
	await switchToNative(driver);
	const source = await driver.getPageSource();
	const lines = source.split('\n').filter((line: string) =>
		(line.includes('text="') || line.includes('content-desc="')) &&
		!line.includes('text=""') &&
		!line.includes('content-desc=""')
	);

	return [
		'=== NATIVE PAGE SOURCE (filtered) ===',
		...lines,
	].join('\n');
}

function formatWebDump(dump: TravelConfirmWebDump | null): string {
	if (!dump) {
		return [
			'=== WEBVIEW DUMP ===',
			'No WEBVIEW context found.',
		].join('\n');
	}

	const elementLines = dump.elements.map((item, index) =>
		`${String(index + 1).padStart(4, '0')} | tag=${item.tag} | visible=${item.visible} | id=${item.id} | aria=${item.accessibilityId} | text=${item.text} | class=${item.className} | role=${item.role}`
	);

	const highlightLines = dump.highlights.map(item =>
		`${item.tag} | id=${item.id} | aria=${item.accessibilityId} | text=${item.text} | class=${item.className} | role=${item.role} | visible=${item.visible}`
	);

	return [
		'=== WEBVIEW DUMP ===',
		`URL: ${dump.url}`,
		`Total elements: ${dump.elements.length}`,
		`Buttons: ${dump.buttonTexts.length ? dump.buttonTexts.join(' | ') : '(none)'}`,
		'',
		'--- TravelId Matches ---',
		dump.travelIdMatches.length ? dump.travelIdMatches.join('\n') : '(none)',
		'',
		'--- Keyword Matches ---',
		dump.keywordMatches.length ? dump.keywordMatches.join('\n') : '(none)',
		'',
		'--- Highlighted Elements ---',
		highlightLines.length ? highlightLines.join('\n') : '(none)',
		'',
		'--- All Elements ---',
		elementLines.join('\n'),
	].join('\n');
}

async function run(): Promise<void> {
	const appiumUrl = new URL(APPIUM_URL);
	console.log(`[dump-travel-confirm] Connecting to ${APPIUM_URL} | device=${DEVICE_NAME} | udid=${UDID} | travelId=${TRAVEL_ID}`);

	const driver = await remote({
		protocol: appiumUrl.protocol.replace(':', '') as 'http' | 'https',
		hostname: appiumUrl.hostname,
		port: Number(appiumUrl.port) || 4723,
		path: '/',
		logLevel: 'warn',
		connectionRetryTimeout: 60_000,
		connectionRetryCount: 2,
		capabilities: {
			platformName: 'Android',
			'appium:automationName': 'UiAutomator2',
			'appium:deviceName': DEVICE_NAME,
			'appium:platformVersion': PLATFORM_VERSION,
			'appium:udid': UDID,
			'appium:appPackage': APP_PACKAGE,
			'appium:appActivity': APP_ACTIVITY,
			'appium:noReset': true,
			'appium:forceAppLaunch': false,
			'appium:autoLaunch': false,
			'appium:newCommandTimeout': 120,
		} as Record<string, unknown>,
	});

	try {
		const webDump = await collectWebDump(driver, TRAVEL_ID);
		const nativeDump = await collectNativeDump(driver);
		await ensureOutputDir();

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const outputPath = path.join(OUTPUT_DIR, `travel-confirm-${timestamp}.txt`);
		const contents = [
			formatWebDump(webDump),
			'',
			nativeDump,
		].join('\n');

		await writeFile(outputPath, contents, 'utf-8');

		console.log(`\n${contents}\n`);
		console.log(`[dump-travel-confirm] Saved to ${outputPath}`);
	} finally {
		await driver.deleteSession();
	}
}

run().catch(error => {
	console.error('[dump-travel-confirm] Error:', error instanceof Error ? error.message : error);
	process.exit(1);
});
