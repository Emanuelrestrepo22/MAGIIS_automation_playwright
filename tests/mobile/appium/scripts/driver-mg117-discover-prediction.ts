/**
 * MG-117 — Descubre el selector real de una fila de predicción en la App Driver.
 *
 * El tap nativo de `driver-mg117-remaining.ts` falla porque `ion-item.prediction-item` viene de
 * la App PAX. Este script no asume ninguna clase: tipea un término, espera las predicciones y
 * vuelca el DOM real de la página visible para que el selector se escriba con evidencia.
 *
 * PRECONDICIÓN: viaje en curso. El script navega solo hasta el buscador desde ahí.
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe as describeTarget, resolveDriverTarget } from './_shared/resolveDriverTarget';
import {
	installWebViewNetworkCapture,
	clearWebViewNetworkCapture,
	readWebViewNetworkCapture
} from '../helpers/webViewNetworkCapture';

// El objetivo (ambiente + paquete) se resuelve desde ENV, no desde un literal: con el literal
// anterior `ENV=uat` era inerte y la corrida abria la app de TEST mientras el reporte decia UAT.
const TARGET = resolveDriverTarget('driver');
const APPIUM_URL = TARGET.appiumUrl;
const UDID = TARGET.udid;
const APP_PACKAGE = TARGET.appPackage;
const TERM = process.env.DISCOVER_TERM ?? 'caza';

const log = (msg: string): void => console.log(`[discover] ${msg}`);

async function currentUrl(driver: WebdriverIO.Browser): Promise<string> {
	return ((await driver.execute(() => window.location.href).catch(() => '')) as string) ?? '';
}

async function hasSearchField(driver: WebdriverIO.Browser): Promise<boolean> {
	return (await driver.execute(() => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		return Array.from(document.querySelectorAll('input'))
			.filter(visible)
			.some(el => !(el as HTMLInputElement).readOnly);
	})) as boolean;
}

async function tapNative(driver: WebdriverIO.Browser, webview: string, script: string): Promise<boolean> {
	const rect = (await driver.execute(script).catch(() => null)) as {
		x: number;
		y: number;
		vw: number;
		vh: number;
	} | null;
	if (!rect) return false;

	await driver.switchContext('NATIVE_APP');
	try {
		const size = await driver.getWindowSize();
		const x = Math.round(rect.x * (size.width / rect.vw));
		const y = Math.round(rect.y * (size.height / rect.vh));
		await driver.performActions([
			{
				type: 'pointer',
				id: 'finger1',
				parameters: { pointerType: 'touch' },
				actions: [
					{ type: 'pointerMove', duration: 0, x, y },
					{ type: 'pointerDown', button: 0 },
					{ type: 'pause', duration: 120 },
					{ type: 'pointerUp', button: 0 }
				]
			}
		]);
		await driver.releaseActions().catch(() => undefined);
	} finally {
		await driver.switchContext(webview);
	}
	return true;
}

const rectOfSelector = (sel: string): string => `
	return (function () {
		var onScreen = function (el) {
			var r = el.getBoundingClientRect();
			return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
		};
		var active = Array.prototype.slice.call(document.querySelectorAll('.ion-page:not(.ion-page-hidden) ${sel}')).filter(onScreen);
		var all = active.length ? active : Array.prototype.slice.call(document.querySelectorAll('${sel}')).filter(onScreen);
		var el = all[all.length - 1];
		if (!el) return null;
		var r = el.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2, vw: window.innerWidth, vh: window.innerHeight };
	})();`;

async function navigateToSearch(driver: WebdriverIO.Browser, webview: string): Promise<boolean> {
	for (let i = 1; i <= 10; i++) {
		if (await hasSearchField(driver)) return true;
		const url = await currentUrl(driver);
		log(`  intento ${i} · url=${url.slice(-60)}`);

		if (url.includes('TravelInProgress')) {
			const rows = (await driver.execute(() => {
				const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				return Array.from(document.querySelectorAll('input'))
					.filter(visible)
					.filter(el => (el as HTMLInputElement).readOnly).length;
			})) as number;

			if (rows > 0) {
				await driver.execute(() => {
					const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
					const ro = Array.from(document.querySelectorAll('input'))
						.filter(visible)
						.filter(el => (el as HTMLInputElement).readOnly) as HTMLInputElement[];
					const t = ro[ro.length - 1];
					if (!t) return;
					t.focus();
					t.dispatchEvent(new Event('ionFocus', { bubbles: true, composed: true } as EventInit));
					t.click();
				});
			} else {
				await tapNative(driver, webview, rectOfSelector('div.edit.action-container'));
			}
		} else if (url.includes('home')) {
			await driver.execute(() => {
				const nodes = Array.from(document.querySelectorAll('div.driver-pass.home-icon')) as HTMLElement[];
				nodes.find(n => n.offsetParent !== null)?.click();
			});
			await driver.pause(1400);
			await driver.execute(() => {
				const nodes = Array.from(
					document.querySelectorAll('app-confirm-modal button.btn.primary')
				) as HTMLElement[];
				nodes.find(n => n.offsetParent !== null)?.click();
			});
		}
		await driver.pause(2400);
	}
	return false;
}

async function setValue(driver: WebdriverIO.Browser, value: string): Promise<void> {
	await driver.execute((v: string) => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const t = Array.from(document.querySelectorAll('input'))
			.filter(visible)
			.find(el => !(el as HTMLInputElement).readOnly) as HTMLInputElement | undefined;
		if (!t) return;
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
		setter?.call(t, v);
		t.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
		t.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
	}, value);
}

/**
 * Walks the visible page and reports every element whose own text matches a prediction string,
 * together with its ancestor chain. No class name is assumed anywhere.
 */
const DUMP_SCRIPT = `
	return (function () {
		var out = { page: null, matches: [], listContainers: [], allClasses: [] };

		var pages = Array.prototype.slice.call(document.querySelectorAll('.ion-page:not(.ion-page-hidden)'));
		var root = pages.length ? pages[pages.length - 1] : document.body;
		out.page = root.tagName + '.' + String(root.className || '').trim();

		var onScreen = function (el) {
			var r = el.getBoundingClientRect();
			return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
		};
		var describe = function (el) {
			var id = el.id ? '#' + el.id : '';
			var cls = String(el.className || '').trim();
			cls = cls ? '.' + cls.split(/\\s+/).join('.') : '';
			return el.tagName.toLowerCase() + id + cls;
		};
		var chain = function (el) {
			var parts = [], n = el, hops = 0;
			while (n && hops < 6) { parts.push(describe(n)); n = n.parentElement; hops++; }
			return parts.join('  <  ');
		};

		// Leaf elements holding prediction-ish text, on screen.
        var all = Array.prototype.slice.call(root.querySelectorAll('*')).filter(onScreen);
		all.forEach(function (el) {
			var own = '';
			for (var i = 0; i < el.childNodes.length; i++) {
				if (el.childNodes[i].nodeType === 3) own += el.childNodes[i].nodeValue;
			}
			own = own.trim();
			if (!own || own.length < 3 || own.length > 120) return;
			var r = el.getBoundingClientRect();
			out.matches.push({ text: own, desc: describe(el), chain: chain(el), top: Math.round(r.top), h: Math.round(r.height) });
		});

		// Any element with 2+ same-tag siblings that look like a repeated row => candidate list.
		all.forEach(function (el) {
			var kids = Array.prototype.slice.call(el.children).filter(onScreen);
			if (kids.length < 2) return;
			var tags = {};
			kids.forEach(function (k) { tags[k.tagName] = (tags[k.tagName] || 0) + 1; });
			var top = Object.keys(tags).sort(function (a, b) { return tags[b] - tags[a]; })[0];
			if (tags[top] < 2) return;
			out.listContainers.push({
				container: describe(el),
				rowTag: top,
				rowCount: tags[top],
				rowSample: describe(kids.filter(function (k) { return k.tagName === top; })[0]),
				text: (kids[0].textContent || '').trim().slice(0, 60)
			});
		});

		// Every distinct class present on screen, for grep-ability.
		var seen = {};
		all.forEach(function (el) {
			String(el.className || '').trim().split(/\\s+/).forEach(function (c) { if (c) seen[c] = 1; });
		});
		out.allClasses = Object.keys(seen).sort();

		return out;
	})();`;

/** Dumps the current screen when navigation stalls, so the real control can be identified. */
const STUCK_SCRIPT = `
	return (function () {
		var out = { url: window.location.href, page: null, clickables: [], inputs: [] };

		var pages = Array.prototype.slice.call(document.querySelectorAll('.ion-page:not(.ion-page-hidden)'));
		var root = pages.length ? pages[pages.length - 1] : document.body;
		out.page = root.tagName + '.' + String(root.className || '').trim();

		var onScreen = function (el) {
			var r = el.getBoundingClientRect();
			return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
		};
		var describe = function (el) {
			var id = el.id ? '#' + el.id : '';
			var cls = String(el.className || '').trim();
			cls = cls ? '.' + cls.split(/\\s+/).join('.') : '';
			return el.tagName.toLowerCase() + id + cls;
		};

		Array.prototype.slice.call(root.querySelectorAll('input')).filter(onScreen).forEach(function (el) {
			var r = el.getBoundingClientRect();
			out.inputs.push({
				desc: describe(el), readOnly: !!el.readOnly,
				value: el.value || '', placeholder: el.placeholder || '', top: Math.round(r.top)
			});
		});

		var sel = 'ion-button, button, ion-item, ion-icon, [class*="edit"], [class*="action"], [class*="btn"], [role="button"], a';
		Array.prototype.slice.call(root.querySelectorAll(sel)).filter(onScreen).forEach(function (el) {
			var r = el.getBoundingClientRect();
			out.clickables.push({
				desc: describe(el),
				text: (el.textContent || '').trim().replace(/\\s+/g, ' '),
				top: Math.round(r.top), h: Math.round(r.height)
			});
		});

		return out;
	})();`;

async function run(): Promise<void> {
	const appiumUrl = new URL(APPIUM_URL);
	const driver = await remote({
		protocol: appiumUrl.protocol.replace(':', '') as 'http' | 'https',
		hostname: appiumUrl.hostname,
		port: Number(appiumUrl.port || 4723),
		path: appiumUrl.pathname === '/' ? '/' : appiumUrl.pathname,
		logLevel: 'error',
		capabilities: {
			platformName: 'Android',
			'appium:automationName': 'UiAutomator2',
			'appium:udid': UDID,
			'appium:appPackage': APP_PACKAGE,
			'appium:noReset': true,
			'appium:forceAppLaunch': false,
			'appium:newCommandTimeout': 300
		}
	});

	try {
		const contexts = (await driver.getContexts()) as string[];
		const webview = contexts.find(c => String(c).includes('WEBVIEW')) ?? 'NATIVE_APP';
		log(`contexto: ${webview}`);
		await driver.switchContext(webview);

		await installWebViewNetworkCapture(driver);

		log('navegando al buscador…');
		if (!(await navigateToSearch(driver, webview))) {
			log('NO se alcanzó el buscador — vuelco la pantalla actual para encontrar el control\n');

			const stuck = (await driver.execute(STUCK_SCRIPT)) as {
				url: string;
				page: string;
				clickables: Array<{ desc: string; text: string; top: number; h: number }>;
				inputs: Array<{ desc: string; readOnly: boolean; value: string; placeholder: string; top: number }>;
			};

			log(`url: ${stuck.url}`);
			log(`página visible: ${stuck.page}`);

			log(`\n=== INPUTS EN PANTALLA (${stuck.inputs.length}) ===`);
			for (const i of stuck.inputs) {
				log(`  ${i.desc}  readOnly=${i.readOnly}  top=${i.top}`);
				log(`     value="${i.value.slice(0, 45)}"  placeholder="${i.placeholder}"`);
			}

			log(`\n=== ELEMENTOS CLICKEABLES / CON TEXTO (${stuck.clickables.length}) ===`);
			for (const c of stuck.clickables.slice(0, 40)) {
				log(`  top=${String(c.top).padStart(4)} h=${String(c.h).padStart(3)}  ${c.desc}`);
				if (c.text) log(`         "${c.text.slice(0, 55)}"`);
			}

			const dir = path.resolve(process.cwd(), 'evidence', 'dom-dump');
			await mkdir(dir, { recursive: true });
			const f = path.join(dir, `mg117-stuck-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
			await writeFile(f, JSON.stringify(stuck, null, 2), 'utf8');
			log(`\nvolcado: ${path.relative(process.cwd(), f)}`);
			return;
		}
		log('buscador alcanzado');

		await clearWebViewNetworkCapture(driver);
		await setValue(driver, '');
		await driver.pause(700);
		await setValue(driver, TERM);
		await driver.pause(3500);

		const capture = await readWebViewNetworkCapture(driver);
		const calls = capture.entries.filter(e => String(e.url).includes('places/autocomplete'));
		const last = calls[calls.length - 1];
		let predictions: Array<{ mainText: string }> = [];
		try {
			predictions = JSON.parse(String(last?.responseBody ?? '[]'));
		} catch {
			predictions = [];
		}
		log(`término "${TERM}" → ${predictions.length} predicciones en la respuesta`);
		for (const p of predictions.slice(0, 5)) log(`    · ${p.mainText}`);

		const dump = (await driver.execute(DUMP_SCRIPT)) as {
			page: string;
			matches: Array<{ text: string; desc: string; chain: string; top: number; h: number }>;
			listContainers: Array<{
				container: string;
				rowTag: string;
				rowCount: number;
				rowSample: string;
				text: string;
			}>;
			allClasses: string[];
		};

		log(`\npágina visible: ${dump.page}`);

		const texts = predictions.map(p => p.mainText.toLowerCase());
		const hits = dump.matches.filter(m => texts.some(t => m.text.toLowerCase().includes(t.slice(0, 12))));

		log(`\n=== ELEMENTOS QUE CONTIENEN TEXTO DE PREDICCIÓN (${hits.length}) ===`);
		for (const h of hits.slice(0, 10)) {
			log(`  "${h.text.slice(0, 45)}"  top=${h.top} h=${h.h}`);
			log(`     ${h.chain}`);
		}

		log(`\n=== CONTENEDORES CON FILAS REPETIDAS ===`);
		for (const c of dump.listContainers.slice(0, 12)) {
			log(`  ${c.container}`);
			log(`     ${c.rowCount} × ${c.rowSample}   "${c.text}"`);
		}

		log(`\n=== CLASES EN PANTALLA CON "pred" / "list" / "item" / "auto" ===`);
		log('  ' + dump.allClasses.filter(c => /pred|list|item|auto|result|suggest/i.test(c)).join(', '));

		const dir = path.resolve(process.cwd(), 'evidence', 'network-capture');
		await mkdir(dir, { recursive: true });
		const file = path.join(dir, `mg117-discover-prediction-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
		await writeFile(file, JSON.stringify({ term: TERM, predictions, dump }, null, 2), 'utf8');
		log(`\nevidencia: ${path.relative(process.cwd(), file)}`);
	} finally {
		await driver.deleteSession().catch(() => undefined);
	}
}

run().catch(err => {
	console.error('[discover] fallo:', err);
	process.exitCode = 1;
});
