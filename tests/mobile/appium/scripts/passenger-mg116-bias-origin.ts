/**
 * MG-116 / F4 — De donde saca la app las coordenadas del SESGO.
 *
 * Hipotesis a contrastar: el sesgo NO viene de la geolocalizacion del dispositivo sino de la
 * ubicacion configurada del CARRIER al que esta vinculado el pasajero.
 *
 * Evidencia previa (2026-08-14, carrier 1521 / USA):
 *   - dispositivo (mock activo):  -34.600100 / -58.372100   -> Buenos Aires
 *   - la app enviaba:              25.924069 / -80.12166     -> area de Miami
 *   No coincidian, asi que la app no lee la posicion del dispositivo.
 *
 * Esta corrida se ejecuta con el MISMO usuario vinculado ahora a un carrier ARGENTINO.
 *   - Si las coordenadas cambian a un punto argentino -> HIPOTESIS CONFIRMADA: el sesgo es por carrier.
 *   - Si siguen siendo las de Miami                   -> es un valor fijo, no depende del carrier.
 *   - Si pasan a coincidir con el dispositivo         -> el sesgo si lee el dispositivo y el caso
 *                                                        anterior tenia otra causa.
 *
 * Imprime la URL COMPLETA del request, que es el dato que el MCP de Appium no puede capturar.
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
const TERM = process.env.TERM_TO_TYPE ?? 'ezeiza';
const log = (m: string): void => console.log(`[bias] ${m}`);

type Entry = { url: string; status?: number; responseBody?: string };

function param(url: string, name: string): string {
	const m = new RegExp(`[?&]${name}=([^&]*)`).exec(url);
	return m ? decodeURIComponent(m[1]) : '';
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

	const out: Record<string, unknown> = { ticket: 'MG-116', finding: 'F4', term: TERM };
	try {
		const ctx = (await driver.getContexts()) as string[];
		const wv = ctx.find(c => String(c).startsWith('WEBVIEW'));
		if (!wv) {
			log('ABORTA: sin contexto WEBVIEW');
			return;
		}
		await driver.switchContext(wv);

		const url = (await driver.execute(() => window.location.href)) as string;
		log(`URL de la app: ${url}`);
		if (/\/login/i.test(url)) {
			log('ABORTA: la app esta en el login. Iniciar sesion y reintentar.');
			return;
		}

		// Perfil visible en el home: dice si es Modo Personal o Compania <nombre>.
		const profile = (await driver.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const el = Array.from(document.querySelectorAll('span, ion-label, p, div'))
				.filter(vis)
				.map(e => (e.textContent ?? '').trim())
				.find(t => /modo personal|compa/i.test(t) && t.length < 60);
			return el ?? '(no encontrado)';
		})) as string;
		log(`Perfil en el home: "${profile}"`);
		out.profileLabel = profile;

		// Lo que el WebView cree que es la posicion del dispositivo.
		const geo = (await driver.execute(`
			return (function () {
				return new Promise(function (resolve) {
					if (!navigator.geolocation) { resolve({ error: 'sin navigator.geolocation' }); return; }
					var done = false;
					var t = setTimeout(function () { if (!done) { done = true; resolve({ error: 'timeout 8s' }); } }, 8000);
					navigator.geolocation.getCurrentPosition(
						function (p) { if (done) return; done = true; clearTimeout(t);
							resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); },
						function (e) { if (done) return; done = true; clearTimeout(t);
							resolve({ error: 'code ' + e.code + ': ' + e.message }); },
						{ enableHighAccuracy: true, timeout: 7000, maximumAge: 0 }
					);
				});
			})();`)) as { lat?: number; lng?: number; acc?: number; error?: string };
		log(`navigator.geolocation del WebView: ${JSON.stringify(geo)}`);
		out.webviewGeolocation = geo;

		await installWebViewNetworkCapture(driver);

		// Enfocar Origen por placeholder y escribir el termino.
		await driver.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const t = Array.from(document.querySelectorAll('input'))
				.filter(vis)
				.find(el => ((el as HTMLInputElement).placeholder ?? '').trim().startsWith('Origen')) as
				| HTMLInputElement
				| undefined;
			if (!t) return;
			t.focus();
			t.dispatchEvent(new Event('ionFocus', { bubbles: true, composed: true } as EventInit));
			t.click();
		});
		await driver.pause(1600);
		await clearWebViewNetworkCapture(driver);

		await driver.execute((val: string) => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const t = Array.from(document.querySelectorAll('input'))
				.filter(vis)
				.find(el => ((el as HTMLInputElement).placeholder ?? '').trim().startsWith('Origen')) as
				| HTMLInputElement
				| undefined;
			if (!t) return;
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
			setter?.call(t, val);
			t.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
			t.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
		}, TERM);
		await driver.pause(4000);

		const cap = await readWebViewNetworkCapture(driver);
		const calls = (cap.entries as Entry[]).filter(e => String(e.url).includes('places/autocomplete'));
		log(`\nrequests de autocomplete capturados: ${calls.length}`);

		const observed = calls.map(c => {
			const full = String(c.url);
			return {
				url: full,
				address: param(full, 'address'),
				latitude: param(full, 'latitude'),
				longitude: param(full, 'longitude'),
				sessionToken: param(full, 'sessionToken'),
				status: c.status
			};
		});
		out.requests = observed;

		for (const o of observed) {
			log(`\n  URL COMPLETA:\n    ${o.url}`);
			log(`    latitude  = ${o.latitude}`);
			log(`    longitude = ${o.longitude}`);
		}

		// Veredicto sobre la hipotesis.
		const first = observed[0];
		if (!first) {
			log('\nSIN DATOS: no se capturo ningun request. La hipotesis no se puede evaluar.');
			out.verdict = 'sin datos';
		} else {
			const lat = Number(first.latitude);
			const lng = Number(first.longitude);
			const isMiami = Math.abs(lat - 25.924069) < 0.5 && Math.abs(lng + 80.12166) < 0.5;
			const isArg = lat < -20 && lat > -56 && lng < -53 && lng > -74;

			/**
			 * Distancia real en km (haversine), NO comparacion de grados.
			 *
			 * La primera version usaba `Math.abs(delta) < 0.2` grados, que a esta latitud son ~20 km:
			 * confundia "misma ciudad" con "mismo punto" y dio un falso positivo de matchesDevice
			 * cuando el punto enviado estaba a 6 km del dispositivo. El umbral ahora es de 1 km, que
			 * es el orden de magnitud del error de un GPS urbano, y se reporta la distancia medida
			 * para que el veredicto sea auditable en vez de binario.
			 */
			const distanceKm = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
				const R = 6371;
				const toRad = (d: number): number => (d * Math.PI) / 180;
				const dLat = toRad(bLat - aLat);
				const dLng = toRad(bLng - aLng);
				const h =
					Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
				return 2 * R * Math.asin(Math.sqrt(h));
			};

			const distToDeviceKm =
				typeof geo.lat === 'number' && typeof geo.lng === 'number'
					? distanceKm(lat, lng, geo.lat, geo.lng)
					: null;
			const matchesDevice = distToDeviceKm !== null && distToDeviceKm < 1;
			if (distToDeviceKm !== null) {
				log(`\n  distancia al punto que reporta el dispositivo: ${distToDeviceKm.toFixed(2)} km`);
			}

			let verdict: string;
			if (matchesDevice) {
				verdict =
					`EL SESGO LEE EL DISPOSITIVO — el punto enviado esta a ${distToDeviceKm?.toFixed(2)} km de ` +
					'navigator.geolocation, dentro del error esperable de un GPS urbano.';
			} else if (isArg) {
				verdict =
					`HIPOTESIS CONFIRMADA — punto ARGENTINO pero a ${distToDeviceKm?.toFixed(2)} km del dispositivo, ` +
					'asi que NO es su posicion. Combinado con que las coordenadas cambiaron al cambiar de carrier, ' +
					'el sesgo viene de la configuracion del CARRIER y no del dispositivo.';
			} else if (isMiami) {
				verdict =
					'VALOR FIJO — siguen siendo las coordenadas de Miami pese al cambio de carrier. No depende del ' +
					'carrier: es un valor constante (hardcode o config global).';
			} else {
				verdict = `COORDENADAS INESPERADAS (${lat}, ${lng}) — ni Miami, ni el dispositivo, ni rango argentino. Investigar el origen.`;
			}
			log(`\n${'='.repeat(60)}\nVEREDICTO: ${verdict}\n${'='.repeat(60)}`);
			out.verdict = verdict;
			out.comparison = { sentLat: lat, sentLng: lng, deviceGeo: geo, matchesDevice, isArgentina: isArg, isMiami };
		}

		const dir = path.resolve('evidence', 'network-capture');
		await mkdir(dir, { recursive: true });
		const f = path.join(dir, `mg116-bias-origin-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
		await writeFile(f, JSON.stringify(out, null, 2), 'utf8');
		log(`\nEvidencia -> ${f}`);
	} finally {
		await driver.deleteSession();
	}
}

run().catch((e: Error) => {
	console.error('[bias] Error:', e.message ?? e);
	process.exit(1);
});
