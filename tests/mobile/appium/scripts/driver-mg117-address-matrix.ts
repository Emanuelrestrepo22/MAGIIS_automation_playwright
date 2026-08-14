/**
 * MG-117 â€” Matriz de tipos de direcciÃ³n: Â¿cuÃ¡ndo la pata de aeropuertos contamina una bÃºsqueda
 * que no es de aeropuerto?
 *
 * CONTEXTO DE NEGOCIO (definido por el QA lead):
 *   - La bÃºsqueda de aeropuertos ES global por diseÃ±o: un viaje puede ir de Argentina a una
 *     terminal de Estados Unidos. Que aparezcan aeropuertos lejanos NO es un defecto.
 *   - Un aeropuerto deberÃ­a alcanzarse por su CÃ“DIGO IATA (`MDZ`), no porque el usuario escribiÃ³
 *     un topÃ³nimo que en su ciudad es el nombre de una calle ("mendoza").
 *   - Caso testigo: "mendoza" devuelve primero El Plumerillo (MDZ) y Rodriguez De Mendoza (PerÃº),
 *     y reciÃ©n despuÃ©s Mendoza 2525 y 2549 de CABA, que es lo que el conductor busca.
 *
 * QUÃ‰ MIDE, por tÃ©rmino:
 *   - cuÃ¡ntas filas AIRPORT y cuÃ¡ntas CACHE
 *   - en quÃ© POSICIÃ“N aparece la primera direcciÃ³n utilizable (rank del primer no-aeropuerto)
 *   - cuÃ¡ntos aeropuertos hay que saltear antes de llegar a ella
 *   - si el resultado tiene relaciÃ³n con la zona del conductor
 *
 * Corre TODOS los tÃ©rminos en UNA sola sesiÃ³n: el dispositivo es un recurso exclusivo y dos
 * sesiones simultÃ¡neas se pisarÃ­an.
 *
 * PRECONDICIÃ“N: modal "Buscar direcciÃ³n" abierto, un solo campo editable.
 *
 * Uso:
 *   node --loader ts-node/esm tests/mobile/appium/scripts/driver-mg117-address-matrix.ts
 *   $env:MATRIX_ONLY="iata,calle"   # opcional: limitar categorÃ­as
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
const ONLY = (process.env.MATRIX_ONLY ?? '').split(',').map(s => s.trim()).filter(Boolean);

const log = (msg: string): void => console.log(`[matrix] ${msg}`);

type Prediction = {
	placeId: string | null;
	mainText: string;
	secondaryText: string | null;
	latitude: string | null;
	longitude: string | null;
	airport: boolean;
	iataCode: string | null;
	source: string;
};

type Probe = { category: string; term: string; expectation: string };

/**
 * TÃ©rminos elegidos para separar dos cosas que hoy se mezclan: buscar un aeropuerto a propÃ³sito
 * (por IATA) y buscar una direcciÃ³n cuyo nombre coincide con un topÃ³nimo.
 */
const PROBES: Probe[] = [
	// El camino previsto para llegar a un aeropuerto.
	{ category: 'iata', term: 'mdz', expectation: 'El Plumerillo (Mendoza) como resultado de aeropuerto' },
	{ category: 'iata', term: 'aep', expectation: 'Aeroparque' },
	{ category: 'iata', term: 'eze', expectation: 'Ministro Pistarini' },

	// TopÃ³nimos que en CABA son calles: acÃ¡ el aeropuerto NO deberÃ­a encabezar.
	{ category: 'calle-toponimo', term: 'mendoza', expectation: 'calle Mendoza de CABA primero' },
	{ category: 'calle-toponimo', term: 'cordoba', expectation: 'Av. CÃ³rdoba de CABA primero' },
	{ category: 'calle-toponimo', term: 'salta', expectation: 'calle Salta de CABA primero' },
	{ category: 'calle-toponimo', term: 'tucuman', expectation: 'calle TucumÃ¡n de CABA primero' },
	{ category: 'calle-toponimo', term: 'brasil', expectation: 'Av. Brasil de CABA primero' },
	{ category: 'calle-toponimo', term: 'bolivia', expectation: 'calle Bolivia de CABA primero' },

	// Calles sin homÃ³nimo aeroportuario: lÃ­nea base de comportamiento sano.
	{ category: 'calle-comun', term: 'san martin', expectation: 'calles San MartÃ­n cercanas' },
	{ category: 'calle-comun', term: 'corrientes', expectation: 'Av. Corrientes' },
	{ category: 'calle-comun', term: 'callao', expectation: 'Av. Callao' },

	// Puntos de interÃ©s: Â¿los resuelve, y con quÃ© relevancia?
	{ category: 'sitio-interes', term: 'obelisco', expectation: 'el Obelisco' },
	{ category: 'sitio-interes', term: 'casa rosada', expectation: 'Casa Rosada' },
	{ category: 'sitio-interes', term: 'luna park', expectation: 'Luna Park' },
	{ category: 'sitio-interes', term: 'teatro colon', expectation: 'Teatro ColÃ³n' },

	{ category: 'museo', term: 'malba', expectation: 'MALBA' },
	{ category: 'museo', term: 'museo', expectation: 'museos cercanos' },

	{ category: 'comercio', term: 'ateneo', expectation: 'librerÃ­a El Ateneo' },
	{ category: 'comercio', term: 'alto palermo', expectation: 'shopping Alto Palermo' },

	{ category: 'salud', term: 'hospital italiano', expectation: 'Hospital Italiano' },

	{ category: 'transporte', term: 'retiro', expectation: 'estaciÃ³n/barrio Retiro' },
	{ category: 'transporte', term: 'constitucion', expectation: 'estaciÃ³n ConstituciÃ³n' },

	{ category: 'estadio', term: 'monumental', expectation: 'Estadio Monumental' }
];

type Result = Probe & {
	total: number;
	airports: number;
	cache: number;
	firstIsAirport: boolean;
	rankOfFirstAddress: number | null;
	airportsBeforeFirstAddress: number;
	topThree: string[];
	nullPlaceIds: number;
};

async function typeAndRead(driver: WebdriverIO.Browser, term: string): Promise<Prediction[]> {
	await clearWebViewNetworkCapture(driver);

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

	// Vaciar y escribir en la MISMA instrucciÃ³n hace que ambos valores caigan en la ventana de
	// debounce: el pipe conserva solo el Ãºltimo y `distinctUntilChanged` lo descarta si coincide
	// con el tÃ©rmino anterior. Hay que dejar que Angular procese el vaciado antes de seguir.
	if (!(await setValue(''))) throw new Error('Sin campo de bÃºsqueda editable visible');
	await driver.pause(800);

	await setValue(term);
	await driver.pause(2600);

	const capture = await readWebViewNetworkCapture(driver);
	const calls = capture.entries.filter(e => String(e.url).includes('places/autocomplete'));
	const last = calls[calls.length - 1];
	if (!last) return [];

	try {
		return JSON.parse(String(last.responseBody ?? '[]')) as Prediction[];
	} catch {
		return [];
	}
}

function analyse(probe: Probe, predictions: Prediction[]): Result {
	const isAirportRow = (p: Prediction): boolean => p.source === 'AIRPORT' || p.airport === true;
	const firstAddressIndex = predictions.findIndex(p => !isAirportRow(p));

	return {
		...probe,
		total: predictions.length,
		airports: predictions.filter(p => p.source === 'AIRPORT').length,
		cache: predictions.filter(p => p.source === 'CACHE').length,
		firstIsAirport: predictions.length > 0 && isAirportRow(predictions[0]),
		rankOfFirstAddress: firstAddressIndex === -1 ? null : firstAddressIndex + 1,
		airportsBeforeFirstAddress:
			firstAddressIndex === -1
				? predictions.length
				: predictions.slice(0, firstAddressIndex).filter(isAirportRow).length,
		topThree: predictions.slice(0, 3).map(p => `${isAirportRow(p) ? 'âœˆ' : 'ðŸ“'} ${p.mainText}`),
		nullPlaceIds: predictions.filter(p => !p.placeId).length
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

	const results: Result[] = [];

	try {
		const contexts = (await driver.getContexts()) as string[];
		const webview = contexts.find(c => String(c).startsWith('WEBVIEW'));
		if (!webview) {
			log('Sin contexto WEBVIEW.');
			return;
		}
		await driver.switchContext(webview);
		await installWebViewNetworkCapture(driver);

		const probes = ONLY.length ? PROBES.filter(p => ONLY.includes(p.category)) : PROBES;
		log(`Ejecutando ${probes.length} tÃ©rminosâ€¦\n`);

		for (const probe of probes) {
			try {
				const predictions = await typeAndRead(driver, probe.term);
				const result = analyse(probe, predictions);
				results.push(result);

				const flag = result.firstIsAirport && probe.category !== 'iata' ? '  âš  AEROPUERTO PRIMERO' : '';
				log(`"${probe.term}" [${probe.category}] -> ${result.total} filas (âœˆ${result.airports} ðŸ“${result.cache})${flag}`);
				for (const row of result.topThree) log(`      ${row}`);
			} catch (error) {
				log(`"${probe.term}" -> ERROR: ${(error as Error).message}`);
			}
		}

		log('\nâ•â•â•â•â•â•â•â•â•â•â•â• CONTAMINACIÃ“N POR AEROPUERTO â•â•â•â•â•â•â•â•â•â•â•â•');
		log('(bÃºsquedas que NO son por cÃ³digo IATA y aun asÃ­ encabeza un aeropuerto)\n');

		const contaminated = results.filter(r => r.category !== 'iata' && r.firstIsAirport);
		if (contaminated.length === 0) {
			log('Ninguna. La pata de aeropuertos no desplaza a las direcciones.');
		}
		for (const r of contaminated) {
			log(
				`  "${r.term}" -> hay que saltear ${r.airportsBeforeFirstAddress} aeropuerto(s) ` +
					`para llegar a la primera direcciÃ³n (posiciÃ³n ${r.rankOfFirstAddress ?? 'ninguna'})`
			);
			log(`      esperado: ${r.expectation}`);
			log(`      obtenido: ${r.topThree[0] ?? '(vacÃ­o)'}`);
		}

		log('\nâ•â•â•â•â•â•â•â•â•â•â•â• TÃ‰RMINOS SIN NINGUNA DIRECCIÃ“N â•â•â•â•â•â•â•â•â•â•â•â•');
		const noAddress = results.filter(r => r.rankOfFirstAddress === null && r.total > 0);
		for (const r of noAddress) log(`  "${r.term}" -> ${r.total} filas, todas de aeropuerto`);
		if (noAddress.length === 0) log('  Ninguno.');

		log('\nâ•â•â•â•â•â•â•â•â•â•â•â• TÃ‰RMINOS SIN RESULTADOS â•â•â•â•â•â•â•â•â•â•â•â•');
		const empty = results.filter(r => r.total === 0);
		for (const r of empty) log(`  "${r.term}" [${r.category}] -> 0 predicciones (esperado: ${r.expectation})`);
		if (empty.length === 0) log('  Ninguno.');

		const outDir = path.resolve('evidence', 'network-capture');
		await mkdir(outDir, { recursive: true });
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		const file = path.join(outDir, `mg117-address-matrix-${stamp}.json`);
		await writeFile(file, JSON.stringify(results, null, 2), 'utf8');
		log(`\nEvidencia -> ${file}`);
	} finally {
		await driver.deleteSession();
	}
}

run().catch((err: Error) => {
	console.error('[matrix] Error:', err.message ?? err);
	process.exit(1);
});
