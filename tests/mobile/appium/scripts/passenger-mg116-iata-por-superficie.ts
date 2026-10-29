/**
 * MG-116 — el mismo codigo IATA de 3 letras en DOS superficies, lado a lado.
 *
 * POR QUE EXISTE: el barrido de longitudes midio que en Perfil > Mis Direcciones la primera
 * consulta recien sale con 4 caracteres, mientras que en el home sale con 3. Un piso de 4 no es
 * una metrica incomoda: significa que un codigo IATA — que mide exactamente 3 — NO dispara
 * busqueda en esa pantalla. Este script lo demuestra con el termino que un usuario escribiria.
 *
 * Escribe `eze` en las dos superficies y reporta, para cada una, cuantas consultas salieron y que
 * predicciones se vieron. Es la evidencia que el Dev puede reproducir en dos taps.
 *
 * NO guarda direcciones, no crea viajes y no confirma nada: escribe en el campo y mide.
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveDriverTarget } from './_shared/resolveDriverTarget';
import { ScreenEvidence } from '../helpers/screenEvidence';

const TARGET = resolveDriverTarget('passenger');
const TERM = process.env.MG116_IATA_TERM ?? 'eze';
/** Termino de control de 4 caracteres: separa "no consulta nunca" de "el piso es 4". */
const CONTROL = process.env.MG116_CONTROL_TERM ?? 'ezei';
const SETTLE_MS = 5200;
const AUTOCOMPLETE_PATH = 'places/autocomplete';

const log = (m: string): void => console.log(`[iata] ${m}`);
const line = (): void => log('='.repeat(74));

type Measure = {
	surface: string;
	fieldSelector: string;
	term: string;
	ownCalls: number;
	googleResources: number;
	urls: string[];
	predictions: string[];
};

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
			'appium:deviceName': process.env.ANDROID_DEVICE_NAME ?? 'SM-A055M',
			'appium:udid': TARGET.udid,
			'appium:appPackage': TARGET.appPackage,
			'appium:appActivity': '.MainActivity',
			'appium:noReset': true,
			'appium:forceAppLaunch': false,
			'appium:newCommandTimeout': 300
		}
	});

	const out: Record<string, unknown> = {
		ticket: 'MG-116',
		question: 'un codigo IATA de 3 letras, dispara busqueda en cada superficie?',
		env: TARGET.env,
		appPackage: TARGET.appPackage,
		term: TERM,
		controlTerm: CONTROL,
		startedAt: new Date().toISOString()
	};
	const measures: Measure[] = [];
	let webview = '';
	const evidence = new ScreenEvidence(
		driver,
		`mg116-iata-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
	);

	try {
		const contexts = (await driver.getContexts()) as unknown as string[];
		webview = contexts.map(String).find(c => c.startsWith('WEBVIEW')) ?? '';
		if (!webview) throw new Error('sin contexto WEBVIEW');
		await driver.switchContext(webview);
		await driver.pause(4000);

		/**
		 * Un solo canal: Resource Timing.
		 *
		 * Sirve para las dos preguntas a la vez. Ve las llamadas del endpoint propio porque salen por
		 * XHR/fetch y quedan como entradas `resource`, y ve las de Google aunque el SDK JS de Places
		 * use su propio transporte y no pase por `fetch`. Parchear `fetch` y `XMLHttpRequest` ademas
		 * de esto no agregaba informacion: solo duplicaba el mismo dato con mas superficie de error.
		 */
		const resourceUrls = async (pattern: RegExp): Promise<string[]> => {
			const all = (await driver.execute(() => {
				return performance.getEntriesByType('resource').map(e => e.name);
			})) as string[];
			return all.filter(n => pattern.test(n));
		};

		const ownUrls = async (): Promise<string[]> =>
			resourceUrls(new RegExp(AUTOCOMPLETE_PATH.replace('/', '\\/'), 'i'));
		const googleCount = async (): Promise<number> =>
			(await resourceUrls(/maps\.googleapis\.com|places\.googleapis\.com/i)).length;

		const readPredictions = async (): Promise<string[]> =>
			(await driver.execute(() => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				return Array.from(document.querySelectorAll('ion-item, ion-list ion-label, li'))
					.filter(vis)
					.map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim())
					.filter(t => t.length > 6)
					.slice(0, 6);
			})) as string[];

		const typeInto = async (selector: string, value: string): Promise<boolean> =>
			(await driver.execute(
				(sel: string, v: string) => {
					const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
					const t = Array.from(document.querySelectorAll(sel)).filter(vis)[0] as HTMLInputElement | undefined;
					if (!t || t.readOnly || t.disabled) return false;
					const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
					setter?.call(t, '');
					t.dispatchEvent(new Event('input', { bubbles: true }));
					setter?.call(t, v);
					t.dispatchEvent(new Event('input', { bubbles: true }));
					t.dispatchEvent(new Event('ionInput', { bubbles: true } as EventInit));
					return t.value === v;
				},
				selector,
				value
			)) as boolean;

		const tapText = async (needle: string, sel: string): Promise<boolean> => {
			const box = (await driver
				.execute(
					(s: string, q: string) => {
						const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
						const cand = Array.from(document.querySelectorAll(s)).filter(
							e => vis(e) && (e.textContent ?? '').toLowerCase().includes(q.toLowerCase())
						);
						const depth = (el: Element): number => {
							let n = 0;
							for (let p = el.parentElement; p; p = p.parentElement) n++;
							return n;
						};
						const t = cand.sort((a, b) => depth(b) - depth(a))[0];
						if (!t) return null;
						t.scrollIntoView({ block: 'center' });
						const b = t.getBoundingClientRect();
						if (!b.width || !b.height) return null;
						return {
							x: b.left + b.width / 2,
							y: b.top + b.height / 2,
							vw: window.innerWidth,
							vh: window.innerHeight
						};
					},
					sel,
					needle
				)
				.catch(() => null)) as { x: number; y: number; vw: number; vh: number } | null;
			if (!box) return false;
			await driver.switchContext('NATIVE_APP');
			const wv = await driver.$('//android.webkit.WebView');
			const loc = await wv.getLocation();
			const size = await wv.getSize();
			await driver.performActions([
				{
					type: 'pointer',
					id: 'finger1',
					parameters: { pointerType: 'touch' },
					actions: [
						{
							type: 'pointerMove',
							duration: 0,
							x: Math.round(loc.x + box.x * (size.width / box.vw)),
							y: Math.round(loc.y + box.y * (size.height / box.vh))
						},
						{ type: 'pointerDown', button: 0 },
						{ type: 'pause', duration: 130 },
						{ type: 'pointerUp', button: 0 }
					]
				}
			]);
			await driver.releaseActions().catch(() => undefined);
			await driver.switchContext(webview);
			await driver.pause(2600);
			return true;
		};

		const measure = async (surface: string, selector: string, term: string): Promise<Measure | null> => {
			// Linea base ANTES de escribir: Resource Timing acumula, asi que lo que importa es el DELTA.
			const ownBefore = (await ownUrls()).length;
			const gBefore = await googleCount();
			const typed = await typeInto(selector, term);
			if (!typed) {
				log(`  "${term}" en ${surface}: el campo NO acepto texto (selector ${selector})`);
				return null;
			}
			await driver.pause(SETTLE_MS);
			const urls = (await ownUrls()).slice(ownBefore);
			const m: Measure = {
				surface,
				fieldSelector: selector,
				term,
				ownCalls: urls.length,
				googleResources: (await googleCount()) - gBefore,
				urls: urls.map(x => x.slice(0, 150)),
				predictions: await readPredictions()
			};
			measures.push(m);
			log(
				`  "${term}" -> ${m.ownCalls} consulta(s) a places/autocomplete · ${m.googleResources} recurso(s) de Google`
			);
			for (const p of m.predictions.slice(0, 3)) log(`       prediccion: ${p.slice(0, 90)}`);
			await evidence
				.capture(`${surface.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${term}`)
				.catch(() => undefined);
			return m;
		};

		line();
		log(`ambiente=${TARGET.env} · package=${TARGET.appPackage}`);
		log(`pregunta: "${TERM}" (${TERM.length} caracteres, codigo IATA) dispara busqueda en cada superficie?`);
		log(`control:  "${CONTROL}" (${CONTROL.length} caracteres) — separa "no consulta nunca" de "el piso es 4"`);
		line();

		// --------------------------------------------------------------- superficie 1: el home
		//
		// `MG116_SKIP_HOME=1` salta esta pata. Hace falta porque escribir en una fila del home ABRE el
		// panel de "Mis Direcciones / Ultimos Destinos", que tapa la barra de tabs: la navegacion a
		// Mi cuenta > Direcciones despues de medir el home no llega nunca. Las dos superficies se
		// miden en sesiones separadas, con la app relanzada en medio, y el reporte las junta.
		if (process.env.MG116_SKIP_HOME === '1') {
			log('MG116_SKIP_HOME=1 -> se omite la pata del home');
		} else {
			log('HOME — la fila de direccion editable');
			const homeSel = (await driver.execute(() => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const hit = Array.from(document.querySelectorAll('input'))
					.filter(vis)
					.map(el => el as HTMLInputElement)
					.filter(i => /origen|destino/i.test(i.placeholder ?? ''))
					.find(i => !i.readOnly && !i.disabled);
				return hit ? hit.placeholder : '';
			})) as string;
			if (!homeSel) {
				log('  ABORTA: el home no tiene ninguna fila de direccion editable en este estado.');
			} else {
				const sel = `input[placeholder=${JSON.stringify(homeSel)}]`;
				log(`  campo: "${homeSel.trim()}"`);
				await measure('home', sel, TERM);
				await measure('home', sel, CONTROL);
			}
		}

		// --------------------------------------------------------------- superficie 2: Mis Direcciones
		line();
		log('PERFIL > MIS DIRECCIONES — el campo del formulario');
		await tapText('mi cuenta', 'ion-tab-button, ion-label');
		await tapText('direccion', 'ion-item, ion-label, button');
		const url = (await driver.execute(() => window.location.href)) as string;
		if (!/AddressesPage/i.test(url)) {
			log(`  ABORTA: no se alcanzo /AddressesPage (quedo en ${url.slice(0, 60)}).`);
		} else {
			// El formulario exige elegir un Tipo antes de habilitar el campo.
			await tapText('tipo', 'ion-select, ion-item');
			await driver
				.execute(() => {
					const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
					const opt = Array.from(
						document.querySelectorAll('ion-select-popover ion-item, ion-popover ion-item, ion-radio')
					).filter(vis)[0] as HTMLElement | undefined;
					opt?.click();
				})
				.catch(() => undefined);
			await driver.pause(1600);
			const sel = 'app-addresses input[name="input-from"], input[name="input-from"]';
			await measure('mis-direcciones', sel, TERM);
			await measure('mis-direcciones', sel, CONTROL);
		}

		// --------------------------------------------------------------- comparacion
		line();
		log('COMPARACION');
		line();
		const rows = measures.map(
			m => `  ${m.surface.padEnd(18)} "${m.term}" (${m.term.length} car.) -> ${m.ownCalls} consulta(s)`
		);
		for (const r of rows) log(r);

		const homeIata = measures.find(m => m.surface === 'home' && m.term === TERM);
		const dirIata = measures.find(m => m.surface === 'mis-direcciones' && m.term === TERM);
		const dirControl = measures.find(m => m.surface === 'mis-direcciones' && m.term === CONTROL);

		log('');
		if (homeIata && dirIata) {
			if (homeIata.ownCalls > 0 && dirIata.ownCalls === 0) {
				log(
					`VEREDICTO: DIVERGENCIA CONFIRMADA. "${TERM}" consulta en el home y NO consulta en Mis Direcciones.`
				);
				if (dirControl && dirControl.ownCalls > 0) {
					log(
						`           Y el control de ${CONTROL.length} caracteres SI consulta ahi, asi que el campo funciona:`
					);
					log(
						`           el piso de Mis Direcciones es 4 y no 3. Un codigo IATA no dispara busqueda en esa pantalla.`
					);
				} else {
					log(
						'           El control tampoco consulto, asi que no se puede afirmar el piso: revisar el estado del campo.'
					);
				}
			} else if (homeIata.ownCalls > 0 && dirIata.ownCalls > 0) {
				log(`VEREDICTO: sin divergencia con "${TERM}" — las dos superficies consultan.`);
			} else {
				log('VEREDICTO: SIN DATOS suficientes — el home no consulto, asi que no hay linea base para comparar.');
			}
		} else if (process.env.MG116_SKIP_HOME === '1' && dirIata) {
			log(
				`PATA AISLADA (Mis Direcciones): "${TERM}" -> ${dirIata.ownCalls} consulta(s) · "${CONTROL}" -> ${dirControl?.ownCalls ?? 'no medido'} consulta(s).`
			);
			log('           Comparar contra la corrida del home, que se mide en su propia sesion.');
		} else {
			log('VEREDICTO: SIN DATOS — falto alcanzar una de las dos superficies. Ver el volcado.');
		}
		line();
	} finally {
		out.measures = measures;
		const dir = path.join(process.cwd(), 'evidence', 'network-capture');
		await mkdir(dir, { recursive: true }).catch(() => undefined);
		const file = path.join(dir, `mg116-iata-por-superficie-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
		await writeFile(file, JSON.stringify(out, null, 2), 'utf8');
		log(`volcado -> ${path.relative(process.cwd(), file)}`);
		await driver.deleteSession().catch(() => undefined);
	}
}

run().catch(err => {
	console.error('[iata] termino con error:', err?.message ?? err);
	process.exitCode = 1;
});
