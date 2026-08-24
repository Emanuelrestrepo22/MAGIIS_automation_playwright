/**
 * [TM-729][TM-730][TM-731][TM-727] MG-116 — guards de regresión de los campos de dirección de App PAX.
 *
 * ORIGEN. Campaña UAT del 2026-08-18 (ATR TM-728). Cuatro hallazgos con ROI Candidate:
 *
 *   TM-729  Perfil › Mis Direcciones consulta a GOOGLE DIRECTO (0 al endpoint propio).
 *           Confirmado en UAT y test sobre v2.5.19 ⇒ defecto del build. ROI 8.0.
 *   TM-730  Editar viaje programado consulta el endpoint propio (304 ms). Es el CONTROL
 *           de TM-729: mismo término, mismo dispositivo. ROI 6.0.
 *   TM-731  Recargar la WebView en travel-info mata la app (URL de ~4.000 caracteres con el
 *           simulateTravel serializado). 3 de 3 en UAT, incluso con ruta realista. ROI 5.0.
 *   TM-727  Los aeropuertos lejanos se rankean por delante de las direcciones locales.
 *           Reproducido en 5 entornos ⇒ backend. No bloqueante. ROI 4.5.
 *
 * POR QUÉ EL GUARD DE TM-729 MIDE POR DOS CANALES — y no es opcional. El SDK JS de Places
 * (`google.maps.places.AutocompletemService`... el nombre real es AutocompleteService) NO pasa por
 * `fetch` ni por XHR: usa transporte propio. Un guard que sólo mire fetch/XHR da VERDE sobre la
 * pantalla defectuosa — exactamente el falso negativo que dejó pasar el defecto en la validación
 * original. El segundo canal es Resource Timing (`performance.getEntriesByType('resource')`).
 *
 * PRECONDICIONES DE SESIÓN. App PAX logueada en el dispositivo (`noReset: true`); las corridas no
 * crean viajes, no guardan direcciones y no tocan la wallet. TM-731 recarga la WebView a propósito
 * y la app queda en el home tras el relaunch del propio test.
 *
 * EJECUCIÓN
 *   ENV=uat  APPIUM_SERVER_URL=http://localhost:4723  npx playwright test pax-address-surfaces
 *   (ANDROID_PASSENGER_UDID desde .env.uat / .env.test — resuelto por resolveDriverTarget)
 */

import { test, expect } from '@playwright/test';
import { remote } from 'webdriverio';
import { resolveDriverTarget } from '../../scripts/_shared/resolveDriverTarget';

const TARGET = resolveDriverTarget('passenger');
const SETTLE_MS = 5200;
const TERM = 'ciudad de la paz 2238';

/** Sello de tipeo + contadores de los DOS canales, instalados dentro de la página. */
const INSTALL_PROBES = `
	(function () {
		var w = window;
		if (w.__mgProbed) { w.__mgOwn = []; return; }
		w.__mgProbed = true;
		w.__mgOwn = [];
		var push = function (u) {
			if (String(u).indexOf('places/autocomplete') !== -1) {
				w.__mgOwn.push({ url: String(u), atEpochMs: Date.now() });
			}
		};
		var of = w.fetch;
		w.fetch = function () { try { push(arguments[0]); } catch (e) {} return of.apply(this, arguments); };
		var oo = XMLHttpRequest.prototype.open;
		XMLHttpRequest.prototype.open = function (m, u) { try { push(u); } catch (e) {} return oo.apply(this, arguments); };
	})();
`;

type Driver = Awaited<ReturnType<typeof remote>>;

async function newSession(forceLaunch = false): Promise<{ driver: Driver; webview: string }> {
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
			'appium:forceAppLaunch': forceLaunch,
			'appium:newCommandTimeout': 300
		} as Record<string, unknown>
	});
	const ctx = (await driver.getContexts()) as string[];
	const webview = ctx.find(c => String(c).startsWith('WEBVIEW')) ?? '';
	if (!webview) {
		await driver.deleteSession().catch(() => undefined);
		throw new Error('Sin contexto WEBVIEW: la app hibrida no expone su DOM.');
	}
	await driver.switchContext(webview);
	await driver.pause(2500);
	return { driver, webview };
}

async function typeInto(driver: Driver, selector: string, value: string): Promise<boolean> {
	return (await driver.execute(
		(s: string, v: string) => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const t = Array.from(document.querySelectorAll(s)).filter(vis)[0] as HTMLInputElement | undefined;
			if (!t || t.disabled) return false;
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
			setter?.call(t, v);
			t.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
			t.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
			return true;
		},
		selector,
		value
	)) as boolean;
}

async function ownCalls(driver: Driver): Promise<number> {
	return (await driver.execute(() => ((window as unknown as { __mgOwn?: unknown[] }).__mgOwn ?? []).length)) as number;
}

async function googleResources(driver: Driver): Promise<number> {
	return (await driver.execute(() => {
		return performance.getEntriesByType('resource').filter(e => /maps\.googleapis\.com|places\.googleapis\.com/i.test(e.name)).length;
	})) as number;
}

async function tapNativeByCss(driver: Driver, webview: string, selector: string, needle: string): Promise<boolean> {
	const rect = (await driver
		.execute(
			(s: string, t: string) => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const el = Array.from(document.querySelectorAll(s))
					.filter(vis)
					.find(e => (e.textContent ?? '').toLowerCase().includes(t)) as HTMLElement | undefined;
				if (!el) return null;
				const r = el.getBoundingClientRect();
				if (!r.width || !r.height) return null;
				return { x: r.left + r.width / 2, y: r.top + r.height / 2, vw: window.innerWidth, vh: window.innerHeight };
			},
			selector,
			needle.toLowerCase()
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
	await driver.pause(3000);
	return true;
}

test.describe('[MG-116] Guards de los campos de dirección — App PAX', () => {
	// Timeout: sesion Appium (~15 s) + taps nativos + settle de 5 s + reload de 8 s + relaunch
	// en el teardown — el default de 60 s mataba el test antes del finally.
	//
	// SIN `mode: 'serial'` a proposito: serial CANCELA los tests restantes cuando uno falla, y
	// esta suite tiene guards que estan EN ROJO por defectos vivos (TM-729). Un rojo esperado no
	// debe impedir que los demas guards se ejerzan. La exclusion mutua del dispositivo la da
	// `--workers=1` en el runner.
	test.describe.configure({ timeout: 240_000 });
	test.fixme(!process.env.APPIUM_SERVER_URL, 'Requiere un servidor Appium y el dispositivo conectado.');

	test('[TM-730][CONTROL] Editar viaje programado consulta el endpoint propio y no a Google', { annotation: [{ type: 'tms', description: 'TM-730' }], tag: ['@regression', '@mg116'] }, async () => {
		const { driver, webview } = await newSession();
		try {
			// Llegar: Actividad -> primer viaje programado -> Editar. Si el entorno no tiene un
			// viaje programado, el guard se declara no ejercido en vez de dar un falso verde.
			await tapNativeByCss(driver, webview, 'ion-tab-button, ion-label', 'actividad');
			const opened = (await tapNativeByCss(driver, webview, 'ion-item, ion-col, div', 'programad')) && (await tapNativeByCss(driver, webview, 'button, ion-button, ion-item', 'editar'));
			const url = (await driver.execute(() => window.location.href)) as string;
			test.skip(!opened || !/travel-edit/i.test(url), 'Sin viaje programado alcanzable en este entorno: guard no ejercido.');

			await driver.execute(INSTALL_PROBES);
			const rtBefore = await googleResources(driver);
			const typed = await typeInto(driver, 'input[placeholder="Agregar otro destino "]', TERM);
			expect(typed, 'el campo "Agregar otro destino" debe aceptar texto').toBe(true);
			await driver.pause(SETTLE_MS);

			const own = await ownCalls(driver);
			const rtNew = (await googleResources(driver)) - rtBefore;
			expect(own, 'debe consultar places/autocomplete').toBeGreaterThan(0);
			expect(rtNew, 'cero recursos de Google durante el tipeo (Resource Timing)').toBe(0);
		} finally {
			await driver.deleteSession().catch(() => undefined);
		}
	});

	test('[TM-729] Perfil › Mis Direcciones consulta el endpoint propio y no a Google', { annotation: [{ type: 'tms', description: 'TM-729' }], tag: ['@regression', '@mg116'] }, async () => {
		const { driver, webview } = await newSession();
		try {
			// Mi cuenta -> Mis Direcciones. En test el campo llega habilitado; en UAT exige Tipo.
			await tapNativeByCss(driver, webview, 'ion-tab-button, ion-label', 'mi cuenta');
			await tapNativeByCss(driver, webview, 'ion-item, ion-label, button', 'direccion');
			const url = (await driver.execute(() => window.location.href)) as string;
			test.skip(!/AddressesPage/i.test(url), 'No se alcanzo /AddressesPage: guard no ejercido.');

			// Habilitar el campo si el formulario lo exige (UAT): elegir el primer Tipo ofrecido.
			await tapNativeByCss(driver, webview, 'ion-select, ion-item', 'tipo');
			await driver
				.execute(() => {
					const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
					const opt = Array.from(document.querySelectorAll('ion-select-popover ion-item, ion-popover ion-item, ion-radio')).filter(vis)[0] as HTMLElement | undefined;
					opt?.click();
				})
				.catch(() => undefined);
			await driver.pause(1500);

			await driver.execute(INSTALL_PROBES);
			const rtBefore = await googleResources(driver);
			const typed = await typeInto(driver, 'app-addresses input[name="input-from"]', TERM);
			expect(typed, 'el campo Direccion debe aceptar texto (en UAT exige elegir Tipo primero)').toBe(true);
			await driver.pause(SETTLE_MS);

			const own = await ownCalls(driver);
			const rtNew = (await googleResources(driver)) - rtBefore;

			// El doble canal ES el guard: rtNew > 0 significa Google directo aunque fetch/XHR este limpio.
			expect(rtNew, 'FALLA CONOCIDA (TM-729): esta pantalla consulta a Google directo').toBe(0);
			expect(own, 'debe consultar places/autocomplete').toBeGreaterThan(0);
		} finally {
			await driver.deleteSession().catch(() => undefined);
		}
	});

	test('[TM-727] Las direcciones locales de cache se rankean por encima de aeropuertos lejanos', { annotation: [{ type: 'tms', description: 'TM-727' }], tag: ['@regression', '@mg116'] }, async () => {
		const { driver } = await newSession();
		try {
			const url = (await driver.execute(() => window.location.href)) as string;
			test.skip(!/HomePage/i.test(url), 'La app no esta en el home: guard no ejercido.');

			// Capturar el CUERPO de la respuesta por fetch y XHR (el request puede salir por cualquiera).
			await driver.execute(`
				(function () {
					var w = window; w.__mgBodies = [];
					var of = w.fetch;
					w.fetch = function () {
						var u = String(arguments[0]);
						var p = of.apply(this, arguments);
						if (u.indexOf('places/autocomplete') !== -1) {
							p.then(function (r) { try { r.clone().text().then(function (t) { w.__mgBodies.push(t); }); } catch (e) {} });
						}
						return p;
					};
					var oo = XMLHttpRequest.prototype.open;
					XMLHttpRequest.prototype.open = function (m, u) {
						if (String(u).indexOf('places/autocomplete') !== -1) {
							this.addEventListener('load', function () { try { w.__mgBodies.push(this.responseText); } catch (e) {} });
						}
						return oo.apply(this, arguments);
					};
				})();
			`);

			const field = ['input[placeholder="Agregar otro destino "]', 'input[placeholder="Destino "]'];
			let typed = false;
			for (const sel of field) {
				typed = await typeInto(driver, sel, 'corr');
				if (typed) break;
			}
			test.skip(!typed, 'Ningun campo de direccion editable en el home: guard no ejercido.');
			await driver.pause(SETTLE_MS);

			const rows = (await driver.execute(() => {
				const w = window as unknown as { __mgBodies?: string[] };
				for (const b of w.__mgBodies ?? []) {
					try {
						const j = JSON.parse(b);
						if (Array.isArray(j) && j.length) return j as { source?: string; mainText?: string }[];
					} catch {
						/* cuerpo no-JSON: se ignora */
					}
				}
				return [];
			})) as { source?: string; mainText?: string }[];

			test.skip(rows.length === 0, 'La respuesta no trajo filas para evaluar el orden: guard no ejercido.');
			const firstAirport = rows.findIndex(r => r.source === 'AIRPORT');
			const firstCache = rows.findIndex(r => r.source === 'CACHE');
			if (firstAirport === -1) return; // sin aeropuertos no hay precedencia que evaluar
			expect(firstCache !== -1 && firstCache < firstAirport, `FALLA CONOCIDA (TM-727): fila 0 = ${rows[0]?.source} "${rows[0]?.mainText}" — un aeropuerto lejano por delante de las direcciones locales`).toBe(true);
		} finally {
			await driver.deleteSession().catch(() => undefined);
		}
	});

	test('[TM-731] travel-info sobrevive a una recarga de la WebView', { annotation: [{ type: 'tms', description: 'TM-731' }], tag: ['@regression', '@mg116'] }, async () => {
		const { driver, webview } = await newSession(true);
		try {
			// Llegar a travel-info por el atajo. Si este entorno no navega (pasa en test), el caso
			// queda NO EJERCIDO — nunca "no reproduce".
			await tapNativeByCss(driver, webview, 'button.shortcut-btn, button', 'llevame a casa');
			await driver.pause(4000);
			const url = (await driver.execute(() => window.location.href)) as string;
			test.skip(!/travel-info/i.test(url), 'No se alcanzo travel-info en este entorno: guard no ejercido.');

			// La causa medida: el estado del viaje serializado en la URL (~4.000 caracteres).
			expect(url.length, 'la URL de travel-info sigue cargando el estado serializado').toBeGreaterThan(2000);

			await driver.execute(() => window.location.reload()).catch(() => undefined);
			await driver.pause(8000);

			const after = (await driver.execute(() => ({ title: document.title, text: (document.body.innerText ?? '').slice(0, 200) })).catch(() => null)) as { title: string; text: string } | null;

			const dead = !after || /no disponible|ERR_HTTP_RESPONSE_CODE_FAILURE/i.test(`${after.title} ${after.text}`);
			expect(dead, 'FALLA CONOCIDA (TM-731): recargar en travel-info deja la app en la pagina de error de Chrome').toBe(false);
		} finally {
			// La app pudo quedar en la pagina de error: se relanza para dejar el dispositivo usable.
			await driver.switchContext('NATIVE_APP').catch(() => undefined);
			await driver.terminateApp(TARGET.appPackage).catch(() => undefined);
			await driver.activateApp(TARGET.appPackage).catch(() => undefined);
			await driver.deleteSession().catch(() => undefined);
		}
	});
});
