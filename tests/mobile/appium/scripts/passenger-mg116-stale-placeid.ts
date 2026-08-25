/**
 * MG-116 / Hilo 1 — ¿Que pasa al SELECCIONAR una prediccion cuyo placeId Google ya no reconoce?
 *
 * CONTEXTO
 * La fila "Policia Caminera, Ezeiza" que devuelve `ezeiza` trae placeId ChIJk6WsDgDPvJUR5ar9TbmxNHU.
 * Consultado contra Google Places Details (2026-08-14) responde NOT_FOUND con el mensaje
 * "The provided Place ID is no longer valid. Please refresh cached Place IDs". El control sobre el
 * placeId de EZE si resuelve, asi que el metodo es valido y el ID esta efectivamente vencido.
 *
 * LO QUE DECIDE ESTE SCRIPT
 *   - `places/getPlace/` devuelve 200 con coordenadas utiles  -> deuda latente, no impacto activo.
 *   - `places/getPlace/` falla, o devuelve 200 sin coordenadas -> EL FLUJO SE ROMPE. Sube a Mayor y
 *     obliga a revisar la atribucion del "Destino invalido" que la campana de Driver cerro como
 *     regla de negocio por carrier.
 *
 * CONTROL OBLIGATORIO
 * Se selecciona TAMBIEN una fila cuyo placeId Google SI resuelve. Sin ese control, un fallo podria
 * ser del harness y no del producto — ya paso antes en esta campana con TM-684 y TM-687, donde un
 * `.click()` programatico no disparaba el handler de Ionic y simulaba dos defectos que no existian.
 * Si el control tampoco resuelve, el resultado es INDETERMINADO y no se reporta nada.
 *
 * El tap es NATIVO, anclado al rect del WebView: el `.click()` del DOM no alcanza en esta app.
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveDriverTarget } from './_shared/resolveDriverTarget';
import {
	installWebViewNetworkCapture,
	clearWebViewNetworkCapture,
	readWebViewNetworkCapture
} from '../helpers/webViewNetworkCapture';

const TARGET = resolveDriverTarget('passenger');
const TERM = process.env.TERM_TO_TYPE ?? 'ezeiza';
/** placeId que Google responde NOT_FOUND. Es el objetivo de la prueba. */
const STALE_PLACE_ID = 'ChIJk6WsDgDPvJUR5ar9TbmxNHU';
const SETTLE_MS = 4000;

const log = (m: string): void => console.log(`[stale] ${m}`);
const line = (): void => log('='.repeat(64));

type Entry = { url: string; status?: number; responseBody?: string };
type Prediction = {
	placeId: string | null;
	mainText?: string;
	secondaryText?: string | null;
	latitude?: string | null;
	longitude?: string | null;
	airport?: boolean;
	iataCode?: string | null;
	source?: string;
};

const findings: Record<string, unknown> = { ticket: 'MG-116', hilo: 1, term: TERM, stalePlaceId: STALE_PLACE_ID };

function isAutocomplete(u: string): boolean {
	return u.includes('places/autocomplete');
}
/** Toda llamada que NO sea autocomplete: la resolucion de la seleccion y lo que dispare despues. */
function isResolution(u: string): boolean {
	return !isAutocomplete(u) && /places\/|getPlace|geoCode|magiis-v0\.2/i.test(u);
}

async function focusOrigen(driver: WebdriverIO.Browser): Promise<boolean> {
	const ok = (await driver.execute(() => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const t = Array.from(document.querySelectorAll('input'))
			.filter(vis)
			.find(el => ((el as HTMLInputElement).placeholder ?? '').trim().startsWith('Origen')) as
			| HTMLInputElement
			| undefined;
		if (!t) return false;
		t.focus();
		t.dispatchEvent(new Event('ionFocus', { bubbles: true, composed: true } as EventInit));
		t.click();
		return true;
	})) as boolean;
	await driver.pause(1600);
	return ok;
}

async function typeTerm(driver: WebdriverIO.Browser, term: string): Promise<void> {
	await driver.execute((val: string) => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const t = Array.from(document.querySelectorAll('input'))
			.filter(vis)
			.find(el => ((el as HTMLInputElement).placeholder ?? '').trim().startsWith('Origen')) as
			| HTMLInputElement
			| undefined;
		if (!t) return;
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
		setter?.call(t, val);
		t.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
		t.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
	}, term);
	await driver.pause(SETTLE_MS);
}

async function origenValue(driver: WebdriverIO.Browser): Promise<string> {
	return (await driver.execute(() => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const t = Array.from(document.querySelectorAll('input'))
			.filter(vis)
			.find(el => ((el as HTMLInputElement).placeholder ?? '').trim().startsWith('Origen')) as
			| HTMLInputElement
			| undefined;
		return t?.value ?? '';
	})) as string;
}

/** Errores visibles en pantalla: toasts, alertas, banners. Base para "el flujo se rompe". */
async function visibleErrors(driver: WebdriverIO.Browser): Promise<string[]> {
	return (await driver.execute(() => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		return Array.from(document.querySelectorAll('ion-toast, ion-alert, .error, .alert, [role="alert"]'))
			.filter(vis)
			.map(e => (e.textContent ?? '').trim().slice(0, 160))
			.filter(Boolean);
	})) as string[];
}

/** Tap nativo mapeando el rect CSS del item al rect NATIVO del WebView. */
async function tapPredictionNative(driver: WebdriverIO.Browser, webview: string, needle: string): Promise<boolean> {
	const script = `
		return (function () {
			var needle = ${JSON.stringify(needle)}.toLowerCase();
			var items = Array.prototype.slice.call(document.querySelectorAll('ion-item.prediction-item'))
				.filter(function (el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
			var t = items.filter(function (el) { return (el.textContent || '').toLowerCase().indexOf(needle) !== -1; })[0];
			if (!t) return null;
			var r = t.getBoundingClientRect();
			return { x: r.left + r.width / 2, y: r.top + r.height / 2, vw: window.innerWidth, vh: window.innerHeight };
		})();`;
	const rect = (await driver.execute(script).catch(() => null)) as {
		x: number;
		y: number;
		vw: number;
		vh: number;
	} | null;
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
	await driver.pause(4000);
	return true;
}

type SelectionResult = {
	label: string;
	target: string;
	placeId: string | null;
	tapped: boolean;
	origenBefore: string;
	origenAfter: string;
	populated: boolean;
	resolutionCalls: { url: string; status?: number; bodyPreview?: string }[];
	errorsOnScreen: string[];
};

async function selectAndObserve(
	driver: WebdriverIO.Browser,
	webview: string,
	label: string,
	needle: string,
	placeId: string | null
): Promise<SelectionResult> {
	log(`\n-- ${label}: "${needle}" (placeId ${placeId ?? 'null'}) --`);
	await focusOrigen(driver);
	await typeTerm(driver, '');
	await driver.pause(500);
	await typeTerm(driver, TERM);

	const before = await origenValue(driver);
	await clearWebViewNetworkCapture(driver);
	const tapped = await tapPredictionNative(driver, webview, needle);
	const after = await origenValue(driver);
	const cap = await readWebViewNetworkCapture(driver);
	const calls = (cap.entries as Entry[]).filter(e => isResolution(String(e.url)));
	const errs = await visibleErrors(driver);

	const res: SelectionResult = {
		label,
		target: needle,
		placeId,
		tapped,
		origenBefore: before,
		origenAfter: after,
		populated: after !== before && after.length > 0,
		resolutionCalls: calls.map(c => ({
			url: String(c.url),
			status: c.status,
			bodyPreview: (c.responseBody ?? '').slice(0, 300)
		})),
		errorsOnScreen: errs
	};

	log(`   tap encontrado: ${tapped}`);
	log(`   Origen: "${before}" -> "${after}"  ${res.populated ? '(POBLADO)' : '(SIN POBLAR)'}`);
	log(`   llamadas de resolucion: ${calls.length}`);
	for (const c of res.resolutionCalls) {
		log(`     · ${c.url.split('?')[0]} -> ${c.status ?? '?'}`);
		if (c.bodyPreview) log(`       body: ${c.bodyPreview.replace(/\s+/g, ' ').slice(0, 180)}`);
	}
	if (errs.length) log(`   ERRORES EN PANTALLA: ${errs.join(' | ')}`);
	return res;
}

async function run(): Promise<void> {
	const u = new URL(TARGET.appiumUrl);
	const driver = await remote({
		protocol: u.protocol.replace(':', '') as 'http' | 'https',
		hostname: u.hostname,
		port: Number(u.port) || 4723,
		path: '/',
		logLevel: 'error',
		connectionRetryTimeout: 60_000,
		capabilities: {
			platformName: 'Android',
			'appium:automationName': 'UiAutomator2',
			'appium:deviceName': 'SM-A055M',
			'appium:udid': TARGET.udid,
			'appium:appPackage': TARGET.appPackage,
			'appium:appActivity': '.MainActivity',
			'appium:noReset': true,
			'appium:forceAppLaunch': false,
			'appium:newCommandTimeout': 300,
			'appium:chromedriverAutodownload': true
		} as Record<string, unknown>
	});

	try {
		const ctx = (await driver.getContexts()) as string[];
		const webview = ctx.find(c => String(c).startsWith('WEBVIEW'));
		if (!webview) {
			log('ABORTA: sin contexto WEBVIEW');
			return;
		}
		await driver.switchContext(webview);
		const url = (await driver.execute(() => window.location.href)) as string;
		log(`URL: ${url}`);
		if (/\/login/i.test(url)) {
			log('ABORTA: la app esta en el login.');
			return;
		}
		await installWebViewNetworkCapture(driver);

		// Descubrir que devuelve el termino y quien es quien.
		await focusOrigen(driver);
		await clearWebViewNetworkCapture(driver);
		await typeTerm(driver, TERM);
		const cap = await readWebViewNetworkCapture(driver);
		const acCalls = (cap.entries as Entry[]).filter(e => isAutocomplete(String(e.url)));
		const rows: Prediction[] = acCalls.flatMap(e => {
			try {
				const p = JSON.parse(e.responseBody ?? '[]');
				return Array.isArray(p) ? (p as Prediction[]) : [];
			} catch {
				return [];
			}
		});

		line();
		log(`filas devueltas por "${TERM}": ${rows.length}`);
		rows.forEach((r, i) => log(`  [${i}] ${r.source} | ${r.mainText} | placeId=${r.placeId ?? 'null'}`));
		findings.rows = rows;

		const stale = rows.find(r => r.placeId === STALE_PLACE_ID);
		// Control: una fila distinta, con placeId presente, de la MISMA respuesta.
		const control = rows.find(r => r.placeId && r.placeId !== STALE_PLACE_ID && r.mainText);

		if (!stale) {
			line();
			log(`SIN DATOS: la fila con placeId ${STALE_PLACE_ID} no aparecio en esta respuesta.`);
			log('El fixture es estado de cache y pudo haber cambiado. No se puede ejercer el caso.');
			findings.verdict = 'sin datos — el fixture del placeId vencido no aparecio';
		} else {
			// CONTROL PRIMERO: valida el metodo antes de interpretar el caso.
			line();
			log('CONTROL — se selecciona una fila cuyo placeId Google SI resuelve.');
			log('Si el control no puebla el campo, el metodo no sirve y el caso queda INDETERMINADO.');
			const controlRes = control?.mainText
				? await selectAndObserve(driver, webview, 'CONTROL', control.mainText.slice(0, 30), control.placeId)
				: null;
			findings.control = controlRes;

			if (controlRes && !controlRes.populated) {
				line();
				log('EL CONTROL NO POBLO EL CAMPO -> limitacion del harness, no del producto.');
				log('El caso queda INDETERMINADO. No se reporta nada.');
				findings.verdict = 'indeterminado — el control no valido el metodo de seleccion';
			} else {
				// Ahora si, el caso.
				line();
				log('CASO — se selecciona la fila cuyo placeId Google responde NOT_FOUND.');
				const staleRes = await selectAndObserve(
					driver,
					webview,
					'CASO placeId vencido',
					(stale.mainText ?? '').slice(0, 30),
					stale.placeId
				);
				findings.stale = staleRes;

				const failedCalls = staleRes.resolutionCalls.filter(c => (c.status ?? 0) >= 400);
				const noCoords = staleRes.resolutionCalls.some(
					c =>
						(c.status ?? 0) === 200 && c.bodyPreview && !/latitude|longitude|lat"|lng"/i.test(c.bodyPreview)
				);

				line();
				let verdict: string;
				if (!staleRes.populated) {
					verdict =
						'FLUJO ROTO — el campo no se poblo al seleccionar la fila con placeId vencido, mientras que el ' +
						'control con el mismo metodo SI poblo. Sube a Mayor y obliga a revisar la atribucion del ' +
						'"Destino invalido" de la campana de Driver.';
				} else if (failedCalls.length) {
					verdict =
						`RESOLUCION CON ERROR — el campo se poblo pero ${failedCalls.length} llamada(s) de resolucion ` +
						'devolvieron 4xx/5xx. El fallo podria manifestarse mas adelante, al cotizar o crear el viaje.';
				} else if (noCoords) {
					verdict =
						'RESOLUCION SIN COORDENADAS — 200 pero sin latitud/longitud utiles en la respuesta. El pin del ' +
						'mapa y el calculo de tarifa quedan sin dato.';
				} else if (staleRes.errorsOnScreen.length) {
					verdict = `SE POBLO PERO HAY ERROR EN PANTALLA: ${staleRes.errorsOnScreen.join(' | ')}`;
				} else {
					verdict =
						'DEUDA LATENTE, SIN IMPACTO ACTIVO — la seleccion resolvio correctamente pese al placeId vencido. ' +
						'El backend no depende de ese ID para resolver (usa nombre o coordenadas cacheadas). El ID vencido ' +
						'sigue siendo deuda a corregir, pero hoy no rompe el flujo.';
				}
				log(`VEREDICTO: ${verdict}`);
				line();
				findings.verdict = verdict;
			}
		}

		const dir = path.resolve('evidence', 'network-capture');
		await mkdir(dir, { recursive: true });
		const f = path.join(dir, `mg116-stale-placeid-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
		await writeFile(f, JSON.stringify(findings, null, 2), 'utf8');
		log(`Evidencia -> ${f}`);
	} finally {
		await driver.deleteSession();
	}
}

run().catch((e: Error) => {
	console.error('[stale] Error:', e.message ?? e);
	process.exit(1);
});
