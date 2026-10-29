/**
 * Observador NO INTRUSIVO de la Driver App — soporte para captura asistida (MG-117).
 *
 * Se adjunta a la app tal como está (noReset + forceAppLaunch:false), fotografía el estado y
 * se va. NO navega, NO tapea, NO escribe: el QA maneja el dispositivo y este script solo mira,
 * para que los selectores salgan del DOM real en vez de adivinarse.
 *
 * Reporta:
 *   - URL y contextos disponibles
 *   - todo input / ion-input VISIBLE con sus atributos identificatorios
 *   - listas y items de predicción (el autocompletado de MG-117)
 *   - botones visibles, para ubicar el CTA del paso siguiente
 *   - screenshot + volcado del DOM a evidence/dom-dumps/
 *
 * Uso:
 *   $env:ANDROID_UDID="R92XB0B8F3J"; $env:LABEL="paso-01"; npx ts-node --esm tests/mobile/appium/scripts/driver-observe.ts
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const APPIUM_URL = process.env.APPIUM_SERVER_URL ?? 'http://localhost:4723';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const APP_PACKAGE = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';
const LABEL = process.env.LABEL ?? 'observe';
const DUMP_HTML = process.env.DUMP_HTML === '1';

const log = (msg: string): void => console.log(`[observe] ${msg}`);

/** Shape returned by the in-page probe. Everything is plain data so it survives serialization. */
type PageSnapshot = {
	url: string;
	title: string;
	inputs: {
		tag: string;
		type: string;
		placeholder: string;
		id: string;
		className: string;
		name: string;
		value: string;
		visible: boolean;
	}[];
	predictionLists: { selector: string; itemCount: number; sample: string[] }[];
	buttons: { tag: string; text: string; id: string; className: string }[];
	componentTags: string[];
};

async function run(): Promise<void> {
	const appiumUrl = new URL(APPIUM_URL);
	const driver = await remote({
		protocol: appiumUrl.protocol.replace(':', '') as 'http' | 'https',
		hostname: appiumUrl.hostname,
		port: Number(appiumUrl.port) || 4723,
		path: '/',
		logLevel: 'error',
		connectionRetryTimeout: 60_000,
		capabilities: {
			platformName: 'Android',
			'appium:automationName': 'UiAutomator2',
			'appium:deviceName': 'SM-A055M',
			'appium:udid': UDID,
			'appium:appPackage': APP_PACKAGE,
			'appium:appActivity': '.MainActivity',
			// Attach to whatever is on screen. Both flags are what make this observer non-intrusive.
			'appium:noReset': true,
			'appium:forceAppLaunch': false,
			'appium:newCommandTimeout': 120,
			'appium:chromedriverAutodownload': true
		} as Record<string, unknown>
	});

	try {
		const contexts = (await driver.getContexts()) as string[];
		log(`Contextos: ${contexts.join(', ')}`);

		const webview = contexts.find(c => String(c).startsWith('WEBVIEW'));
		if (!webview) {
			log('Sin contexto WEBVIEW. La app puede estar en una pantalla nativa.');
			return;
		}

		await driver.switchContext(webview);

		const snapshot = (await driver.execute(() => {
			const isVisible = (el: Element): boolean => {
				const node = el as HTMLElement;
				if (node.offsetParent === null && getComputedStyle(node).position !== 'fixed') return false;
				const rect = node.getBoundingClientRect();
				return rect.width > 0 && rect.height > 0;
			};

			const text = (el: Element): string => (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);

			const inputs = Array.from(document.querySelectorAll('input, ion-input, ion-searchbar')).map(el => {
				const node = el as HTMLInputElement;
				// ion-input keeps the real <input> inside its shadow root.
				const inner = ((el as unknown as { shadowRoot?: ShadowRoot | null }).shadowRoot?.querySelector(
					'input'
				) ?? null) as HTMLInputElement | null;
				const target = inner ?? node;
				return {
					tag: el.tagName.toLowerCase(),
					type: String(target.type ?? ''),
					placeholder: String(target.placeholder ?? ''),
					id: String(el.id ?? ''),
					className: String((el as HTMLElement).className ?? ''),
					name: String(target.name ?? ''),
					value: String(target.value ?? ''),
					visible: isVisible(el)
				};
			});

			// The PAX app renders predictions as ion-list.prediction-list / ion-item.prediction-item.
			// The Driver app may differ, so probe several shapes and report whichever exists.
			const listSelectors = [
				'ion-list.prediction-list',
				'ion-item.prediction-item',
				'[class*="prediction"]',
				'[class*="autocomplete"]',
				'[class*="suggestion"]',
				'ion-list ion-item'
			];
			const predictionLists = listSelectors
				.map(selector => {
					const nodes = Array.from(document.querySelectorAll(selector));
					return { selector, itemCount: nodes.length, sample: nodes.slice(0, 4).map(text) };
				})
				.filter(entry => entry.itemCount > 0);

			// The Driver home renders its main actions as plain divs (`div.driver-pass.home-icon` is the
			// one that starts a street trip), so a button-only sweep would miss the entry point.
			const buttons = Array.from(
				document.querySelectorAll(
					'button, ion-button, [role="button"], div[class*="home-icon"], div[class*="driver-"]'
				)
			)
				.filter(isVisible)
				.slice(0, 25)
				.map(el => ({
					tag: el.tagName.toLowerCase(),
					text: text(el),
					id: String(el.id ?? ''),
					className: String((el as HTMLElement).className ?? '')
				}));

			// Angular component tags identify the current page far more reliably than the URL.
			const componentTags = Array.from(
				new Set(
					Array.from(document.querySelectorAll('*'))
						.map(el => el.tagName.toLowerCase())
						.filter(tag => tag.startsWith('app-') || tag.startsWith('page-'))
				)
			);

			return {
				url: window.location.href,
				title: document.title,
				inputs,
				predictionLists,
				buttons,
				componentTags
			};
		})) as PageSnapshot;

		log(`URL: ${snapshot.url}`);
		log(`Componentes Angular: ${snapshot.componentTags.join(', ') || '(ninguno)'}`);

		const visibleInputs = snapshot.inputs.filter(i => i.visible);
		log(`\n=== INPUTS VISIBLES (${visibleInputs.length} de ${snapshot.inputs.length}) ===`);
		for (const input of visibleInputs) {
			log(
				`  <${input.tag}> placeholder="${input.placeholder}" id="${input.id}" class="${input.className}" value="${input.value}"`
			);
		}

		log(`\n=== LISTAS DE PREDICCION ===`);
		if (snapshot.predictionLists.length === 0) {
			log('  (ninguna encontrada — el dropdown puede estar cerrado)');
		}
		for (const list of snapshot.predictionLists) {
			log(`  ${list.selector} -> ${list.itemCount} items`);
			for (const sample of list.sample) log(`      · ${sample}`);
		}

		log(`\n=== BOTONES VISIBLES ===`);
		for (const button of snapshot.buttons) {
			log(`  <${button.tag}> "${button.text}" class="${button.className}"`);
		}

		const outDir = path.resolve('evidence', 'dom-dumps');
		await mkdir(outDir, { recursive: true });
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		const base = path.join(outDir, `driver-${LABEL}-${stamp}`);

		await writeFile(`${base}.json`, JSON.stringify(snapshot, null, 2), 'utf8');
		log(`\nSnapshot -> ${base}.json`);

		if (DUMP_HTML) {
			const html = (await driver.execute(() => document.body.outerHTML)) as string;
			await writeFile(`${base}.html`, html, 'utf8');
			log(`DOM completo -> ${base}.html`);
		}

		await driver.switchContext('NATIVE_APP');
		await (driver as unknown as { saveScreenshot: (p: string) => Promise<unknown> }).saveScreenshot(`${base}.png`);
		log(`Screenshot -> ${base}.png`);
	} finally {
		await driver.deleteSession();
	}
}

run().catch((err: Error) => {
	console.error('[observe] Error:', err.message ?? err);
	process.exit(1);
});
