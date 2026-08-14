/**
 * TM-665 â€” ValidaciÃ³n de consistencia y alcance del fallo.
 *
 * Responde tres preguntas que la corrida puntual dejÃ³ abiertas:
 *
 *   A. Â¿Es REPRODUCIBLE? â€” el mismo 503 repetido varias veces, Â¿da siempre el mismo resultado?
 *   B. Â¿Es EXCLUSIVO del 503? â€” Â¿quÃ© pasa con 500, 502, 504 y un error de red?
 *   C. Â¿El conductor puede SALIR? â€” con el spinner activo, Â¿el botÃ³n de volver responde?
 *
 * IMPORTANTE sobre el escenario: el backend estÃ¡ OPERATIVO durante toda la prueba. Cada iteraciÃ³n
 * verifica un baseline sano antes de inyectar, asÃ­ que lo que se mide es la reacciÃ³n de la app a
 * una respuesta de error PUNTUAL â€” no a una caÃ­da del servicio. Un 5xx aislado ocurre en
 * producciÃ³n aunque el uptime sea alto (rolling updates, timeouts del balanceador, picos).
 *
 * Cada iteraciÃ³n usa un tÃ©rmino PROPIO: `onLocationTextChange` no emite el valor vacÃ­o al
 * observable, asÃ­ que repetir un tÃ©rmino anterior lo descarta `distinctUntilChanged` y el fallo
 * quedarÃ­a sin ejercer.
 *
 * PRECONDICIÃ“N: modal "Buscar direcciÃ³n" abierto, backend operativo.
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe as describeTarget, resolveDriverTarget } from './_shared/resolveDriverTarget';
import {
	installWebViewNetworkCapture,
	clearWebViewNetworkCapture,
	readWebViewNetworkCapture,
	readWebViewGoogleActivity,
	installWebViewFaultInjection,
	clearWebViewFaultInjection,
	readWebViewFaultInjectionState
} from '../helpers/webViewNetworkCapture';

// El objetivo (ambiente + paquete) se resuelve desde ENV, no desde un literal: con el literal
// anterior `ENV=uat` era inerte y la corrida abria la app de TEST mientras el reporte decia UAT.
const TARGET = resolveDriverTarget('driver');
const APPIUM_URL = TARGET.appiumUrl;
const UDID = TARGET.udid;
const APP_PACKAGE = TARGET.appPackage;

const log = (msg: string): void => console.log(`[matrix665] ${msg}`);

/** TÃ©rminos distintos entre sÃ­, todos con 4+ caracteres y con resultados conocidos en test. */
const TERMS = [
	'corrie', 'corrien', 'corrient',
	'flori', 'florid', 'florida',
	'callao', 'callaos', 'obelis'
];

type Scenario = { label: string; mode: 'status' | 'networkError'; status?: number };

const SCENARIOS: Scenario[] = [
	{ label: '503 Â· Service Unavailable', mode: 'status', status: 503 },
	{ label: '503 Â· repeticiÃ³n 2', mode: 'status', status: 503 },
	{ label: '503 Â· repeticiÃ³n 3', mode: 'status', status: 503 },
	{ label: '500 Â· Internal Server Error', mode: 'status', status: 500 },
	{ label: '502 Â· Bad Gateway', mode: 'status', status: 502 },
	{ label: '504 Â· Gateway Timeout', mode: 'status', status: 504 },
	{ label: 'error de red (sin respuesta)', mode: 'networkError' }
];

type Observation = {
	scenario: string;
	baselineOk: boolean;
	faultHits: number;
	requests: number;
	spinnerAt3s: boolean;
	spinnerAt10s: boolean;
	predictions: number;
	errorTexts: string[];
	googleNewResources: number;
};

async function readState(driver: WebdriverIO.Browser): Promise<{ spinner: boolean; predictions: number; errors: string[] }> {
	return (await driver.execute(() => {
		const seen = (el: Element): boolean => {
			const node = el as HTMLElement;
			const rect = node.getBoundingClientRect();
			const style = getComputedStyle(node);
			return (
				rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0 &&
				style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0
			);
		};

		// Solo el spinner real de la bÃºsqueda: `[class*=loading]` a secas matchea nodos de 0x0.
		const spinner = Array.from(document.querySelectorAll('ion-spinner')).some(seen);
		const predictions = Array.from(document.querySelectorAll('ion-item.prediction-item, [class*="prediction-item"]')).filter(seen).length;

		const pattern = /error|falla|fallo|intenta|reintent|no se pudo|sin conexi|problema|disponible|servicio/i;
		const errors = Array.from(new Set(
			Array.from(document.querySelectorAll('p, span, div, ion-label, ion-text'))
				.filter(seen)
				.map(el => (el.textContent ?? '').trim())
				.filter(t => t.length > 0 && t.length < 140 && pattern.test(t))
		));

		return { spinner, predictions, errors };
	})) as { spinner: boolean; predictions: number; errors: string[] };
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

async function typeFresh(driver: WebdriverIO.Browser, term: string): Promise<void> {
	await setValue(driver, '');
	await driver.pause(700);
	await setValue(driver, term);
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

	const observations: Observation[] = [];

	try {
		const contexts = (await driver.getContexts()) as string[];
		const webview = contexts.find(c => String(c).startsWith('WEBVIEW'));
		if (!webview) {
			log('Sin contexto WEBVIEW.');
			return;
		}
		await driver.switchContext(webview);
		await installWebViewNetworkCapture(driver);

		const hasInput = (await driver.execute(() => {
			const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			return Array.from(document.querySelectorAll('input')).filter(visible).some(el => !(el as HTMLInputElement).readOnly);
		})) as boolean;

		if (!hasInput) {
			log('ABORTA: no hay campo de bÃºsqueda editable. AbrÃ­ "Buscar direcciÃ³n" primero.');
			return;
		}

		let termIndex = 0;

		for (const scenario of SCENARIOS) {
			log(`\nâ”€â”€â”€â”€â”€â”€â”€â”€ ${scenario.label}`);

			// Baseline: sin baseline sano no se puede atribuir lo que pase despuÃ©s al fallo.
			await clearWebViewFaultInjection(driver).catch(() => undefined);
			await clearWebViewNetworkCapture(driver);
			const baselineTerm = TERMS[termIndex++ % TERMS.length];
			await typeFresh(driver, baselineTerm);
			await driver.pause(2800);
			const baseState = await readState(driver);
			const baselineOk = baseState.predictions > 0;
			log(`   baseline "${baselineTerm}": ${baseState.predictions} predicciones Â· ${baselineOk ? 'OK' : 'SIN RESULTADOS'}`);

			if (!baselineOk) {
				log('   se omite: sin baseline sano la observaciÃ³n no serÃ­a atribuible al fallo');
				observations.push({
					scenario: scenario.label, baselineOk: false, faultHits: 0, requests: 0,
					spinnerAt3s: false, spinnerAt10s: false, predictions: 0, errorTexts: [], googleNewResources: 0
				});
				continue;
			}

			const googleBefore = await readWebViewGoogleActivity(driver);

			await installWebViewFaultInjection(driver, [
				{
					id: `tm665-${scenario.status ?? 'neterr'}`,
					urlPattern: 'places/autocomplete',
					mode: scenario.mode,
					...(scenario.status ? { status: scenario.status, body: '{"error":"injected"}' } : {})
				}
			]);
			await clearWebViewNetworkCapture(driver);

			const faultTerm = TERMS[termIndex++ % TERMS.length];
			await typeFresh(driver, faultTerm);

			await driver.pause(3000);
			const at3 = await readState(driver);
			await driver.pause(7000);
			const at10 = await readState(driver);

			const capture = await readWebViewNetworkCapture(driver);
			const calls = capture.entries.filter(e => String(e.url).includes('places/autocomplete'));
			const faultState = await readWebViewFaultInjectionState(driver);
			const googleAfter = await readWebViewGoogleActivity(driver);

			const obs: Observation = {
				scenario: scenario.label,
				baselineOk: true,
				faultHits: faultState.totalHits,
				requests: calls.length,
				spinnerAt3s: at3.spinner,
				spinnerAt10s: at10.spinner,
				predictions: at10.predictions,
				errorTexts: at10.errors,
				googleNewResources: googleAfter.resourceEntries.length - googleBefore.resourceEntries.length
			};
			observations.push(obs);

			log(`   tÃ©rmino "${faultTerm}" Â· hits: ${obs.faultHits} Â· requests: ${obs.requests}`);
			log(`   spinner t+3s: ${obs.spinnerAt3s} Â· t+10s: ${obs.spinnerAt10s} Â· predicciones: ${obs.predictions}`);
			log(`   avisos de error: ${obs.errorTexts.length ? obs.errorTexts.join(' | ') : 'ninguno'}`);
			log(`   recursos nuevos de Google: ${obs.googleNewResources}`);

			if (obs.faultHits === 0) log('   OJO: la regla no disparÃ³; esta fila no es concluyente');
		}

		// â”€â”€ Â¿Puede el conductor salir con el spinner activo? â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
		log('\nâ”€â”€â”€â”€â”€â”€â”€â”€ Â¿Se puede salir del buscador con el spinner activo?');
		const backPressed = (await driver
			.execute(() => {
				const seen = (el: Element): boolean => {
					const r = el.getBoundingClientRect();
					return r.width > 0 && r.height > 0 && r.top < window.innerHeight;
				};
				const back = Array.from(document.querySelectorAll('ion-icon, ion-button, button'))
					.filter(seen)
					.find(el => String(el.getAttribute('name') ?? el.getAttribute('ng-reflect-name') ?? '').includes('arrow-back')) as HTMLElement | undefined;
				if (!back) return false;
				back.click();
				return true;
			})
			.catch(() => false)) as boolean;

		await driver.pause(2000);
		const afterBack = (await driver.execute(() => {
			const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			return {
				searchStillOpen: Array.from(document.querySelectorAll('input')).filter(visible).some(el => !(el as HTMLInputElement).readOnly),
				spinner: Array.from(document.querySelectorAll('ion-spinner')).some(el => (el as HTMLElement).offsetParent !== null)
			};
		})) as { searchStillOpen: boolean; spinner: boolean };

		log(`   botÃ³n volver encontrado: ${backPressed}`);
		log(`   buscador sigue abierto: ${afterBack.searchStillOpen} Â· spinner: ${afterBack.spinner}`);
		log(`   -> ${backPressed && !afterBack.searchStillOpen ? 'SÃ puede salir: el fallo no lo deja atrapado' : 'REVISAR: no se cerrÃ³ el buscador'}`);

		// â”€â”€ SÃNTESIS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
		log('\nâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• SÃNTESIS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
		const valid = observations.filter(o => o.baselineOk && o.faultHits > 0);
		const stuck = valid.filter(o => o.spinnerAt10s);

		log(`\nEscenarios vÃ¡lidos: ${valid.length} de ${observations.length}`);
		log(`Con spinner colgado a los 10 s: ${stuck.length}`);
		for (const o of valid) {
			log(`   ${o.spinnerAt10s ? 'COLGADO ' : 'liberado'} Â· ${o.scenario} (hits ${o.faultHits})`);
		}

		const anyGoogle = valid.some(o => o.googleNewResources > 0);
		log(`\nÂ¿Alguno cayÃ³ a Google?: ${anyGoogle ? 'SÃ' : 'NO en ningÃºn escenario'}`);
		const anyMessage = valid.some(o => o.errorTexts.length > 0);
		log(`Â¿Alguno mostrÃ³ aviso de error?: ${anyMessage ? 'SÃ' : 'NO en ningÃºn escenario'}`);

		if (valid.length > 0) {
			log(
				stuck.length === valid.length
					? '\nCONSISTENTE: el spinner queda colgado en TODOS los escenarios de error probados.'
					: stuck.length === 0
						? '\nEl spinner se libera en todos los escenarios: la observaciÃ³n puntual no se reproduce.'
						: `\nPARCIAL: se cuelga en ${stuck.length} de ${valid.length}. El detalle por escenario estÃ¡ arriba.`
			);
		}

		const outDir = path.resolve('evidence', 'network-capture');
		await mkdir(outDir, { recursive: true });
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		const file = path.join(outDir, `mg117-tm665-matrix-${stamp}.json`);
		await writeFile(file, JSON.stringify({ observations, backPressed, afterBack }, null, 2), 'utf8');
		log(`\nEvidencia -> ${file}`);
	} finally {
		await clearWebViewFaultInjection(driver).catch(() => undefined);
		await driver.deleteSession();
	}
}

run().catch((err: Error) => {
	console.error('[matrix665] Error:', err.message ?? err);
	process.exit(1);
});
