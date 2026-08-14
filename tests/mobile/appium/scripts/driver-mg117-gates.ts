/**
 * MG-117 â€” MediciÃ³n de los gates que el ojo no puede resolver en el panel de red.
 *
 *   TM-654 â€” debounce ~300 ms: tecleo continuo debe producir UNA sola llamada
 *   TM-655 â€” distinctUntilChanged: repetir el mismo tÃ©rmino no vuelve a consultar
 *   TM-656 â€” con 2 caracteres NO se consulta
 *   TM-657 â€” con 3 caracteres SÃ se consulta (soporte IATA)
 *   TM-662 â€” todas las llamadas de la sesiÃ³n comparten sessionToken
 *
 * Por quÃ© un script y no el panel: el debounce se mide por la separaciÃ³n entre el ÃšLTIMO
 * evento de tecla y el inicio de la request. A ojo, en una lista de requests, eso no se ve.
 * El marcador de la Ãºltima tecla se escribe DENTRO del WebView (`__mg117LastKeystrokeAt`)
 * para que el delta se calcule con un Ãºnico reloj y no arrastre el desfase con el host.
 *
 * PRECONDICIÃ“N: viaje en curso, modal "Editar viaje" abierto y el campo Destino vacÃ­o.
 * Si hay mÃ¡s de un buscador apilado el script aborta: cada modal tiene su propia suscripciÃ³n
 * al tecleo y multiplicarÃ­a las llamadas, que fue justo lo que contaminÃ³ la corrida anterior.
 *
 * Uso:
 *   $env:ANDROID_UDID="R92XB0B8F3J"; npx ... driver-mg117-gates.ts
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe as describeTarget, resolveDriverTarget } from './_shared/resolveDriverTarget';
import {
	installWebViewNetworkCapture,
	clearWebViewNetworkCapture,
	readWebViewNetworkCapture,
	readWebViewGoogleActivity
} from '../helpers/webViewNetworkCapture';

// El objetivo (ambiente + paquete) se resuelve desde ENV, no desde un literal: con el literal
// anterior `ENV=uat` era inerte y la corrida abria la app de TEST mientras el reporte decia UAT.
const TARGET = resolveDriverTarget('driver');
const APPIUM_URL = TARGET.appiumUrl;
const UDID = TARGET.udid;
const APP_PACKAGE = TARGET.appPackage;
/** Muy por debajo de los 300 ms declarados, para que un debounce sano colapse todo el tÃ©rmino. */
const KEY_GAP_MS = Number(process.env.KEY_GAP_MS ?? 80);

const log = (msg: string): void => console.log(`[gates] ${msg}`);

type Entry = { url: string; startedAt: string; status?: number };

type Measurement = {
	label: string;
	term: string;
	calls: number;
	addresses: string[];
	sessionTokens: string[];
	msFromLastKeystroke: number | null;
	gapsMs: number[];
};

async function countSearchInputs(driver: WebdriverIO.Browser): Promise<number> {
	return (await driver.execute(() => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		return Array.from(document.querySelectorAll('input'))
			.filter(visible)
			.filter(el => !(el as HTMLInputElement).readOnly).length;
	})) as number;
}

async function openSearchFromDestination(driver: WebdriverIO.Browser): Promise<boolean> {
	const opened = (await driver.execute(() => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const inputs = Array.from(document.querySelectorAll('input')).filter(visible) as HTMLInputElement[];
		const readonly = inputs.filter(el => el.readOnly);
		const target = readonly[readonly.length - 1];
		if (!target) return false;
		target.focus();
		target.dispatchEvent(new Event('ionFocus', { bubbles: true, composed: true } as EventInit));
		target.click();
		return true;
	})) as boolean;
	await driver.pause(1800);
	return opened;
}

/** Empties the field through the same event path a user would trigger. */
async function clearField(driver: WebdriverIO.Browser): Promise<void> {
	await driver.execute(() => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const target = Array.from(document.querySelectorAll('input'))
			.filter(visible)
			.find(el => !(el as HTMLInputElement).readOnly) as HTMLInputElement | undefined;
		if (!target) return;
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
		setter?.call(target, '');
		target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
		target.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
	});
	await driver.pause(700);
}

async function typeTerm(driver: WebdriverIO.Browser, term: string, gapMs: number): Promise<void> {
	for (let i = 1; i <= term.length; i++) {
		await driver.execute((value: string, isLast: boolean) => {
			const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const target = Array.from(document.querySelectorAll('input'))
				.filter(visible)
				.find(el => !(el as HTMLInputElement).readOnly) as HTMLInputElement | undefined;
			if (!target) return;
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
			setter?.call(target, value);
			target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
			target.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
			// Same clock as the capture hook, so the debounce delta has no host/device skew.
			if (isLast) (window as any).__mg117LastKeystrokeAt = Date.now();
		}, term.slice(0, i), i === term.length);
		if (i < term.length) await driver.pause(gapMs);
	}
}

async function measure(
	driver: WebdriverIO.Browser,
	label: string,
	term: string,
	settleMs = 2500
): Promise<Measurement> {
	await clearField(driver);
	await clearWebViewNetworkCapture(driver);
	await typeTerm(driver, term, KEY_GAP_MS);
	await driver.pause(settleMs);

	const lastKeystrokeAt = (await driver.execute(() => (window as any).__mg117LastKeystrokeAt ?? null)) as number | null;
	const capture = await readWebViewNetworkCapture(driver);
	const calls = (capture.entries as Entry[]).filter(e => String(e.url).includes('places/autocomplete'));

	const startedTimes = calls.map(c => new Date(c.startedAt).getTime()).sort((a, b) => a - b);
	const gapsMs = startedTimes.slice(1).map((t, i) => t - startedTimes[i]);
	const msFromLastKeystroke =
		lastKeystrokeAt && startedTimes.length > 0 ? startedTimes[0] - lastKeystrokeAt : null;

	const param = (url: string, name: string): string => {
		const match = new RegExp(`[?&]${name}=([^&]*)`).exec(url);
		return match ? decodeURIComponent(match[1]) : '';
	};

	return {
		label,
		term,
		calls: calls.length,
		addresses: calls.map(c => param(String(c.url), 'address')),
		sessionTokens: Array.from(new Set(calls.map(c => param(String(c.url), 'sessionToken')))),
		msFromLastKeystroke,
		gapsMs
	};
}

function report(m: Measurement): void {
	log(`\nâ”€â”€ ${m.label} â€” tÃ©rmino "${m.term}"`);
	log(`   llamadas: ${m.calls}`);
	if (m.addresses.length) log(`   address enviados: ${m.addresses.join(' | ')}`);
	if (m.sessionTokens.length) log(`   sessionToken(s): ${m.sessionTokens.join(' | ')}`);
	if (m.msFromLastKeystroke !== null) log(`   ms desde la Ãºltima tecla: ${m.msFromLastKeystroke}`);
	if (m.gapsMs.length) log(`   separaciÃ³n entre llamadas: ${m.gapsMs.join(', ')} ms`);
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
			log('Sin contexto WEBVIEW.');
			return;
		}
		await driver.switchContext(webview);

		const url = (await driver.execute(() => window.location.href)) as string;
		log(`URL: ${url}`);

		await installWebViewNetworkCapture(driver);

		let searchInputs = await countSearchInputs(driver);
		log(`Campos de bÃºsqueda activos: ${searchInputs}`);

		if (searchInputs === 0) {
			log('Abriendo el buscador desde la fila Destinoâ€¦');
			if (!(await openSearchFromDestination(driver))) {
				log('No se pudo abrir el buscador.');
				return;
			}
			searchInputs = await countSearchInputs(driver);
			log(`Campos de bÃºsqueda activos tras abrir: ${searchInputs}`);
		}

		if (searchInputs !== 1) {
			log(`ABORTA: se esperaba exactamente 1 buscador y hay ${searchInputs}.`);
			log('Con buscadores apilados cada uno dispara su propia consulta y la mediciÃ³n no sirve.');
			return;
		}

		const googleBefore = await readWebViewGoogleActivity(driver);

		// TM-656 / TM-657: el umbral. "ez" no debe consultar; "eze" sÃ­ (cÃ³digo IATA).
		results.push(await measure(driver, 'TM-656 Â· 2 caracteres', 'ez'));
		report(results[results.length - 1]);

		results.push(await measure(driver, 'TM-657 Â· 3 caracteres (IATA)', 'eze'));
		report(results[results.length - 1]);

		// TM-654: tecleo continuo por debajo de la ventana de debounce.
		results.push(await measure(driver, 'TM-654 Â· debounce', 'corrientes'));
		report(results[results.length - 1]);

		// TM-655: repetir el mismo tÃ©rmino no debe volver a consultar.
		await clearWebViewNetworkCapture(driver);
		await typeTerm(driver, 'corrientes', KEY_GAP_MS);
		await driver.pause(2500);
		const repeatCapture = await readWebViewNetworkCapture(driver);
		const repeatCalls = (repeatCapture.entries as Entry[]).filter(e =>
			String(e.url).includes('places/autocomplete')
		);
		log(`\nâ”€â”€ TM-655 Â· mismo tÃ©rmino repetido\n   llamadas: ${repeatCalls.length}`);

		const googleAfter = await readWebViewGoogleActivity(driver);
		const newGoogle = googleAfter.resourceEntries.length - googleBefore.resourceEntries.length;

		log('\nâ•â•â•â•â•â•â•â•â•â•â•â• VEREDICTOS â•â•â•â•â•â•â•â•â•â•â•â•');
		const twoChars = results.find(r => r.label.startsWith('TM-656'));
		const threeChars = results.find(r => r.label.startsWith('TM-657'));
		const debounce = results.find(r => r.label.startsWith('TM-654'));

		log(`TM-656 (2 chars no consulta): ${twoChars && twoChars.calls === 0 ? 'PASA' : 'FALLA'} â€” ${twoChars?.calls} llamadas`);
		log(`TM-657 (3 chars sÃ­ consulta): ${threeChars && threeChars.calls > 0 ? 'PASA' : 'FALLA'} â€” ${threeChars?.calls} llamadas`);
		if (debounce) {
			const single = debounce.calls === 1;
			const timing = debounce.msFromLastKeystroke;
			const inWindow = timing !== null && timing >= 150 && timing <= 900;
			log(
				`TM-654 (debounce ~300 ms): ${single && inWindow ? 'PASA' : 'REVISAR'} â€” ` +
					`${debounce.calls} llamada(s), ${timing ?? '?'} ms tras la Ãºltima tecla`
			);
		}
		log(`TM-655 (tÃ©rmino repetido): ${repeatCalls.length === 0 ? 'PASA' : 'FALLA'} â€” ${repeatCalls.length} llamadas`);
		log(`TM-650 (sin trÃ¡fico a Google): ${googleAfter.available ? (newGoogle === 0 ? 'PASA' : 'FALLA') : 'INDETERMINADO'} â€” ${newGoogle} recursos nuevos`);

		const allTokens = Array.from(new Set(results.flatMap(r => r.sessionTokens).filter(Boolean)));
		log(`TM-662 (sessionToken): ${allTokens.length} token(s) distintos en toda la sesiÃ³n`);
		for (const token of allTokens) log(`   Â· ${token}`);

		const outDir = path.resolve('evidence', 'network-capture');
		await mkdir(outDir, { recursive: true });
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		const file = path.join(outDir, `mg117-gates-${stamp}.json`);
		await writeFile(
			file,
			JSON.stringify({ url, results, repeatCalls: repeatCalls.length, googleBefore, googleAfter }, null, 2),
			'utf8'
		);
		log(`\nEvidencia -> ${file}`);
	} finally {
		await driver.deleteSession();
	}
}

run().catch((err: Error) => {
	console.error('[gates] Error:', err.message ?? err);
	process.exit(1);
});
