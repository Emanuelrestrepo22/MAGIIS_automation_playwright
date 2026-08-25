/**
 * TM-731 — separa DOS disparadores que se venian tratando como uno solo.
 *
 * POR QUE EXISTE: el reporte afirmaba que "cualquier restore de proceso o vuelta del segundo plano"
 * dispara el crash de `travel-info`. La ejecucion MANUAL mostro otra cosa: mandar la app al segundo
 * plano y volver NO rompe la pantalla, solo deja un error en consola. El guard automatizado, en
 * cambio, hace un `location.reload()` explicito y SI cae en la pagina de error de Chrome.
 *
 * Los dos hechos son compatibles — el crash necesita que el renderer VUELVA A PEDIR la URL — pero
 * la diferencia cambia la frecuencia real del defecto, asi que se mide en vez de suponerse.
 *
 * ORDEN DELIBERADO: primero el segundo plano (no destructivo), despues el reload (destructivo). Al
 * reves, el reload deja la app en la pagina de error y el tramo de segundo plano ya no mide nada.
 *
 * NO crea, no confirma y no toca la wallet: solo navega a la estimacion y observa.
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveDriverTarget } from './_shared/resolveDriverTarget';
import { ScreenEvidence } from '../helpers/screenEvidence';

const TARGET = resolveDriverTarget('passenger');
const BACKGROUND_SECONDS = Number(process.env.TM731_BACKGROUND_SECONDS ?? 8);

const log = (m: string): void => console.log(`[tm731] ${m}`);
const line = (): void => log('='.repeat(74));

type ConsoleEntry = { level: string; message: string; timestamp?: number };
type Snapshot = {
	url: string;
	urlLength: number;
	title: string;
	/** La pagina de error de Chrome vive en el mismo WebView: se detecta por su marca propia. */
	isChromeErrorPage: boolean;
	visibleText: string;
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
		ticket: 'TM-731',
		env: TARGET.env,
		appPackage: TARGET.appPackage,
		udid: TARGET.udid,
		backgroundSeconds: BACKGROUND_SECONDS,
		startedAt: new Date().toISOString()
	};
	let webview = '';
	const evidence = new ScreenEvidence(
		driver,
		`tm731-bg-vs-reload-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
	);

	try {
		const contexts = (await driver.getContexts()) as unknown as string[];
		webview = contexts.map(String).find(c => c.startsWith('WEBVIEW')) ?? '';
		if (!webview) throw new Error('sin contexto WEBVIEW');
		await driver.switchContext(webview);
		await driver.pause(4000);

		const snap = async (): Promise<Snapshot> =>
			(await driver.execute(() => {
				const body = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim();
				return {
					url: location.href,
					urlLength: location.href.length,
					title: document.title ?? '',
					isChromeErrorPage:
						/no est.? disponible|ERR_|no se puede acceder|webpage not available|no disponible/i.test(
							body
						) || /error/i.test(document.title ?? ''),
					visibleText: body.slice(0, 300)
				};
			})) as Snapshot;

		/** Los logs del WebView se drenan al leerlos: cada llamada devuelve lo NUEVO desde la anterior. */
		const drainConsole = async (): Promise<ConsoleEntry[]> => {
			try {
				const raw = (await driver.getLogs('browser')) as unknown as ConsoleEntry[];
				return Array.isArray(raw) ? raw : [];
			} catch (err) {
				log(`  (no se pudieron leer los logs del navegador: ${(err as Error).message.slice(0, 80)})`);
				return [];
			}
		};

		const printConsole = (label: string, entries: ConsoleEntry[]): void => {
			const interesting = entries.filter(e => /SEVERE|WARNING|ERROR/i.test(e.level ?? ''));
			log(`  consola — ${entries.length} entradas, ${interesting.length} de nivel error/warning`);
			for (const e of interesting.slice(0, 12))
				log(`     ${e.level}: ${(e.message ?? '').replace(/\s+/g, ' ').slice(0, 220)}`);
			if (!interesting.length && entries.length) {
				for (const e of entries.slice(0, 5))
					log(`     ${e.level}: ${(e.message ?? '').replace(/\s+/g, ' ').slice(0, 160)}`);
			}
		};

		const tapByText = async (needle: string, sel: string): Promise<boolean> => {
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
			await driver.pause(3500);
			return true;
		};

		line();
		log(`ambiente=${TARGET.env} · package=${TARGET.appPackage} · segundo plano=${BACKGROUND_SECONDS}s`);
		line();

		// ------------------------------------------------------------- paso 2 del caso: ir a la estimacion
		const home = await snap();
		log(`partida: ${home.url.slice(0, 60)}`);
		if (!/travel-info/i.test(home.url)) {
			log('paso 2 — tap en "Llevame a Casa"');
			const ok = await tapByText('llevame a casa', 'button.shortcut-btn, button, div, span');
			if (!ok) {
				log('ABORTA: no se encontro el atajo "Llevame a Casa" en la pantalla actual.');
				out.aborted = 'sin atajo Llevame a Casa';
				return;
			}
		}
		const atInfo = await snap();
		out.step2 = atInfo;
		log(
			`paso 2 -> ${/travel-info/i.test(atInfo.url) ? 'PASA: llego a la pantalla de estimacion' : 'NO llego a travel-info'}`
		);
		log(`   URL de ${atInfo.urlLength} caracteres`);
		log(`   pantalla: ${atInfo.visibleText.slice(0, 140)}`);
		await evidence.capture('01-estimacion').catch(() => undefined);
		printConsole('linea base en travel-info', await drainConsole());

		// ------------------------------------------------------------- disparador A: segundo plano y vuelta
		line();
		log(`DISPARADOR A — segundo plano ${BACKGROUND_SECONDS}s y vuelta a primer plano (NO destructivo)`);
		line();
		await driver.switchContext('NATIVE_APP');
		await driver.background(BACKGROUND_SECONDS);
		await driver.pause(2500);
		// Tras volver, el handle del WebView puede ser otro: se re-resuelve en vez de reusar el viejo.
		const ctxAfter = (await driver.getContexts()) as unknown as string[];
		webview = ctxAfter.map(String).find(c => c.startsWith('WEBVIEW')) ?? webview;
		await driver.switchContext(webview);
		await driver.pause(3000);

		const afterBg = await snap();
		out.afterBackground = afterBg;
		log(`URL tras volver: ${afterBg.url.slice(0, 70)}`);
		log(`largo: ${afterBg.urlLength} caracteres`);
		log(`pagina de error de Chrome: ${afterBg.isChromeErrorPage ? 'SI' : 'NO'}`);
		log(`pantalla: ${afterBg.visibleText.slice(0, 160)}`);
		const bgConsole = await drainConsole();
		out.consoleAfterBackground = bgConsole;
		printConsole('tras volver del segundo plano', bgConsole);
		await evidence.capture('02-tras-segundo-plano').catch(() => undefined);

		const survivedBackground = /travel-info/i.test(afterBg.url) && !afterBg.isChromeErrorPage;
		log('');
		log(`VEREDICTO A: la pantalla ${survivedBackground ? 'SOBREVIVE' : 'NO sobrevive'} al segundo plano.`);

		// ------------------------------------------------------------- disparador B: reload explicito
		line();
		log('DISPARADOR B — recarga explicita del renderer (DESTRUCTIVO, va al final)');
		line();
		if (!/travel-info/i.test(afterBg.url)) {
			log('se omite: la app ya no esta en travel-info, asi que el reload no mediria este caso.');
			out.reloadSkipped = 'la app no estaba en travel-info';
		} else {
			await driver.execute(() => window.location.reload());
			await driver.pause(6000);
			const afterReload = await snap();
			out.afterReload = afterReload;
			log(`URL tras recargar: ${afterReload.url.slice(0, 70)}`);
			log(`pagina de error de Chrome: ${afterReload.isChromeErrorPage ? 'SI' : 'NO'}`);
			log(`pantalla: ${afterReload.visibleText.slice(0, 160)}`);
			const rlConsole = await drainConsole();
			out.consoleAfterReload = rlConsole;
			printConsole('tras la recarga', rlConsole);
			await evidence.capture('03-tras-recarga').catch(() => undefined);
			log('');
			log(
				`VEREDICTO B: la pantalla ${afterReload.isChromeErrorPage ? 'CAE en la pagina de error' : 'sobrevive'} al reload.`
			);
		}

		line();
		log('CONCLUSION — los dos disparadores no son el mismo hecho:');
		log(`   segundo plano y vuelta : ${survivedBackground ? 'sobrevive' : 'rompe'}`);
		log(
			`   recarga del renderer   : ${out.afterReload ? ((out.afterReload as Snapshot).isChromeErrorPage ? 'rompe' : 'sobrevive') : 'no medido'}`
		);
		line();
	} finally {
		const dir = path.join(process.cwd(), 'evidence', 'network-capture');
		await mkdir(dir, { recursive: true }).catch(() => undefined);
		const file = path.join(
			dir,
			`tm731-background-vs-reload-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
		);
		await writeFile(file, JSON.stringify(out, null, 2), 'utf8');
		log(`volcado -> ${path.relative(process.cwd(), file)}`);
		await driver.deleteSession().catch(() => undefined);
	}
}

run().catch(err => {
	console.error('[tm731] termino con error:', err?.message ?? err);
	process.exitCode = 1;
});
