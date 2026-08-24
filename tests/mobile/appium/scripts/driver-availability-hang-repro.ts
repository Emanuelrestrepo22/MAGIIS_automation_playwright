/**
 * Reproduccion controlada: ¿el toggle de DISPONIBILIDAD deja al driver bloqueado?
 *
 * Observado en device: tras tocar el toggle, el boton quedo deshabilitado, el icono desaparecio y
 * la UI dejo de responder hasta reiniciar la app.
 *
 * Lectura de codigo (magiis-mobile-driver-v2@develop, sin reproducir):
 *   - home.page.ts:1085 toggleAvailability() enciende `updatingState` (1087-1088) y lo apaga en TRES
 *     ramas separadas (1121, 1127, 1133). No hay `finally`.
 *   - `await sendDriverReportLocation()` (1108) queda ENTRE prender y apagar, sin proteccion.
 *   - `setStatusService(...)` no se awaitea: la liberacion queda en una promesa flotante.
 *   - connection.service.ts aplica `.pipe(timeout(75000))`; al pasar a ONLINE son DOS HTTP
 *     secuenciales -> hasta ~150 s de boton muerto.
 *   - home.page.ts:901-904 getAppStatus() reintenta a si mismo en el `.catch`, SIN backoff ni tope,
 *     y vuelve a llamar toggleAvailability() (723) -> re-prende `updatingState` en cada vuelta.
 *
 * ESTE SCRIPT MIDE, NO CONCLUYE. Registra: estado del boton, presencia del icono, el flag real del
 * componente Angular si es legible, y todas las llamadas HTTP con su duracion y status. Si el
 * bloqueo NO se reproduce, tambien es un resultado y queda registrado como tal.
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	installWebViewNetworkCapture,
	clearWebViewNetworkCapture,
	readWebViewNetworkCapture,
	installWebViewFaultInjection,
	clearWebViewFaultInjection,
	readWebViewFaultInjectionState,
	type WebViewFaultInjectionMode
} from '../helpers/webViewNetworkCapture';

const APPIUM_URL = process.env.APPIUM_SERVER_URL ?? 'http://localhost:4723';
const UDID = process.env.ANDROID_UDID ?? 'R92XB0B8F3J';
const APP_PACKAGE = process.env.ANDROID_DRIVER_APP_PACKAGE ?? 'com.magiis.app.test.driver';
/** Cuanto observar tras el tap. Por encima de los 75 s del timeout HTTP, y del doble (~150 s). */
const WATCH_MS = Number(process.env.HANG_WATCH_MS ?? 200_000);
const POLL_MS = 2_000;

/**
 * Modo degradado opcional: inyecta un fallo sobre un endpoint ANTES del tap.
 *   INJECT_PATTERN  substring de la URL a fallar (p. ej. 'setFromAppDriverStatus')
 *   INJECT_MODE     status | timeout | networkError   (default: status)
 *   INJECT_STATUS   codigo para mode=status           (default: 503)
 *   INJECT_TIMES    cuantos matches; '0' = ilimitado  (default: 1)
 * Sin INJECT_PATTERN el script corre exactamente igual que antes (camino sano).
 */
const INJECT_PATTERN = process.env.INJECT_PATTERN ?? '';
const INJECT_MODE = (process.env.INJECT_MODE ?? 'status') as WebViewFaultInjectionMode;
const INJECT_STATUS = Number(process.env.INJECT_STATUS ?? 503);
const INJECT_TIMES = Number(process.env.INJECT_TIMES ?? 1);

const log = (m: string): void => console.log(`[hang] ${m}`);

/**
 * Estado observable del control de disponibilidad, sin asumir nada del componente.
 *
 * GOTCHA medido en device: Ionic mantiene montadas las páginas anteriores, así que puede haber
 * MÁS de un button#availability en el documento — y el primero por orden de DOM puede ser una
 * instancia VIEJA y oculta (label desactualizado, rect 0x0). Siempre se elige la instancia con
 * rect visible, nunca la primera a secas.
 */
const STATE = `
	return (function () {
		var onScreen = function (el) {
			var r = el.getBoundingClientRect();
			return r.width > 0 && r.height > 0;
		};
		var pick = function (sel) {
			var all = Array.prototype.slice.call(document.querySelectorAll(sel));
			var alive = all.filter(onScreen);
			return { el: alive[alive.length - 1] || null, instances: all.length, visibles: alive.length };
		};
		var b = pick('button#availability');
		var btn = b.el;
		var l = pick('span.available-label');
		var label = l.el;
		var vis = function (el) { return el ? onScreen(el) : false; };
		var root = document.querySelector('.ion-page:not(.ion-page-hidden)');

		var iconCount = btn ? btn.querySelectorAll('img').length : -1;
		var spinner = document.querySelectorAll('ion-spinner').length;

		// pointer-events:none en el contenedor deja TODO el home sin respuesta al toque.
		var pe = '';
		try {
			var host = document.querySelector('div.driver-base') || root;
			pe = host ? window.getComputedStyle(host).pointerEvents : '';
		} catch (e) { pe = 'error'; }

		// El flag del componente, si Angular lo expone en runtime.
		var updatingState = null;
		try {
			if (window.ng && root) {
				var cmp = window.ng.getComponent(document.querySelector('page-home') || root);
				if (cmp && typeof cmp.updatingState !== 'undefined') updatingState = !!cmp.updatingState;
			}
		} catch (e) { updatingState = 'error'; }

		return {
			present: !!btn,
			instances: b.instances,
			visibles: b.visibles,
			disabled: btn ? (btn.disabled || btn.getAttribute('disabled') !== null) : null,
			icons: iconCount,
			label: label ? (label.textContent || '').trim() : '',
			spinners: spinner,
			pointerEvents: pe,
			updatingState: updatingState,
			visible: btn ? vis(btn) : false
		};
	})();`;

const BTN_RECT = `
	return (function () {
		var all = Array.prototype.slice.call(document.querySelectorAll('button#availability'));
		var alive = all.filter(function (el) {
			var r = el.getBoundingClientRect();
			return r.width > 0 && r.height > 0;
		});
		var btn = alive[alive.length - 1];
		if (!btn) return null;
		var r = btn.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2, vw: window.innerWidth, vh: window.innerHeight };
	})();`;

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

type Sample = {
	tMs: number;
	disabled: boolean | null;
	icons: number;
	label: string;
	spinners: number;
	pointerEvents: string;
	updatingState: unknown;
};

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
			'appium:newCommandTimeout': 600
		}
	});

	const samples: Sample[] = [];

	try {
		const contexts = (await driver.getContexts()) as string[];
		const webview = contexts.find(c => String(c).includes('WEBVIEW')) ?? 'NATIVE_APP';
		await driver.switchContext(webview);
		await installWebViewNetworkCapture(driver);
		await clearWebViewNetworkCapture(driver);

		if (INJECT_PATTERN) {
			await installWebViewFaultInjection(driver, [
				{
					id: 'availability-hang-probe',
					urlPattern: INJECT_PATTERN,
					mode: INJECT_MODE,
					status: INJECT_STATUS,
					body: JSON.stringify({ injected: true, reason: 'availability hang probe' }),
					...(INJECT_TIMES > 0 ? { times: INJECT_TIMES } : {})
				}
			]);
			log(`INYECCION ACTIVA: ${INJECT_MODE}${INJECT_MODE === 'status' ? ` ${INJECT_STATUS}` : ''} sobre "${INJECT_PATTERN}" (times=${INJECT_TIMES > 0 ? INJECT_TIMES : 'ilimitado'})`);
		}

		const before = (await driver.execute(STATE)) as Sample & { present: boolean; visible: boolean };
		log(`estado ANTES: presente=${before.present} visible=${before.visible} disabled=${before.disabled} iconos=${before.icons} label="${before.label}" pointerEvents=${before.pointerEvents} updatingState=${String(before.updatingState)}`);

		if (!before.present) {
			log('ABORTA: no se encontró button#availability en el home.');
			return;
		}

		log('tocando el control de disponibilidad…');
		const tapped = await tapNative(driver, webview, BTN_RECT);
		log(`tap nativo: ${tapped}`);
		const t0 = Date.now();

		let released = false;
		let releasedAt = -1;
		while (Date.now() - t0 < WATCH_MS) {
			const s = (await driver.execute(STATE).catch(() => null)) as (Sample & { present: boolean }) | null;
			const tMs = Date.now() - t0;
			if (!s) {
				log(`  t=${(tMs / 1000).toFixed(1)}s  (el WebView no respondió — señal de hilo saturado)`);
				samples.push({ tMs, disabled: null, icons: -1, label: 'sin-respuesta', spinners: -1, pointerEvents: '', updatingState: 'sin-respuesta' });
			} else {
				samples.push({ tMs, disabled: s.disabled, icons: s.icons, label: s.label, spinners: s.spinners, pointerEvents: s.pointerEvents, updatingState: s.updatingState });
				log(`  t=${(tMs / 1000).toFixed(1).padStart(5)}s  disabled=${String(s.disabled).padEnd(5)} iconos=${s.icons} label="${s.label}" pe=${s.pointerEvents} updatingState=${String(s.updatingState)}`);
				// Liberado = el botón vuelve a estar habilitado Y el ícono reaparece.
				if (!released && s.disabled === false && s.icons > 0) {
					released = true;
					releasedAt = tMs;
					log(`  >>> LIBERADO a los ${(tMs / 1000).toFixed(1)}s`);
					// Se sigue observando un poco más por si vuelve a bloquearse (bucle de reintento).
					if (tMs > 20_000) break;
				}
			}
			await new Promise(r => setTimeout(r, POLL_MS));
		}

		const capture = await readWebViewNetworkCapture(driver).catch(() => ({ entries: [] as unknown[] }));
		const entries = (capture.entries ?? []) as Array<Record<string, unknown>>;

		log(`\n=== HTTP durante la observación (${entries.length}) ===`);
		const byUrl: Record<string, number> = {};
		for (const e of entries) {
			const url = String(e.url ?? '');
			const short = url.split('?')[0].split('/').slice(-2).join('/');
			byUrl[short] = (byUrl[short] ?? 0) + 1;
			log(`  ${String(e.status ?? '-').padStart(3)}  ${String(e.durationMs ?? '-').padStart(6)}ms  ${short}`);
		}
		log(`\n=== repeticiones por endpoint (un conteo alto = bucle de reintento) ===`);
		for (const [k, v] of Object.entries(byUrl).sort((a, b) => b[1] - a[1])) log(`  ${String(v).padStart(3)} x  ${k}`);

		let injectionHits = 0;
		if (INJECT_PATTERN) {
			const st = await readWebViewFaultInjectionState(driver).catch(() => null);
			injectionHits = st?.totalHits ?? 0;
			log(`\ninyección: ${injectionHits} match(es) del patrón "${INJECT_PATTERN}"`);
			if (injectionHits === 0) log('  ⚠ el patrón NO matcheó ninguna request — la corrida degradada no ejerció nada');
		}

		const verdict = released
			? `LIBERADO a los ${(releasedAt / 1000).toFixed(1)}s — el bloqueo NO se reprodujo en esta corrida`
			: `NO LIBERADO tras ${(WATCH_MS / 1000).toFixed(0)}s de observación — bloqueo REPRODUCIDO`;
		log(`\n>>> ${verdict}`);

		const dir = path.resolve(process.cwd(), 'evidence', 'network-capture');
		await mkdir(dir, { recursive: true });
		const f = path.join(dir, `driver-availability-hang-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
		await writeFile(
			f,
			JSON.stringify(
				{
					verdict,
					released,
					releasedAtMs: releasedAt,
					watchMs: WATCH_MS,
					injection: INJECT_PATTERN ? { pattern: INJECT_PATTERN, mode: INJECT_MODE, status: INJECT_STATUS, times: INJECT_TIMES, hits: injectionHits } : null,
					before,
					samples,
					http: entries,
					repeticiones: byUrl
				},
				null,
				2
			),
			'utf8'
		);
		log(`evidencia: ${path.relative(process.cwd(), f)}`);
	} finally {
		if (INJECT_PATTERN) {
			await clearWebViewFaultInjection(driver).catch(() => undefined);
		}
		await driver.deleteSession().catch(() => undefined);
	}
}

run().catch(e => {
	console.error('[hang] fallo:', e);
	process.exitCode = 1;
});
