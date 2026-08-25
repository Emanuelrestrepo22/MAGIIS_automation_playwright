/**
 * MG-116 / S7 — el campo de direccion de "Mis Direcciones" (perfil del pasajero).
 *
 * POR QUE ESTA SUPERFICIE ES LA IMPORTANTE
 * El alcance declarado de MG-116 nombra la directiva de autocompletado, pero la app tiene VARIAS
 * implementaciones del mismo campo. La lectura del fuente de `release/2.5.19` dice que esta pantalla
 * — `pages/addresses/address-edit-modal` — **no fue migrada**: seguiria llamando a Google directo con
 * `debounceTime(2500)` y sin `sessionToken`. Este script lo verifica EN RUNTIME.
 *
 * EL CANAL QUE HAY QUE MIRAR
 * El SDK JS de Places (`google.maps.places.AutocompleteService`) **no pasa por `fetch` ni por XHR**:
 * usa su propio transporte. Una captura de red sola no lo ve, y el campo pareceria "no consultar
 * nada" cuando en realidad esta hablando con Google. Por eso se mide por TRES vias:
 *   1. `fetch`/XHR   -> detecta el endpoint propio `places/autocomplete`
 *   2. Resource Timing -> detecta al SDK de Google aunque no use fetch
 *   3. Sellos de tiempo in-page -> mide el debounce real con el MISMO reloj que ambos canales
 *
 * DISCIPLINA: cero consultas por los dos canales es `SIN DATOS`, nunca PASS. Un campo inalcanzable
 * se reporta como tal y no se convierte en defecto.
 *
 * NO GUARDA NADA: escribe en el campo y mide. La direccion solo se persiste si se corre con
 * `MG116_SAVE=1`, y en ese caso el script imprime el valor anterior para poder restaurarlo.
 */

import { remote } from 'webdriverio';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveDriverTarget } from './_shared/resolveDriverTarget';
import { ScreenEvidence } from '../helpers/screenEvidence';

const TARGET = resolveDriverTarget('passenger');

/**
 * Selector del campo. Por defecto apunta a Mis Direcciones (S7), pero se puede redirigir a
 * cualquier otra superficie con `MG116_FIELD_SELECTOR` — la medicion de los dos canales es la
 * misma, y es justamente lo que permite comparar pantallas entre si.
 *
 * Ejemplo, para la edicion de viaje programado (S6):
 *   MG116_FIELD_SELECTOR='input[placeholder="Agregar otro destino "]' MG116_SKIP_NAV=1 MG116_LABEL='S6 · Editar viaje programado'
 */
const FIELD =
	process.env.MG116_FIELD_SELECTOR ??
	'#main-content > app-addresses > ion-content > div > form > div:nth-child(2) > ion-row > ion-col > ion-item > ion-input > input';
/** Respaldo por atributo, por si el arbol cambia de forma. */
const FIELD_FALLBACK =
	process.env.MG116_FIELD_SELECTOR ?? 'app-addresses input[name="input-from"], app-addresses ion-input input';
/** Con `MG116_SKIP_NAV=1` se mide la pantalla que ya esta abierta, sin intentar navegar. */
const SKIP_NAV = process.env.MG116_SKIP_NAV === '1';
const SURFACE_LABEL = process.env.MG116_LABEL ?? 'S7 · Perfil > Mis Direcciones · campo Direccion';

const TERM_STEPS = ['ciu', 'ciudad', 'ciudad de la paz 22'];
const TERM_FULL = 'ciudad de la paz 2238';
const SETTLE_MS = 5200;

const log = (m: string): void => console.log(`[s7] ${m}`);
const line = (): void => log('='.repeat(74));

type GoogleRes = { name: string; atEpochMs: number };
type Call = { url: string; atEpochMs: number | null };

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
		} as Record<string, unknown>
	});

	const evidence = new ScreenEvidence(
		driver,
		`mg116-${process.env.MG116_SLUG ?? 's7'}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`
	);
	const out: Record<string, unknown> = {
		ticket: 'MG-116',
		surface: SURFACE_LABEL,
		env: TARGET.env,
		appPackage: TARGET.appPackage,
		startedAt: new Date().toISOString(),
		hypothesis: 'El fuente de release/2.5.19 indica que esta pantalla NO fue migrada a places/autocomplete.'
	};

	try {
		const ctx = (await driver.getContexts()) as string[];
		const webview = ctx.find(c => String(c).startsWith('WEBVIEW'));
		if (!webview) {
			out.aborted = 'sin contexto WEBVIEW';
			log('ABORTA: sin contexto WEBVIEW.');
			return;
		}
		await driver.switchContext(webview);
		out.startUrl = (await driver.execute(() => window.location.href)) as string;
		log(`URL inicial: ${out.startUrl}`);

		// ---------------------------------------------------------------- llegar a la pantalla
		if (!SKIP_NAV && !/AddressesPage/i.test(String(out.startUrl))) {
			// Mi cuenta -> Direcciones. NO el boton "Mis Direcciones" del home: ese es un atajo para
			// elegir un destino guardado, no la seccion del perfil con el formulario de alta/edicion.
			log('navegando a Mi cuenta > Direcciones...');
			await tapByText(driver, webview, 'mi cuenta');
			await driver.pause(2200);
			await tapByText(driver, webview, 'direccion');
			await driver.pause(2800);
		}
		const url = (await driver.execute(() => window.location.href)) as string;
		out.addressesUrl = url;
		log(`URL de la pantalla: ${url}`);
		await evidence.capture('01-mis-direcciones');

		// El campo puede estar deshabilitado hasta elegir un Tipo: es la precondicion del formulario.
		const sel = await resolveField(driver);
		if (!sel && !SKIP_NAV) {
			log('El campo de direccion no esta presente/habilitado. Intentando elegir un Tipo...');
			await pickType(driver, webview);
			await driver.pause(1500);
		}
		const selector = (await resolveField(driver)) ?? FIELD_FALLBACK;
		out.fieldSelector = selector;
		const st = await fieldState(driver, selector);
		log(`campo -> presente=${st.present} readOnly=${st.readOnly} disabled=${st.disabled} valor="${st.value}"`);
		out.fieldStateBefore = st;
		await evidence.capture('02-formulario-listo');

		if (!st.present || st.disabled) {
			out.aborted = 'campo de direccion ausente o deshabilitado';
			const pathOut = await evidence.captureUnblockPath('s7-campo');
			out.unblockPath = pathOut;
			log('ABORTA: el campo no esta usable. Camino de salida volcado en la evidencia.');
			return;
		}

		// ---------------------------------------------------------------- instrumentacion
		await installProbes(driver);

		// ---------------------------------------------------------------- B1 + B2
		line();
		log('B1/B2 — a quien le consulta este campo, y con que debounce');
		line();
		await resetProbes(driver);
		const rtBefore = (await googleResources(driver)).length;

		for (const t of TERM_STEPS) {
			await typeAndStamp(driver, selector, t);
			await driver.pause(120);
		}
		const stampedAt = (await driver.execute(
			() => (window as never as { __mgStamp?: number }).__mgStamp ?? null
		)) as number | null;
		await driver.pause(SETTLE_MS);

		const own = await ownCalls(driver);
		const rtAll = await googleResources(driver);
		const rtNew = rtAll.slice(rtBefore);
		const firstOwn = own.length ? own[0].atEpochMs : null;
		const firstGoogle = rtNew.length ? rtNew[0].atEpochMs : null;

		const channel = own.length > 0 ? 'endpoint propio' : rtNew.length > 0 ? 'SDK de Google' : null;
		const firstAt = firstOwn ?? firstGoogle;
		const delayMs = stampedAt !== null && firstAt !== null ? firstAt - stampedAt : null;

		log(`  consultas al endpoint propio (places/autocomplete): ${own.length}`);
		for (const c of own) log(`     ${c.url.slice(0, 150)}`);
		log(`  recursos NUEVOS de Google durante el tipeo (Resource Timing): ${rtNew.length}`);
		for (const r of rtNew.slice(0, 4)) log(`     ${r.name.slice(0, 140)}`);
		log(`  canal efectivo: ${channel ?? '(ninguno)'}`);
		log(`  debounce medido: ${delayMs === null ? '(no medible)' : `${delayMs} ms`}   [el AC pide ~300 ms]`);

		let b1: { status: string; verdict: string };
		if (own.length === 0 && rtNew.length === 0) {
			b1 = {
				status: 'SIN_DATOS',
				verdict: `Ninguno de los dos canales registro consultas con "${TERM_STEPS[TERM_STEPS.length - 1]}". La conducta no se ejercio: revisar que el campo este realmente enfocado antes de concluir nada.`
			};
		} else if (rtNew.length > 0) {
			b1 = {
				status: 'FAIL',
				verdict: `Esta pantalla consulta a GOOGLE DIRECTO: ${rtNew.length} recurso(s) de hosts de Google durante el tipeo${own.length ? `, ademas de ${own.length} al endpoint propio` : ' y CERO al endpoint propio'}. La migracion de MG-116 no alcanzo a este campo — confirma en runtime lo que indicaba el fuente de release/2.5.19.`
			};
		} else {
			b1 = {
				status: 'PASS',
				verdict: `${own.length} consulta(s) a places/autocomplete y cero a Google, verificado en fetch/XHR y en Resource Timing.`
			};
		}
		log(`  B1 ${b1.status}: ${b1.verdict}`);

		let b2: { status: string; verdict: string };
		const count = own.length > 0 ? own.length : rtNew.length;
		if (count === 0) b2 = { status: 'SIN_DATOS', verdict: 'Sin consultas, no hay debounce que medir.' };
		else if (delayMs === null)
			b2 = { status: 'NO_EJERCIDO', verdict: 'No se pudo obtener el sello temporal para medir la latencia.' };
		else if (count > 1)
			b2 = {
				status: 'FAIL',
				verdict: `${TERM_STEPS.length} pulsaciones generaron ${count} consulta(s) via ${channel}: no agrupa.`
			};
		else if (delayMs > 900)
			b2 = {
				status: 'FAIL',
				verdict: `Agrupa en 1 consulta via ${channel}, pero la ventana medida es de ${delayMs} ms contra los ~300 ms del AC. La demora es perceptible para el usuario.`
			};
		else
			b2 = {
				status: 'PASS',
				verdict: `1 consulta via ${channel}, disparada ${delayMs} ms despues de la ultima tecla.`
			};
		log(`  B2 ${b2.status}: ${b2.verdict}`);

		// ---------------------------------------------------------------- predicciones y seleccion
		await typeAndStamp(driver, selector, TERM_FULL);
		await driver.pause(SETTLE_MS);
		const preds = (await driver.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			return Array.from(document.querySelectorAll('ion-item.prediction-item, .prediction-item'))
				.filter(vis)
				.map(e => (e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80));
		})) as string[];
		log(`\n  predicciones renderizadas para "${TERM_FULL}": ${preds.length}`);
		for (const p of preds.slice(0, 6)) log(`     ${p}`);
		out.predictions = preds;
		await evidence.capture('03-predicciones');

		out.b1 = { ...b1, ownCalls: own, googleResourcesDuringTyping: rtNew, channel };
		out.b2 = { ...b2, measuredDelayMs: delayMs, count, acTargetMs: 300 };
		out.screenshots = evidence.all();

		line();
		log('RESUMEN — ' + SURFACE_LABEL);
		line();
		log(`  canal ....... ${channel ?? 'ninguno'}`);
		log(`  B1 .......... ${b1.status}`);
		log(`  B2 .......... ${b2.status}  (${delayMs === null ? 's/d' : delayMs + ' ms'})`);
		log(`  predicciones  ${preds.length}`);
		line();
		log('NO se guardo ninguna direccion: el script solo escribe en el campo y mide.');
	} finally {
		out.finishedAt = new Date().toISOString();
		const dir = path.resolve('evidence', 'network-capture');
		await mkdir(dir, { recursive: true });
		const f = path.join(
			dir,
			`mg116-superficie-${process.env.MG116_SLUG ?? 's7'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
		);
		await writeFile(f, JSON.stringify(out, null, 2), 'utf8');
		log(`Evidencia -> ${f}`);
		await driver.deleteSession().catch(() => undefined);
	}
}

// ---------------------------------------------------------------------- helpers

async function resolveField(driver: WebdriverIO.Browser): Promise<string | null> {
	return (await driver.execute(
		(a: string, b: string) => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const byExact = document.querySelector(a) as HTMLInputElement | null;
			if (byExact && vis(byExact) && !byExact.disabled) return a;
			const byFallback = Array.from(document.querySelectorAll(b)).filter(vis)[0] as HTMLInputElement | undefined;
			if (byFallback && !byFallback.disabled) return b;
			return null;
		},
		FIELD,
		FIELD_FALLBACK
	)) as string | null;
}

async function fieldState(
	driver: WebdriverIO.Browser,
	selector: string
): Promise<{ present: boolean; readOnly: boolean; disabled: boolean; value: string; cls: string }> {
	return (await driver.execute((s: string) => {
		const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
		const t = Array.from(document.querySelectorAll(s)).filter(vis)[0] as HTMLInputElement | undefined;
		if (!t) return { present: false, readOnly: false, disabled: false, value: '', cls: '' };
		return { present: true, readOnly: t.readOnly, disabled: t.disabled, value: t.value, cls: t.className };
	}, selector)) as { present: boolean; readOnly: boolean; disabled: boolean; value: string; cls: string };
}

/** El campo se habilita recien al elegir un Tipo: es la precondicion del formulario. */
async function pickType(driver: WebdriverIO.Browser, webview: string): Promise<boolean> {
	await tapByText(driver, webview, 'tipo');
	await driver.pause(1600);
	const picked = (await driver
		.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const opt = Array.from(
				document.querySelectorAll('ion-select-popover ion-item, ion-popover ion-item, ion-radio')
			).filter(vis)[0] as HTMLElement | undefined;
			if (!opt) return '';
			const label = (opt.textContent ?? '').trim();
			opt.click();
			return label || 'opcion-1';
		})
		.catch(() => '')) as string;
	await driver.pause(1600);
	if (picked) console.log(`[s7] tipo elegido: "${picked}"`);
	return Boolean(picked);
}

async function tapByText(
	driver: WebdriverIO.Browser,
	webview: string,
	needle: string,
	timeout = 7000
): Promise<boolean> {
	const target = needle.toLowerCase();
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const rect = (await driver
			.execute((t: string) => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const el = Array.from(
					document.querySelectorAll('button, ion-item, ion-col, ion-label, ion-select, div, span')
				)
					.filter(vis)
					.find(e => (e.textContent ?? '').toLowerCase().includes(t) && (e.textContent ?? '').length < 70) as
					| HTMLElement
					| undefined;
				if (!el) return null;
				const r = el.getBoundingClientRect();
				if (!r.width || !r.height) return null;
				return {
					x: r.left + r.width / 2,
					y: r.top + r.height / 2,
					vw: window.innerWidth,
					vh: window.innerHeight
				};
			}, target)
			.catch(() => null)) as { x: number; y: number; vw: number; vh: number } | null;
		if (rect) {
			await nativeTap(driver, webview, rect);
			return true;
		}
		await driver.pause(400);
	}
	return false;
}

async function nativeTap(
	driver: WebdriverIO.Browser,
	webview: string,
	rect: { x: number; y: number; vw: number; vh: number }
): Promise<void> {
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
	await driver.pause(2200);
}

/** Hooks de fetch/XHR + sello de pulsacion. El SDK se observa aparte, por Resource Timing. */
async function installProbes(driver: WebdriverIO.Browser): Promise<void> {
	await driver.execute(() => {
		const w = window as never as Record<string, unknown> & { fetch: typeof fetch };
		if ((w as { __mgProbed?: boolean }).__mgProbed) return;
		(w as { __mgProbed?: boolean }).__mgProbed = true;
		(w as { __mgOwn?: unknown[] }).__mgOwn = [];
		const push = (u: string): void => {
			if (!u.includes('places/autocomplete')) return;
			const bag = (w as unknown as { __mgOwn?: { url: string; atEpochMs: number }[] }).__mgOwn;
			if (bag) bag.push({ url: u, atEpochMs: Date.now() });
		};
		const of = w.fetch;
		w.fetch = function (this: unknown, ...a: Parameters<typeof fetch>) {
			try {
				push(String(a[0]));
			} catch {
				/* ignorar */
			}
			return of.apply(this as never, a);
		} as typeof fetch;
		const oo = XMLHttpRequest.prototype.open;
		XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, m: string, url: string) {
			try {
				push(String(url));
			} catch {
				/* ignorar */
			}
			// eslint-disable-next-line prefer-rest-params
			return oo.apply(this, arguments as never);
		} as typeof XMLHttpRequest.prototype.open;
	});
}

async function resetProbes(driver: WebdriverIO.Browser): Promise<void> {
	await driver.execute(() => {
		(window as never as { __mgOwn: unknown[] }).__mgOwn = [];
	});
}

async function ownCalls(driver: WebdriverIO.Browser): Promise<Call[]> {
	return (await driver.execute(() => (window as never as { __mgOwn?: Call[] }).__mgOwn ?? [])) as Call[];
}

async function googleResources(driver: WebdriverIO.Browser): Promise<GoogleRes[]> {
	return (await driver.execute(() => {
		return performance
			.getEntriesByType('resource')
			.filter(e => /maps\.googleapis\.com|places\.googleapis\.com/i.test(e.name))
			.map(e => ({ name: e.name.slice(0, 160), atEpochMs: Math.round(performance.timeOrigin + e.startTime) }));
	})) as GoogleRes[];
}

/** Escribe y sella la ultima pulsacion IN-PAGE, para medir contra el mismo reloj. */
async function typeAndStamp(driver: WebdriverIO.Browser, selector: string, value: string): Promise<void> {
	await driver.execute(
		(s: string, v: string) => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const t = Array.from(document.querySelectorAll(s)).filter(vis)[0] as HTMLInputElement | undefined;
			if (!t) return;
			const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
			setter?.call(t, v);
			t.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
			t.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
			t.dispatchEvent(new Event('keyup', { bubbles: true, composed: true } as EventInit));
			(window as never as { __mgStamp?: number }).__mgStamp = Date.now();
		},
		selector,
		value
	);
}

run().catch((e: Error) => {
	console.error('[s7] Error:', e.message ?? e);
	process.exit(1);
});
