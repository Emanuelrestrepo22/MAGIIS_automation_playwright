/**
 * MG-116 — cuarta celda de la matriz: Android con el pasajero vinculado al carrier ARGENTINO.
 *
 * QUE CIERRA. Ya estan medidas tres celdas: iOS+carrier US, iOS+carrier AR, y Android+carrier US.
 * Si Android+AR envia el MISMO sesgo que iOS+AR, el mecanismo es identico en las dos plataformas y
 * el hallazgo se cierra como UN defecto de diseño y no como dos defectos de plataforma.
 *
 * QUE MIDE, y por que estas dos cosas juntas:
 *   1. El SESGO que sale en el request desde el campo del home. Se compara con -34.5614108 /
 *      -58.4590128, que es el CARRIERPLACE del carrier 1040 UNITY (Ciudad de la Paz 2238) leido de
 *      la base. Coincidencia digito por digito = misma cadena causal que en iOS.
 *   2. El PISO DE CARACTERES en Perfil > Mis Direcciones, escribiendo `eze` y despues `ezei`. Ese
 *      defecto (TM-734) es INDEPENDIENTE del sesgo: cambiar de carrier no deberia moverlo. Medirlo
 *      en la misma corrida evita que el ruido de la discusion del sesgo lo tape.
 *
 * Solo escribe en campos y mide. No guarda direcciones, no crea viajes, no toca la wallet.
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveDriverTarget } from './_shared/resolveDriverTarget';

const TARGET = resolveDriverTarget('passenger');
/** El CARRIERPLACE del carrier 1040 UNITY, leido de la base de UAT. */
const CARRIER_AR = { lat: '-34.5614108', lon: '-58.4590128', label: 'Ciudad de la Paz 2238 (carrier 1040 UNITY)' };
/** El del carrier 1481 UNITY US, para reconocerlo si el cambio no tomo efecto. */
const CARRIER_US = { lat: '25.9300485', lon: '-80.1262026', label: 'Sunny Isles Beach (carrier 1481 UNITY US)' };
const SETTLE_MS = 5600;
/**
 * Posicion REAL del usuario, para reconocer el caso de EXITO.
 *
 * El fix del sesgo se valida asi: vinculado al carrier de EE.UU. y parado en CABA, el sesgo enviado
 * tiene que ser la ubicacion del DISPOSITIVO y no la del carrier. Sin este dato el script solo sabe
 * decir "no es ninguno de los carriers conocidos", que no distingue un fix de un valor roto.
 */
const USER_POS = {
	lat: Number(process.env.MG116_USER_LAT ?? '-34.6009'),
	lon: Number(process.env.MG116_USER_LON ?? '-58.3731'),
	label: process.env.MG116_USER_LABEL ?? 'Reconquista 661, CABA'
};
/** Tolerancia para considerar que el sesgo ES la posicion del usuario. */
const USER_TOLERANCE_KM = Number(process.env.MG116_USER_TOLERANCE_KM ?? '3');

function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
	const R = 6371;
	const r = Math.PI / 180;
	const dLat = (bLat - aLat) * r;
	const dLon = (bLon - aLon) * r;
	const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(x));
}

const log = (m: string): void => console.log(`[ab] ${m}`);
const line = (): void => log('='.repeat(76));

type Shot = { term: string; calls: number; urls: string[]; predictions: string[] };

async function run(): Promise<void> {
	const u = new URL(TARGET.appiumUrl);
	const driver = await remote({
		protocol: u.protocol.replace(':', '') as 'http' | 'https',
		hostname: u.hostname,
		port: Number(u.port) || 4723,
		path: '/',
		logLevel: 'error',
		connectionRetryTimeout: 90_000,
		capabilities: {
			platformName: 'Android',
			'appium:automationName': 'UiAutomator2',
			'appium:deviceName': process.env.ANDROID_DEVICE_NAME ?? 'SM-A055M',
			'appium:udid': TARGET.udid,
			'appium:appPackage': TARGET.appPackage,
			'appium:appActivity': '.MainActivity',
			'appium:noReset': true,
			'appium:forceAppLaunch': true,
			'appium:newCommandTimeout': 300
		}
	});

	const out: Record<string, unknown> = {
		ticket: 'MG-116',
		celda: 'Android + carrier argentino',
		env: TARGET.env,
		appPackage: TARGET.appPackage,
		startedAt: new Date().toISOString()
	};
	let webview = '';

	try {
		const ctx = (await driver.getContexts()) as unknown as string[];
		webview = ctx.map(String).find(c => c.startsWith('WEBVIEW')) ?? '';
		if (!webview) throw new Error('sin contexto WEBVIEW');
		await driver.switchContext(webview);
		await driver.pause(5000);

		const urls = async (): Promise<string[]> =>
			(
				(await driver.execute(() => performance.getEntriesByType('resource').map(e => e.name))) as string[]
			).filter(n => /places\/autocomplete/i.test(n));

		const preds = async (): Promise<string[]> =>
			(await driver.execute(() => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				return Array.from(document.querySelectorAll('ion-item, ion-list ion-label, li'))
					.filter(vis)
					.map(e => (e.textContent ?? '').replace(/\s+/g, ' ').trim())
					.filter(t => t.length > 8)
					.slice(0, 8);
			})) as string[];

		const type = async (sel: string, v: string): Promise<boolean> =>
			(await driver.execute(
				(s: string, val: string) => {
					const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
					const t = Array.from(document.querySelectorAll(s)).filter(vis)[0] as HTMLInputElement | undefined;
					if (!t || t.readOnly || t.disabled) return false;
					const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
					setter?.call(t, '');
					t.dispatchEvent(new Event('input', { bubbles: true }));
					setter?.call(t, val);
					t.dispatchEvent(new Event('input', { bubbles: true }));
					t.dispatchEvent(new Event('ionInput', { bubbles: true } as EventInit));
					return t.value === val;
				},
				sel,
				v
			)) as boolean;

		const shoot = async (sel: string, term: string): Promise<Shot | null> => {
			const before = (await urls()).length;
			if (!(await type(sel, term))) {
				log(`   "${term}": el campo NO acepto texto`);
				return null;
			}
			await driver.pause(SETTLE_MS);
			const nuevas = (await urls()).slice(before);
			const s: Shot = {
				term,
				calls: nuevas.length,
				urls: nuevas.map(x => x.slice(0, 170)),
				predictions: await preds()
			};
			log(`   "${term}" (${term.length} car.) -> ${s.calls} consulta(s)`);
			for (const p of s.predictions.slice(0, 3)) log(`        ${p.slice(0, 78)}`);
			return s;
		};

		const tap = async (needle: string, sel: string): Promise<boolean> => {
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
					id: 'f1',
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
			await driver.pause(2800);
			return true;
		};

		line();
		log(`ambiente=${TARGET.env} · package=${TARGET.appPackage}`);
		log(`criterio del fix: el sesgo debe ser la POSICION DEL DISPOSITIVO (${USER_POS.label}),`);
		log('               NO la direccion registrada del carrier, incluso vinculado al carrier de EE.UU.');
		line();

		// ------------------------------------------------------------ 1. el sesgo, desde el home
		log('HOME — fila de direccion editable');
		const ph = (await driver.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const hit = Array.from(document.querySelectorAll('input'))
				.filter(vis)
				.map(el => el as HTMLInputElement)
				.filter(i => /origen|destino/i.test(i.placeholder ?? ''))
				.find(i => !i.readOnly && !i.disabled);
			return hit ? hit.placeholder : '';
		})) as string;

		let home: Shot | null = null;
		if (!ph) {
			log('   ABORTA: el home no tiene fila de direccion editable en este estado.');
		} else {
			log(`   campo: "${ph.trim()}"`);
			home = await shoot(`input[placeholder=${JSON.stringify(ph)}]`, 'corri');
			out.home = home;
		}

		// ------------------------------------------------------------ 2. el piso, en Mis Direcciones
		line();
		log('PERFIL > MIS DIRECCIONES — piso de caracteres (independiente del sesgo)');
		await tap('mi cuenta', 'ion-tab-button, ion-label');
		await tap('direccion', 'ion-item, ion-label, button');
		const url = (await driver.execute(() => window.location.href)) as string;
		if (!/AddressesPage/i.test(url)) {
			log(`   ABORTA: no se alcanzo /AddressesPage (quedo en ${url.slice(0, 60)})`);
		} else {
			await tap('tipo', 'ion-select, ion-item');
			await driver
				.execute(() => {
					const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
					const opt = Array.from(
						document.querySelectorAll('ion-select-popover ion-item, ion-popover ion-item, ion-radio')
					).filter(vis)[0] as HTMLElement | undefined;
					opt?.click();
				})
				.catch(() => undefined);
			await driver.pause(1800);
			const sel = 'app-addresses input[name="input-from"], input[name="input-from"]';
			const eze = await shoot(sel, 'eze');
			const ezei = await shoot(sel, 'ezei');
			out.misDirecciones = { eze, ezei };

			line();
			log('PISO DE CARACTERES EN MIS DIRECCIONES');
			if (eze && ezei) {
				if (eze.calls === 0 && ezei.calls > 0) {
					log('   >>> El piso SIGUE EN 4: "eze" (3 car.) no consulta y "ezei" (4 car.) si.');
					log('       TM-734 se sostiene, y NO depende del carrier.');
				} else if (eze.calls > 0) {
					log('   >>> El piso es 3: "eze" SI consulta. TM-734 estaria corregido o el estado cambio.');
				} else {
					log('   >>> SIN DATOS: ninguno de los dos consulto. Revisar el estado del campo.');
				}
			} else {
				log('   >>> SIN DATOS: el campo no acepto texto en algun paso.');
			}
		}

		// ------------------------------------------------------------ 3. veredicto del sesgo
		line();
		log('VEREDICTO DE LA CELDA');
		line();
		const todas = [
			...(home?.urls ?? []),
			...((out.misDirecciones as { eze?: Shot; ezei?: Shot } | undefined)?.ezei?.urls ?? [])
		];
		const lat = /[?&]latitude=([^&]*)/.exec(todas[0] ?? '')?.[1] ?? '';
		const lon = /[?&]longitude=([^&]*)/.exec(todas[0] ?? '')?.[1] ?? '';
		out.sesgoMedido = { lat, lon };
		log(`   sesgo medido: latitude=${lat || '(sin dato)'}  longitude=${lon || '(sin dato)'}`);
		const dUser = lat && lon ? distKm(USER_POS.lat, USER_POS.lon, Number(lat), Number(lon)) : null;
		if (dUser !== null)
			log(
				`   distancia del sesgo al usuario (${USER_POS.label}): ${dUser < 1 ? Math.round(dUser * 1000) + ' m' : dUser.toFixed(1) + ' km'}`
			);

		if (lat === CARRIER_US.lat && lon === CARRIER_US.lon) {
			log(`   >>> SIGUE ENVIANDO ${CARRIER_US.label}.`);
			log('       El sesgo continua saliendo de la direccion registrada del carrier: el fix NO esta.');
			out.veredicto = 'FAIL — sigue usando la direccion del carrier de EE.UU.';
		} else if (lat === CARRIER_AR.lat && lon === CARRIER_AR.lon) {
			log(`   >>> Envia ${CARRIER_AR.label}.`);
			log('       Sigue siendo la direccion de UN carrier, no la del dispositivo. Y si se esperaba');
			log('       el carrier de EE.UU., ademas el cambio de vinculacion no tomo efecto.');
			out.veredicto = 'FAIL — usa la direccion del carrier argentino';
		} else if (dUser !== null && dUser <= USER_TOLERANCE_KM) {
			log(
				`   >>> ES LA POSICION DEL DISPOSITIVO (a ${dUser < 1 ? Math.round(dUser * 1000) + ' m' : dUser.toFixed(1) + ' km'} del usuario).`
			);
			log('       No coincide con ningun CARRIERPLACE conocido. EL FIX ESTA: el sesgo ya sale del');
			log('       dispositivo y no del carrier, incluso estando vinculado al carrier de EE.UU.');
			out.veredicto = 'PASS — el sesgo es la posicion del dispositivo';
		} else if (lat) {
			log(`   >>> Sesgo INESPERADO: no es ninguno de los carriers conocidos ni la posicion del usuario`);
			log(`       (esta a ${dUser?.toFixed(1)} km de el, y la tolerancia es ${USER_TOLERANCE_KM} km).`);
			log('       Hay que resolver de donde sale antes de dar un veredicto.');
			out.veredicto = 'sesgo inesperado — requiere analisis';
		} else {
			log('   >>> SIN DATOS: no se capturo ninguna URL con sesgo.');
			out.veredicto = 'sin datos';
		}
		line();
	} finally {
		const dir = path.join(process.cwd(), 'evidence', 'network-capture');
		await mkdir(dir, { recursive: true }).catch(() => undefined);
		const f = path.join(dir, `mg116-carrier-ab-android-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
		await writeFile(f, JSON.stringify(out, null, 2), 'utf8');
		log(`volcado -> ${path.relative(process.cwd(), f)}`);
		await driver.deleteSession().catch(() => undefined);
	}
}

run().catch(err => {
	console.error('[ab] termino con error:', err?.message ?? err);
	process.exitCode = 1;
});
