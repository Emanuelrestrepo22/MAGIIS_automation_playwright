/**
 * MG-117 â€” Sonda de un tÃ©rmino contra el buscador ya abierto en el dispositivo.
 *
 * Teclea un tÃ©rmino y analiza el CUERPO de la respuesta que devolviÃ³ el endpoint, sin
 * credenciales propias: reutiliza la sesiÃ³n autenticada de la app. Sirve para elegir el dato de
 * prueba correcto de cada caso â€” por ejemplo, quÃ© aeropuertos llegan con `placeId` nulo, que es
 * la precondiciÃ³n de TM-660 y depende del entorno y del registro concreto.
 *
 * PRECONDICIÃ“N: el modal "Buscar direcciÃ³n" abierto, con un Ãºnico campo editable.
 *
 * Uso:
 *   $env:PROBE_TERM="corr"; node --loader ts-node/esm tests/mobile/appium/scripts/driver-mg117-probe-term.ts
 */

import { remote } from 'webdriverio';
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
const TERM = process.env.PROBE_TERM ?? 'corr';

const log = (msg: string): void => console.log(`[probe] ${msg}`);

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
			'appium:newCommandTimeout': 180,
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
		await clearWebViewNetworkCapture(driver);

		const typed = (await driver.execute((value: string) => {
			const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const target = Array.from(document.querySelectorAll('input'))
				.filter(visible)
				.find(el => !(el as HTMLInputElement).readOnly) as HTMLInputElement | undefined;
			if (!target) return false;
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
			setter?.call(target, '');
			target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
			setter?.call(target, value);
			target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
			target.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
			return true;
		}, TERM)) as boolean;

		if (!typed) {
			log('No hay campo de bÃºsqueda editable visible. Â¿EstÃ¡ abierto "Buscar direcciÃ³n"?');
			return;
		}

		await driver.pause(3000);

		const capture = await readWebViewNetworkCapture(driver);
		const calls = capture.entries.filter(e => String(e.url).includes('places/autocomplete'));
		log(`Llamadas a places/autocomplete: ${calls.length}`);

		const last = calls[calls.length - 1];
		if (!last) {
			log('Ninguna llamada capturada para ese tÃ©rmino.');
			return;
		}

		log(`URL: ${last.url}`);
		let predictions: Prediction[] = [];
		try {
			predictions = JSON.parse(String(last.responseBody ?? '[]')) as Prediction[];
		} catch {
			log(`Cuerpo no parseable: ${String(last.responseBody).slice(0, 300)}`);
			return;
		}

		log(`\nPredicciones: ${predictions.length}`);
		log('â”€'.repeat(100));
		for (const p of predictions) {
			log(
				`${(p.source ?? '?').padEnd(8)} | placeId=${(p.placeId ? 'presente' : '*** NULL ***').padEnd(13)} | ` +
					`airport=${String(p.airport).padEnd(5)} | iata=${(p.iataCode ?? '-').padEnd(5)} | ` +
					`coords=${p.latitude ? 'sÃ­' : 'NULL'} | ${p.mainText}`
			);
		}

		const nulls = predictions.filter(p => !p.placeId);
		const bySource = predictions.reduce<Record<string, number>>((acc, p) => {
			acc[p.source] = (acc[p.source] ?? 0) + 1;
			return acc;
		}, {});

		log('â”€'.repeat(100));
		log(`Por fuente: ${JSON.stringify(bySource)}`);
		log(`Con placeId NULO: ${nulls.length}${nulls.length ? ' -> ' + nulls.map(p => `${p.iataCode ?? '?'}:${p.mainText}`).join(' | ') : ''}`);
		if (nulls.length > 0) {
			log(`\nTM-660 es ejecutable con "${TERM}": seleccionar una de esas filas ejercita la resoluciÃ³n por nombre.`);
		} else {
			log(`\nTM-660 NO es ejecutable con "${TERM}": todas las predicciones traen placeId.`);
		}
	} finally {
		await driver.deleteSession();
	}
}

run().catch((err: Error) => {
	console.error('[probe] Error:', err.message ?? err);
	process.exit(1);
});
