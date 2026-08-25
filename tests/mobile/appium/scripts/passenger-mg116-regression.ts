/**
 * MG-116 — REGRESION PROFUNDA de la feature de autocomplete en App PAX.
 *
 * Amplia la primera pasada (que solo ejercio el campo Origen y quedo sin poder seleccionar) en
 * cinco frentes. Cada fase escribe su evidencia al terminar, asi que una fase que falle no se lleva
 * puesto lo que ya se midio.
 *
 *   FASE 1 · matriz de campos    — los TRES campos de direccion, no solo Origen:
 *                                  `Origen `, `Destino `, `Agregar otro destino `.
 *                                  Cubre TM-693 (TC20: tokens independientes entre campos) y
 *                                  verifica que el gating de longitud aplica igual en los tres.
 *   FASE 2 · seleccion           — TAP NATIVO anclado al rect del WebView, porque el `.click()`
 *                                  programatico no dispara el handler de Ionic (probado con control
 *                                  en la pasada anterior). Desbloquea TM-677, TM-683, TM-684,
 *                                  TM-687 y los pasos de seleccion de TM-674/TM-679.
 *   FASE 3 · orden               — TM-727: las direcciones cercanas de cache deben rankearse por
 *                                  encima de los aeropuertos lejanos.
 *   FASE 4 · degradacion         — TM-689 (5xx y timeout, sin fallback silencioso a Google) y
 *                                  TM-697 (error de red), via inyeccion de fallas del harness.
 *   FASE 5 · estados            — TM-688 (estado vacio controlado) y TM-694 (skipLoader: ninguna
 *                                  pulsacion dispara el loader global).
 *
 * El tap nativo se reusa TAL CUAL de `driver-availability-hang-repro.ts`: se mide el rect en CSS
 * dentro del WebView, se cambia a NATIVE_APP, se lee el rect NATIVO del WebView y se mapea
 * css/viewport -> nativo. Escalar contra la pantalla completa cae ~70 px abajo por la status bar.
 *
 * PRECONDICION: Passenger en el home, sesion iniciada. Appium en :4723.
 * Seleccion de fases: PHASES="1,2,3" (default: todas).
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveDriverTarget } from './_shared/resolveDriverTarget';
import {
	installWebViewNetworkCapture,
	clearWebViewNetworkCapture,
	readWebViewNetworkCapture,
	readWebViewGoogleActivity,
	installWebViewFaultInjection,
	clearWebViewFaultInjection
} from '../helpers/webViewNetworkCapture';

const TARGET = resolveDriverTarget('passenger');
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 3500);
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 900);
const PHASES = (process.env.PHASES ?? '1,2,3,4,5').split(',').map(s => s.trim());

const FIELDS = ['Origen', 'Destino', 'Agregar otro destino'] as const;

const log = (m: string): void => console.log(`[reg] ${m}`);
const phase = (n: string, title: string): void => log(`\n${'='.repeat(58)}\nFASE ${n} · ${title}\n${'='.repeat(58)}`);

type Entry = { url: string; status?: number; responseBody?: string; startedAt: string };
type Prediction = {
	placeId: string | null;
	mainText?: string;
	secondaryText?: string | null;
	iataCode?: string | null;
	source?: string;
	airport?: boolean;
	latitude?: string | null;
	longitude?: string | null;
};
type DropRow = { main: string; secondary: string; icons: number; iconNames: string[]; html: string };

const findings: Record<string, unknown> = {};

function paramOf(url: string, name: string): string {
	const m = new RegExp(`[?&]${name}=([^&]*)`).exec(url);
	return m ? decodeURIComponent(m[1]) : '';
}
function acCalls(entries: Entry[]): Entry[] {
	return entries.filter(e => String(e.url).includes('places/autocomplete'));
}
function preds(entries: Entry[]): Prediction[] {
	return entries.flatMap(e => {
		try {
			const p = JSON.parse(e.responseBody ?? '[]');
			return Array.isArray(p) ? (p as Prediction[]) : [];
		} catch {
			return [];
		}
	});
}

// ─────────────────────────── interaccion con el WebView ───────────────────────────

/** Enfoca el campo por prefijo de placeholder. Devuelve si lo encontro. */
async function focusField(driver: WebdriverIO.Browser, prefix: string): Promise<boolean> {
	const ok = (await driver.execute((p: string) => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const t = Array.from(document.querySelectorAll('input'))
			.filter(vis)
			.find(el =>
				((el as HTMLInputElement).placeholder ?? '').trim().toLowerCase().startsWith(p.toLowerCase())
			) as HTMLInputElement | undefined;
		if (!t) return false;
		t.focus();
		t.dispatchEvent(new Event('ionFocus', { bubbles: true, composed: true } as EventInit));
		t.click();
		return true;
	}, prefix)) as boolean;
	await driver.pause(1500);
	return ok;
}

/**
 * Escribe en el campo identificado por su PLACEHOLDER.
 *
 * POR QUE POR PLACEHOLDER Y NO "el unico editable". La sonda `passenger-mg116-probe-modal.ts`
 * (2026-08-14) demostro que esta pantalla NO abre ningun modal: `ion-modal` y `ion-backdrop` estan
 * en cero, la URL no cambia, y enfocar un campo solo le saca el `readOnly` EN EL SITIO. En ese
 * estado hay DOS inputs editables a la vez (`Origen ` y `Agregar otro destino `), asi que
 * "el primer editable" elige por orden del DOM y no por intencion: la medicion no seria atribuible
 * al campo que se quiso probar. El script de Driver puede usar esa heuristica porque alli SI hay un
 * modal con un unico buscador; aca no aplica.
 */
async function setValue(driver: WebdriverIO.Browser, prefix: string, v: string): Promise<void> {
	await driver.execute(
		(p: string, val: string) => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const t = Array.from(document.querySelectorAll('input'))
				.filter(vis)
				.find(el =>
					((el as HTMLInputElement).placeholder ?? '').trim().toLowerCase().startsWith(p.toLowerCase())
				) as HTMLInputElement | undefined;
			if (!t) return;
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
			setter?.call(t, val);
			t.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
			t.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
		},
		prefix,
		v
	);
}

/** Lee el dropdown con informacion de iconos: base de TM-683 (icono de aeropuerto) y TM-691. */
async function readDropdown(driver: WebdriverIO.Browser): Promise<DropRow[]> {
	return (await driver.execute(() => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		return Array.from(document.querySelectorAll('ion-item.prediction-item'))
			.filter(vis)
			.map(item => {
				const icons = Array.from(item.querySelectorAll('ion-icon, svg, img'));
				return {
					main: (item.querySelector('span.main')?.textContent ?? '').trim(),
					secondary: (item.querySelector('span.secondary')?.textContent ?? '').trim(),
					icons: icons.length,
					iconNames: icons.map(i => i.getAttribute('name') ?? i.getAttribute('src') ?? i.tagName),
					html: (item as HTMLElement).innerHTML.slice(0, 260)
				};
			});
	})) as DropRow[];
}

async function fieldValues(driver: WebdriverIO.Browser): Promise<{ placeholder: string; value: string }[]> {
	return (await driver.execute(() => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		return (Array.from(document.querySelectorAll('input')).filter(vis) as HTMLInputElement[]).map(i => ({
			placeholder: i.placeholder,
			value: i.value
		}));
	})) as { placeholder: string; value: string }[];
}

/** Cuenta loaders globales visibles. Base de TM-694 (skipLoader). */
async function loaderCount(driver: WebdriverIO.Browser): Promise<number> {
	return (await driver.execute(() => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		return Array.from(document.querySelectorAll('ion-loading, .loading-wrapper, ion-spinner')).filter(vis).length;
	})) as number;
}

/**
 * TAP NATIVO. Reusa tal cual el mapeo de `driver-availability-hang-repro.ts`:
 * rect CSS dentro del WebView -> rect NATIVO del WebView -> coordenadas nativas.
 */
async function tapNativeByText(
	driver: WebdriverIO.Browser,
	webview: string,
	needle: string
): Promise<{ found: boolean; x?: number; y?: number }> {
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
	if (!rect) return { found: false };

	await driver.switchContext('NATIVE_APP');
	let x = 0;
	let y = 0;
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
		x = Math.round(ox + rect.x * (sw / rect.vw));
		y = Math.round(oy + rect.y * (sh / rect.vh));
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
	await driver.pause(2800);
	return { found: true, x, y };
}

/** Mide un termino en el campo ya enfocado. */
async function measureTerm(
	driver: WebdriverIO.Browser,
	prefix: string,
	term: string
): Promise<{ calls: number; status: number | null; tokens: string[]; params: string[]; rows: Prediction[] }> {
	await setValue(driver, prefix, '');
	await driver.pause(500);
	await clearWebViewNetworkCapture(driver);
	await setValue(driver, prefix, term);
	await driver.pause(SETTLE_MS);
	const cap = await readWebViewNetworkCapture(driver);
	const calls = acCalls(cap.entries as Entry[]);
	return {
		calls: calls.length,
		status: calls[0]?.status ?? null,
		tokens: Array.from(new Set(calls.map(c => paramOf(String(c.url), 'sessionToken')).filter(Boolean))),
		params: calls.length
			? (String(calls[0].url)
					.split('?')[1]
					?.split('&')
					.map(kv => kv.split('=')[0]) ?? [])
			: [],
		rows: preds(calls)
	};
}

/**
 * Cuenta los tres campos de direccion visibles, SIN mirar `readOnly`.
 *
 * La version anterior contaba solo los readonly y exigia >=2 para declarar "estoy en el home". Eso
 * era falso: al enfocar un campo este pierde el readOnly, asi que quedaba 1 y la sonda daba negativo
 * estando la pantalla perfectamente sana. Peor: la reaccion era presionar `driver.back()` en bucle,
 * lo que TERMINO DESLOGUEANDO LA APP en la corrida de 15:53. Un chequeo de estado mal calibrado no
 * solo miente: empuja a una accion destructiva.
 */
async function addressFieldCount(driver: WebdriverIO.Browser): Promise<number> {
	return (await driver.execute(
		(names: string[]) => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const inputs = Array.from(document.querySelectorAll('input')).filter(vis) as HTMLInputElement[];
			return names.filter(n =>
				inputs.some(i => (i.placeholder ?? '').trim().toLowerCase().startsWith(n.toLowerCase()))
			).length;
		},
		[...FIELDS]
	)) as number;
}

/**
 * Confirma que la pantalla de alta de viaje sigue en pie. NUNCA navega: esta pantalla no abre modales
 * (probado con sonda) asi que no hay nada que cerrar, y presionar back aca desloguea la app.
 */
async function ensureHome(driver: WebdriverIO.Browser): Promise<boolean> {
	const n = await addressFieldCount(driver);
	if (n < FIELDS.length) log(`   AVISO: solo ${n}/${FIELDS.length} campos de direccion visibles.`);
	return n >= 2;
}

/** Limpia el campo. No cierra nada — no hay modal que cerrar en esta pantalla. */
async function closeSearch(driver: WebdriverIO.Browser, prefix = 'Origen'): Promise<void> {
	await setValue(driver, prefix, '');
	await driver.pause(500);
}

async function writeEvidence(tag: string): Promise<string> {
	const outDir = path.resolve('evidence', 'network-capture');
	await mkdir(outDir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const file = path.join(outDir, `mg116-pax-regression-${tag}-${stamp}.json`);
	await writeFile(file, JSON.stringify({ ticket: 'MG-116', target: TARGET, findings }, null, 2), 'utf8');
	return file;
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
		const contexts = (await driver.getContexts()) as string[];
		const webview = contexts.find(c => String(c).startsWith('WEBVIEW'));
		if (!webview) {
			log('ABORTA: sin contexto WEBVIEW.');
			return;
		}
		await driver.switchContext(webview);
		const url = (await driver.execute(() => window.location.href)) as string;
		log(`URL: ${url}`);
		if (/\/login/i.test(url)) {
			log('ABORTA: la app esta en el login. Correr `pnpm mobile:passenger:login-dump` primero.');
			return;
		}
		await installWebViewNetworkCapture(driver);

		// ══════════════════ FASE 1 · matriz de los tres campos ══════════════════
		if (PHASES.includes('1')) {
			phase('1', 'matriz de campos — Origen / Destino / Agregar otro destino');
			const perField: Record<string, unknown> = {};
			for (const f of FIELDS) {
				log(`\n-- campo "${f}" --`);
				// Cada campo arranca desde el home confirmado: si el modal del campo anterior quedo
				// abierto, este campo no seria visible y se reportaria "no existe" cuando si existe.
				if (!(await ensureHome(driver))) {
					log('   ABORTA el campo: no se pudo volver al home (modal previo sin cerrar).');
					perField[f] = { found: false, reason: 'home no alcanzable' };
					continue;
				}
				const focused = await focusField(driver, f);
				if (!focused) {
					log(`   NO ENCONTRADO: no hay input visible con placeholder que empiece con "${f}".`);
					perField[f] = { found: false, reason: 'placeholder no visible en el home' };
					continue;
				}
				const twoChars = await measureTerm(driver, f, 'ez');
				const threeChars = await measureTerm(driver, f, 'eze');
				log(`   2 chars -> ${twoChars.calls} llamada(s)  |  3 chars -> ${threeChars.calls} llamada(s)`);
				log(`   params: [${threeChars.params.join(', ')}]`);
				log(`   token: ${threeChars.tokens.join(', ') || '(ninguno)'}`);
				perField[f] = {
					found: true,
					twoCharCalls: twoChars.calls,
					threeCharCalls: threeChars.calls,
					params: threeChars.params,
					tokens: threeChars.tokens,
					gatingOk: twoChars.calls === 0 && threeChars.calls > 0,
					contractOk:
						threeChars.params.includes('address') &&
						threeChars.params.includes('latitude') &&
						threeChars.params.includes('longitude') &&
						!threeChars.params.includes('radius') &&
						!threeChars.params.includes('language')
				};
				await closeSearch(driver);
			}
			// TM-693: tokens independientes entre campos.
			const tokensByField = Object.entries(perField)
				.filter(([, v]) => (v as { found: boolean }).found)
				.map(([k, v]) => ({ field: k, tokens: (v as { tokens: string[] }).tokens }));
			const allTokens = tokensByField.flatMap(t => t.tokens);
			const distinct = new Set(allTokens);
			// TM-693 compara tokens ENTRE campos: con menos de dos campos medidos no hay comparacion
			// posible y el caso queda sin ejercer, no aprobado ni fallado.
			const tm693Verdict =
				tokensByField.length < 2
					? `NO EJERCIDO — solo ${tokensByField.length} campo(s) medido(s); hacen falta 2 para comparar`
					: distinct.size === allTokens.length
						? 'PASA — cada campo usa su propio token'
						: 'FALLA — los campos comparten token entre sesiones distintas';
			findings.phase1 = {
				perField,
				tokensByField,
				distinctTokenCount: distinct.size,
				totalTokenObservations: allTokens.length,
				tm693Verdict
			};
			log(
				`\nTM-693 (tokens entre campos): ${tokensByField.length} campo(s) medido(s), ${distinct.size} token(s) distinto(s) sobre ${allTokens.length} observacion(es)`
			);
			log(`   ${tm693Verdict}`);
			log(`Evidencia parcial -> ${await writeEvidence('f1')}`);
		}

		// ══════════════════ FASE 2 · seleccion con tap nativo ══════════════════
		if (PHASES.includes('2')) {
			phase('2', 'seleccion con TAP NATIVO — control primero, luego los casos');
			if (!(await ensureHome(driver))) log('AVISO: home no confirmado antes de la fase 2.');
			await focusField(driver, 'Origen');
			const m = await measureTerm(driver, 'Origen', 'corr');
			const drop = await readDropdown(driver);
			log(`llamadas: ${m.calls} | filas en payload: ${m.rows.length} | filas en dropdown: ${drop.length}`);
			if (m.rows.length === 0) {
				log('SIN DATOS: el termino no devolvio filas. Las aserciones de esta fase NO se ejercen.');
				findings.phase2_status = 'sin datos — cero filas devueltas';
			}
			for (const d of drop.slice(0, 6)) {
				log(`   · "${d.main}" / "${d.secondary}" | iconos=${d.icons} [${d.iconNames.join(',')}]`);
			}

			// TM-683 / TM-691: el icono debe diferenciar aeropuerto de direccion.
			const airportRows = m.rows.filter(r => r.source === 'AIRPORT');
			const cacheRows = m.rows.filter(r => r.source === 'CACHE');
			const dropAirport = drop.filter(d => airportRows.some(a => d.main.includes(a.mainText ?? ' ')));
			const dropCache = drop.filter(d => cacheRows.some(c => d.main.includes((c.mainText ?? ' ').slice(0, 20))));
			findings.phase2_icons = {
				airportRowsInDom: dropAirport.map(d => ({ main: d.main, icons: d.icons, iconNames: d.iconNames })),
				cacheRowsInDom: dropCache
					.slice(0, 3)
					.map(d => ({ main: d.main, icons: d.icons, iconNames: d.iconNames }))
			};
			log(
				`TM-683 (icono diferenciado): aeropuertos con ${dropAirport.map(d => d.icons).join('/')} icono(s), ` +
					`direcciones con ${dropCache
						.slice(0, 3)
						.map(d => d.icons)
						.join('/')} icono(s)`
			);

			// CONTROL: tap nativo sobre una fila que SI trae placeId.
			const withId = m.rows.find(r => r.placeId !== null && r.placeId !== undefined && r.mainText);
			let tapWorks = false;
			if (withId?.mainText) {
				const before = await fieldValues(driver);
				const bVal = before.find(f => f.placeholder.trim().startsWith('Origen'))?.value ?? '';
				await clearWebViewNetworkCapture(driver);
				const t = await tapNativeByText(driver, webview, withId.mainText.slice(0, 28));
				const after = await fieldValues(driver);
				const aVal = after.find(f => f.placeholder.trim().startsWith('Origen'))?.value ?? '';
				const post = await readWebViewNetworkCapture(driver);
				const res = (post.entries as Entry[]).filter(e => !String(e.url).includes('places/autocomplete'));
				tapWorks = aVal !== bVal || res.length > 0;
				findings.phase2_control = {
					target: withId.mainText,
					tapFound: t.found,
					nativeCoords: { x: t.x, y: t.y },
					originBefore: bVal,
					originAfter: aVal,
					resolutionCalls: res.map(r => ({ url: String(r.url).split('?')[0], status: r.status })),
					tapWorks
				};
				log(`\nCONTROL tap nativo -> "${withId.mainText.slice(0, 40)}"`);
				log(`   coords nativas: (${t.x}, ${t.y})`);
				log(`   Origen: "${bVal}" -> "${aVal}"`);
				log(`   llamadas de resolucion: ${res.length}`);
				for (const r of res.slice(0, 4)) log(`     · ${String(r.url).split('?')[0]} -> ${r.status ?? '?'}`);
				log(`   ${tapWorks ? 'EL TAP NATIVO FUNCIONA' : 'el tap nativo TAMPOCO puebla — sigue indeterminado'}`);
			} else {
				log('CONTROL: no hubo fila con placeId para usar de control.');
			}

			// TM-684: seleccionar el aeropuerto con placeId nulo, SOLO si el control valido el metodo.
			if (tapWorks) {
				const nullAir = m.rows.find(r => r.source === 'AIRPORT' && r.placeId === null && r.mainText);
				if (nullAir?.mainText) {
					await focusField(driver, 'Origen');
					await measureTerm(driver, 'Origen', 'corr');
					const before = await fieldValues(driver);
					const bVal = before.find(f => f.placeholder.trim().startsWith('Origen'))?.value ?? '';
					await clearWebViewNetworkCapture(driver);
					const t = await tapNativeByText(driver, webview, nullAir.mainText);
					const after = await fieldValues(driver);
					const aVal = after.find(f => f.placeholder.trim().startsWith('Origen'))?.value ?? '';
					const post = await readWebViewNetworkCapture(driver);
					const res = (post.entries as Entry[]).filter(e => !String(e.url).includes('places/autocomplete'));
					const resolved = aVal !== bVal;
					findings.phase2_tm684 = {
						target: nullAir,
						tapFound: t.found,
						originBefore: bVal,
						originAfter: aVal,
						resolutionCalls: res.map(r => ({
							url: String(r.url).split('?')[0],
							status: r.status,
							carriesToken: Boolean(paramOf(String(r.url), 'sessionToken'))
						})),
						resolved
					};
					log(`\nTM-684 · seleccion de "${nullAir.mainText}" (iata=${nullAir.iataCode}, placeId=null)`);
					log(`   Origen: "${bVal}" -> "${aVal}"`);
					log(`   llamadas de resolucion: ${res.length}`);
					for (const r of res.slice(0, 4)) log(`     · ${String(r.url).split('?')[0]} -> ${r.status ?? '?'}`);
					log(`   ${resolved ? 'PASA — resolvio y poblo el campo' : 'FALLA — el campo no se poblo'}`);

					// TM-687: token nuevo en la busqueda siguiente.
					const tokenBefore = m.tokens[0] ?? '';
					await focusField(driver, 'Origen');
					const next = await measureTerm(driver, 'Origen', 'ezei');
					findings.phase2_tm687 = {
						tokenBefore,
						tokenAfter: next.tokens[0] ?? '',
						rotated: Boolean(next.tokens[0]) && next.tokens[0] !== tokenBefore
					};
					log(
						`\nTM-687 · rotacion de token: ${tokenBefore.slice(0, 8)}... -> ${(
							next.tokens[0] ?? '(ninguno)'
						).slice(0, 8)}... ${next.tokens[0] && next.tokens[0] !== tokenBefore ? 'ROTO' : 'NO ROTO'}`
					);
					await closeSearch(driver);
				}
			} else {
				log('\nTM-684/TM-687 quedan INDETERMINADOS: el control no valido el metodo de tap.');
			}
			log(`Evidencia parcial -> ${await writeEvidence('f2')}`);
		}

		// ══════════════════ FASE 3 · orden de las predicciones (TM-727) ══════════════════
		if (PHASES.includes('3')) {
			phase('3', 'TM-727 — orden: cercanas de cache por encima de aeropuertos lejanos');
			if (!(await ensureHome(driver))) log('AVISO: home no confirmado antes de la fase 3.');
			await focusField(driver, 'Origen');
			const m = await measureTerm(driver, 'Origen', 'corr');
			const ordered = m.rows.map((r, i) => ({
				pos: i,
				source: r.source,
				main: r.mainText,
				secondary: r.secondaryText,
				iata: r.iataCode
			}));
			for (const o of ordered.slice(0, 10)) {
				log(`   [${o.pos}] ${o.source} | ${o.main} | ${o.secondary ?? '-'}`);
			}
			const firstAirport = ordered.findIndex(o => o.source === 'AIRPORT');
			const firstCache = ordered.findIndex(o => o.source === 'CACHE');
			// Un veredicto SOLO es valido si hay filas de las dos clases. Sin datos, la ausencia de
			// defecto es indistinguible de la ausencia de medicion: se reporta SIN DATOS, nunca "correcto".
			const hasBoth = firstAirport !== -1 && firstCache !== -1;
			const defectPresent = hasBoth && firstAirport < firstCache;
			const verdict = !ordered.length
				? 'SIN DATOS — cero filas devueltas, la medicion no ocurrio'
				: !hasBoth
					? `SIN DATOS SUFICIENTES — ${ordered.length} fila(s) pero falta una de las dos clases (AIRPORT=${
							firstAirport !== -1
						}, CACHE=${firstCache !== -1})`
					: defectPresent
						? 'DEFECTO PRESENTE — aeropuertos rankeados antes que direcciones'
						: 'orden correcto — direcciones cercanas primero';
			findings.phase3_tm727 = {
				ordered,
				firstAirportAt: firstAirport,
				firstCacheAt: firstCache,
				hasBothClasses: hasBoth,
				defectPresent: hasBoth ? defectPresent : null,
				verdict
			};
			log(
				`\nTM-727: ${ordered.length} fila(s) | primer AIRPORT en pos ${firstAirport}, primer CACHE en pos ${firstCache}`
			);
			log(`   ${verdict}`);
			if (defectPresent) {
				const air = ordered.filter(o => o.source === 'AIRPORT').slice(0, 3);
				log('   aeropuertos rankeados primero:');
				for (const a of air) log(`     · ${a.main} (${a.secondary})`);
			}
			await closeSearch(driver);
			log(`Evidencia parcial -> ${await writeEvidence('f3')}`);
		}

		// ══════════════════ FASE 4 · degradacion (TM-689 / TM-697) ══════════════════
		if (PHASES.includes('4')) {
			phase('4', 'degradacion — TM-689 (5xx, timeout) y TM-697 (error de red)');
			const modes: Array<{ tm: string; mode: 'status' | 'timeout' | 'networkError'; status?: number }> = [
				{ tm: 'TM-689 · 500', mode: 'status', status: 500 },
				{ tm: 'TM-689 · timeout', mode: 'timeout' },
				{ tm: 'TM-697 · error de red', mode: 'networkError' }
			];
			const degraded: Record<string, unknown> = {};
			for (const { tm, mode, status } of modes) {
				log(`\n-- ${tm} --`);
				const gBefore = await readWebViewGoogleActivity(driver);
				await installWebViewFaultInjection(driver, [
					{
						id: `mg116-${mode}`,
						urlPattern: 'places/autocomplete',
						mode,
						...(status ? { status } : {}),
						...(mode === 'timeout' ? { delayMs: 8000 } : {})
					}
				]);
				await focusField(driver, 'Origen');
				await setValue(driver, 'Origen', '');
				await driver.pause(400);
				await clearWebViewNetworkCapture(driver);
				await setValue(driver, 'Origen', 'corrientes');
				await driver.pause(mode === 'timeout' ? 11000 : SETTLE_MS);

				const drop = await readDropdown(driver);
				const fv = await fieldValues(driver);
				const usable = fv.some(f => f.placeholder.trim().startsWith('Origen'));
				const loaders = await loaderCount(driver);
				const gAfter = await readWebViewGoogleActivity(driver);
				const newGoogle = gAfter.resourceEntries.length - gBefore.resourceEntries.length;
				const alive = (await driver.execute(() => document.querySelectorAll('input').length)) as number;

				degraded[tm] = {
					dropdownRows: drop.length,
					fieldStillPresent: usable,
					visibleLoaders: loaders,
					newGoogleResources: newGoogle,
					googleProbeAvailable: gAfter.available,
					inputsInDom: alive
				};
				log(`   dropdown: ${drop.length} fila(s) | loaders visibles: ${loaders} | inputs en DOM: ${alive}`);
				log(
					`   trafico NUEVO a Google: ${newGoogle} ${
						newGoogle === 0 ? '(sin fallback silencioso)' : '(REVISAR: posible fallback)'
					}`
				);
				log(`   campo sigue presente: ${usable ? 'si' : 'NO — posible crash o pantalla rota'}`);
				await clearWebViewFaultInjection(driver).catch(() => undefined);
				await closeSearch(driver);
			}
			findings.phase4_degradation = degraded;
			log(`Evidencia parcial -> ${await writeEvidence('f4')}`);
		}

		// ══════════════════ FASE 5 · estados (TM-688 / TM-694) ══════════════════
		if (PHASES.includes('5')) {
			phase('5', 'estados — TM-688 (vacio controlado) y TM-694 (skipLoader)');
			await focusField(driver, 'Origen');

			// TM-688: termino sin resultados.
			const empty = await measureTerm(driver, 'Origen', 'zzqqxx');
			const emptyDrop = await readDropdown(driver);
			const errVisible = (await driver.execute(() => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				return Array.from(document.querySelectorAll('ion-toast, .error, .alert, [role="alert"]')).filter(vis)
					.length;
			})) as number;
			findings.phase5_tm688 = {
				calls: empty.calls,
				status: empty.status,
				payloadRows: empty.rows.length,
				dropdownRows: emptyDrop.length,
				errorElements: errVisible
			};
			log(
				`\nTM-688: ${empty.calls} llamada(s), status ${empty.status}, ${empty.rows.length} fila(s) en payload, ` +
					`${emptyDrop.length} en dropdown, ${errVisible} elemento(s) de error visibles`
			);
			log(
				`   ${
					empty.calls > 0 && empty.status === 200 && emptyDrop.length === 0 && errVisible === 0
						? 'PASA — vacio controlado, sin banner de error'
						: 'REVISAR'
				}`
			);

			// TM-694: ningun loader global durante el tecleo.
			await setValue(driver, 'Origen', '');
			await driver.pause(400);
			const loaderSamples: number[] = [];
			const term = 'corrientes';
			for (let i = 1; i <= term.length; i++) {
				await setValue(driver, 'Origen', term.slice(0, i));
				loaderSamples.push(await loaderCount(driver));
				await driver.pause(120);
			}
			await driver.pause(SETTLE_MS);
			loaderSamples.push(await loaderCount(driver));
			const maxLoaders = Math.max(...loaderSamples);
			findings.phase5_tm694 = { loaderSamples, maxLoaders };
			log(`\nTM-694 (skipLoader): muestras de loader por pulsacion -> [${loaderSamples.join(',')}]`);
			log(
				`   ${maxLoaders === 0 ? 'PASA — ninguna pulsacion disparo el loader global' : `REVISAR — hasta ${maxLoaders} loader(s) visibles`}`
			);
			await closeSearch(driver);
		}

		const file = await writeEvidence('final');
		log(`\n${'='.repeat(58)}\nEvidencia final -> ${file}`);
	} finally {
		await clearWebViewFaultInjection(driver).catch(() => undefined);
		await driver.deleteSession();
	}
}

run().catch(async (e: Error) => {
	console.error('[reg] Error:', e.message ?? e);
	try {
		const f = await writeEvidence('crash');
		console.error(`[reg] Evidencia parcial guardada -> ${f}`);
	} catch {
		/* nada mas que hacer */
	}
	process.exit(1);
});
