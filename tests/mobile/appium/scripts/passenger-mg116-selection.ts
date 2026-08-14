/**
 * MG-116 — Segunda pasada: los casos que la corrida de gates dejo sin ejercer.
 *
 * `passenger-mg116-gates.ts` mide los umbrales y el contrato del request, pero deja tres huecos
 * porque nunca selecciona una prediccion ni produce una sesion de varias llamadas:
 *
 *   TM-682 (TC9)  — paso 3: termino de 3 caracteres NO-IATA devuelve 200 con lista vacia, sin error
 *   TM-686 (TC13) — una sesion con DOS o mas llamadas debe compartir el mismo sessionToken.
 *                   En la corrida de gates cada termino produjo UNA sola llamada, asi que la
 *                   asercion "mismo token entre llamadas debounced" no se ejercio: se observo el
 *                   token estable entre busquedas distintas, que es otra cosa.
 *   TM-687 (TC14) — tras SELECCIONAR una prediccion, la busqueda siguiente usa un token NUEVO.
 *   TM-684 (TC11) — seleccionar una prediccion de aeropuerto con `placeId` nulo resuelve por nombre
 *                   y el flujo continua. La corrida de gates confirmo que la fila existe; este
 *                   script la SELECCIONA, que es lo que el caso pide.
 *
 * DATO IMPORTANTE de la corrida de gates (2026-08-14, env test): las filas AIRPORT con `placeId`
 * nulo aparecen en coincidencias por NOMBRE (`corr` -> "Corrado Gex" AOT, "Corryong" CYG), mientras
 * el match IATA exacto de `EZE` SI trae placeId. Es lo contrario de lo que asumia el caso, que
 * esperaba el nulo en `eze`. Por eso este script usa `corr` como fixture del placeId nulo.
 *
 * PRECONDICION: identica a la de gates — Passenger en el home, sesion iniciada.
 *
 * Uso: mismo runner que gates (ver package.json -> mobile:passenger:mg116-selection).
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
const FIELD_PREFIX = (process.env.PAX_FIELD ?? 'Origen').trim();
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 3500);
/** Por encima del debounce medido (~304 ms) para que cada tramo dispare su propia llamada. */
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 900);

const log = (msg: string): void => console.log(`[mg116-sel] ${msg}`);

type Entry = { url: string; startedAt: string; status?: number; responseBody?: string };
type Prediction = {
	placeId: string | null;
	mainText?: string;
	secondaryText?: string | null;
	iataCode?: string | null;
	source?: string;
};

function paramOf(url: string, name: string): string {
	const m = new RegExp(`[?&]${name}=([^&]*)`).exec(url);
	return m ? decodeURIComponent(m[1]) : '';
}

function autocompleteCalls(entries: Entry[]): Entry[] {
	return entries.filter(e => String(e.url).includes('places/autocomplete'));
}

function parsePredictions(body: string | undefined): Prediction[] {
	if (!body) return [];
	try {
		const p = JSON.parse(body);
		return Array.isArray(p) ? (p as Prediction[]) : [];
	} catch {
		return [];
	}
}

async function setValue(driver: WebdriverIO.Browser, value: string): Promise<void> {
	await driver.execute((v: string) => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const target = Array.from(document.querySelectorAll('input'))
			.filter(visible)
			.find(el => !(el as HTMLInputElement).readOnly) as HTMLInputElement | undefined;
		if (!target) return;
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
		setter?.call(target, v);
		target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
		target.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
	}, value);
}

async function openField(driver: WebdriverIO.Browser, prefix: string): Promise<void> {
	await driver.execute((p: string) => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const target = Array.from(document.querySelectorAll('input'))
			.filter(visible)
			.find(el =>
				((el as HTMLInputElement).placeholder ?? '').trim().toLowerCase().startsWith(p.toLowerCase())
			) as HTMLInputElement | undefined;
		if (!target) return;
		target.focus();
		target.dispatchEvent(new Event('ionFocus', { bubbles: true, composed: true } as EventInit));
		target.click();
	}, prefix);
	await driver.pause(1800);
}

/** Lee las filas del dropdown tal como las ve el usuario (`ion-item.prediction-item`). */
async function readDropdown(driver: WebdriverIO.Browser): Promise<{ main: string; secondary: string }[]> {
	return (await driver.execute(() => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		return Array.from(document.querySelectorAll('ion-item.prediction-item'))
			.filter(visible)
			.map(item => ({
				main: (item.querySelector('span.main')?.textContent ?? '').trim(),
				secondary: (item.querySelector('span.secondary')?.textContent ?? '').trim()
			}));
	})) as { main: string; secondary: string }[];
}

/** Tapea la fila del dropdown cuyo texto principal contiene `needle`. */
async function tapPrediction(driver: WebdriverIO.Browser, needle: string): Promise<boolean> {
	const tapped = (await driver.execute((n: string) => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const items = Array.from(document.querySelectorAll('ion-item.prediction-item')).filter(visible);
		const target = items.find(i => (i.textContent ?? '').toLowerCase().includes(n.toLowerCase()));
		if (!target) return false;
		(target as HTMLElement).click();
		return true;
	}, needle)) as boolean;
	await driver.pause(2500);
	return tapped;
}

async function run(): Promise<void> {
	const appiumUrl = new URL(TARGET.appiumUrl);
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
			'appium:udid': TARGET.udid,
			'appium:appPackage': TARGET.appPackage,
			'appium:appActivity': '.MainActivity',
			'appium:noReset': true,
			'appium:forceAppLaunch': false,
			'appium:newCommandTimeout': 240,
			'appium:chromedriverAutodownload': true
		} as Record<string, unknown>
	});

	const findings: Record<string, unknown> = {};

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
			log('ABORTA: la app esta en el login.');
			return;
		}

		await installWebViewNetworkCapture(driver);
		await openField(driver, FIELD_PREFIX);

		// ── TM-682 paso 3: 3 caracteres NO-IATA -> 200 con lista vacia, sin estado de error ──
		await setValue(driver, '');
		await driver.pause(600);
		await clearWebViewNetworkCapture(driver);
		await setValue(driver, 'ave');
		await driver.pause(SETTLE_MS);
		let cap = await readWebViewNetworkCapture(driver);
		let calls = autocompleteCalls(cap.entries as Entry[]);
		const avePreds = calls.flatMap(c => parsePredictions(c.responseBody));
		const aveDropdown = await readDropdown(driver);
		findings.tm682_step3 = {
			term: 'ave',
			calls: calls.length,
			status: calls[0]?.status ?? null,
			rows: avePreds.length,
			dropdownRows: aveDropdown.length
		};
		log(
			`\n-- TM-682 paso 3 · "ave" (3 chars no-IATA) --\n   llamadas: ${calls.length} · status: ${
				calls[0]?.status ?? '?'
			} · filas en payload: ${avePreds.length} · filas en dropdown: ${aveDropdown.length}`
		);

		// ── TM-686: sesion con DOS o mas llamadas debe compartir el token ──
		await setValue(driver, '');
		await driver.pause(600);
		await clearWebViewNetworkCapture(driver);
		for (const chunk of ['cor', 'corri', 'corrientes']) {
			await setValue(driver, chunk);
			await driver.pause(PAUSE_MS);
		}
		await driver.pause(SETTLE_MS);
		cap = await readWebViewNetworkCapture(driver);
		calls = autocompleteCalls(cap.entries as Entry[]);
		const tokensInSession = Array.from(new Set(calls.map(c => paramOf(String(c.url), 'sessionToken')).filter(Boolean)));
		findings.tm686 = {
			calls: calls.length,
			addresses: calls.map(c => paramOf(String(c.url), 'address')),
			distinctTokens: tokensInSession
		};
		log(
			`\n-- TM-686 · sesion multi-llamada --\n   llamadas: ${calls.length} (${calls
				.map(c => paramOf(String(c.url), 'address'))
				.join(', ')})\n   tokens distintos: ${tokensInSession.length}`
		);
		const tokenBeforeSelection = tokensInSession[0] ?? '';

		// ── TM-684 + TM-687: seleccionar un aeropuerto con placeId nulo, luego nueva busqueda ──
		await setValue(driver, '');
		await driver.pause(600);
		await clearWebViewNetworkCapture(driver);
		await setValue(driver, 'corr');
		await driver.pause(SETTLE_MS);
		cap = await readWebViewNetworkCapture(driver);
		calls = autocompleteCalls(cap.entries as Entry[]);
		const corrPreds = calls.flatMap(c => parsePredictions(c.responseBody));
		const nullAirport = corrPreds.find(p => p.source === 'AIRPORT' && p.placeId === null);
		const dropdown = await readDropdown(driver);
		log(`\n-- TM-684 · seleccion de aeropuerto con placeId nulo --`);
		log(`   filas en dropdown: ${dropdown.length}`);
		for (const d of dropdown.slice(0, 6)) log(`     · "${d.main}" / "${d.secondary}"`);

		if (!nullAirport?.mainText) {
			log('   La fila AIRPORT con placeId nulo NO aparecio en esta corrida: caso NO REPRODUCIBLE ahora.');
			findings.tm684 = { reproducible: false };
		} else {
			log(`   objetivo: "${nullAirport.mainText}" (iata=${nullAirport.iataCode}, placeId=null)`);
			await clearWebViewNetworkCapture(driver);
			const tapped = await tapPrediction(driver, nullAirport.mainText);
			const afterSel = await readWebViewNetworkCapture(driver);
			const resolutionCalls = (afterSel.entries as Entry[]).filter(
				e => !String(e.url).includes('places/autocomplete')
			);
			const fieldValue = (await driver.execute(() => {
				const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const inputs = Array.from(document.querySelectorAll('input')).filter(visible) as HTMLInputElement[];
				return inputs.map(i => ({ placeholder: i.placeholder, value: i.value }));
			})) as { placeholder: string; value: string }[];
			findings.tm684 = {
				reproducible: true,
				target: nullAirport,
				tapped,
				resolutionCalls: resolutionCalls.map(c => ({
					url: String(c.url).split('?')[0],
					status: c.status,
					carriesSessionToken: Boolean(paramOf(String(c.url), 'sessionToken'))
				})),
				fieldsAfterSelection: fieldValue
			};
			log(`   tap: ${tapped ? 'OK' : 'FALLO'}`);
			log(`   llamadas de resolucion tras la seleccion: ${resolutionCalls.length}`);
			for (const r of resolutionCalls.slice(0, 5)) {
				log(
					`     · ${String(r.url).split('?')[0]} -> ${r.status ?? '?'} ${
						paramOf(String(r.url), 'sessionToken') ? '(lleva sessionToken)' : '(sin sessionToken)'
					}`
				);
			}
			for (const f of fieldValue) log(`     campo "${f.placeholder}" = "${f.value}"`);

			// ── TM-687: la busqueda SIGUIENTE debe usar un token nuevo ──
			await openField(driver, FIELD_PREFIX);
			await setValue(driver, '');
			await driver.pause(600);
			await clearWebViewNetworkCapture(driver);
			await setValue(driver, 'ezei');
			await driver.pause(SETTLE_MS);
			cap = await readWebViewNetworkCapture(driver);
			calls = autocompleteCalls(cap.entries as Entry[]);
			const tokenAfter = calls.length ? paramOf(String(calls[0].url), 'sessionToken') : '';
			findings.tm687 = {
				tokenBeforeSelection,
				tokenAfterSelection: tokenAfter,
				rotated: Boolean(tokenAfter) && tokenAfter !== tokenBeforeSelection,
				calls: calls.length
			};
			log(`\n-- TM-687 · rotacion del token tras seleccionar --`);
			log(`   token antes: ${tokenBeforeSelection || '(ninguno)'}`);
			log(`   token despues: ${tokenAfter || '(ninguno)'}`);
			log(
				`   ${
					tokenAfter && tokenAfter !== tokenBeforeSelection
						? 'ROTO correctamente'
						: 'NO roto — el mismo token sobrevive a la seleccion'
				}`
			);
		}

		log('\n=========== VEREDICTOS ===========');
		const t682 = findings.tm682_step3 as { calls: number; status: number | null; rows: number; dropdownRows: number };
		log(
			`TM-682 paso 3 (3 chars no-IATA -> vacio sin error): ${
				t682.calls > 0 && t682.status === 200 && t682.rows === 0 && t682.dropdownRows === 0 ? 'PASA' : 'REVISAR'
			}`
		);
		const t686 = findings.tm686 as { calls: number; distinctTokens: string[] };
		log(
			`TM-686 (un token en sesion multi-llamada): ${
				t686.calls >= 2 ? (t686.distinctTokens.length === 1 ? 'PASA' : 'FALLA') : 'NO EJERCIDO'
			} — ${t686.calls} llamadas, ${t686.distinctTokens.length} token(s)`
		);
		if ((findings.tm687 as { rotated?: boolean } | undefined)?.rotated !== undefined) {
			log(`TM-687 (token nuevo tras seleccion): ${(findings.tm687 as { rotated: boolean }).rotated ? 'PASA' : 'FALLA'}`);
		}

		const outDir = path.resolve('evidence', 'network-capture');
		await mkdir(outDir, { recursive: true });
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		const file = path.join(outDir, `mg116-pax-selection-${stamp}.json`);
		await writeFile(
			file,
			JSON.stringify({ ticket: 'MG-116', testSet: 'TM-669', target: TARGET, url, findings }, null, 2),
			'utf8'
		);
		log(`\nEvidencia -> ${file}`);
	} finally {
		await driver.deleteSession();
	}
}

run().catch((err: Error) => {
	console.error('[mg116-sel] Error:', err.message ?? err);
	process.exit(1);
});
