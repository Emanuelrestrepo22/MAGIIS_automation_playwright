/**
 * MG-116 / TM-693 (TC20) — ALCANCE REAL del `sessionToken` en App PAX.
 *
 * QUE ASIERTA EL CASO
 * "Validar que las sesiones de sessionToken son independientes entre el campo de origen y el de
 * destino". Hasta hoy NINGUNA corrida sobre PAX midio los dos campos: toda la evidencia previa de
 * token viene de un unico campo (`Origen`) con un solo token, asi que el caso nunca se ejercio.
 *
 * EVIDENCIA MANUAL QUE ORIGINA ESTA CORRIDA (2026-08-18, Carrier v2 / localhost)
 * Con Origen YA SELECCIONADO, al tipear en Destino el payload viajaba con
 * sessionToken 0b085265-9c20-49e8-a8f7-45c429102b36, distinto del 3dabf649-d56c-49c1-9b40-8ec96f312b03
 * observado en el campo de origen. Esa medicion es de CARRIER v2, no de App PAX: este script la
 * reproduce sobre la superficie que el caso realmente cubre.
 *
 * TRES PREGUNTAS, TRES FASES — un token de sesion tiene que cumplir las tres para que el ahorro
 * de facturacion que persigue la epica sea real:
 *
 *   A. ESTABILIDAD INTRA-CAMPO. Varias pulsaciones dentro del MISMO campo tienen que compartir
 *      token: eso es lo que agrupa N requests en 1 sesion facturable. Si el token cambia en cada
 *      tecla, el `sessionToken` esta presente pero no ahorra nada.
 *   B. INDEPENDENCIA ENTRE CAMPOS SIN SELECCION INTERMEDIA. Es la lectura estricta de TM-693 y el
 *      hueco de definicion: ningun AC dice que pasa si el usuario tipea en Origen, no elige nada y
 *      se va a Destino.
 *   C. INDEPENDENCIA ENTRE CAMPOS CON SELECCION INTERMEDIA. Reproduce exactamente la evidencia
 *      manual de Carrier v2. Es el camino de uso real.
 *
 * DISCIPLINA DE VEREDICTO (aprendida a golpes en esta campana)
 * Cero llamadas capturadas => SIN DATOS, nunca PASS. Cero tokens => NO EJERCIDO. Un campo que
 * no se pudo enfocar se reporta como tal y NO se convierte en un defecto: en TM-684 y TM-687 un tap
 * programatico que no disparaba el handler de Ionic simulo dos defectos que no existian.
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
const SETTLE_MS = 4200;

/** Terminos distintos por fase para que cada request sea distinguible en la captura. */
const ORIGIN_STEPS = ['libe', 'libertad', 'libertad 479'];
const DEST_TERM_NO_SELECT = 'cmte rosales';
const DEST_TERM_AFTER_SELECT = 'santa fe 12';

const log = (m: string): void => console.log(`[token-scope] ${m}`);
const line = (): void => log('='.repeat(70));

type Entry = { url: string; status?: number };
type Call = { url: string; address: string; sessionToken: string; latitude: string; longitude: string };

function param(url: string, name: string): string {
	const m = new RegExp(`[?&]${name}=([^&]*)`).exec(url);
	return m ? decodeURIComponent(m[1]) : '';
}

/** Diagnostico: que inputs hay realmente en pantalla. Sin esto un campo inalcanzable parece defecto. */
async function visibleInputs(
	driver: WebdriverIO.Browser
): Promise<{ placeholder: string; value: string; readOnly: boolean }[]> {
	return (await driver.execute(() => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		return Array.from(document.querySelectorAll('input'))
			.filter(vis)
			.map(el => {
				const i = el as HTMLInputElement;
				return { placeholder: (i.placeholder ?? '').trim(), value: i.value, readOnly: i.readOnly };
			});
	})) as { placeholder: string; value: string; readOnly: boolean }[];
}

async function focusField(driver: WebdriverIO.Browser, prefix: string): Promise<boolean> {
	const ok = (await driver.execute((p: string) => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const t = Array.from(document.querySelectorAll('input'))
			.filter(vis)
			.find(el => ((el as HTMLInputElement).placeholder ?? '').trim().startsWith(p)) as
			| HTMLInputElement
			| undefined;
		if (!t) return false;
		t.focus();
		t.dispatchEvent(new Event('ionFocus', { bubbles: true, composed: true } as EventInit));
		t.click();
		return true;
	}, prefix)) as boolean;
	await driver.pause(1600);
	return ok;
}

async function typeInField(driver: WebdriverIO.Browser, prefix: string, val: string): Promise<boolean> {
	const ok = (await driver.execute(
		(p: string, v: string) => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const t = Array.from(document.querySelectorAll('input'))
				.filter(vis)
				.find(el => ((el as HTMLInputElement).placeholder ?? '').trim().startsWith(p)) as
				| HTMLInputElement
				| undefined;
			if (!t) return false;
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
			setter?.call(t, v);
			t.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
			t.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
			return true;
		},
		prefix,
		val
	)) as boolean;
	await driver.pause(SETTLE_MS);
	return ok;
}

async function fieldValue(driver: WebdriverIO.Browser, prefix: string): Promise<string> {
	return (await driver.execute((p: string) => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const t = Array.from(document.querySelectorAll('input'))
			.filter(vis)
			.find(el => ((el as HTMLInputElement).placeholder ?? '').trim().startsWith(p)) as
			| HTMLInputElement
			| undefined;
		return t?.value ?? '';
	}, prefix)) as string;
}

/** Lee la captura y devuelve solo los autocomplete, con el token de cada uno. */
async function drainAutocomplete(driver: WebdriverIO.Browser): Promise<Call[]> {
	const cap = await readWebViewNetworkCapture(driver);
	return (cap.entries as Entry[])
		.filter(e => String(e.url).includes('places/autocomplete'))
		.map(e => {
			const full = String(e.url);
			return {
				url: full,
				address: param(full, 'address'),
				sessionToken: param(full, 'sessionToken'),
				latitude: param(full, 'latitude'),
				longitude: param(full, 'longitude')
			};
		});
}

function tokensOf(calls: Call[]): string[] {
	return Array.from(new Set(calls.map(c => c.sessionToken).filter(Boolean)));
}

function reportCalls(tag: string, calls: Call[]): void {
	log(`  ${tag}: ${calls.length} request(s) de autocomplete`);
	for (const c of calls) {
		log(`    address="${c.address}"  sessionToken=${c.sessionToken || '(ausente)'}`);
	}
}

/** Tap NATIVO anclado al rect del WebView: el .click() del DOM no dispara el handler de Ionic. */
async function tapFirstPredictionNative(driver: WebdriverIO.Browser, webview: string): Promise<string | null> {
	const probe = [
		'return (function () {',
		"  var items = Array.prototype.slice.call(document.querySelectorAll('ion-item.prediction-item'))",
		'    .filter(function (el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });',
		'  var t = items[0];',
		'  if (!t) return null;',
		'  var r = t.getBoundingClientRect();',
		'  return { x: r.left + r.width / 2, y: r.top + r.height / 2, vw: window.innerWidth,',
		"           vh: window.innerHeight, label: (t.textContent || '').trim().slice(0, 90) };",
		'})();'
	].join('\n');

	const rect = (await driver.execute(probe).catch(() => null)) as
		| { x: number; y: number; vw: number; vh: number; label: string }
		| null;
	if (!rect) return null;

	await driver.switchContext('NATIVE_APP');
	try {
		let ox = 0;
		let oy = 0;
		let sw = 0;
		let sh = 0;
		try {
			const wv = (await driver.$('//android.webkit.WebView')) as unknown as {
				getLocation: () => Promise<{ x: number; y: number }>;
				getSize: () => Promise<{ width: number; height: number }>;
			};
			const loc = await wv.getLocation();
			const sz = await wv.getSize();
			ox = loc.x;
			oy = loc.y;
			sw = sz.width;
			sh = sz.height;
		} catch {
			sw = 0;
		}
		if (!sw || !sh) {
			const size = await driver.getWindowSize();
			sw = size.width;
			sh = size.height;
		}
		const x = Math.round(ox + rect.x * (sw / rect.vw));
		const y = Math.round(oy + rect.y * (sh / rect.vh));
		await driver.performActions([
			{
				type: 'pointer',
				id: 'finger1',
				parameters: { pointerType: 'touch' },
				actions: [
					{ type: 'pointerMove', duration: 0, x, y },
					{ type: 'pointerDown', button: 0 },
					{ type: 'pause', duration: 120 },
					{ type: 'pointerUp', button: 0 }
				]
			}
		]);
		await driver.releaseActions().catch(() => undefined);
	} finally {
		await driver.switchContext(webview);
	}
	await driver.pause(4000);
	return rect.label;
}

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
			'appium:deviceName': 'SM-A055M',
			'appium:udid': TARGET.udid,
			'appium:appPackage': TARGET.appPackage,
			'appium:appActivity': '.MainActivity',
			'appium:noReset': true,
			'appium:forceAppLaunch': false,
			'appium:newCommandTimeout': 240
		} as Record<string, unknown>
	});

	const out: Record<string, unknown> = {
		ticket: 'MG-116',
		testCase: 'TM-693',
		testCaseAlias: 'TC20',
		target: TARGET,
		capturedAt: new Date().toISOString(),
		manualBaselineCarrierV2: {
			note: 'Medicion manual del usuario en Carrier v2 (localhost/navigator/HomePage), NO en App PAX.',
			originFieldToken: '3dabf649-d56c-49c1-9b40-8ec96f312b03',
			destinationFieldToken: '0b085265-9c20-49e8-a8f7-45c429102b36',
			destinationPayload: { address: 'libertad 4790', latitude: '-34.5694058', longitude: '-58.4465842' }
		}
	};

	try {
		const ctx = (await driver.getContexts()) as string[];
		const webview = ctx.find(c => String(c).startsWith('WEBVIEW'));
		if (!webview) {
			log('ABORTA: sin contexto WEBVIEW.');
			out.aborted = 'sin contexto WEBVIEW';
			return;
		}
		await driver.switchContext(webview);

		const url = (await driver.execute(() => window.location.href)) as string;
		log(`URL de la app: ${url}`);
		out.appUrl = url;
		if (/\/login/i.test(url)) {
			log('ABORTA: la app esta en el login. Iniciar sesion y reintentar.');
			out.aborted = 'app en login';
			return;
		}

		const inputsAtStart = await visibleInputs(driver);
		out.inputsAtStart = inputsAtStart;
		log(`inputs visibles al inicio (${inputsAtStart.length}):`);
		for (const i of inputsAtStart) {
			log(`   "${i.placeholder}" = "${i.value}"${i.readOnly ? '  [readonly]' : ''}`);
		}

		await installWebViewNetworkCapture(driver);

		// ---------------------------------------------------------------- FASE A
		line();
		log('FASE A - estabilidad del token DENTRO del campo Origen');
		line();
		const focusedOrigin = await focusField(driver, 'Origen');
		log(`Origen enfocado: ${focusedOrigin}`);
		await clearWebViewNetworkCapture(driver);

		const phaseA: Call[] = [];
		if (focusedOrigin) {
			for (const term of ORIGIN_STEPS) {
				await typeInField(driver, 'Origen', term);
				phaseA.push(...(await drainAutocomplete(driver)));
				await clearWebViewNetworkCapture(driver);
			}
		}
		reportCalls('FASE A', phaseA);
		const tokensA = tokensOf(phaseA);
		log(`  tokens distintos en Origen: ${tokensA.length} -> ${tokensA.join(', ') || '(ninguno)'}`);

		let verdictA: string;
		if (!focusedOrigin) verdictA = 'SIN DATOS - no se pudo enfocar el campo Origen.';
		else if (phaseA.length === 0) verdictA = 'SIN DATOS - cero requests de autocomplete capturados.';
		else if (tokensA.length === 0) verdictA = 'NO EJERCIDO - los requests salieron sin parametro sessionToken.';
		else if (tokensA.length === 1)
			verdictA = `ESTABLE - ${phaseA.length} requests dentro de Origen comparten un unico token. La agrupacion por sesion funciona.`;
		else
			verdictA = `NO AGRUPA - ${phaseA.length} requests en el MISMO campo usaron ${tokensA.length} tokens distintos. El parametro viaja pero no agrupa la sesion, asi que el ahorro de facturacion que persigue la epica no se materializa.`;
		log(`  VEREDICTO A: ${verdictA}`);

		// ---------------------------------------------------------------- FASE B
		line();
		log('FASE B - Origen -> Destino SIN seleccion intermedia (lectura estricta de TM-693)');
		line();
		out.inputsBeforePhaseB = await visibleInputs(driver);
		const focusedDestB = await focusField(driver, 'Destino');
		log(`Destino enfocado: ${focusedDestB}`);
		await clearWebViewNetworkCapture(driver);
		const phaseB: Call[] = [];
		if (focusedDestB) {
			await typeInField(driver, 'Destino', DEST_TERM_NO_SELECT);
			phaseB.push(...(await drainAutocomplete(driver)));
		}
		reportCalls('FASE B', phaseB);
		const tokensB = tokensOf(phaseB);
		log(`  tokens distintos en Destino: ${tokensB.length} -> ${tokensB.join(', ') || '(ninguno)'}`);
		const sharedAB = tokensB.filter(t => tokensA.includes(t));

		let verdictB: string;
		if (!focusedDestB)
			verdictB =
				'SIN DATOS - el campo Destino no era alcanzable en este estado de pantalla. NO se reporta como defecto: es limitacion del harness.';
		else if (phaseB.length === 0) verdictB = 'SIN DATOS - cero requests de autocomplete en Destino.';
		else if (tokensB.length === 0) verdictB = 'NO EJERCIDO - Destino no envio sessionToken.';
		else if (tokensA.length === 0)
			verdictB = 'INDETERMINADO - sin token de referencia en Origen no hay con que comparar.';
		else if (sharedAB.length === 0)
			verdictB = `INDEPENDIENTES - Destino abrio sesion propia (${tokensB.join(', ')}) sin reutilizar la de Origen (${tokensA.join(', ')}). TM-693 se cumple incluso sin seleccion intermedia.`;
		else
			verdictB = `TOKEN COMPARTIDO - Destino reutilizo ${sharedAB.join(', ')}, el mismo token que venia usando Origen. Las dos busquedas quedan contabilizadas como una sola sesion.`;
		log(`  VEREDICTO B: ${verdictB}`);

		// ---------------------------------------------------------------- FASE C
		line();
		log('FASE C - Origen CON seleccion, luego Destino (reproduce la evidencia manual de Carrier v2)');
		line();
		await focusField(driver, 'Origen');
		await typeInField(driver, 'Origen', '');
		await driver.pause(500);
		await typeInField(driver, 'Origen', ORIGIN_STEPS[ORIGIN_STEPS.length - 1]);
		await clearWebViewNetworkCapture(driver);

		const originBefore = await fieldValue(driver, 'Origen');
		const tappedLabel = await tapFirstPredictionNative(driver, webview);
		const originAfter = await fieldValue(driver, 'Origen');
		const selectionPopulated = tappedLabel !== null && originAfter !== originBefore && originAfter.length > 0;
		log(`  fila tocada: ${tappedLabel ?? '(no habia predicciones visibles)'}`);
		log(`  Origen: "${originBefore}" -> "${originAfter}"  ${selectionPopulated ? '(POBLADO)' : '(SIN POBLAR)'}`);

		// El token de Origen DESPUES de la seleccion: re-tipear ahi mide si roto (CA-30).
		await focusField(driver, 'Origen');
		await clearWebViewNetworkCapture(driver);
		await typeInField(driver, 'Origen', 'libertad 47');
		const originAfterSelectCalls = await drainAutocomplete(driver);
		const tokensOriginPostSelect = tokensOf(originAfterSelectCalls);
		reportCalls('Origen post-seleccion', originAfterSelectCalls);

		out.inputsBeforePhaseCDestination = await visibleInputs(driver);
		const focusedDestC = await focusField(driver, 'Destino');
		log(`Destino enfocado: ${focusedDestC}`);
		await clearWebViewNetworkCapture(driver);
		const phaseC: Call[] = [];
		if (focusedDestC) {
			await typeInField(driver, 'Destino', DEST_TERM_AFTER_SELECT);
			phaseC.push(...(await drainAutocomplete(driver)));
		}
		reportCalls('FASE C (Destino)', phaseC);
		const tokensC = tokensOf(phaseC);
		log(
			`  tokens distintos en Destino tras seleccionar Origen: ${tokensC.length} -> ${tokensC.join(', ') || '(ninguno)'}`
		);
		const sharedCOrigin = tokensC.filter(t => tokensOriginPostSelect.includes(t) || tokensA.includes(t));

		let verdictC: string;
		if (!focusedDestC) verdictC = 'SIN DATOS - Destino no alcanzable tras la seleccion.';
		else if (phaseC.length === 0) verdictC = 'SIN DATOS - cero requests en Destino.';
		else if (tokensC.length === 0) verdictC = 'NO EJERCIDO - Destino no envio sessionToken.';
		else if (sharedCOrigin.length === 0)
			verdictC = `INDEPENDIENTES - con Origen ya seleccionado, Destino abrio sesion propia (${tokensC.join(', ')}). Coincide con la medicion manual en Carrier v2, donde origen y destino viajaron con tokens distintos.`;
		else
			verdictC = `TOKEN COMPARTIDO - Destino reutilizo ${sharedCOrigin.join(', ')} pese a la seleccion previa en Origen.`;
		log(`  VEREDICTO C: ${verdictC}`);

		// Rotacion del token en Origen despues de seleccionar (CA-30).
		let verdictRotation: string;
		if (!selectionPopulated)
			verdictRotation = 'SIN DATOS - la seleccion no llego a poblar el campo, asi que no hay rotacion que medir.';
		else if (tokensOriginPostSelect.length === 0) verdictRotation = 'SIN DATOS - sin requests tras la seleccion.';
		else if (tokensOriginPostSelect.some(t => tokensA.includes(t)))
			verdictRotation = `NO ROTA - tras seleccionar, Origen siguio con ${tokensOriginPostSelect.join(', ')}, el token de la sesion anterior. CA-30 pide descartarlo.`;
		else
			verdictRotation = `ROTA - tras seleccionar, Origen abrio token nuevo (${tokensOriginPostSelect.join(', ')}). CA-30 se cumple.`;
		log(`  VEREDICTO rotacion post-seleccion (CA-30): ${verdictRotation}`);

		line();
		log('RESUMEN');
		log(`  A intra-campo Origen ......... ${verdictA}`);
		log(`  B entre campos sin seleccion . ${verdictB}`);
		log(`  C entre campos con seleccion . ${verdictC}`);
		log(`  rotacion tras seleccion ...... ${verdictRotation}`);
		line();

		out.phaseA = { steps: ORIGIN_STEPS, calls: phaseA, tokens: tokensA, verdict: verdictA };
		out.phaseB = {
			term: DEST_TERM_NO_SELECT,
			focused: focusedDestB,
			calls: phaseB,
			tokens: tokensB,
			sharedWithOrigin: sharedAB,
			verdict: verdictB
		};
		out.selection = { tappedLabel, originBefore, originAfter, populated: selectionPopulated };
		out.originAfterSelection = {
			calls: originAfterSelectCalls,
			tokens: tokensOriginPostSelect,
			verdict: verdictRotation
		};
		out.phaseC = {
			term: DEST_TERM_AFTER_SELECT,
			focused: focusedDestC,
			calls: phaseC,
			tokens: tokensC,
			sharedWithOrigin: sharedCOrigin,
			verdict: verdictC
		};
	} finally {
		const dir = path.resolve('evidence', 'network-capture');
		await mkdir(dir, { recursive: true });
		const f = path.join(dir, `mg116-token-scope-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
		await writeFile(f, JSON.stringify(out, null, 2), 'utf8');
		log(`Evidencia -> ${f}`);
		await driver.deleteSession().catch(() => undefined);
	}
}

run().catch((e: Error) => {
	console.error('[token-scope] Error:', e.message ?? e);
	process.exit(1);
});
