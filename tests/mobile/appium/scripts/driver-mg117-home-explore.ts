/**
 * MG-117 — Descarta el modal bloqueante y mapea el HOME del driver.
 *
 * Con el driver del carrier argentino (Unity) el boton "Pasajero" devuelve "Funcion no disponible"
 * y el driver figura como "No Disponible". Este script no asume ningun selector: descarta la
 * alerta, vuelca el home y reporta los controles reales para decidir el camino de navegacion.
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe as describeTarget, resolveDriverTarget } from './_shared/resolveDriverTarget';

// El objetivo (ambiente + paquete) se resuelve desde ENV, no desde un literal: con el literal
// anterior `ENV=uat` era inerte y la corrida abria la app de TEST mientras el reporte decia UAT.
const TARGET = resolveDriverTarget('driver');
const APPIUM_URL = TARGET.appiumUrl;
const UDID = TARGET.udid;
const APP_PACKAGE = TARGET.appPackage;

const log = (m: string): void => console.log(`[home] ${m}`);

const DISMISS = `
	return (function () {
		var vis = function (el) { return el.offsetParent !== null; };
		var btns = Array.prototype.slice.call(
			document.querySelectorAll('app-alert-modal button, ion-alert button, button.btn-outlined-red, ion-modal button')
		).filter(vis);
		var hit = btns.filter(function (b) { return /aceptar|ok|cerrar|entendido/i.test(b.textContent || ''); })[0] || btns[0];
		if (!hit) return { clicked: false, text: '' };
		hit.click();
		return { clicked: true, text: (hit.textContent || '').trim() };
	})();`;

const ALERT_TEXT = `
	return (function () {
		var vis = function (el) { return el.offsetParent !== null; };
		var mods = Array.prototype.slice.call(
			document.querySelectorAll('app-alert-modal, ion-alert, ion-modal.show-modal')
		).filter(vis);
		if (!mods.length) return { present: false, text: '' };
		return { present: true, text: (mods[0].textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 200) };
	})();`;

/** Rect del botón de la alerta, para tap NATIVO: en Ionic un `el.click()` no dispara el handler. */
const ALERT_BTN_RECT = `
	return (function () {
		var vis = function (el) { return el.offsetParent !== null; };
		var btns = Array.prototype.slice.call(
			document.querySelectorAll('app-alert-modal button, ion-alert button, button.btn-outlined-red, ion-modal button')
		).filter(vis);
		var hit = btns.filter(function (b) { return /aceptar|ok|cerrar|entendido/i.test(b.textContent || ''); })[0] || btns[0];
		if (!hit) return null;
		var r = hit.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2, vw: window.innerWidth, vh: window.innerHeight };
	})();`;

/** Mapea un punto del WebView sobre las coordenadas NATIVAS del propio WebView y tapea ahí. */
async function tapNative(driver: WebdriverIO.Browser, webview: string, script: string): Promise<boolean> {
	const rect = (await driver.execute(script).catch(() => null)) as
		| { x: number; y: number; vw: number; vh: number }
		| null;
	if (!rect) return false;

	await driver.switchContext('NATIVE_APP');
	try {
		let ox = 0;
		let oy = 0;
		let sw = 0;
		let sh = 0;
		try {
			const wv = (await driver.$('//android.webkit.WebView')) as unknown as {
				getLocation: () => Promise<{ x: number; y: number }>;
				getSize: () => Promise<{ width: number; height: number }>;
			};
			const loc = await wv.getLocation();
			const sz = await wv.getSize();
			ox = loc.x;
			oy = loc.y;
			sw = sz.width;
			sh = sz.height;
		} catch {
			sw = 0;
		}
		if (!sw || !sh) {
			const size = await driver.getWindowSize();
			sw = size.width;
			sh = size.height;
		}

		const x = Math.round(ox + rect.x * (sw / rect.vw));
		const y = Math.round(oy + rect.y * (sh / rect.vh));
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

const HOME_DUMP = `
	return (function () {
		var out = { url: window.location.href, page: null, controls: [], texts: [] };
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

		var sel = 'button, ion-button, ion-toggle, ion-item, ion-card, ion-icon, [class*="icon"], [class*="btn"], [class*="status"], [class*="available"], [class*="disponib"], [role="button"], [class*="home"], [class*="driver"]';
		Array.prototype.slice.call(root.querySelectorAll(sel)).filter(onScreen).forEach(function (el) {
			var r = el.getBoundingClientRect();
			out.controls.push({
				desc: describe(el),
				text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 50),
				top: Math.round(r.top), left: Math.round(r.left), h: Math.round(r.height), w: Math.round(r.width)
			});
		});

		Array.prototype.slice.call(root.querySelectorAll('*')).filter(onScreen).forEach(function (el) {
			var own = '';
			for (var i = 0; i < el.childNodes.length; i++) {
				if (el.childNodes[i].nodeType === 3) own += el.childNodes[i].nodeValue;
			}
			own = own.trim();
			if (own && own.length > 1 && own.length < 60) {
				var r = el.getBoundingClientRect();
				out.texts.push({ text: own, desc: describe(el), top: Math.round(r.top) });
			}
		});

		return out;
	})();`;

async function run(): Promise<void> {
	const u = new URL(APPIUM_URL);
	const driver = await remote({
		protocol: u.protocol.replace(':', '') as 'http' | 'https',
		hostname: u.hostname,
		port: Number(u.port || 4723),
		path: u.pathname === '/' ? '/' : u.pathname,
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
		await driver.switchContext(webview);

		const before = (await driver.execute(ALERT_TEXT)) as { present: boolean; text: string };
		log(`alerta presente: ${before.present}`);
		if (before.present) log(`  texto: "${before.text}"`);

		for (let i = 0; i < 4; i++) {
			const st = (await driver.execute(ALERT_TEXT)) as { present: boolean };
			if (!st.present) break;
			// Primero el camino barato (DOM); si el modal sigue ahí, tap NATIVO.
			const d = (await driver.execute(DISMISS)) as { clicked: boolean; text: string };
			await driver.pause(900);
			const still = (await driver.execute(ALERT_TEXT)) as { present: boolean };
			if (still.present) {
				const tapped = await tapNative(driver, webview, ALERT_BTN_RECT);
				log(`  descarte ${i + 1}: DOM=${d.clicked} ("${d.text}") · tap nativo=${tapped}`);
				await driver.pause(1200);
			} else {
				log(`  descarte ${i + 1}: cerrado por DOM ("${d.text}")`);
			}
		}

		const after = (await driver.execute(ALERT_TEXT)) as { present: boolean };
		log(`alerta tras descartar: ${after.present}`);

		const dump = (await driver.execute(HOME_DUMP)) as {
			url: string;
			page: string;
			controls: Array<{ desc: string; text: string; top: number; left: number; h: number; w: number }>;
			texts: Array<{ text: string; desc: string; top: number }>;
		};

		log(`\nurl: ${dump.url}`);
		log(`página: ${dump.page}`);

		log(`\n=== TEXTOS EN PANTALLA ===`);
		for (const t of dump.texts.slice(0, 25)) log(`  top=${String(t.top).padStart(4)}  "${t.text}"   ${t.desc.slice(0, 60)}`);

		log(`\n=== CONTROLES (${dump.controls.length}) ===`);
		for (const c of dump.controls.slice(0, 45)) {
			log(`  top=${String(c.top).padStart(4)} left=${String(c.left).padStart(4)} ${c.w}x${c.h}  ${c.desc.slice(0, 70)}`);
			if (c.text) log(`        "${c.text}"`);
		}

		const dir = path.resolve(process.cwd(), 'evidence', 'dom-dump');
		await mkdir(dir, { recursive: true });
		const f = path.join(dir, `mg117-home-ar-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
		await writeFile(f, JSON.stringify({ alert: before, dump }, null, 2), 'utf8');
		log(`\nvolcado: ${path.relative(process.cwd(), f)}`);
	} finally {
		await driver.deleteSession().catch(() => undefined);
	}
}

run().catch(e => {
	console.error('[home] fallo:', e);
	process.exitCode = 1;
});
