/**
 * [TM-650][TM-651][TM-654][TM-655][TM-656][TM-657][TM-662][TM-663][TM-664][TM-665]
 * MG-117 — guards de regresión del buscador de direcciones de App Driver.
 *
 * ORIGEN. Campaña MG-117 del 2026-08-13 (ATR TM-668, 17/17 en test y re-validado en UAT sobre
 * `com.magiis.app.uat.driver` 2.6.15). Los 10 casos de acá quedaron marcados
 * `automation-candidate` al actualizar el ROI de la story: el shift-left original la había
 * declarado MANUAL-APK "outside the v2 web UI automation scope", premisa que la propia campaña
 * invalidó al automatizar los 17 casos sobre dispositivo físico. Los 7 gates del ATP van con
 * prioridad `high`; el resto, `medium`.
 *
 * NO se transcriben puntajes de ROI porque nadie los calculó para MG-117 — a diferencia de MG-116,
 * donde el spec de PAX documenta 8.0 / 6.0 / 5.0 / 4.5. La justificación acá es la evidencia de
 * ejecución de la campaña, no un número inventado.
 *
 * QUÉ CUBRE Y QUÉ NO. Entran los casos deterministas y observables por red. Quedan afuera, con
 * motivo: TM-652 / TM-658 / TM-659 dependen del catálogo del ambiente y se cubren mejor en
 * `magiis-api-e2e`; TM-653 y TM-660 exigen estado de viaje y datos concretos; TM-661 NO es
 * verificable en dispositivo porque el sesgo sale del origen del viaje y no del GPS; TM-666 es la
 * corrida completa de esta batería, no un caso suelto.
 *
 * EL CASO DE ORDEN NO TIENE KEY DE XRAY, a propósito. Su equivalente en PAX es TM-727; en el Driver
 * el caso nunca se diseñó — el defecto se halló explorando. Es el hueco que el review de MG-931
 * dejó anotado ("App Driver: NO EXISTE guard de orden"). No se inventa una clave: cuando se cree el
 * Test en TM, se reemplaza en `DriverAddressCaseBattery.orden()`.
 *
 * POR QUÉ LOS GUARDS MIDEN POR DOS CANALES. El SDK JS de Google Places consulta por inyección de
 * script (JSONP) y NO pasa por `fetch` ni por XHR: un guard que sólo mire esos hooks da VERDE sobre
 * una pantalla que está llamando a Google. El segundo canal es Resource Timing. Medido en la
 * iteración 1 de la campaña, cuando el panel de red mostraba `AutocompletionService.GetPredictionsJson`
 * con type `script`.
 *
 * PRECONDICIONES DE SESIÓN. App Driver logueada (`noReset: true`) y un VIAJE EN CURSO con origen
 * definido: el buscador vive dentro de "Editar viaje". La corrida no crea ni cierra viajes, no toca
 * pagos y devuelve el GPS a su lugar. Si el dispositivo no está en un viaje, los guards se declaran
 * NO EJERCIDOS en vez de dar un falso verde.
 *
 * EJECUCIÓN
 *   ENV=uat APPIUM_SERVER_URL=http://localhost:4723 npx playwright test driver-address-surfaces --workers=1
 *   (el paquete y el udid los resuelve `resolveDriverTarget`, que falla si ENV no es válido)
 */

import { test, expect } from '@playwright/test';
import { remote } from 'webdriverio';
import { resolveDriverTarget } from '../../scripts/_shared/resolveDriverTarget';
import { DriverAddressCaseBattery, type CaseResult } from '../DriverAddressCaseBattery';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

type Driver = WebdriverIO.Browser;

const TARGET = resolveDriverTarget('driver');
/** Campo editable del buscador. El de origen/destino del viaje es readonly y abre el modal. */
const SEARCH_INPUT = 'input';
const EVIDENCE_DIR = path.resolve('evidence', 'driver-address-surfaces');

async function newSession(): Promise<{ driver: Driver; webview: string }> {
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
		} as Record<string, unknown>
	});
	const ctx = (await driver.getContexts()) as string[];
	const webview = ctx.find((cc) => String(cc).startsWith('WEBVIEW')) ?? '';
	if (!webview) {
		await driver.deleteSession().catch(() => undefined);
		throw new Error('Sin contexto WEBVIEW: la app híbrida no expone su DOM.');
	}
	await driver.switchContext(webview);
	await driver.pause(2500);
	return { driver, webview };
}

/**
 * Tap NATIVO sobre el primer elemento visible que matchea el selector (y opcionalmente el texto).
 *
 * En Ionic un `el.click()` de DOM NO dispara el handler del lápiz de edición ni de las filas del
 * buscador. Y las coordenadas se anclan al rect NATIVO del WebView: escalar contra la pantalla
 * completa cae ~70 px abajo por la barra de estado, y el tap termina en la fila siguiente.
 */
async function tapNative(driver: Driver, webview: string, selector: string, needle?: string): Promise<boolean> {
	const rect = (await driver
		.execute(
			(s: string, t: string | null) => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const all = Array.from(document.querySelectorAll(s)).filter(vis);
				const el = (t ? all.find((e) => (e.textContent ?? '').toLowerCase().includes(t)) : all[all.length - 1]) as HTMLElement | undefined;
				if (!el) return null;
				const r = el.getBoundingClientRect();
				if (!r.width || !r.height) return null;
				return { x: r.left + r.width / 2, y: r.top + r.height / 2, vw: window.innerWidth, vh: window.innerHeight };
			},
			selector,
			needle ? needle.toLowerCase() : null
		)
		.catch(() => null)) as { x: number; y: number; vw: number; vh: number } | null;
	if (!rect) return false;

	await driver.switchContext('NATIVE_APP');
	try {
		const wv = (await driver.$('//android.webkit.WebView')) as unknown as {
			getLocation: () => Promise<{ x: number; y: number }>;
			getSize: () => Promise<{ width: number; height: number }>;
		};
		const loc = await wv.getLocation();
		const sz = await wv.getSize();
		const x = Math.round(loc.x + rect.x * (sz.width / rect.vw));
		const y = Math.round(loc.y + rect.y * (sz.height / rect.vh));
		await driver.performActions([
			{
				type: 'pointer',
				id: 'finger1',
				parameters: { pointerType: 'touch' },
				actions: [
					{ type: 'pointerMove', duration: 0, x, y },
					{ type: 'pointerDown', button: 0 },
					{ type: 'pause', duration: 130 },
					{ type: 'pointerUp', button: 0 }
				]
			}
		]);
		await driver.releaseActions().catch(() => undefined);
	} finally {
		await driver.switchContext(webview);
	}
	await driver.pause(1800);
	return true;
}

async function editableFields(driver: Driver): Promise<number> {
	return (await driver.execute((sel: string) => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		return Array.from(document.querySelectorAll(sel)).filter(vis).filter((e) => !(e as HTMLInputElement).readOnly).length;
	}, SEARCH_INPUT)) as number;
}

/**
 * Lleva la app hasta el buscador de dirección: viaje en curso → lápiz → fila de destino.
 * Devuelve `false` si el dispositivo no está en un viaje: el runner lo convierte en skip, no en rojo.
 */
async function reachAddressSearch(driver: Driver, webview: string): Promise<boolean> {
	if ((await editableFields(driver)) === 1) return true;

	const url = ((await driver.execute(() => window.location.href).catch(() => '')) as string) ?? '';
	if (!/TravelInProgress|travel-edit/i.test(url)) return false;

	// El modal "Editar viaje" se abre con el lápiz; el DOM click no lo dispara.
	if (!/travel-edit/i.test(url)) await tapNative(driver, webview, 'div.edit.action-container');
	// La fila de destino es un input readonly que abre el buscador al recibir el foco.
	await tapNative(driver, webview, 'input[placeholder*="estino"], ion-input[placeholder*="estino"]');
	return (await editableFields(driver)) === 1;
}

async function snap(driver: Driver, label: string): Promise<string | null> {
	try {
		await mkdir(EVIDENCE_DIR, { recursive: true });
		const safe = label.replace(/[^a-zA-Z0-9._-]/g, '_');
		const file = path.join(EVIDENCE_DIR, `${safe}.png`);
		await writeFile(file, Buffer.from(await driver.takeScreenshot(), 'base64'));
		return path.relative(process.cwd(), file);
	} catch {
		return null;
	}
}

// ── Corrida única de la batería, resultados compartidos por los guards ─────────
let RESULTS: CaseResult[] = [];
let SETUP_ERROR: string | null = null;
let REACHED = false;

test.describe('[MG-117] Guards del buscador de direcciones — App Driver', () => {
	// Sesión Appium (~15 s) + navegación con taps nativos + 11 casos con settle de 4,2 s cada uno
	// + tres escenarios de inyección de fallos. El default de 60 s no alcanza ni para el setup.
	test.describe.configure({ timeout: 600_000 });
	test.fixme(!process.env.APPIUM_SERVER_URL, 'Requiere un servidor Appium y el dispositivo conectado.');

	// La batería corre UNA vez: un solo recorrido del dispositivo, y cada guard lee su resultado.
	// Alternativa descartada: una sesión por caso, como hace el spec de PAX. Acá son 11 casos y el
	// costo de sesión (~15 s) más la navegación por taps se pagaría once veces.
	test.beforeAll(async () => {
		let driver: Driver | null = null;
		try {
			const s = await newSession();
			driver = s.driver;
			REACHED = await reachAddressSearch(s.driver, s.webview);
			if (!REACHED) {
				SETUP_ERROR = 'No se alcanzó el buscador de dirección: el dispositivo no está en un viaje en curso con origen definido.';
				return;
			}
			const battery = new DriverAddressCaseBattery(s.driver, SEARCH_INPUT);
			RESULTS = await battery.runAll(async (r) => {
				// La captura se toma ACÁ, con la pantalla todavía en el estado que produjo el
				// veredicto. Si se tomaran al final, las 11 imágenes serían el mismo frame.
				await snap(s.driver, `${r.key}-${r.status}`);
			});
		} catch (e) {
			SETUP_ERROR = (e as Error).message ?? String(e);
		} finally {
			await driver?.deleteSession().catch(() => undefined);
		}
	});

	/** Busca el resultado de un caso y lo convierte en aserción de Playwright. */
	function guard(key: string, descripcion: string): void {
		test(`[${key}] ${descripcion}`, async () => {
			test.skip(Boolean(SETUP_ERROR), SETUP_ERROR ?? '');
			const r = RESULTS.find((x) => x.key === key);
			test.skip(!r, `La batería no produjo resultado para ${key}.`);

			const detalle = `${r!.verdict}${r!.measured ? `\n  medido: ${JSON.stringify(r!.measured)}` : ''}`;
			// SIN_DATOS y NO_EJERCIDO son skip, no verde: un caso que no se pudo ejercer no está bien.
			test.skip(r!.status === 'SIN_DATOS' || r!.status === 'NO_EJERCIDO', `${r!.status}: ${detalle}`);
			expect(r!.status, detalle).toBe('PASS');
		});
	}

	// Precondición: si hay más de un buscador abierto, la batería aborta y todo queda en skip.
	test('[PRECONDICION] Un solo buscador abierto', async () => {
		test.skip(Boolean(SETUP_ERROR), SETUP_ERROR ?? '');
		const abort = RESULTS.find((r) => r.key === 'PRECONDICION');
		expect(abort, abort ? abort.verdict : 'sin abort').toBeUndefined();
	});

	// ── Gates del ATP (prioridad high) ──
	guard('TM-650', 'TC1 · consulta el endpoint propio y cero tráfico nuevo a Google (dos canales)');
	guard('TM-651', 'TC2 · el request lleva address y coordenadas, y no lleva radius ni language');
	guard('TM-654', 'TC5 · el tecleo continuo colapsa en una sola llamada ~300 ms tras la última tecla');
	guard('TM-656', 'TC7 · con 2 caracteres no consulta');
	guard('TM-657', 'TC8 · con 3 caracteres sí consulta');
	guard('TM-662', 'TC13 · todas las llamadas de la sesión comparten sessionToken');
	guard('TM-665', 'TC16 · ante 5xx o error de red degrada controlado y no cae a Google');

	// ── Resto de la batería (prioridad medium) ──
	guard('TM-655', 'TC6 · un término repetido no dispara una nueva llamada');
	guard('TM-663', 'TC14 · tras seleccionar, la búsqueda siguiente usa un sessionToken nuevo');
	guard('TM-664', 'TC15 · un término sin resultados muestra un estado vacío controlado');

	// ── Hueco de cobertura del Driver, sin Test en Xray todavía ──
	guard('ORDEN(sin-key)', 'las direcciones cercanas de caché van por delante de aeropuertos lejanos');

	test.afterAll(() => {
		if (SETUP_ERROR) {
			console.log(`\n[driver-address-surfaces] setup no completado: ${SETUP_ERROR}`);
			return;
		}
		console.log('\n[driver-address-surfaces] resumen de la batería:');
		for (const r of RESULTS) console.log(`  ${r.key.padEnd(16)} ${r.status.padEnd(11)} ${r.verdict}`);
		console.log(`  evidencia: ${path.relative(process.cwd(), EVIDENCE_DIR)}`);
	});
});
