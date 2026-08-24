/**
 * TM-665 — Degradación ante 5xx, en condiciones CONTROLADAS.
 *
 * La observación anterior salió de una caída espontánea del entorno, mezclada con tecleo manual y
 * automatizado a la vez: sirvió para ver el fenómeno, no para emitir un veredicto. Acá el fallo se
 * provoca sobre un único término y con el resto del sistema sano, para poder atribuir cada request.
 *
 * Responde tres preguntas, cada una con su medición:
 *   1. ¿La app cae a Google cuando el endpoint propio falla?   (el criterio real de TM-665)
 *   2. ¿UN tecleo genera UNA request o la app reintenta sola?   (lo que antes inferí sin verificar)
 *   3. ¿Qué ve el conductor: un error, una lista vacía, o un spinner colgado?
 *
 * Secuencia: baseline sano -> inyectar 503 -> medir -> limpiar -> verificar recuperación.
 * La verificación final importa: si la app no se recupera sola tras un fallo transitorio, eso es
 * más grave que la falta de mensaje.
 *
 * PRECONDICIÓN: modal "Buscar dirección" abierto, un solo campo editable, backend operativo.
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
const TERM = process.env.TM665_TERM ?? 'corr';
/** Ventana de observación tras el tecleo: suficiente para que asomen reintentos con backoff. */
const OBSERVE_MS = Number(process.env.TM665_OBSERVE_MS ?? 15000);

const log = (msg: string): void => console.log(`[TM-665] ${msg}`);

type UiState = {
	predictionItems: number;
	spinnerVisible: boolean;
	inputValue: string;
	errorTexts: string[];
	visibleTexts: string[];
};

async function readUi(driver: WebdriverIO.Browser): Promise<UiState> {
	return (await driver.execute(() => {
		const visible = (el: Element): boolean => {
			const node = el as HTMLElement;
			if (node.offsetParent === null) return false;
			const rect = node.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0;
		};

		const predictionItems = Array.from(document.querySelectorAll('ion-item.prediction-item, [class*="prediction-item"]'))
			.filter(visible).length;

		const spinnerVisible = Array.from(document.querySelectorAll('ion-spinner, ion-loading, [class*="spinner"], [class*="loading"]'))
			.some(visible);

		const input = Array.from(document.querySelectorAll('input'))
			.filter(visible)
			.find(el => !(el as HTMLInputElement).readOnly) as HTMLInputElement | undefined;

		// Cualquier cartel que el usuario podría leer como aviso de fallo.
		const errorPattern = /error|falla|fallo|intenta|reintent|no se pudo|sin conexi|problema|disponible/i;
		const errorTexts = Array.from(document.querySelectorAll('p, span, div, ion-label, ion-text'))
			.filter(visible)
			.map(el => (el.textContent ?? '').trim())
			.filter(text => text.length > 0 && text.length < 160 && errorPattern.test(text));

		const visibleTexts = Array.from(document.querySelectorAll('ion-content p, ion-content span, ion-list, ion-item'))
			.filter(visible)
			.map(el => (el.textContent ?? '').trim().replace(/\s+/g, ' '))
			.filter(text => text.length > 0 && text.length < 120)
			.slice(0, 8);

		return {
			predictionItems,
			spinnerVisible,
			inputValue: String(input?.value ?? ''),
			errorTexts: Array.from(new Set(errorTexts)),
			visibleTexts: Array.from(new Set(visibleTexts))
		};
	})) as UiState;
}

async function currentUrl(driver: WebdriverIO.Browser): Promise<string> {
	return ((await driver.execute(() => window.location.href).catch(() => '')) as string) ?? '';
}

/**
 * DOM click restricted to the ACTIVE Ionic page.
 *
 * Ionic keeps previous pages mounted in a stack, so a selector like `div.edit.action-container`
 * matches several nodes — one per visited screen. `offsetParent` does not tell them apart, and the
 * click ends up on a stale page that ignores it. `.ion-page:not(.ion-page-hidden)` is the page the
 * user is actually looking at; the rect check discards anything off-viewport.
 */
async function clickWeb(driver: WebdriverIO.Browser, selector: string): Promise<boolean> {
	return (await driver
		.execute((sel: string) => {
			const onScreen = (el: Element): boolean => {
				const rect = el.getBoundingClientRect();
				return (
					rect.width > 0 &&
					rect.height > 0 &&
					rect.bottom > 0 &&
					rect.right > 0 &&
					rect.top < window.innerHeight &&
					rect.left < window.innerWidth
				);
			};

			const active = Array.from(document.querySelectorAll(`.ion-page:not(.ion-page-hidden) ${sel}`)).filter(onScreen);
			const candidates = active.length ? active : Array.from(document.querySelectorAll(sel)).filter(onScreen);

			// La página viva es la última del stack cuando no hay marca de Ionic.
			const el = candidates[candidates.length - 1] as HTMLElement | undefined;
			if (!el) return false;
			el.click();
			return true;
		}, selector)
		.catch(() => false)) as boolean;
}

/**
 * Real finger tap on a WebView element.
 *
 * Ionic controls bind `(click)` through Angular's event plugin and a synthetic `el.click()` does not
 * always reach the handler — the PAX screens hit this same wall and solved it with a native tap.
 * The element's CSS rect is scaled to device pixels, the tap happens in NATIVE_APP, and the context
 * is restored afterwards.
 */
async function tapNative(driver: WebdriverIO.Browser, selector: string, webviewName: string): Promise<boolean> {
	const rect = (await driver
		.execute((sel: string) => {
			const onScreen = (el: Element): boolean => {
				const r = el.getBoundingClientRect();
				return r.width > 0 && r.height > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
			};
			const active = Array.from(document.querySelectorAll(`.ion-page:not(.ion-page-hidden) ${sel}`)).filter(onScreen);
			const candidates = active.length ? active : Array.from(document.querySelectorAll(sel)).filter(onScreen);
			const el = candidates[candidates.length - 1];
			if (!el) return null;
			const r = el.getBoundingClientRect();
			return {
				x: r.left + r.width / 2,
				y: r.top + r.height / 2,
				vw: window.innerWidth,
				vh: window.innerHeight
			};
		}, selector)
		.catch(() => null)) as { x: number; y: number; vw: number; vh: number } | null;

	if (!rect) return false;

	await driver.switchContext('NATIVE_APP');
	try {
		const size = await driver.getWindowSize();
		const tapX = Math.round(rect.x * (size.width / rect.vw));
		const tapY = Math.round(rect.y * (size.height / rect.vh));
		log(`       tap nativo en (${tapX}, ${tapY}) — css (${Math.round(rect.x)}, ${Math.round(rect.y)}) de ${rect.vw}x${rect.vh}`);

		await driver.performActions([
			{
				type: 'pointer',
				id: 'finger1',
				parameters: { pointerType: 'touch' },
				actions: [
					{ type: 'pointerMove', duration: 0, x: tapX, y: tapY },
					{ type: 'pointerDown', button: 0 },
					{ type: 'pause', duration: 120 },
					{ type: 'pointerUp', button: 0 }
				]
			}
		]);
		await driver.releaseActions().catch(() => undefined);
	} finally {
		await driver.switchContext(webviewName);
	}

	return true;
}

async function clickByText(driver: WebdriverIO.Browser, text: string): Promise<boolean> {
	return (await driver
		.execute((needle: string) => {
			const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const el = Array.from(document.querySelectorAll('button, ion-button, [role="button"]'))
				.filter(visible)
				.find(node => (node.textContent ?? '').trim().toLowerCase().includes(needle.toLowerCase())) as
				| HTMLElement
				| undefined;
			if (!el) return false;
			el.click();
			return true;
		}, text)
		.catch(() => false)) as boolean;
}

/** Opens the LAST readonly row of the edit modal — the Destination stop. */
async function openDestinationRow(driver: WebdriverIO.Browser): Promise<boolean> {
	return (await driver
		.execute(() => {
			const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const readonly = Array.from(document.querySelectorAll('input'))
				.filter(visible)
				.filter(el => (el as HTMLInputElement).readOnly) as HTMLInputElement[];
			const target = readonly[readonly.length - 1];
			if (!target) return false;
			target.focus();
			target.dispatchEvent(new Event('ionFocus', { bubbles: true, composed: true } as EventInit));
			target.click();
			return true;
		})
		.catch(() => false)) as boolean;
}

/**
 * Drives the app from wherever it is to the address search modal. Each iteration re-reads the URL
 * instead of assuming a fixed sequence, so the routine survives an unexpected screen.
 */
async function navigateToSearch(driver: WebdriverIO.Browser, webviewName: string): Promise<boolean> {
	for (let attempt = 1; attempt <= 10; attempt++) {
		if (await anchorInput(driver)) {
			log(`   buscador disponible (intento ${attempt})`);
			return true;
		}

		const url = await currentUrl(driver);
		log(`   [${attempt}] ${url.replace('https://localhost/navigator/', '') || '(sin url)'}`);

		if (url.includes('TravelInProgress')) {
			// El modal de edición ya abierto muestra las paradas como campos readonly.
			const readonlyRows = (await driver.execute(() => {
				const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				return Array.from(document.querySelectorAll('input'))
					.filter(visible)
					.filter(el => (el as HTMLInputElement).readOnly).length;
			})) as number;

			if (readonlyRows > 0) {
				log('       abriendo la fila Destino');
				await openDestinationRow(driver);
			} else {
				// El DOM click no alcanza este control de Ionic: va por tap real.
				log('       abriendo "Editar viaje" (tap nativo)');
				await tapNative(driver, 'div.edit.action-container', webviewName);
			}
		} else if (url.includes('TravelToStart')) {
			log('       "Empezar Viaje" + confirmación');
			await clickByText(driver, 'Empezar Viaje');
			await driver.pause(1200);
			await clickWeb(driver, 'app-confirm-modal button.btn.primary');
		} else if (url.includes('TravelConfirm')) {
			log('       aceptando el viaje asignado');
			await clickWeb(driver, 'app-confirm-modal button.btn.primary');
		} else if (url.includes('home')) {
			log('       iniciando viaje calle desde el home');
			await clickWeb(driver, 'div.driver-pass.home-icon');
			await driver.pause(1500);
			await clickWeb(driver, 'app-confirm-modal button.btn.primary');
		} else {
			await clickWeb(driver, 'app-confirm-modal button.btn.primary');
		}

		await driver.pause(2500);
	}
	return false;
}

/**
 * Marks the search field so every later step writes to the SAME element. Re-resolving "the first
 * visible editable input" on each step is what broke the previous run: once the prediction list
 * renders it overlaps the input area and the lookup can land elsewhere.
 */
async function anchorInput(driver: WebdriverIO.Browser): Promise<boolean> {
	return (await driver.execute(() => {
		const visible = (el: Element): boolean => {
			const node = el as HTMLElement;
			if (node.offsetParent === null) return false;
			const rect = node.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0;
		};
		const target = Array.from(document.querySelectorAll('input'))
			.filter(visible)
			.find(el => !(el as HTMLInputElement).readOnly) as HTMLInputElement | undefined;
		if (!target) return false;
		target.setAttribute('data-mg117-target', '1');
		return true;
	})) as boolean;
}

/**
 * Writes a value and READS IT BACK. A test script must fail loudly when its precondition does not
 * hold — silently measuring a scenario that never happened is how false verdicts are produced.
 */
async function setValueVerified(
	driver: WebdriverIO.Browser,
	value: string
): Promise<{ ok: boolean; actual: string | null }> {
	await driver.execute((v: string) => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		let target = document.querySelector('input[data-mg117-target="1"]') as HTMLInputElement | null;

		// The modal may have been rebuilt: re-anchor instead of writing to the wrong field.
		if (!target || !visible(target)) {
			target =
				(Array.from(document.querySelectorAll('input'))
					.filter(visible)
					.find(el => !(el as HTMLInputElement).readOnly) as HTMLInputElement | undefined) ?? null;
			target?.setAttribute('data-mg117-target', '1');
		}
		if (!target) return;

		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
		setter?.call(target, v);
		target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
		target.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
	}, value);

	await driver.pause(250);
	const actual = (await driver.execute(() => {
		const el = document.querySelector('input[data-mg117-target="1"]') as HTMLInputElement | null;
		return el ? String(el.value) : null;
	})) as string | null;

	return { ok: actual === value, actual };
}

async function typeTerm(driver: WebdriverIO.Browser, term: string): Promise<boolean> {
	// Vaciar y escribir necesitan ticks separados o `distinctUntilChanged` descarta el segundo.
	await setValueVerified(driver, '');
	await driver.pause(800);
	const written = await setValueVerified(driver, term);
	if (!written.ok) {
		log(`   !! el término no quedó escrito: se esperaba "${term}" y el campo dice "${written.actual ?? '(sin campo)'}"`);
	}
	return written.ok;
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

	const report: Record<string, unknown> = { term: TERM, observeMs: OBSERVE_MS };

	try {
		const contexts = (await driver.getContexts()) as string[];
		const webview = contexts.find(c => String(c).startsWith('WEBVIEW'));
		if (!webview) {
			log('Sin contexto WEBVIEW.');
			return;
		}
		await driver.switchContext(webview);
		await installWebViewNetworkCapture(driver);

		// ── PASO 0 · Llegar al buscador ──────────────────────────────────────────
		log('PASO 0 — navegando hasta el buscador de dirección');
		if (!(await navigateToSearch(driver, webview))) {
			log('ABORTA: no se pudo llegar al buscador de dirección tras 10 intentos.');
			return;
		}

		// ── PASO 1 · Baseline sano ───────────────────────────────────────────────
		log('PASO 1 — baseline con el backend operativo');
		await clearWebViewNetworkCapture(driver);
		if (!(await typeTerm(driver, TERM))) {
			log('ABORTA: el término no se pudo escribir en el baseline.');
			return;
		}
		await driver.pause(3000);

		const baseCapture = await readWebViewNetworkCapture(driver);
		const baseCalls = baseCapture.entries.filter(e => String(e.url).includes('places/autocomplete'));
		const baseUi = await readUi(driver);

		log(`   requests: ${baseCalls.length} · status: ${baseCalls.map(c => c.status).join(', ') || '—'}`);
		log(`   predicciones en pantalla: ${baseUi.predictionItems}`);
		report.baseline = { calls: baseCalls.length, statuses: baseCalls.map(c => c.status), ui: baseUi };

		if (baseCalls.length === 0 || baseUi.predictionItems === 0) {
			log('\n   ABORTA: el baseline no produjo resultados. Sin un punto de partida sano no se puede');
			log('   atribuir lo que ocurra después al fallo inyectado.');
			return;
		}

		// ── PASO 2 · Inyectar 503 ────────────────────────────────────────────────
		log('\nPASO 2 — inyectando 503 sobre places/autocomplete');
		await installWebViewFaultInjection(driver, [
			{
				id: 'TM-665-503',
				urlPattern: 'places/autocomplete',
				mode: 'status',
				status: 503,
				body: '{"error":"Service Unavailable"}'
				// Sin delayMs a propósito: la entrega inmediata evita la ventana del timer aparcado.
			}
		]);

		await clearWebViewNetworkCapture(driver);
		const googleBefore = await readWebViewGoogleActivity(driver);
		log(`   Google antes: available=${googleBefore.available} recursos=${googleBefore.resourceEntries.length}`);

		// ── PASO 3 · Un solo tecleo, ventana de observación ──────────────────────
		// Cada fase usa un término PROPIO. `onLocationTextChange` no emite el valor vacío al
		// observable (llama a resetPlacesCollection), así que vaciar el campo no reinicia el
		// `distinctUntilChanged`: repetir el término del baseline sería descartado por idéntico y
		// la app no consultaría, dejando el fallo sin ejercer.
		const faultTerm = `${TERM}i`;
		log(`\nPASO 3 — un tecleo de "${faultTerm}", observando ${OBSERVE_MS / 1000}s`);
		const typedUnderFault = await typeTerm(driver, faultTerm);
		if (!typedUnderFault) {
			log('\n   ABORTA: el término no quedó escrito con el fallo activo.');
			log('   Sin tecleo efectivo no hay consulta, y sin consulta no hay degradación que evaluar.');
			await clearWebViewFaultInjection(driver);
			return;
		}

		const snapshots: { atMs: number; requests: number; ui: UiState }[] = [];
		const step = 3000;
		for (let elapsed = step; elapsed <= OBSERVE_MS; elapsed += step) {
			await driver.pause(step);
			const capture = await readWebViewNetworkCapture(driver);
			const calls = capture.entries.filter(e => String(e.url).includes('places/autocomplete'));
			const ui = await readUi(driver);
			snapshots.push({ atMs: elapsed, requests: calls.length, ui });
			log(`   t+${elapsed / 1000}s -> requests: ${calls.length} · predicciones: ${ui.predictionItems} · spinner: ${ui.spinnerVisible}`);
		}

		const faultCapture = await readWebViewNetworkCapture(driver);
		const faultCalls = faultCapture.entries.filter(e => String(e.url).includes('places/autocomplete'));
		const injected = faultCalls.filter(e => (e as { injected?: boolean }).injected === true);
		const googleAfter = await readWebViewGoogleActivity(driver);
		const faultState = await readWebViewFaultInjectionState(driver);
		const faultUi = await readUi(driver);

		const newGoogle = googleAfter.resourceEntries.length - googleBefore.resourceEntries.length;

		report.underFault = {
			totalCalls: faultCalls.length,
			injectedCalls: injected.length,
			faultHits: faultState.totalHits,
			googleNewResources: newGoogle,
			googleAvailable: googleAfter.available,
			ui: faultUi,
			snapshots
		};

		// ── PASO 4 · Quitar el fallo y verificar recuperación ────────────────────
		log('\nPASO 4 — quitando el fallo y verificando que se recupera');
		await clearWebViewFaultInjection(driver);
		await clearWebViewNetworkCapture(driver);
		await typeTerm(driver, `${TERM}ie`);
		await driver.pause(3500);

		const recoveryCapture = await readWebViewNetworkCapture(driver);
		const recoveryCalls = recoveryCapture.entries.filter(e => String(e.url).includes('places/autocomplete'));
		const recoveryUi = await readUi(driver);
		log(`   requests: ${recoveryCalls.length} · predicciones: ${recoveryUi.predictionItems}`);
		report.recovery = { calls: recoveryCalls.length, ui: recoveryUi };

		// ── VEREDICTOS ───────────────────────────────────────────────────────────
		log('\n════════════════ VEREDICTOS ════════════════');

		// Sin un disparo de la regla, el 503 nunca llegó a la app: no hay escenario que juzgar.
		if (faultState.totalHits === 0 && faultCalls.length === 0) {
			log('\nESCENARIO NO EJERCIDO — la regla de fallo no se disparó ni una vez.');
			log('La app no emitió ninguna consulta con el fallo activo, así que no se puede afirmar');
			log('nada sobre su degradación. No se emite veredicto para TM-665.');
			log(`\n(estado de la regla: ${JSON.stringify(faultState)})`);
			report.verdict = 'NO_EJERCIDO';
			return;
		}

		log(`\n1) ¿Cayó a Google al fallar el endpoint propio?`);
		if (!googleAfter.available) {
			log(`   INDETERMINADO — la sonda de actividad Google no pudo correr (${googleAfter.unavailableReason ?? '?'})`);
		} else if (newGoogle === 0) {
			log(`   NO. Cero recursos nuevos de Google durante todo el fallo. -> CRITERIO CENTRAL CUMPLIDO`);
		} else {
			log(`   SÍ — ${newGoogle} recursos nuevos de Google. -> CRITERIO CENTRAL INCUMPLIDO`);
		}

		log(`\n2) ¿UN tecleo produce UNA request o la app reintenta sola?`);
		log(`   requests con el fallo activo: ${faultCalls.length} (inyectadas: ${injected.length}, hits de la regla: ${faultState.totalHits})`);
		if (faultCalls.length <= 1) {
			log(`   NO reintenta. Los 654 requests de la observación anterior eran acumulación de`);
			log(`   términos distintos (automatizados + manuales), no reintentos de la app.`);
		} else {
			log(`   SÍ reintenta: ${faultCalls.length} requests para un solo tecleo.`);
			const times = snapshots.map(s => `t+${s.atMs / 1000}s=${s.requests}`).join(' · ');
			log(`   progresión: ${times}`);
		}

		log(`\n3) ¿Qué ve el conductor?`);
		log(`   predicciones en pantalla: ${faultUi.predictionItems}`);
		log(`   spinner visible: ${faultUi.spinnerVisible}`);
		log(`   texto del campo: "${faultUi.inputValue}"`);
		log(`   avisos de error detectados: ${faultUi.errorTexts.length ? faultUi.errorTexts.join(' | ') : 'NINGUNO'}`);
		if (faultUi.spinnerVisible) {
			log(`   -> el spinner quedó colgado: el usuario percibe la app trabajando indefinidamente`);
		} else if (faultUi.predictionItems === 0 && faultUi.errorTexts.length === 0) {
			log(`   -> lista vacía sin aviso: indistinguible de "no hay resultados"`);
		}

		log(`\n4) ¿Se recupera al normalizarse el servicio?`);
		log(`   ${recoveryUi.predictionItems > 0 ? 'SÍ — vuelve a mostrar predicciones sin reiniciar nada.' : 'NO — sigue sin resultados tras quitar el fallo.'}`);

		const outDir = path.resolve('evidence', 'network-capture');
		await mkdir(outDir, { recursive: true });
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		const file = path.join(outDir, `mg117-tm665-controlado-${stamp}.json`);
		await writeFile(file, JSON.stringify(report, null, 2), 'utf8');
		log(`\nEvidencia -> ${file}`);
	} finally {
		// La regla no puede quedar viva: envenenaría cualquier corrida posterior.
		await clearWebViewFaultInjection(driver).catch(() => undefined);
		await driver.deleteSession();
	}
}

run().catch((err: Error) => {
	console.error('[TM-665] Error:', err.message ?? err);
	process.exit(1);
});
