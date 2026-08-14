/**
 * MG-117 â€” Cierra los casos pendientes del Test Set TM-670 en una sola corrida.
 *
 *   TM-664 Â· tÃ©rmino sin resultados muestra estado vacÃ­o controlado
 *   TM-660 Â· predicciÃ³n de aeropuerto con placeId nulo se resuelve sin romper
 *   TM-653 Â· al elegir una predicciÃ³n se resuelve la direcciÃ³n y el viaje continÃºa
 *   TM-663 Â· tras seleccionar, la siguiente bÃºsqueda usa un sessionToken nuevo
 *   TM-661 Â· la bÃºsqueda por IATA no aplica sesgo por ubicaciÃ³n
 *
 * Tres de ellos (660, 653, 663) se cierran con UNA sola selecciÃ³n: "La Macaza" llega con
 * placeId nulo, asÃ­ que elegirla fuerza la resoluciÃ³n por nombre, carga la direcciÃ³n y rota el
 * token de sesiÃ³n. TM-661 mueve el GPS y compara la respuesta del mismo cÃ³digo IATA.
 *
 * Las predicciones se tocan con TAP NATIVO: un `el.click()` de DOM no dispara el handler de
 * Ionic â€” la App PAX ya documentÃ³ esa trampa y el botÃ³n "Editar" de esta misma pantalla la
 * confirmÃ³.
 *
 * PRECONDICIÃ“N: viaje en curso. El script navega solo hasta el buscador desde ahÃ­.
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

const log = (msg: string): void => console.log(`[remaining] ${msg}`);

type Prediction = {
	placeId: string | null;
	mainText: string;
	latitude: string | null;
	longitude: string | null;
	airport: boolean;
	iataCode: string | null;
	source: string;
};

const results: Record<string, { verdict: string; detail: string[]; shots: string[] }> = {};
const record = (key: string, verdict: string, detail: string[]): void => {
	results[key] = { verdict, detail, shots: shots[key] ?? [] };
	log(`\n>>> ${key}: ${verdict}`);
	for (const d of detail) log(`    ${d}`);
	for (const s of results[key].shots) log(`    captura: ${s}`);
};

/** Screenshots per case â€” the network dump proves the contract, the capture proves what the user saw. */
const SHOT_DIR = path.resolve('evidence', 'screenshots');
const shots: Record<string, string[]> = {};
async function shot(driver: WebdriverIO.Browser, key: string, label: string): Promise<void> {
	try {
		await mkdir(SHOT_DIR, { recursive: true });
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		const file = path.join(SHOT_DIR, `mg117-${key}-${label}-${stamp}.png`);
		await writeFile(file, Buffer.from(await driver.takeScreenshot(), 'base64'));
		(shots[key] ??= []).push(path.relative(process.cwd(), file));
	} catch (e) {
		log(`  aviso: no se pudo capturar ${key}/${label}: ${(e as Error).message.split('\n')[0]}`);
	}
}

function param(url: string, name: string): string | null {
	const m = new RegExp(`[?&]${name}=([^&]*)`).exec(url);
	return m ? decodeURIComponent(m[1]) : null;
}

async function currentUrl(driver: WebdriverIO.Browser): Promise<string> {
	return ((await driver.execute(() => window.location.href).catch(() => '')) as string) ?? '';
}

async function hasSearchField(driver: WebdriverIO.Browser): Promise<boolean> {
	return (await driver.execute(() => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		return Array.from(document.querySelectorAll('input')).filter(visible).some(el => !(el as HTMLInputElement).readOnly);
	})) as boolean;
}

/**
 * Native tap: reads the element rect in the WebView, maps it onto the WebView's NATIVE bounds and
 * taps there.
 *
 * Scaling against the full screen size is WRONG and lands the tap low: the WebView does not start
 * at y=0 (status bar) nor span the whole height (nav bar). Measured on device: aiming at a row at
 * css y=172 hit the row at css y=244. Anchoring on the WebView's own native rect removes both the
 * offset and the scale error.
 */
async function tapNative(driver: WebdriverIO.Browser, webview: string, locate: () => string): Promise<boolean> {
	const rect = (await driver
		.execute(locate())
		.catch(() => null)) as { x: number; y: number; vw: number; vh: number } | null;
	if (!rect) return false;

	await driver.switchContext('NATIVE_APP');
	try {
		let originX = 0;
		let originY = 0;
		let spanW = 0;
		let spanH = 0;
		try {
			const wv = (await driver.$('//android.webkit.WebView')) as unknown as {
				getLocation: () => Promise<{ x: number; y: number }>;
				getSize: () => Promise<{ width: number; height: number }>;
			};
			const loc = await wv.getLocation();
			const sz = await wv.getSize();
			originX = loc.x;
			originY = loc.y;
			spanW = sz.width;
			spanH = sz.height;
		} catch {
			spanW = 0;
		}
		if (!spanW || !spanH) {
			const size = await driver.getWindowSize();
			originX = 0;
			originY = 0;
			spanW = size.width;
			spanH = size.height;
		}

		const x = Math.round(originX + rect.x * (spanW / rect.vw));
		const y = Math.round(originY + rect.y * (spanH / rect.vh));
		await driver.performActions([
			{
				type: 'pointer', id: 'finger1', parameters: { pointerType: 'touch' },
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

// NOTA: `driver.execute(<string>)` usa el string como CUERPO de funciÃ³n â€” un IIFE suelto evalÃºa
// pero NO devuelve nada (verificado en device: devuelve null). El `return` es obligatorio.
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

const rectOfPredictionContaining = (needle: string): string => `
	return (function () {
		var onScreen = function (el) {
			var r = el.getBoundingClientRect();
			return r.width > 0 && r.height > 0 && r.top < window.innerHeight;
		};
		var items = Array.prototype.slice.call(
			document.querySelectorAll('ion-item.prediction-item, [class*="prediction-item"]')
		).filter(onScreen);
		var el = items.filter(function (n) {
			return (n.textContent || '').toLowerCase().indexOf('${needle.toLowerCase()}') !== -1;
		})[0];
		if (!el) return null;
		var r = el.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2, vw: window.innerWidth, vh: window.innerHeight };
	})();`;

async function navigateToSearch(driver: WebdriverIO.Browser, webview: string): Promise<boolean> {
	for (let i = 1; i <= 10; i++) {
		if (await hasSearchField(driver)) return true;
		const url = await currentUrl(driver);

		if (url.includes('TravelInProgress')) {
			const rows = (await driver.execute(() => {
				const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				return Array.from(document.querySelectorAll('input')).filter(visible).filter(el => (el as HTMLInputElement).readOnly).length;
			})) as number;

			if (rows > 0) {
				await driver.execute(() => {
					const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
					const ro = Array.from(document.querySelectorAll('input')).filter(visible).filter(el => (el as HTMLInputElement).readOnly) as HTMLInputElement[];
					const t = ro[ro.length - 1];
					if (!t) return;
					t.focus();
					t.dispatchEvent(new Event('ionFocus', { bubbles: true, composed: true } as EventInit));
					t.click();
				});
			} else {
				await tapNative(driver, webview, () => rectOfSelector('div.edit.action-container'));
			}
		} else if (url.includes('home')) {
			await driver.execute(() => {
				const nodes = Array.from(document.querySelectorAll('div.driver-pass.home-icon')) as HTMLElement[];
				const el = nodes.find(n => n.offsetParent !== null);
				el?.click();
			});
			await driver.pause(1400);
			await driver.execute(() => {
				const nodes = Array.from(document.querySelectorAll('app-confirm-modal button.btn.primary')) as HTMLElement[];
				const el = nodes.find(n => n.offsetParent !== null);
				el?.click();
			});
		}
		await driver.pause(2400);
	}
	return false;
}

async function setValue(driver: WebdriverIO.Browser, value: string): Promise<void> {
	await driver.execute((v: string) => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const t = Array.from(document.querySelectorAll('input')).filter(visible).find(el => !(el as HTMLInputElement).readOnly) as HTMLInputElement | undefined;
		if (!t) return;
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
		setter?.call(t, v);
		t.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
		t.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
	}, value);
}

/** Types a term and returns the last autocomplete call with its parsed body. */
async function search(driver: WebdriverIO.Browser, term: string): Promise<{ url: string; predictions: Prediction[] } | null> {
	await clearWebViewNetworkCapture(driver);
	await setValue(driver, '');
	await driver.pause(700);
	await setValue(driver, term);
	await driver.pause(3000);

	const capture = await readWebViewNetworkCapture(driver);
	const calls = capture.entries.filter(e => String(e.url).includes('places/autocomplete'));
	const last = calls[calls.length - 1];
	if (!last) return null;

	let predictions: Prediction[] = [];
	try {
		predictions = JSON.parse(String(last.responseBody ?? '[]')) as Prediction[];
	} catch {
		predictions = [];
	}
	return { url: String(last.url), predictions };
}

async function run(): Promise<void> {
	const appiumUrl = new URL(APPIUM_URL);
	const driver = await remote({
		protocol: appiumUrl.protocol.replace(':', '') as 'http' | 'https',
		hostname: appiumUrl.hostname,
		port: Number(appiumUrl.port) || 4723,
		path: '/',
		logLevel: 'error',
		capabilities: {
			platformName: 'Android',
			'appium:automationName': 'UiAutomator2',
			'appium:deviceName': 'SM-A055M',
			'appium:udid': UDID,
			'appium:appPackage': APP_PACKAGE,
			'appium:appActivity': '.MainActivity',
			'appium:noReset': true,
			'appium:forceAppLaunch': false,
			'appium:newCommandTimeout': 900,
			'appium:chromedriverAutodownload': true
		} as Record<string, unknown>
	});

	try {
		const contexts = (await driver.getContexts()) as string[];
		const webview = contexts.find(c => String(c).startsWith('WEBVIEW'));
		if (!webview) {
			log('Sin contexto WEBVIEW.');
			return;
		}
		await driver.switchContext(webview);
		await installWebViewNetworkCapture(driver);

		log('Navegando al buscadorâ€¦');
		if (!(await navigateToSearch(driver, webview))) {
			log('ABORTA: no se pudo llegar al buscador.');
			return;
		}

		// â”€â”€ TM-664 Â· estado vacÃ­o controlado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
		log('\nâ”€â”€â”€â”€ TM-664 Â· tÃ©rmino sin resultados');
		const empty = await search(driver, 'zzzqqqxxx');
		if (!empty) {
			record('TM-664', 'NO EJERCIDO', ['no se capturÃ³ ninguna llamada']);
		} else {
			const ui = (await driver.execute(() => {
				const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				return {
					items: Array.from(document.querySelectorAll('ion-item.prediction-item, [class*="prediction-item"]')).filter(visible).length,
					spinner: Array.from(document.querySelectorAll('ion-spinner')).some(visible)
				};
			})) as { items: number; spinner: boolean };

			await shot(driver, 'TM-664', 'estado-vacio');
			const ok = empty.predictions.length === 0 && ui.items === 0 && !ui.spinner;
			record('TM-664', ok ? 'PASSED' : 'REVISAR', [
				`respuesta: ${empty.predictions.length} predicciones`,
				`en pantalla: ${ui.items} items Â· spinner: ${ui.spinner}`,
				ok ? 'estado vacÃ­o controlado: sin items, sin spinner, sin error' : 'no coincide con lo esperado'
			]);
		}

		// â”€â”€ TM-660 + TM-653 + TM-663 Â· selecciÃ³n de aeropuerto sin placeId â”€â”€â”€â”€â”€â”€â”€
		log('\nâ”€â”€â”€â”€ TM-660 / TM-653 / TM-663 Â· selecciÃ³n de "La Macaza" (placeId nulo)');
		const caza = await search(driver, 'caza');
		if (!caza) {
			record('TM-660', 'NO EJERCIDO', ['sin respuesta para "caza"']);
		} else {
			const tokenBefore = param(caza.url, 'sessionToken');
			const target = caza.predictions.find(p => !p.placeId && p.airport);
			log(`    predicciones: ${caza.predictions.length} Â· sin placeId: ${caza.predictions.filter(p => !p.placeId).length}`);
			log(`    token antes de seleccionar: ${tokenBefore}`);

			if (!target) {
				record('TM-660', 'NO EJERCIDO', ['ninguna predicciÃ³n de aeropuerto llegÃ³ con placeId nulo']);
			} else {
				log(`    objetivo: "${target.mainText}" (${target.iataCode}) placeId=null`);
				await shot(driver, 'TM-660', 'lista-predicciones');

				await clearWebViewNetworkCapture(driver);
				const tapped = await tapNative(driver, webview, () => rectOfPredictionContaining(target.mainText.slice(0, 10)));
				await driver.pause(3500);

				const afterCapture = await readWebViewNetworkCapture(driver);
				const getPlace = afterCapture.entries.filter(e => String(e.url).includes('places/getPlace'));
				const lastGet = getPlace[getPlace.length - 1];

				await shot(driver, 'TM-660', 'tras-seleccionar');
				const resolvedByName = lastGet ? param(String(lastGet.url), 'address') !== null : false;
				const resolvedById = lastGet ? param(String(lastGet.url), 'placeId') !== null : false;

				// La respuesta de getPlace decide si un rechazo posterior es regla de negocio o un
				// fallo de la resoluciÃ³n por nombre. Sin este cuerpo el veredicto serÃ­a una conjetura.
				const getPlaceBody = lastGet ? String(lastGet.responseBody ?? '').slice(0, 600) : '(sin llamada)';
				log(`    getPlace status: ${lastGet ? String(lastGet.status) : '-'}`);
				log(`    getPlace respuesta: ${getPlaceBody}`);

				record('TM-660', lastGet && resolvedByName ? 'PASSED' : lastGet ? 'REVISAR' : 'NO EJERCIDO', [
					`tap nativo: ${tapped}`,
					lastGet ? `getPlace llamado: ${String(lastGet.url).split('?')[1]?.slice(0, 90)}` : 'no se llamÃ³ a getPlace',
					`resuelto por nombre: ${resolvedByName} Â· por placeId: ${resolvedById}`,
					'una predicciÃ³n sin placeId debe resolverse por nombre (address=)'
				]);

				// TM-653 â€” Â¿la direcciÃ³n quedÃ³ cargada y el flujo sigue?
				// Se consulta por sondeo: la resoluciÃ³n del destino es asÃ­ncrona (getPlace -> geocode ->
				// commit en la parada) y leer una sola vez mide la pantalla anterior, no el resultado.
				const needle = target.mainText.slice(0, 8).toLowerCase();
				let rowState = { rows: 0, values: [] as string[] };
				let loaded = false;
				for (let i = 0; i < 12; i++) {
					rowState = (await driver.execute(() => {
						const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
						const ro = Array.from(document.querySelectorAll('input')).filter(visible).filter(el => (el as HTMLInputElement).readOnly) as HTMLInputElement[];
						return { rows: ro.length, values: ro.map(el => String(el.value ?? '')) };
					})) as { rows: number; values: string[] };
					loaded = rowState.values.some(v => v.toLowerCase().includes(needle));
					if (loaded) break;
					await driver.pause(1000);
				}

				// La captura tiene que mostrar lo que VE el usuario. Si se dispara con el modal de
				// bÃºsqueda todavÃ­a encima, retrata el buscador y no la parada cargada â€” evidencia que
				// no prueba el criterio. Se cierra el modal y reciÃ©n ahÃ­ se captura el viaje.
				if (loaded) {
					await driver.back().catch(() => undefined);
					await driver.pause(1800);
				}
				await shot(driver, 'TM-653', loaded ? 'parada-cargada-en-viaje' : 'direccion-cargada');

				// Â¿La app rechazÃ³ el destino? "La Macaza" es un aerÃ³dromo de Quebec: sirve para probar la
				// resoluciÃ³n sin placeId (TM-660) pero no es un destino plausible de un viaje calle en
				// Buenos Aires. Si lo rechaza, TM-653 se ejerce con una direcciÃ³n de calle real.
				const reject = (await driver.execute(`
					return (function () {
						var vis = function (el) { return el.offsetParent !== null; };
						var mods = Array.prototype.slice.call(
							document.querySelectorAll('ion-modal.show-modal, ion-alert, app-confirm-modal, [class*="modal"]')
						).filter(vis);
						for (var i = 0; i < mods.length; i++) {
							var t = (mods[i].textContent || '').trim();
							if (/inv[aÃ¡]lid|no v[aÃ¡]lid|error/i.test(t)) return { present: true, text: t.replace(/\\s+/g, ' ').slice(0, 120) };
						}
						return { present: false, text: '' };
					})();`)) as { present: boolean; text: string };

				if (loaded) {
					record('TM-653', 'PASSED', [
						`filas de direcciÃ³n visibles: ${rowState.rows}`,
						`valores: ${rowState.values.map(v => v.slice(0, 40) || '(vacÃ­o)').join(' | ')}`,
						'la direcciÃ³n elegida quedÃ³ cargada en la parada'
					]);
				} else if (reject.present) {
					log(`    la app rechazÃ³ el destino: "${reject.text}"`);
					log('    reintentando TM-653 con una direcciÃ³n de calle vÃ¡lidaâ€¦');

					// Descartar el modal (botÃ³n Aceptar) y volver al buscador.
					await tapNative(driver, webview, () => rectOfSelector('button, ion-button'));
					await driver.pause(1500);
					if (!(await hasSearchField(driver))) await navigateToSearch(driver, webview);

					const street = await search(driver, 'cazadores 1098');
					const pick = street?.predictions.find(p => p.placeId);
					if (!pick) {
						record('TM-653', 'NO EJERCIDO', [
							`el destino lejano fue rechazado ("${reject.text}")`,
							'y no se obtuvo una predicciÃ³n de calle para reintentar'
						]);
					} else {
						await clearWebViewNetworkCapture(driver);
						await tapNative(driver, webview, () => rectOfPredictionContaining(pick.mainText.slice(0, 12)));

						const need2 = pick.mainText.slice(0, 10).toLowerCase();
						let ok2 = false;
						let rows2 = { rows: 0, values: [] as string[] };
						for (let i = 0; i < 12; i++) {
							rows2 = (await driver.execute(() => {
								const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
								const ro = Array.from(document.querySelectorAll('input')).filter(visible).filter(el => (el as HTMLInputElement).readOnly) as HTMLInputElement[];
								return { rows: ro.length, values: ro.map(el => String(el.value ?? '')) };
							})) as { rows: number; values: string[] };
							ok2 = rows2.values.some(v => v.toLowerCase().includes(need2));
							if (ok2) break;
							await driver.pause(1000);
						}
						await shot(driver, 'TM-653', 'direccion-calle-cargada');
						record('TM-653', ok2 ? 'PASSED' : 'REVISAR', [
							`destino elegido: "${pick.mainText.slice(0, 45)}" (placeId presente)`,
							`filas: ${rows2.values.map(v => v.slice(0, 40) || '(vacÃ­o)').join(' | ')}`,
							ok2
								? 'la direcciÃ³n elegida quedÃ³ cargada en la parada y el viaje continÃºa'
								: 'la direcciÃ³n no se cargÃ³ en ninguna fila',
							`observaciÃ³n: el destino de aeropuerto lejano se rechaza con "${reject.text}"`
						]);
					}
				} else {
					record('TM-653', 'REVISAR', [
						`filas de direcciÃ³n visibles: ${rowState.rows}`,
						`valores: ${rowState.values.map(v => v.slice(0, 40) || '(vacÃ­o)').join(' | ')}`,
						'no se cargÃ³ la direcciÃ³n y tampoco apareciÃ³ un modal de rechazo'
					]);
				}

				// TM-663 â€” Â¿la bÃºsqueda siguiente abre sesiÃ³n nueva?
				// Elegir una predicciÃ³n cierra el modal de bÃºsqueda, asÃ­ que hay que reabrirlo antes de
				// medir el token siguiente. Reabrirlo es parte del caso: el token nuevo se emite en la
				// sesiÃ³n que arranca al volver a entrar.
				if (!(await hasSearchField(driver))) {
					log('    el modal se cerrÃ³ tras seleccionar; reabriendo el buscadorâ€¦');
					await navigateToSearch(driver, webview);
				}
				if (await hasSearchField(driver)) {
					const next = await search(driver, 'flori');
					await shot(driver, 'TM-663', 'sesion-nueva');
					const tokenAfter = next ? param(next.url, 'sessionToken') : null;
					const rotated = Boolean(tokenBefore && tokenAfter && tokenBefore !== tokenAfter);
					record('TM-663', rotated ? 'PASSED' : 'REVISAR', [
						`token antes:  ${tokenBefore}`,
						`token despuÃ©s: ${tokenAfter}`,
						rotated ? 'el token rotÃ³ tras la selecciÃ³n' : 'el token no cambiÃ³'
					]);
				} else {
					record('TM-663', 'PENDIENTE', ['el buscador se cerrÃ³ tras seleccionar; reabrir para medir el token siguiente']);
				}
			}
		}

		// â”€â”€ TM-661 Â· IATA sin sesgo por ubicaciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
		log('\nâ”€â”€â”€â”€ TM-661 Â· misma bÃºsqueda IATA desde dos ubicaciones');
		if (!(await hasSearchField(driver))) {
			await navigateToSearch(driver, webview);
		}

		const signature = (list: Prediction[]): string => list.map(p => `${p.iataCode ?? '-'}:${p.mainText}`).join('|');

		const fromHere = await search(driver, 'eze');
		let moved = false;
		try {
			await driver.switchContext('NATIVE_APP');
			await (driver as unknown as { setGeoLocation: (l: { latitude: number; longitude: number; altitude: number }) => Promise<unknown> })
				.setGeoLocation({ latitude: -32.8895, longitude: -68.8458, altitude: 15 });
			moved = true;
		} catch {
			moved = false;
		} finally {
			await driver.switchContext(webview);
		}

		if (!moved) {
			record('TM-661', 'NO EJERCIDO', ['no se pudo mover la ubicaciÃ³n del dispositivo']);
		} else {
			log('    GPS movido a Mendoza (-32.8895, -68.8458); esperando propagaciÃ³nâ€¦');
			await driver.pause(9000);
			// MISMO tÃ©rmino en ambas mediciones. El largo del tÃ©rmino cambia el MODO de bÃºsqueda
			// (3 caracteres = cÃ³digo IATA; 4 o mÃ¡s = direcciÃ³n/nombre), asÃ­ que comparar 'eze' contra
			// 'ezei' mide el cambio de modo, no el sesgo por ubicaciÃ³n.
			const fromMendoza = await search(driver, 'eze');

			const sigA = fromHere ? signature(fromHere.predictions.filter(p => p.source === 'AIRPORT')) : '';
			const sigB = fromMendoza ? signature(fromMendoza.predictions.filter(p => p.source === 'AIRPORT')) : '';
			const coordsA = fromHere ? `${param(fromHere.url, 'latitude')},${param(fromHere.url, 'longitude')}` : '-';
			const coordsB = fromMendoza ? `${param(fromMendoza.url, 'latitude')},${param(fromMendoza.url, 'longitude')}` : '-';

			record('TM-661', sigA && sigB ? (sigA === sigB ? 'PASSED' : 'REVISAR') : 'NO EJERCIDO', [
				`coords enviadas #1: ${coordsA}`,
				`coords enviadas #2: ${coordsB}`,
				`aeropuertos #1: ${sigA || '(ninguno)'}`,
				`aeropuertos #2: ${sigB || '(ninguno)'}`,
				sigA === sigB ? 'la pata de aeropuertos no varÃ­a con la ubicaciÃ³n' : 'la respuesta difiere entre ubicaciones'
			]);

			// Devolver el GPS a Buenos Aires para no dejar el dispositivo desplazado.
			try {
				await driver.switchContext('NATIVE_APP');
				await (driver as unknown as { setGeoLocation: (l: { latitude: number; longitude: number; altitude: number }) => Promise<unknown> })
					.setGeoLocation({ latitude: -34.6001, longitude: -58.3721, altitude: 15 });
			} catch {
				log('    aviso: no se pudo restaurar el GPS a Buenos Aires');
			} finally {
				await driver.switchContext(webview);
			}
		}

		log('\nâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• RESUMEN â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
		for (const [key, r] of Object.entries(results)) log(`${key.padEnd(8)} ${r.verdict}`);

		const outDir = path.resolve('evidence', 'network-capture');
		await mkdir(outDir, { recursive: true });
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		const file = path.join(outDir, `mg117-remaining-${stamp}.json`);
		await writeFile(file, JSON.stringify(results, null, 2), 'utf8');
		log(`\nEvidencia -> ${file}`);
	} finally {
		await driver.deleteSession();
	}
}

run().catch((err: Error) => {
	console.error('[remaining] Error:', err.message ?? err);
	process.exit(1);
});
