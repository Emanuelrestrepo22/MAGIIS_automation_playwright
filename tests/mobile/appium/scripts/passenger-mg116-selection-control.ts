/**
 * MG-116 — CONTROL de la seleccion. Aisla harness de producto.
 *
 * POR QUE EXISTE. `passenger-mg116-selection.ts` tapeo una fila AIRPORT con `placeId` nulo y observo:
 * tap reportado OK, CERO llamadas de resolucion, y el campo Origen sin poblar. Eso admite DOS
 * lecturas incompatibles:
 *
 *   (a) DEFECTO DE PRODUCTO — seleccionar un aeropuerto con `placeId` nulo falla en silencio,
 *       que es exactamente el riesgo que TM-684 (TC11) existe para cazar.
 *   (b) LIMITACION DEL HARNESS — un `.click()` programatico sobre `ion-item.prediction-item` no
 *       dispara el handler de Ionic, y entonces la seleccion nunca ocurrio en absoluto.
 *
 * Reportar (a) sin descartar (b) seria un defecto falso sobre MG-116. Este control decide:
 * selecciona, con el MISMO metodo, una fila CACHE que SI trae `placeId`.
 *
 *   · Si la fila con placeId SI puebla el campo -> el metodo de tap funciona -> el fallo de la fila
 *     con placeId nulo es PRODUCTO. TM-684 falla de verdad.
 *   · Si la fila con placeId TAMPOCO puebla -> el metodo de tap no sirve -> TM-684 y TM-687 quedan
 *     INDETERMINADOS y hay que tapear por coordenadas nativas ancladas al rect del WebView.
 *
 * Uso: mismo runner que los otros dos scripts de MG-116.
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

const log = (m: string): void => console.log(`[mg116-ctl] ${m}`);

type Entry = { url: string; status?: number; responseBody?: string };

async function openField(driver: WebdriverIO.Browser, prefix: string): Promise<void> {
	await driver.execute((p: string) => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const t = Array.from(document.querySelectorAll('input'))
			.filter(visible)
			.find(el =>
				((el as HTMLInputElement).placeholder ?? '').trim().toLowerCase().startsWith(p.toLowerCase())
			) as HTMLInputElement | undefined;
		if (!t) return;
		t.focus();
		t.dispatchEvent(new Event('ionFocus', { bubbles: true, composed: true } as EventInit));
		t.click();
	}, prefix);
	await driver.pause(1800);
}

async function setValue(driver: WebdriverIO.Browser, v: string): Promise<void> {
	await driver.execute((val: string) => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const t = Array.from(document.querySelectorAll('input'))
			.filter(visible)
			.find(el => !(el as HTMLInputElement).readOnly) as HTMLInputElement | undefined;
		if (!t) return;
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
		setter?.call(t, val);
		t.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
		t.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
	}, v);
}

async function fieldValues(driver: WebdriverIO.Browser): Promise<{ placeholder: string; value: string }[]> {
	return (await driver.execute(() => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		return (Array.from(document.querySelectorAll('input')).filter(visible) as HTMLInputElement[]).map(i => ({
			placeholder: i.placeholder,
			value: i.value
		}));
	})) as { placeholder: string; value: string }[];
}

/** Tapea por texto. Devuelve tambien si el nodo existia, para no confundir "no estaba" con "no reacciono". */
async function tapByText(driver: WebdriverIO.Browser, needle: string): Promise<{ found: boolean }> {
	const res = (await driver.execute((n: string) => {
		const visible = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const items = Array.from(document.querySelectorAll('ion-item.prediction-item')).filter(visible);
		const target = items.find(i => (i.textContent ?? '').toLowerCase().includes(n.toLowerCase()));
		if (!target) return { found: false };
		(target as HTMLElement).click();
		return { found: true };
	}, needle)) as { found: boolean };
	await driver.pause(2500);
	return res;
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
			'appium:newCommandTimeout': 240,
			'appium:chromedriverAutodownload': true
		} as Record<string, unknown>
	});

	try {
		const contexts = (await driver.getContexts()) as string[];
		const wv = contexts.find(c => String(c).startsWith('WEBVIEW'));
		if (!wv) {
			log('ABORTA: sin contexto WEBVIEW.');
			return;
		}
		await driver.switchContext(wv);
		await installWebViewNetworkCapture(driver);
		await openField(driver, FIELD_PREFIX);

		// Termino que devuelve una fila CACHE con placeId presente (control positivo).
		await setValue(driver, '');
		await driver.pause(600);
		await clearWebViewNetworkCapture(driver);
		await setValue(driver, 'corrientes');
		await driver.pause(SETTLE_MS);

		const cap = await readWebViewNetworkCapture(driver);
		const calls = (cap.entries as Entry[]).filter(e => String(e.url).includes('places/autocomplete'));
		const rows = calls.flatMap(c => {
			try {
				const p = JSON.parse(c.responseBody ?? '[]');
				return Array.isArray(p) ? p : [];
			} catch {
				return [];
			}
		}) as { mainText?: string; placeId: string | null; source?: string }[];

		const withPlaceId = rows.find(r => r.placeId !== null && r.placeId !== undefined);
		if (!withPlaceId?.mainText) {
			log('ABORTA: ninguna fila con placeId presente para usar como control.');
			return;
		}
		log(`Control positivo -> "${withPlaceId.mainText}" (source=${withPlaceId.source}, placeId presente)`);

		const before = await fieldValues(driver);
		const originBefore = before.find(f => f.placeholder.trim().startsWith(FIELD_PREFIX))?.value ?? '';
		log(`   Origen antes del tap: "${originBefore}"`);

		await clearWebViewNetworkCapture(driver);
		const tap = await tapByText(driver, withPlaceId.mainText);
		const after = await fieldValues(driver);
		const originAfter = after.find(f => f.placeholder.trim().startsWith(FIELD_PREFIX))?.value ?? '';
		const post = await readWebViewNetworkCapture(driver);
		const resolution = (post.entries as Entry[]).filter(e => !String(e.url).includes('places/autocomplete'));

		log(`   nodo encontrado: ${tap.found}`);
		log(`   Origen despues del tap: "${originAfter}"`);
		log(`   llamadas de resolucion: ${resolution.length}`);
		for (const r of resolution.slice(0, 5)) log(`     · ${String(r.url).split('?')[0]} -> ${r.status ?? '?'}`);

		const populated = originAfter !== originBefore && originAfter.length > originBefore.length;

		log('\n=========== VEREDICTO DEL CONTROL ===========');
		if (populated || resolution.length > 0) {
			log('El metodo de tap FUNCIONA sobre una fila con placeId.');
			log('=> El fallo de la fila AIRPORT con placeId nulo es PRODUCTO: TM-684 (TC11) FALLA de verdad,');
			log('   y TM-687 (TC14) es evaluable porque la seleccion si ocurre cuando el placeId esta.');
		} else {
			log('El metodo de tap NO puebla el campo ni siquiera con placeId presente.');
			log('=> Es LIMITACION DEL HARNESS. TM-684 y TM-687 quedan INDETERMINADOS.');
			log('   Siguiente paso: tap NATIVO por coordenadas ancladas al rect del WebView');
			log('   (driver.$("//android.webkit.WebView") -> getLocation()+getSize(), mapear css/vw).');
		}

		const outDir = path.resolve('evidence', 'network-capture');
		await mkdir(outDir, { recursive: true });
		const stamp = new Date().toISOString().replace(/[:.]/g, '-');
		const file = path.join(outDir, `mg116-pax-selection-control-${stamp}.json`);
		await writeFile(
			file,
			JSON.stringify(
				{
					ticket: 'MG-116',
					purpose: 'aislar harness vs producto en la seleccion de predicciones',
					control: withPlaceId,
					tapFoundNode: tap.found,
					originBefore,
					originAfter,
					populated,
					resolutionCalls: resolution.map(r => ({ url: String(r.url).split('?')[0], status: r.status })),
					verdict: populated || resolution.length > 0 ? 'tap-works-product-defect' : 'harness-limitation'
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

run().catch((e: Error) => {
	console.error('[mg116-ctl] Error:', e.message ?? e);
	process.exit(1);
});
