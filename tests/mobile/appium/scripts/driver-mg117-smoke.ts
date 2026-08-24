/**
 * MG-117 — Smoke de una sola pregunta: ¿este binario consume el endpoint propio?
 *
 * Abre el buscador de dirección desde un viaje en curso, teclea un término carácter por
 * carácter y responde:
 *
 *   TM-650 — ¿hay tráfico a Google Places durante la búsqueda?
 *   TM-651 — ¿el request lleva `address` + coordenadas, y NO `radius` / `language`?
 *   TM-654 — ¿cuántas llamadas salen y con qué separación? (insumo para el debounce)
 *   TM-662 — ¿todas las llamadas de la sesión comparten `sessionToken`?
 *
 * Por qué no alcanza con el interceptor de fetch/XHR: el SDK de Google Places consulta por
 * inyección de script (JSONP), que NO pasa por esos hooks. Medido en la iteración 1: el panel
 * de red mostraba `AutocompletionService.GetPredictionsJson` con type `script`. Por eso la
 * pregunta "¿llamó a Google?" se responde con readWebViewGoogleActivity (Resource Timing +
 * etiquetas de script), y una captura vacía NO se acepta como prueba de nada.
 *
 * PRECONDICIÓN: la app debe estar en TravelInProgressPage (viaje calle iniciado).
 *
 * Uso:
 *   $env:ANDROID_UDID="R92XB0B8F3J"; $env:TERM_TO_TYPE="corr"; npx ts-node --esm tests/mobile/appium/scripts/driver-mg117-smoke.ts
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	installWebViewNetworkCapture,
	clearWebViewNetworkCapture,
	readWebViewNetworkCapture,
	readWebViewGoogleActivity
} from '../helpers/webViewNetworkCapture';
import { describe as describeTarget, resolveDriverTarget } from './_shared/resolveDriverTarget';

// El objetivo se resuelve desde ENV, no desde un literal: antes esta línea fijaba la app de test
// y `ENV=uat` quedaba inerte, de modo que una corrida podía decir UAT y estar midiendo test.
const TARGET = resolveDriverTarget('driver');
const APPIUM_URL = TARGET.appiumUrl;
const UDID = TARGET.udid;
const APP_PACKAGE = TARGET.appPackage;
const TERM = process.env.TERM_TO_TYPE ?? 'corr';
const KEYSTROKE_GAP_MS = Number(process.env.KEYSTROKE_GAP_MS ?? 120);

const log = (msg: string): void => console.log(`[mg117] ${msg}`);

const SEL = {
	editButton: 'app-page-travel-in-progress div.edit.action-container',
	searchInput: 'input'
} as const;

/**
 * Tap NATIVO sobre un elemento del WebView.
 *
 * Un `el.click()` de DOM NO dispara el handler de Ionic del lápiz de edición ni de las filas del
 * buscador — medido: el modal simplemente no abre. Y las coordenadas hay que anclarlas al rect
 * NATIVO del WebView: escalar contra la pantalla completa cae ~70px abajo por la barra de estado.
 */
async function tapNativeBySelector(driver: WebdriverIO.Browser, webview: string, selector: string): Promise<boolean> {
	const rect = (await driver
		.execute(
			`return (function () {
				var onScreen = function (el) {
					var r = el.getBoundingClientRect();
					return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
				};
				var all = Array.prototype.slice.call(document.querySelectorAll('${selector}')).filter(onScreen);
				var el = all[all.length - 1];
				if (!el) return null;
				var r = el.getBoundingClientRect();
				return { x: r.left + r.width / 2, y: r.top + r.height / 2, vw: window.innerWidth, vh: window.innerHeight };
			})();`
		)
		.catch(() => null)) as { x: number; y: number; vw: number; vh: number } | null;
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

/** DOM click on the first visible match. The Driver POM uses this and it works for its buttons. */
async function clickWeb(driver: WebdriverIO.Browser, selector: string, timeoutMs = 12_000): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const clicked = (await driver
			.execute((sel: string) => {
				const nodes = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
				const el = nodes.find(node => node.offsetParent !== null);
				if (el) {
					el.click();
					return true;
				}
				return false;
			}, selector)
			.catch(() => false)) as boolean;

		if (clicked) return true;
		await driver.pause(300);
	}
	return false;
}

async function describeInputs(driver: WebdriverIO.Browser): Promise<string> {
	return (await driver.execute(() => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		return Array.from(document.querySelectorAll('input, ion-input'))
			.filter(visible)
			.map(el => {
				const inner = ((el as unknown as { shadowRoot?: ShadowRoot | null }).shadowRoot?.querySelector('input') ??
					null) as HTMLInputElement | null;
				const target = inner ?? (el as HTMLInputElement);
				return `<${el.tagName.toLowerCase()} placeholder="${target.placeholder ?? ''}" readonly=${target.readOnly} value="${target.value ?? ''}">`;
			})
			.join(' | ');
	})) as string;
}

/**
 * Types one character at a time with a real key event sequence. A single value-set would collapse
 * the whole term into one input event, which makes the debounce unmeasurable.
 */
async function typeCharByChar(driver: WebdriverIO.Browser, term: string, gapMs: number): Promise<void> {
	for (let i = 1; i <= term.length; i++) {
		const soFar = term.slice(0, i);
		await driver.execute((value: string) => {
			const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const candidates = Array.from(document.querySelectorAll('input')).filter(visible) as HTMLInputElement[];
			const target = candidates.find(el => !el.readOnly);
			if (!target) return false;

			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
			setter?.call(target, value);
			target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
			target.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
			return true;
		}, soFar);
		await driver.pause(gapMs);
	}
}

async function run(): Promise<void> {
	// Primera línea de toda corrida: contra qué ambiente y qué binario se está midiendo.
	log(describeTarget(TARGET));
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
			'appium:noReset': true,
			'appium:forceAppLaunch': false,
			'appium:newCommandTimeout': 180,
			'appium:chromedriverAutodownload': true
		} as Record<string, unknown>
	});

	// El contexto se guarda a nivel de función: el tap nativo necesita volver a él tras cambiar a
	// NATIVE_APP, así que no puede quedar encerrado dentro del callback que lo descubre.
	let webview = 'NATIVE_APP';
	try {
		const contexts = (await driver.getContexts().catch(() => [])) as string[];
		const found = contexts.find(c => String(c).startsWith('WEBVIEW'));
		if (found) {
			webview = found;
			await driver.switchContext(webview);
		}
		const url = ((await driver.execute(() => window.location.href).catch(() => '')) as string) ?? '';
		log(`URL actual: ${url}`);

		if (!url.includes('TravelInProgress')) {
			log('PRECONDICION NO CUMPLIDA: se esperaba TravelInProgressPage (viaje calle en curso).');
			return;
		}

		log('Instalando captura de red…');
		await installWebViewNetworkCapture(driver);
		await clearWebViewNetworkCapture(driver);

		const googleBefore = await readWebViewGoogleActivity(driver);
		log(
			`Google ANTES -> available=${googleBefore.available} sdkPresent=${googleBefore.sdkPresent} ` +
				`scripts=${googleBefore.scriptTags.length} resources=${googleBefore.resourceEntries.length}`
		);

		log('Abriendo modal "Editar viaje"…');
		// Primero el camino barato (DOM); si no abre, tap NATIVO — que es el que funciona en Ionic.
		await clickWeb(driver, SEL.editButton, 3000);
		await driver.pause(1200);
		let inputsInfo = await describeInputs(driver);
		if (!inputsInfo.trim()) {
			log('  el click de DOM no abrió el modal; reintentando con tap nativo…');
			const tapped = await tapNativeBySelector(driver, webview, 'div.edit.action-container');
			log(`  tap nativo: ${tapped}`);
			await driver.pause(1800);
			inputsInfo = await describeInputs(driver);
		}
		log(`Inputs tras Editar: ${inputsInfo}`);
		if (!inputsInfo.trim()) {
			log('No se pudo abrir el modal "Editar viaje" por ninguna vía.');
			return;
		}

		// El input de cada parada es readonly y abre el buscador con (ionFocus): hay que tocarlo,
		// no escribirle. Se elige el ÚLTIMO readonly visible, que es la fila de Destino.
		log('Abriendo el buscador de dirección (fila Destino)…');
		const opened = (await driver.execute(() => {
			const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const inputs = Array.from(document.querySelectorAll('input')).filter(visible) as HTMLInputElement[];
			const readonly = inputs.filter(el => el.readOnly);
			const target = readonly[readonly.length - 1] ?? inputs[inputs.length - 1];
			if (!target) return false;
			target.focus();
			target.dispatchEvent(new Event('ionFocus', { bubbles: true, composed: true } as EventInit));
			target.click();
			return true;
		})) as boolean;

		if (!opened) {
			log('No se encontró la fila de Destino.');
			return;
		}

		await driver.pause(2000);
		log(`Inputs tras abrir el buscador: ${await describeInputs(driver)}`);

		log(`Tecleando "${TERM}" carácter por carácter (${KEYSTROKE_GAP_MS} ms entre teclas)…`);
		await clearWebViewNetworkCapture(driver);
		await typeCharByChar(driver, TERM, KEYSTROKE_GAP_MS);

		// Debounce declarado 300 ms + ida y vuelta de red.
		await driver.pause(3000);

		const capture = await readWebViewNetworkCapture(driver);
		const googleAfter = await readWebViewGoogleActivity(driver);

		const autocompleteCalls = capture.entries.filter(e => String(e.url).includes('places/autocomplete'));
		const googleXhr = capture.entries.filter(e => /googleapis|google\.com/i.test(String(e.url)));
		const newGoogleResources = googleAfter.resourceEntries.length - googleBefore.resourceEntries.length;

		log('');
		log('════════════ RESULTADO ════════════');
		log(`Requests capturadas en total: ${capture.entries.length}`);
		log(`  -> a places/autocomplete: ${autocompleteCalls.length}`);
		log(`  -> a Google por fetch/XHR: ${googleXhr.length}`);
		log(
			`Actividad Google (Resource Timing): available=${googleAfter.available} ` +
				`sdkPresent=${googleAfter.sdkPresent} recursos nuevos=${newGoogleResources}`
		);

		for (const entry of autocompleteCalls) {
			log(`  [${entry.startedAt}] ${entry.method} ${entry.url}  -> ${entry.status}`);
		}
		for (const resource of googleAfter.resourceEntries.slice(-6)) {
			log(`  [google] ${resource.name}`);
		}

		log('');
		if (!googleAfter.available) {
			log('VEREDICTO: INDETERMINADO — la sonda de actividad Google no pudo correr.');
			log(`  motivo: ${googleAfter.unavailableReason ?? 'desconocido'}`);
		} else if (autocompleteCalls.length === 0 && capture.entries.length === 0) {
			log('VEREDICTO: INDETERMINADO — cero requests capturadas: el hook pudo no estar activo.');
		} else if (autocompleteCalls.length > 0 && newGoogleResources === 0 && googleXhr.length === 0) {
			log('VEREDICTO: TM-650 PASA — consume el endpoint propio y no hubo tráfico nuevo a Google.');
		} else if (autocompleteCalls.length === 0 && newGoogleResources > 0) {
			log('VEREDICTO: TM-650 FALLA — sigue consultando a Google; no hay llamada al endpoint propio.');
		} else {
			log('VEREDICTO: MIXTO — revisar el detalle de arriba.');
		}

		const outDir = path.resolve('evidence', 'network-capture');
		await mkdir(outDir, { recursive: true });
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		const file = path.join(outDir, `mg117-smoke-${TERM}-${stamp}.json`);
		await writeFile(
			file,
			JSON.stringify({ term: TERM, url, capture, googleBefore, googleAfter }, null, 2),
			'utf8'
		);
		log(`\nEvidencia -> ${file}`);
	} finally {
		await driver.deleteSession();
	}
}

run().catch((err: Error) => {
	console.error('[mg117] Error:', err.message ?? err);
	process.exit(1);
});
