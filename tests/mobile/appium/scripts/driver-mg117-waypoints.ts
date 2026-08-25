/**
 * MG-117 — Paradas múltiples: ¿el sesgo y el sessionToken cambian según la parada que se edita?
 *
 * HIPÓTESIS (del código, `GooglePlacesService.runGoogleAutocomplete`):
 *   el sesgo se toma SIEMPRE de `travelService.currentOrigin` — el origen del viaje — y no de la
 *   parada que se está editando ni de la anterior. En un viaje largo (CABA -> Mar del Plata) eso
 *   significa que al cargar una parada cercana al destino las sugerencias siguen sesgadas al
 *   origen, a cientos de kilómetros de donde el conductor va a estar.
 *
 * Y el `sessionToken` vive en el servicio (singleton) y solo se descarta al seleccionar, así que
 * debería compartirse entre paradas mientras no se elija ninguna predicción.
 *
 * QUÉ HACE: enumera las filas de dirección del modal "Editar viaje", edita una por una con el
 * mismo término y compara las coordenadas y el token de cada consulta. No selecciona nada — la
 * selección cerraría la sesión y cambiaría lo que se quiere observar.
 *
 * PRECONDICIÓN: viaje en curso (propio o despachado por el carrier) y modal "Editar viaje" abierto.
 *
 * Uso:
 *   $env:WAYPOINT_TERM="san martin"; node --loader ts-node/esm tests/mobile/appium/scripts/driver-mg117-waypoints.ts
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
const TERM = process.env.WAYPOINT_TERM ?? 'san martin';

const log = (msg: string): void => console.log(`[waypoints] ${msg}`);

type Row = { index: number; placeholder: string; value: string; readOnly: boolean };

type Sample = {
	row: number;
	placeholder: string;
	previousValue: string;
	url: string | null;
	latitude: string | null;
	longitude: string | null;
	sessionToken: string | null;
	predictionCount: number;
	firstPrediction: string | null;
};

function param(url: string, name: string): string | null {
	const match = new RegExp(`[?&]${name}=([^&]*)`).exec(url);
	return match ? decodeURIComponent(match[1]) : null;
}

async function listRows(driver: WebdriverIO.Browser): Promise<Row[]> {
	return (await driver.execute(() => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		return Array.from(document.querySelectorAll('input'))
			.filter(visible)
			.map((el, index) => {
				const input = el as HTMLInputElement;
				return {
					index,
					placeholder: String(input.placeholder ?? ''),
					value: String(input.value ?? ''),
					readOnly: Boolean(input.readOnly)
				};
			});
	})) as Row[];
}

/** Opens the search modal for the Nth readonly row (each row is a stop of the trip). */
async function openRow(driver: WebdriverIO.Browser, rowIndex: number): Promise<boolean> {
	const opened = (await driver.execute((target: number) => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const readonly = Array.from(document.querySelectorAll('input'))
			.filter(visible)
			.filter(el => (el as HTMLInputElement).readOnly) as HTMLInputElement[];
		const el = readonly[target];
		if (!el) return false;
		el.focus();
		el.dispatchEvent(new Event('ionFocus', { bubbles: true, composed: true } as EventInit));
		el.click();
		return true;
	}, rowIndex)) as boolean;
	await driver.pause(1800);
	return opened;
}

async function typeInSearch(driver: WebdriverIO.Browser, term: string): Promise<void> {
	const setValue = (value: string): Promise<boolean> =>
		driver.execute((v: string) => {
			const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const target = Array.from(document.querySelectorAll('input'))
				.filter(visible)
				.find(el => !(el as HTMLInputElement).readOnly) as HTMLInputElement | undefined;
			if (!target) return false;
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
			setter?.call(target, v);
			target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
			target.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
			return true;
		}, value) as Promise<boolean>;

	// Vaciar y escribir necesitan ticks separados: si van juntos, ambos valores caen en la misma
	// ventana de debounce y `distinctUntilChanged` descarta el segundo.
	await setValue('');
	await driver.pause(800);
	await setValue(term);
	await driver.pause(2600);
}

/** Closes the search modal with its back arrow, leaving the stop list visible again. */
async function closeSearch(driver: WebdriverIO.Browser): Promise<void> {
	await driver
		.execute(() => {
			const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const back = Array.from(document.querySelectorAll('ion-icon, ion-button, button'))
				.filter(visible)
				.find(el => {
					const name = String(el.getAttribute('name') ?? el.getAttribute('ng-reflect-name') ?? '');
					return name.includes('arrow-back');
				}) as HTMLElement | undefined;
			if (back) {
				back.click();
				return true;
			}
			return false;
		})
		.catch(() => false);
	await driver.pause(1500);
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
			'appium:newCommandTimeout': 600,
			'appium:chromedriverAutodownload': true
		} as Record<string, unknown>
	});

	const samples: Sample[] = [];

	try {
		const contexts = (await driver.getContexts()) as string[];
		const webview = contexts.find(c => String(c).startsWith('WEBVIEW'));
		if (!webview) {
			log('Sin contexto WEBVIEW.');
			return;
		}
		await driver.switchContext(webview);
		await installWebViewNetworkCapture(driver);

		const url = (await driver.execute(() => window.location.href)) as string;
		log(`URL: ${url}`);

		const rows = await listRows(driver);
		const stops = rows.filter(r => r.readOnly);

		log(`\nFilas de dirección detectadas: ${stops.length}`);
		for (const row of stops) {
			log(`  [${row.index}] placeholder="${row.placeholder}" valor="${row.value || '(vacío)'}"`);
		}

		if (stops.length === 0) {
			log('\nNo hay filas de parada. ¿Está abierto el modal "Editar viaje"?');
			return;
		}
		if (stops.length < 2) {
			log(
				'\nSolo hay una parada: para este caso hace falta un viaje con origen, destino y al menos una parada intermedia.'
			);
		}

		for (let i = 0; i < stops.length; i++) {
			const stop = stops[i];
			log(
				`\n── Editando parada ${i + 1}/${stops.length} — "${stop.placeholder}" (valor actual: ${stop.value || 'vacío'})`
			);

			if (!(await openRow(driver, i))) {
				log('   no se pudo abrir el buscador para esta fila');
				continue;
			}

			await clearWebViewNetworkCapture(driver);
			await typeInSearch(driver, TERM);

			const capture = await readWebViewNetworkCapture(driver);
			const calls = capture.entries.filter(e => String(e.url).includes('places/autocomplete'));
			const last = calls[calls.length - 1];

			let predictionCount = 0;
			let firstPrediction: string | null = null;
			if (last?.responseBody) {
				try {
					const parsed = JSON.parse(String(last.responseBody)) as { mainText: string }[];
					predictionCount = parsed.length;
					firstPrediction = parsed[0]?.mainText ?? null;
				} catch {
					// Cuerpo no parseable: se reporta igual con conteo cero.
				}
			}

			const sample: Sample = {
				row: i + 1,
				placeholder: stop.placeholder,
				previousValue: stop.value,
				url: last ? String(last.url) : null,
				latitude: last ? param(String(last.url), 'latitude') : null,
				longitude: last ? param(String(last.url), 'longitude') : null,
				sessionToken: last ? param(String(last.url), 'sessionToken') : null,
				predictionCount,
				firstPrediction
			};
			samples.push(sample);

			log(`   coords enviadas: ${sample.latitude ?? '—'}, ${sample.longitude ?? '—'}`);
			log(`   sessionToken:    ${sample.sessionToken ?? '—'}`);
			log(
				`   predicciones:    ${sample.predictionCount}${sample.firstPrediction ? ` (1ª: ${sample.firstPrediction})` : ''}`
			);

			await closeSearch(driver);
		}

		log('\n════════════ ANÁLISIS ════════════');

		const coordSet = new Set(samples.filter(s => s.latitude).map(s => `${s.latitude},${s.longitude}`));
		log(`\nCoordenadas de sesgo distintas entre paradas: ${coordSet.size}`);
		for (const coords of coordSet) log(`   · ${coords}`);
		if (coordSet.size === 1 && samples.length > 1) {
			log('   -> TODAS las paradas se sesgan con el MISMO punto (el origen del viaje).');
			log('      En un viaje largo, una parada cercana al destino recibe sugerencias del origen.');
		} else if (coordSet.size > 1) {
			log('   -> El sesgo cambia según la parada.');
		}

		const tokenSet = new Set(samples.filter(s => s.sessionToken).map(s => s.sessionToken as string));
		log(`\nsessionToken distintos entre paradas: ${tokenSet.size}`);
		for (const token of tokenSet) log(`   · ${token}`);
		if (tokenSet.size === 1 && samples.length > 1) {
			log('   -> Se comparte un único token entre paradas (sin selección de por medio).');
			log('      Para la facturación de Google eso cuenta como UNA sesión: es lo buscado.');
		} else if (tokenSet.size > 1) {
			log('   -> Cada parada abre una sesión nueva: Google factura por separado.');
		}

		const outDir = path.resolve('evidence', 'network-capture');
		await mkdir(outDir, { recursive: true });
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		const file = path.join(outDir, `mg117-waypoints-${stamp}.json`);
		await writeFile(file, JSON.stringify({ url, term: TERM, stops, samples }, null, 2), 'utf8');
		log(`\nEvidencia -> ${file}`);
	} finally {
		await driver.deleteSession();
	}
}

run().catch((err: Error) => {
	console.error('[waypoints] Error:', err.message ?? err);
	process.exit(1);
});
