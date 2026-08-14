/**
 * MG-116 — Medicion de los gates de autocomplete de App PAX que el ojo no resuelve en el panel de red.
 *
 * Portado de `driver-mg117-gates.ts` (campana gemela, cerrada 16/17). Mismo contrato de backend
 * (`places/autocomplete`, MG-118), misma instrumentacion. Lo que cambia es la superficie:
 *
 *   · Actor `passenger` en vez de `driver` (paquete resuelto por ENV, nunca por literal).
 *   · Driver tiene UN buscador tras abrir el modal "Editar viaje"; PAX tiene TRES campos en el home
 *     (`Origen `, `Destino `, `Agregar otro destino `). El script apunta a UNO por placeholder en vez
 *     de asumir "el unico editable" — con tres campos, esa heuristica del script de Driver elegiria
 *     al azar y la medicion no seria atribuible a un campo concreto.
 *
 * Casos que mide (set TM-669):
 *   TM-680 (TC7)  — con 2 caracteres NO se consulta
 *   TM-681 (TC8)  — con exactamente 3 caracteres SI se consulta. PAX es la superficie que corrigio
 *                   el operador `>` por `>=`; en Driver este gate estaba escrito para fallar.
 *   TM-682 (TC9)  — con 4 caracteres la respuesta combina aeropuertos por nombre y direcciones de cache.
 *                   Dato corregido: `corr`, NO `ezei` (que devuelve 8 filas todas CACHE).
 *   TM-679 (TC6)  — termino repetido no vuelve a consultar (distinctUntilChanged)
 *   TM-678 (TC5)  — debounce. NO emite veredicto: ver §DEBOUNCE abajo.
 *   TM-686 (TC13) — todas las llamadas de una sesion comparten sessionToken (conformidad del cliente)
 *   TM-675 (TC2)  — el request lleva address + ambas coordenadas y NO lleva radius ni language
 *   TM-674 (TC1)  — cero trafico a Google durante todo el recorrido
 *
 * Ademas volca los response bodies, que son la evidencia de tres casos mas sin correrlos aparte:
 *   TM-684 (TC11) — nulidad de `placeId` en filas `source=AIRPORT`
 *   TM-691 (TC18) — filas `source=CACHE` con el flag `airport` en true sobre direcciones de calle
 *   TM-692 (TC19) — filas `source=GOOGLE` con `latitude`/`longitude` en NULL
 *
 * §DEBOUNCE — por que TM-678 se mide y NO se dictamina.
 * Conviven TRES valores declarados para la misma pantalla: MG-116 dice ~300 ms, MG-552 dice <=400 ms,
 * y `travel-edit-input.component.ts` shippea 2500 ms, sobre cinco implementaciones paralelas de
 * autocomplete. Con eso, un valor medido de 350 ms no es PASA ni FALLA: no hay contra que comparar.
 * El script reporta el numero medido y contra cual de los tres candidatos es compatible, para que la
 * decision de Dev se tome sobre un dato y no sobre la lectura de tres tickets que se contradicen.
 *
 * PRECONDICION: Passenger en el home de alta de viaje, sesion iniciada (si aparece el login, correr
 * primero `pnpm mobile:passenger:login-dump`). El script NO loguea por su cuenta.
 *
 * Uso:
 *   $env:ANDROID_UDID="R92XB0B8F3J"; $env:ENV="test"
 *   pnpm exec ts-node --esm tests/mobile/appium/scripts/passenger-mg116-gates.ts
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveDriverTarget } from './_shared/resolveDriverTarget';
import {
	installWebViewNetworkCapture,
	clearWebViewNetworkCapture,
	readWebViewNetworkCapture,
	readWebViewGoogleActivity
} from '../helpers/webViewNetworkCapture';

const TARGET = resolveDriverTarget('passenger');
const APPIUM_URL = TARGET.appiumUrl;
const UDID = TARGET.udid;
const APP_PACKAGE = TARGET.appPackage;

/** Muy por debajo del menor de los tres candidatos, para que cualquier debounce sano colapse el termino. */
const KEY_GAP_MS = Number(process.env.KEY_GAP_MS ?? 80);
/** Campo bajo medicion. `Origen` es el que MG-552 tambien toca, asi que es el de mayor valor. */
const FIELD_PREFIX = (process.env.PAX_FIELD ?? 'Origen').trim();
/** Espera tras el ultimo caracter. Debe superar al mayor candidato de debounce (2500 ms) con margen. */
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 3500);

const log = (msg: string): void => console.log(`[mg116] ${msg}`);

type Entry = {
	url: string;
	startedAt: string;
	status?: number;
	responseBody?: string;
};

type Prediction = {
	placeId: string | null;
	mainText?: string;
	secondaryText?: string | null;
	shortName?: string;
	latitude?: string | null;
	longitude?: string | null;
	airport?: boolean;
	iataCode?: string | null;
	source?: string;
};

type Measurement = {
	label: string;
	term: string;
	calls: number;
	addresses: string[];
	sessionTokens: string[];
	/** Parametros presentes en el query string de la PRIMERA llamada. Base de TM-675. */
	paramsSeen: string[];
	msFromLastKeystroke: number | null;
	gapsMs: number[];
	predictions: Prediction[];
};

/**
 * Resuelve el input objetivo DENTRO del WebView. Dos modos porque PAX puede exponer el campo
 * editable en el home o detras de un modal, y el modal no necesariamente conserva el placeholder.
 */
type FieldMode = 'placeholder' | 'onlyEditable';

async function probeField(
	driver: WebdriverIO.Browser,
	prefix: string
): Promise<{ byPlaceholder: number; readOnly: boolean | null; editableTotal: number }> {
	return (await driver.execute((p: string) => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const all = Array.from(document.querySelectorAll('input')).filter(visible) as HTMLInputElement[];
		const byPh = all.filter(el => (el.placeholder ?? '').trim().toLowerCase().startsWith(p.toLowerCase()));
		return {
			byPlaceholder: byPh.length,
			readOnly: byPh[0] ? byPh[0].readOnly : null,
			editableTotal: all.filter(el => !el.readOnly).length
		};
	}, prefix)) as { byPlaceholder: number; readOnly: boolean | null; editableTotal: number };
}

/** Abre el campo tocandolo, para el caso en que PAX lo exponga readonly y delegue en un modal. */
async function openField(driver: WebdriverIO.Browser, prefix: string): Promise<boolean> {
	const opened = (await driver.execute((p: string) => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const target = Array.from(document.querySelectorAll('input'))
			.filter(visible)
			.find(el =>
				((el as HTMLInputElement).placeholder ?? '').trim().toLowerCase().startsWith(p.toLowerCase())
			) as HTMLInputElement | undefined;
		if (!target) return false;
		target.focus();
		target.dispatchEvent(new Event('ionFocus', { bubbles: true, composed: true } as EventInit));
		target.click();
		return true;
	}, prefix)) as boolean;
	await driver.pause(1800);
	return opened;
}

async function setValue(
	driver: WebdriverIO.Browser,
	mode: FieldMode,
	prefix: string,
	value: string,
	markLastKeystroke: boolean
): Promise<void> {
	await driver.execute(
		(m: string, p: string, v: string, mark: boolean) => {
			const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const all = Array.from(document.querySelectorAll('input')).filter(visible) as HTMLInputElement[];
			const target =
				m === 'placeholder'
					? all.find(el => (el.placeholder ?? '').trim().toLowerCase().startsWith(p.toLowerCase()))
					: all.find(el => !el.readOnly);
			if (!target) return;
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
			setter?.call(target, v);
			target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
			target.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
			// Mismo reloj que el hook de captura: el delta del debounce no arrastra desfase con el host.
			if (mark) (window as any).__mg116LastKeystrokeAt = Date.now();
		},
		mode,
		prefix,
		value,
		markLastKeystroke
	);
}

async function clearField(driver: WebdriverIO.Browser, mode: FieldMode, prefix: string): Promise<void> {
	await setValue(driver, mode, prefix, '', false);
	await driver.pause(700);
}

async function typeTerm(
	driver: WebdriverIO.Browser,
	mode: FieldMode,
	prefix: string,
	term: string,
	gapMs: number
): Promise<void> {
	for (let i = 1; i <= term.length; i++) {
		await setValue(driver, mode, prefix, term.slice(0, i), i === term.length);
		if (i < term.length) await driver.pause(gapMs);
	}
}

function paramOf(url: string, name: string): string {
	const match = new RegExp(`[?&]${name}=([^&]*)`).exec(url);
	return match ? decodeURIComponent(match[1]) : '';
}

function paramNames(url: string): string[] {
	const qs = url.split('?')[1];
	if (!qs) return [];
	return qs.split('&').map(kv => kv.split('=')[0]).filter(Boolean);
}

/** El endpoint devuelve un ARRAY PELADO, sin envelope — medido en vivo el 2026-08-12. */
function parsePredictions(body: string | undefined): Prediction[] {
	if (!body) return [];
	try {
		const parsed = JSON.parse(body);
		return Array.isArray(parsed) ? (parsed as Prediction[]) : [];
	} catch {
		return [];
	}
}

async function measure(
	driver: WebdriverIO.Browser,
	mode: FieldMode,
	label: string,
	term: string
): Promise<Measurement> {
	await clearField(driver, mode, FIELD_PREFIX);
	await clearWebViewNetworkCapture(driver);
	await typeTerm(driver, mode, FIELD_PREFIX, term, KEY_GAP_MS);
	await driver.pause(SETTLE_MS);

	const lastKeystrokeAt = (await driver.execute(
		() => (window as any).__mg116LastKeystrokeAt ?? null
	)) as number | null;
	const capture = await readWebViewNetworkCapture(driver);
	const calls = (capture.entries as Entry[]).filter(e => String(e.url).includes('places/autocomplete'));

	const startedTimes = calls.map(c => new Date(c.startedAt).getTime()).sort((a, b) => a - b);
	const gapsMs = startedTimes.slice(1).map((t, i) => t - startedTimes[i]);

	return {
		label,
		term,
		calls: calls.length,
		addresses: calls.map(c => paramOf(String(c.url), 'address')),
		sessionTokens: Array.from(new Set(calls.map(c => paramOf(String(c.url), 'sessionToken')).filter(Boolean))),
		paramsSeen: calls.length ? paramNames(String(calls[0].url)) : [],
		msFromLastKeystroke: lastKeystrokeAt && startedTimes.length > 0 ? startedTimes[0] - lastKeystrokeAt : null,
		gapsMs,
		predictions: calls.flatMap(c => parsePredictions(c.responseBody))
	};
}

function report(m: Measurement): void {
	log(`\n-- ${m.label} -- termino "${m.term}"`);
	log(`   llamadas: ${m.calls}`);
	if (m.addresses.length) log(`   address enviados: ${m.addresses.join(' | ')}`);
	if (m.paramsSeen.length) log(`   parametros del request: ${m.paramsSeen.join(', ')}`);
	if (m.sessionTokens.length) log(`   sessionToken(s): ${m.sessionTokens.join(' | ')}`);
	if (m.msFromLastKeystroke !== null) log(`   ms desde la ultima tecla: ${m.msFromLastKeystroke}`);
	if (m.gapsMs.length) log(`   separacion entre llamadas: ${m.gapsMs.join(', ')} ms`);
	if (m.predictions.length) {
		const bySource = m.predictions.reduce<Record<string, number>>((acc, p) => {
			const k = p.source ?? '(sin source)';
			acc[k] = (acc[k] ?? 0) + 1;
			return acc;
		}, {});
		log(`   filas por source: ${Object.entries(bySource).map(([k, v]) => `${k}=${v}`).join(', ')}`);
	}
}

/** Analisis de los bodies: evidencia de TM-684, TM-691 y TM-692 sin una corrida aparte. */
function analyzePredictions(all: Prediction[]): {
	airportNullPlaceId: Prediction[];
	cacheFlaggedAirport: Prediction[];
	googleNullCoords: Prediction[];
	stringCoords: boolean;
} {
	const airportNullPlaceId = all.filter(p => p.source === 'AIRPORT' && (p.placeId === null || p.placeId === undefined));
	const cacheFlaggedAirport = all.filter(p => p.source === 'CACHE' && p.airport === true);
	const googleNullCoords = all.filter(
		p => p.source === 'GOOGLE' && (p.latitude === null || p.longitude === null)
	);
	const withCoords = all.find(p => p.latitude !== null && p.latitude !== undefined);
	return {
		airportNullPlaceId,
		cacheFlaggedAirport,
		googleNullCoords,
		stringCoords: withCoords ? typeof withCoords.latitude === 'string' : false
	};
}

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
			'appium:noReset': true,
			'appium:forceAppLaunch': false,
			'appium:newCommandTimeout': 240,
			'appium:chromedriverAutodownload': true
		} as Record<string, unknown>
	});

	const results: Measurement[] = [];

	try {
		const contexts = (await driver.getContexts()) as string[];
		const webview = contexts.find(c => String(c).startsWith('WEBVIEW'));
		if (!webview) {
			log('ABORTA: sin contexto WEBVIEW. La app es Ionic/Cordova, asi que sin WebView no hay nada que medir.');
			return;
		}
		await driver.switchContext(webview);

		const url = (await driver.execute(() => window.location.href)) as string;
		log(`URL: ${url}`);

		if (/\/login/i.test(url)) {
			log('ABORTA: la app esta en el login. Correr primero `pnpm mobile:passenger:login-dump`.');
			return;
		}

		await installWebViewNetworkCapture(driver);

		let probe = await probeField(driver, FIELD_PREFIX);
		log(
			`Campo "${FIELD_PREFIX}": ${probe.byPlaceholder} coincidencia(s), readOnly=${probe.readOnly}, ` +
				`editables visibles en total=${probe.editableTotal}`
		);

		if (probe.byPlaceholder === 0) {
			log(`ABORTA: no hay ningun input visible cuyo placeholder empiece con "${FIELD_PREFIX}".`);
			return;
		}
		if (probe.byPlaceholder > 1) {
			log(`ABORTA: ${probe.byPlaceholder} campos comparten el placeholder "${FIELD_PREFIX}".`);
			log('Con campos apilados cada uno dispara su propia consulta y la medicion no es atribuible.');
			return;
		}

		let mode: FieldMode = 'placeholder';
		if (probe.readOnly === true) {
			log('El campo es readonly: se abre tocandolo y se mide sobre el input del modal.');
			if (!(await openField(driver, FIELD_PREFIX))) {
				log('ABORTA: no se pudo abrir el campo.');
				return;
			}
			probe = await probeField(driver, FIELD_PREFIX);
			if (probe.readOnly === true || probe.byPlaceholder === 0) {
				if (probe.editableTotal !== 1) {
					log(`ABORTA: tras abrir el modal hay ${probe.editableTotal} inputs editables, se esperaba 1.`);
					return;
				}
				mode = 'onlyEditable';
				log('Modo de resolucion: unico input editable del modal.');
			}
		}

		const googleBefore = await readWebViewGoogleActivity(driver);
		if (!googleBefore.available) {
			log(`AVISO: la sonda de Google no pudo correr (${googleBefore.unavailableReason ?? 'sin razon'}).`);
			log('TM-674 quedara INDETERMINADO: un reporte vacio con available=false NO es evidencia de cero trafico.');
		}

		// TM-680 / TM-681: el umbral. "ez" no debe consultar; "eze" si (codigo IATA de 3 letras).
		results.push(await measure(driver, mode, 'TM-680 (TC7) 2 caracteres', 'ez'));
		report(results[results.length - 1]);

		results.push(await measure(driver, mode, 'TM-681 (TC8) 3 caracteres IATA', 'eze'));
		report(results[results.length - 1]);

		// TM-682: 4 caracteres con prefijo de NOMBRE de aeropuerto -> AIRPORT + CACHE mezclados.
		results.push(await measure(driver, mode, 'TM-682 (TC9) 4 caracteres mezcla', 'corr'));
		report(results[results.length - 1]);

		// TM-678: tecleo continuo por debajo de cualquiera de los tres candidatos de debounce.
		results.push(await measure(driver, mode, 'TM-678 (TC5) debounce', 'corrientes'));
		report(results[results.length - 1]);

		// TM-679: repetir el mismo termino no debe volver a consultar.
		await clearWebViewNetworkCapture(driver);
		await typeTerm(driver, mode, FIELD_PREFIX, 'corrientes', KEY_GAP_MS);
		await driver.pause(SETTLE_MS);
		const repeatCapture = await readWebViewNetworkCapture(driver);
		const repeatCalls = (repeatCapture.entries as Entry[]).filter(e =>
			String(e.url).includes('places/autocomplete')
		);
		log(`\n-- TM-679 (TC6) mismo termino repetido --\n   llamadas: ${repeatCalls.length}`);

		const googleAfter = await readWebViewGoogleActivity(driver);
		const newGoogle = googleAfter.resourceEntries.length - googleBefore.resourceEntries.length;

		// ─────────────────────────── VEREDICTOS ───────────────────────────
		log('\n=========== VEREDICTOS ===========');
		const twoChars = results.find(r => r.label.startsWith('TM-680'));
		const threeChars = results.find(r => r.label.startsWith('TM-681'));
		const mixed = results.find(r => r.label.startsWith('TM-682'));
		const debounce = results.find(r => r.label.startsWith('TM-678'));

		log(`TM-680 (2 chars no consulta): ${twoChars && twoChars.calls === 0 ? 'PASA' : 'FALLA'} — ${twoChars?.calls} llamadas`);
		log(
			`TM-681 (3 chars si consulta): ${threeChars && threeChars.calls > 0 ? 'PASA' : 'FALLA'} — ${threeChars?.calls} llamadas`
		);

		if (mixed) {
			const sources = new Set(mixed.predictions.map(p => p.source));
			const mixOk = sources.has('AIRPORT') && sources.has('CACHE');
			log(
				`TM-682 (mezcla AIRPORT+CACHE): ${mixOk ? 'PASA' : 'REVISAR'} — sources vistos: ${
					Array.from(sources).join(', ') || 'ninguno'
				}`
			);
		}

		log(`TM-679 (termino repetido): ${repeatCalls.length === 0 ? 'PASA' : 'FALLA'} — ${repeatCalls.length} llamadas`);

		// TM-675: contrato del request. El AC manda enviar `radius`; el endpoint lo ignora.
		const contractSample = threeChars?.paramsSeen.length ? threeChars : results.find(r => r.paramsSeen.length);
		if (contractSample) {
			const p = contractSample.paramsSeen;
			const has = (n: string): boolean => p.includes(n);
			const contractOk = has('address') && has('latitude') && has('longitude') && !has('radius') && !has('language');
			log(
				`TM-675 (contrato del request): ${contractOk ? 'PASA' : 'FALLA'} — presentes [${p.join(', ')}]` +
					`${has('radius') ? ' · lleva radius, que el backend ignora' : ''}` +
					`${has('language') ? ' · lleva language, que el backend ignora' : ''}` +
					`${!has('latitude') || !has('longitude') ? ' · falta una coordenada: el sesgo requiere AMBAS' : ''}`
			);
		} else {
			log('TM-675 (contrato del request): INDETERMINADO — ninguna llamada capturada para inspeccionar.');
		}

		log(
			`TM-674 (sin trafico a Google): ${
				googleAfter.available && googleAfter.probeErrors.length === 0
					? newGoogle === 0
						? 'PASA'
						: 'FALLA'
					: 'INDETERMINADO'
			} — ${newGoogle} recursos nuevos, sdkPresent=${googleAfter.sdkPresent}`
		);

		// TM-686: conformidad del cliente. NO prueba el ahorro — el backend devuelve respuesta
		// byte-identica con y sin sessionToken, asi que la facturacion no es observable desde aca.
		const allTokens = Array.from(new Set(results.flatMap(r => r.sessionTokens).filter(Boolean)));
		log(`TM-686 (sessionToken): ${allTokens.length} token(s) distintos en toda la sesion`);
		for (const t of allTokens) log(`   · ${t}`);
		if (allTokens.length === 0) {
			log('   El cliente NO emite sessionToken. CA-28/CA-30 no se cumplen del lado del cliente.');
		}

		// TM-678 — se mide, no se dictamina. Ver el bloque §DEBOUNCE de la cabecera.
        if (debounce) {
			const ms = debounce.msFromLastKeystroke;
			log(`\nTM-678 (debounce) — SIN VEREDICTO, por diseno.`);
			log(`   llamadas: ${debounce.calls} · ms tras la ultima tecla: ${ms ?? '?'}`);
			if (ms !== null) {
				const candidates: Array<[string, number]> = [
					['MG-116 declara ~300 ms', 300],
					['MG-552 declara <=400 ms', 400],
					['travel-edit-input shippea 2500 ms', 2500]
				];
				for (const [name, value] of candidates) {
					const compatible = Math.abs(ms - value) <= Math.max(150, value * 0.35);
					log(`   ${compatible ? 'COMPATIBLE con' : 'incompatible con'} ${name}`);
				}
				log('   Este numero es el dato que faltaba para cerrar la contradiccion entre MG-116 y MG-552.');
			}
		}

		// Analisis de bodies: TM-684 / TM-691 / TM-692.
		const allPredictions = results.flatMap(r => r.predictions);
		const analysis = analyzePredictions(allPredictions);
		log('\n=========== ANALISIS DE RESPUESTAS ===========');
		log(`Filas totales observadas: ${allPredictions.length}`);
		log(
			`TM-684 (placeId nulo en AIRPORT): ${analysis.airportNullPlaceId.length} fila(s)` +
				(analysis.airportNullPlaceId.length
					? ` — ej. ${analysis.airportNullPlaceId[0].mainText ?? analysis.airportNullPlaceId[0].shortName}`
					: '')
		);
		log(
			`TM-691 (CACHE con airport=true): ${analysis.cacheFlaggedAirport.length} fila(s)` +
				(analysis.cacheFlaggedAirport.length
					? ` — ej. "${analysis.cacheFlaggedAirport[0].mainText}" iataCode=${analysis.cacheFlaggedAirport[0].iataCode}`
					: ' — fixture no presente en esta corrida')
		);
		log(`TM-692 (GOOGLE con coords NULL): ${analysis.googleNullCoords.length} fila(s)`);
		log(`Coordenadas serializadas como string: ${analysis.stringCoords ? 'SI' : 'no observado'}`);

		const outDir = path.resolve('evidence', 'network-capture');
		await mkdir(outDir, { recursive: true });
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		const file = path.join(outDir, `mg116-pax-gates-${stamp}.json`);
		await writeFile(
			file,
			JSON.stringify(
				{
					ticket: 'MG-116',
					testSet: 'TM-669',
					target: TARGET,
					field: FIELD_PREFIX,
					fieldMode: mode,
					url,
					keyGapMs: KEY_GAP_MS,
					settleMs: SETTLE_MS,
					results,
					repeatCalls: repeatCalls.length,
					predictionAnalysis: analysis,
					googleBefore,
					googleAfter
				},
				null,
				2
			),
			'utf8'
		);
		log(`\nEvidencia -> ${file}`);
	} finally {
		await driver.deleteSession();
	}
}

run().catch((err: Error) => {
	console.error('[mg116] Error:', err.message ?? err);
	process.exit(1);
});
