/**
 * MG-116 — bateria por TEST CASE.
 *
 * `AddressFieldProbe` mide CONDUCTAS (B1..B6) para comparar superficies entre si. Esta bateria mide
 * los CASOS del set TM-669 uno por uno, porque es lo que se adjunta como evidencia en cada ticket.
 * Comparten las mismas primitivas y la misma disciplina de veredicto: cero requests es `SIN_DATOS`,
 * nunca PASS; una superficie inalcanzable no se convierte en defecto.
 *
 * QUE AGREGA SOBRE LA BATERIA DE CONDUCTAS
 *   · Ruteo por longitud con datos reales (IATA de 3 letras, mezcla de 4+).
 *   · Estado vacio y degradacion del endpoint, esta ultima con INYECCION DE FALLAS — no esperando
 *     a que el backend se caiga solo.
 *   · Veracidad del flag `airport`, orden de las predicciones y rotacion del token tras seleccionar.
 *   · Validez del sesgo, no su mera presencia: el caso TM-675 aprobo en su momento mientras la app
 *     mandaba coordenadas de Miami, porque solo verificaba que los parametros ESTUVIERAN.
 */

import {
	installWebViewNetworkCapture,
	clearWebViewNetworkCapture,
	readWebViewNetworkCapture,
	installWebViewFaultInjection,
	clearWebViewFaultInjection
} from '../helpers/webViewNetworkCapture';

export type CaseStatus = 'PASS' | 'FAIL' | 'SIN_DATOS' | 'NO_EJERCIDO';

export type CaseResult = {
	/** Clave del test case en Xray. */
	key: string;
	tc: string;
	title: string;
	status: CaseStatus;
	verdict: string;
	measured?: Record<string, unknown>;
};

type Row = {
	placeId: string | null;
	mainText?: string;
	secondaryText?: string | null;
	shortName?: string;
	latitude?: string | null;
	longitude?: string | null;
	airport?: boolean;
	iataCode?: string | null;
	source?: string;
};

type Entry = { url: string; status?: number; startedAt?: string; responseBody?: string; error?: string };

const AUTOCOMPLETE = 'places/autocomplete';
const log = (m: string): void => console.log(`[casos] ${m}`);

function param(url: string, name: string): string {
	const m = new RegExp(`[?&]${name}=([^&]*)`).exec(url);
	return m ? decodeURIComponent(m[1]) : '';
}

/** Distancia real en km. Comparar grados confunde "misma ciudad" con "mismo punto". */
function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
	const R = 6371;
	const toRad = (d: number): number => (d * Math.PI) / 180;
	const dLat = toRad(bLat - aLat);
	const dLng = toRad(bLng - aLng);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

export class AddressCaseBattery {
	constructor(
		private readonly driver: WebdriverIO.Browser,
		private readonly selector: string,
		private readonly settleMs = 4200
	) {}

	// ------------------------------------------------------------------ primitivas

	private async type(value: string): Promise<boolean> {
		return (await this.driver.execute(
			(sel: string, v: string) => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const t = Array.from(document.querySelectorAll(sel)).filter(vis)[0] as HTMLInputElement | undefined;
				if (!t) return false;
				const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
				setter?.call(t, v);
				t.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
				t.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
				return true;
			},
			this.selector,
			value
		)) as boolean;
	}

	private async reset(): Promise<void> {
		await this.type('');
		await this.driver.pause(600);
		await clearWebViewNetworkCapture(this.driver);
	}

	private async calls(): Promise<Entry[]> {
		const cap = await readWebViewNetworkCapture(this.driver);
		return (cap.entries as Entry[]).filter(e => String(e.url).includes(AUTOCOMPLETE));
	}

	/** Escribe un termino y devuelve los requests y las filas de la primera respuesta con cuerpo. */
	private async probe(term: string): Promise<{ entries: Entry[]; rows: Row[]; parseError: string | null }> {
		await this.reset();
		await this.type(term);
		await this.driver.pause(this.settleMs);
		const entries = await this.calls();
		const withBody = entries.find(e => (e.responseBody ?? '').trim().length > 0);
		if (!withBody) return { entries, rows: [], parseError: null };
		try {
			const parsed = JSON.parse(withBody.responseBody as string);
			return { entries, rows: Array.isArray(parsed) ? (parsed as Row[]) : [], parseError: null };
		} catch (e) {
			return { entries, rows: [], parseError: (e as Error).message };
		}
	}

	/** Overlays de carga visibles. El AC pide que el autocompletado NO los dispare. */
	private async loaderVisible(): Promise<string[]> {
		return (await this.driver.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			return Array.from(document.querySelectorAll('ion-loading, .loading-wrapper, ion-spinner, .spinner'))
				.filter(vis)
				.map(e => e.tagName.toLowerCase() + (e.className ? `.${String(e.className).slice(0, 40)}` : ''));
		})) as string[];
	}

	/** Errores visibles en pantalla: toasts, alertas, banners. */
	private async screenErrors(): Promise<string[]> {
		return (await this.driver.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			return Array.from(document.querySelectorAll('ion-toast, ion-alert, .error, .alert, [role="alert"]'))
				.filter(vis)
				.map(e => (e.textContent ?? '').trim().slice(0, 140))
				.filter(Boolean);
		})) as string[];
	}

	private async fieldUsable(): Promise<boolean> {
		return (await this.driver.execute((sel: string) => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const t = Array.from(document.querySelectorAll(sel)).filter(vis)[0] as HTMLInputElement | undefined;
			return Boolean(t) && !t!.disabled;
		}, this.selector)) as boolean;
	}

	// ------------------------------------------------------------------ casos

	/** TM-683 · TC10 — un IATA de 3 letras devuelve el aeropuerto. */
	async tm683(): Promise<CaseResult> {
		const { entries, rows } = await this.probe('eze');
		const airports = rows.filter(r => r.source === 'AIRPORT');
		const eze = rows.find(r => (r.iataCode ?? '').toUpperCase() === 'EZE');
		const measured = { term: 'eze', calls: entries.length, rows: rows.length, airports: airports.length, firstRow: rows[0] };
		if (entries.length === 0) return this.mk('TM-683', 'TC10', 'IATA de 3 letras devuelve aeropuerto', 'SIN_DATOS', 'Cero requests con "eze".', measured);
		if (rows.length === 0) return this.mk('TM-683', 'TC10', 'IATA de 3 letras devuelve aeropuerto', 'FAIL', 'El endpoint respondio vacio para el codigo IATA "eze".', measured);
		if (!eze) return this.mk('TM-683', 'TC10', 'IATA de 3 letras devuelve aeropuerto', 'FAIL', `Ninguna fila trae iataCode EZE. Se recibieron ${rows.length} fila(s).`, measured);
		return this.mk('TM-683', 'TC10', 'IATA de 3 letras devuelve aeropuerto', 'PASS', `"eze" devolvio ${rows.length} fila(s), con "${eze.mainText}" (iataCode EZE, source ${eze.source}).`, measured);
	}

	/** TM-682 · TC9 — con 4 caracteres la respuesta combina aeropuertos y cache. */
	async tm682(): Promise<CaseResult> {
		const { entries, rows } = await this.probe('corr');
		const sources = Array.from(new Set(rows.map(r => String(r.source ?? '')).filter(Boolean)));
		const measured = { term: 'corr', calls: entries.length, rows: rows.length, sources, order: rows.map(r => r.source) };
		if (entries.length === 0) return this.mk('TM-682', 'TC9', '4 caracteres combinan aeropuertos y cache', 'SIN_DATOS', 'Cero requests con "corr".', measured);
		if (rows.length === 0) return this.mk('TM-682', 'TC9', '4 caracteres combinan aeropuertos y cache', 'FAIL', 'Respuesta vacia con 4 caracteres.', measured);
		if (sources.length < 2) return this.mk('TM-682', 'TC9', '4 caracteres combinan aeropuertos y cache', 'FAIL', `Solo se devolvio la fuente ${sources.join(', ')}. El AC pide que 4+ caracteres sumen aeropuertos por nombre Y direcciones de cache.`, measured);
		return this.mk('TM-682', 'TC9', '4 caracteres combinan aeropuertos y cache', 'PASS', `"corr" devolvio ${rows.length} fila(s) mezclando ${sources.join(' y ')}.`, measured);
	}

	/** TM-727 · TC25 — las direcciones cercanas de cache deberian ir sobre aeropuertos lejanos. */
	async tm727(): Promise<CaseResult> {
		const { entries, rows } = await this.probe('corr');
		const firstCache = rows.findIndex(r => r.source === 'CACHE');
		const firstAirport = rows.findIndex(r => r.source === 'AIRPORT');
		const head = rows.slice(0, 4).map(r => ({ main: r.mainText, source: r.source, iata: r.iataCode, sec: r.secondaryText }));
		const measured = { term: 'corr', calls: entries.length, rows: rows.length, firstCacheIndex: firstCache, firstAirportIndex: firstAirport, head };
		if (entries.length === 0 || rows.length === 0) return this.mk('TM-727', 'TC25', 'Cache cercana por encima de aeropuertos lejanos', 'SIN_DATOS', 'Sin filas para evaluar el orden.', measured);
		if (firstAirport === -1) return this.mk('TM-727', 'TC25', 'Cache cercana por encima de aeropuertos lejanos', 'PASS', 'No se devolvieron aeropuertos, asi que no hay precedencia que evaluar en este termino.', measured);
		if (firstCache === -1) return this.mk('TM-727', 'TC25', 'Cache cercana por encima de aeropuertos lejanos', 'FAIL', 'Solo aeropuertos: ninguna direccion local en la lista.', measured);
		if (firstAirport < firstCache) {
			const a = rows[firstAirport];
			return this.mk('TM-727', 'TC25', 'Cache cercana por encima de aeropuertos lejanos', 'FAIL', `La posicion ${firstAirport} es el aeropuerto "${a.mainText}" (${a.secondaryText ?? ''}), por delante de la primera direccion local, que aparece recien en la posicion ${firstCache}.`, measured);
		}
		return this.mk('TM-727', 'TC25', 'Cache cercana por encima de aeropuertos lejanos', 'PASS', `La primera direccion de cache aparece en la posicion ${firstCache}, antes del primer aeropuerto (${firstAirport}).`, measured);
	}

	/** TM-691 · TC18 — una fila de cache no deberia venir marcada como aeropuerto. */
	async tm691(): Promise<CaseResult> {
		const { entries, rows } = await this.probe('ezeiza');
		const badFlag = rows.filter(r => r.source === 'CACHE' && r.airport === true);
		const measured = {
			term: 'ezeiza',
			calls: entries.length,
			rows: rows.length,
			cacheRowsFlaggedAirport: badFlag.map(r => ({ placeId: r.placeId, mainText: r.mainText, iataCode: r.iataCode, source: r.source }))
		};
		if (entries.length === 0 || rows.length === 0) return this.mk('TM-691', 'TC18', 'Fila de cache marcada como aeropuerto', 'SIN_DATOS', 'Sin filas para inspeccionar el flag.', measured);
		if (badFlag.length > 0) {
			const r = badFlag[0];
			return this.mk('TM-691', 'TC18', 'Fila de cache marcada como aeropuerto', 'FAIL', `${badFlag.length} fila(s) con source CACHE llegan con airport=true. Ejemplo: "${r.mainText}" con iataCode ${r.iataCode ?? 'null'} — es una direccion de calle marcada como aeropuerto. El defecto es del DATO, no del cliente: la app pinta el icono que el contrato le indica.`, measured);
		}
		// NO es PASS: es la AUSENCIA DEL FIXTURE.
		//
		// Este caso verifica como se comporta la app ante una fila mal enriquecida. Si el ambiente no
		// tiene ninguna, no se verifico nada — se midio que el problema no esta presente acá, que es
		// una afirmacion sobre el DATO del ambiente y no sobre el comportamiento del cliente.
		// Devolver PASS haria creer que hay cobertura donde no la hay, y el caso quedaria en verde
		// justo en el ambiente donde es imposible ejercerlo.
		return this.mk(
			'TM-691',
			'TC18',
			'Fila de cache marcada como aeropuerto',
			'SIN_DATOS',
			`Ninguna de las ${rows.length} filas de cache de "ezeiza" viene marcada como aeropuerto en este ambiente, asi que la condicion del caso NO SE REPRODUCE y no hay comportamiento que evaluar. No es un PASS: es fixture ausente. La fila defectuosa existe en el ambiente test, donde este caso si se puede ejercer.`,
			measured
		);
	}

	/** TM-688 · TC15 — un termino sin resultados muestra vacio, no un error. */
	async tm688(): Promise<CaseResult> {
		const term = 'zzqxwvk';
		const { entries, rows } = await this.probe(term);
		const errors = await this.screenErrors();
		const usable = await this.fieldUsable();
		const measured = { term, calls: entries.length, rows: rows.length, screenErrors: errors, fieldUsable: usable, statuses: entries.map(e => e.status) };
		if (entries.length === 0) return this.mk('TM-688', 'TC15', 'Termino sin resultados muestra vacio', 'SIN_DATOS', `Cero requests con "${term}".`, measured);
		if (rows.length > 0) return this.mk('TM-688', 'TC15', 'Termino sin resultados muestra vacio', 'SIN_DATOS', `El termino "${term}" devolvio ${rows.length} fila(s), asi que no sirve como caso de vacio. Elegir otro termino.`, measured);
		if (errors.length > 0) return this.mk('TM-688', 'TC15', 'Termino sin resultados muestra vacio', 'FAIL', `Sin resultados se muestra un error en pantalla: ${errors.join(' | ')}. El AC pide estado vacio, no error.`, measured);
		return this.mk('TM-688', 'TC15', 'Termino sin resultados muestra vacio', 'PASS', `Respuesta vacia con status ${entries.map(e => e.status).join(', ')}, sin error en pantalla y con el campo usable.`, measured);
	}

	/** TM-694 · TC21 — el autocompletado no debe disparar el loader de pantalla. */
	async tm694(): Promise<CaseResult> {
		await this.reset();
		await this.type('libertad');
		await this.driver.pause(700);
		const during = await this.loaderVisible();
		await this.driver.pause(this.settleMs);
		const after = await this.loaderVisible();
		const entries = await this.calls();
		const measured = { calls: entries.length, loaderDuringTyping: during, loaderAfter: after };
		if (entries.length === 0) return this.mk('TM-694', 'TC21', 'El autocompletado no dispara el loader', 'SIN_DATOS', 'Cero requests: no hubo busqueda durante la cual observar el loader.', measured);
		if (during.length > 0 || after.length > 0) return this.mk('TM-694', 'TC21', 'El autocompletado no dispara el loader', 'FAIL', `Aparecio overlay de carga durante la busqueda: ${[...during, ...after].join(', ')}.`, measured);
		return this.mk('TM-694', 'TC21', 'El autocompletado no dispara el loader', 'PASS', `${entries.length} request(s) sin que aparezca ningun overlay de carga.`, measured);
	}

	/**
	 * TM-689 · TC16 — degradacion del endpoint.
	 * Se INYECTA la falla en vez de esperar a que el backend se caiga: es la unica forma de ejercer
	 * el caso de forma repetible y sin depender del ambiente.
	 */
	async tm689(): Promise<CaseResult> {
		await this.reset();
		await installWebViewFaultInjection(this.driver, [
			{ urlPattern: AUTOCOMPLETE, mode: 'status', status: 500 } as never
		]);
		await this.type('libertad 4');
		await this.driver.pause(this.settleMs);

		const entries = await this.calls();
		const errors = await this.screenErrors();
		const usable = await this.fieldUsable();
		const crashed = (await this.driver.execute(() => document.body.innerText.trim().length === 0)) as boolean;

		await clearWebViewFaultInjection(this.driver).catch(() => undefined);

		const measured = {
			injected: 'status 500 sobre places/autocomplete',
			calls: entries.length,
			statuses: entries.map(e => e.status),
			screenErrors: errors,
			fieldUsable: usable,
			screenBlank: crashed
		};
		if (entries.length === 0) return this.mk('TM-689', 'TC16', 'Error 5xx del endpoint', 'SIN_DATOS', 'La inyeccion no llego a interceptar ningun request.', measured);
		if (crashed) return this.mk('TM-689', 'TC16', 'Error 5xx del endpoint', 'FAIL', 'Con el endpoint devolviendo 500 la pantalla quedo en blanco.', measured);
		if (!usable) return this.mk('TM-689', 'TC16', 'Error 5xx del endpoint', 'FAIL', 'Tras el 500 el campo quedo inutilizable: el usuario no puede seguir escribiendo.', measured);
		return this.mk('TM-689', 'TC16', 'Error 5xx del endpoint', 'PASS', `Con ${entries.length} request(s) interceptado(s) en 500, la app no se rompe y el campo sigue usable${errors.length ? ` (avisa: ${errors.join(' | ')})` : ' (sin mensaje al usuario)'}.`, measured);
	}

	/** TM-697 · TC24 — el campo sigue usable si se corta la conexion. */
	async tm697(): Promise<CaseResult> {
		await this.reset();
		await installWebViewFaultInjection(this.driver, [
			{ urlPattern: AUTOCOMPLETE, mode: 'networkError' } as never
		]);
		await this.type('libertad 47');
		await this.driver.pause(this.settleMs);

		const entries = await this.calls();
		const errors = await this.screenErrors();
		const usable = await this.fieldUsable();
		await clearWebViewFaultInjection(this.driver).catch(() => undefined);

		const measured = { injected: 'networkError', calls: entries.length, errors: entries.map(e => e.error), screenErrors: errors, fieldUsable: usable };
		if (entries.length === 0) return this.mk('TM-697', 'TC24', 'El campo sigue usable sin conexion', 'SIN_DATOS', 'La inyeccion no intercepto ningun request.', measured);
		if (!usable) return this.mk('TM-697', 'TC24', 'El campo sigue usable sin conexion', 'FAIL', 'Con la red caida el campo quedo inutilizable.', measured);
		return this.mk('TM-697', 'TC24', 'El campo sigue usable sin conexion', 'PASS', `Con ${entries.length} request(s) fallando por red, el campo sigue aceptando texto${errors.length ? ` y la app avisa: ${errors.join(' | ')}` : ' (sin aviso al usuario)'}.`, measured);
	}

	/**
	 * TM-675 · TC2 — el request lleva el sesgo. REDISENADO.
	 * El caso original solo verificaba que los parametros ESTUVIERAN, y por eso aprobo mientras la
	 * app enviaba coordenadas de Miami. Ahora ademas comprueba que los valores sean numeros validos
	 * y reporta la distancia al punto que informa el propio dispositivo.
	 */
	async tm675(): Promise<CaseResult> {
		const { entries } = await this.probe('libertad 479');
		if (entries.length === 0) {
			return this.mk('TM-675', 'TC2', 'El request lleva address y el sesgo', 'SIN_DATOS', 'Cero requests para inspeccionar el query.', { calls: 0 });
		}
		const url = String(entries[0].url);
		const address = param(url, 'address');
		const lat = Number(param(url, 'latitude'));
		const lng = Number(param(url, 'longitude'));
		const hasBoth = Number.isFinite(lat) && Number.isFinite(lng);

		const geo = (await this.driver.execute(`
			return (function () { return new Promise(function (resolve) {
				if (!navigator.geolocation) { resolve(null); return; }
				var done = false;
				var t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 8000);
				navigator.geolocation.getCurrentPosition(
					function (p) { if (done) return; done = true; clearTimeout(t); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
					function () { if (done) return; done = true; clearTimeout(t); resolve(null); },
					{ enableHighAccuracy: true, timeout: 7000, maximumAge: 0 });
			}); })();`)) as { lat: number; lng: number } | null;

		const distKm = geo && hasBoth ? distanceKm(lat, lng, geo.lat, geo.lng) : null;
		const measured = {
			url,
			address,
			latitude: lat,
			longitude: lng,
			hasRadius: url.includes('radius='),
			hasLanguage: url.includes('language='),
			deviceGeolocation: geo,
			distanceToDeviceKm: distKm === null ? null : Number(distKm.toFixed(2))
		};

		if (!address) return this.mk('TM-675', 'TC2', 'El request lleva address y el sesgo', 'FAIL', 'El request salio sin el parametro obligatorio address.', measured);
		if (!hasBoth) return this.mk('TM-675', 'TC2', 'El request lleva address y el sesgo', 'FAIL', 'Falta latitude o longitude, o no son numeros. El sesgo solo aplica si van los dos.', measured);

		const note = distKm === null
			? ' No se pudo leer la posicion del dispositivo para contrastar.'
			: ` El punto enviado esta a ${distKm.toFixed(2)} km de lo que informa el dispositivo.`;
		return this.mk('TM-675', 'TC2', 'El request lleva address y el sesgo', 'PASS', `El query lleva address="${address}" y un sesgo numericamente valido (${lat}, ${lng}).${note} Que ese punto sea el CORRECTO no lo define ningun criterio de aceptacion todavia — es el hueco de definicion ya reportado.`, measured);
	}

	private mk(key: string, tc: string, title: string, status: CaseStatus, verdict: string, measured?: Record<string, unknown>): CaseResult {
		return { key, tc, title, status, verdict, measured };
	}

	// ------------------------------------------------------------------ corrida completa

	/**
	 * @param onCase se invoca INMEDIATAMENTE despues de cada caso, con la pantalla todavia en el
	 *   estado que produjo ese veredicto.
	 *
	 *   Esto no es un detalle de comodidad. La primera version de esta bateria devolvia todos los
	 *   resultados y el runner sacaba las capturas DESPUES, en rafaga: las 9 imagenes salian con el
	 *   mismo MD5 — un unico frame del estado final — y se adjuntaron a Xray como si fueran evidencia
	 *   por caso. Una captura que no corresponde al caso que dice ilustrar es peor que no tener
	 *   captura, porque parece respaldo y no lo es. El enganche va aca adentro para que sea imposible
	 *   sacarla tarde.
	 */
	async runAll(onCase?: (r: CaseResult) => Promise<void>): Promise<CaseResult[]> {
		await installWebViewNetworkCapture(this.driver);
		const out: CaseResult[] = [];
		// El orden importa: los de inyeccion de fallas van al final, para no contaminar a los demas
		// si algo quedara enganchado.
		const steps: (() => Promise<CaseResult>)[] = [
			() => this.tm675(),
			() => this.tm682(),
			() => this.tm683(),
			() => this.tm688(),
			() => this.tm691(),
			() => this.tm694(),
			() => this.tm727(),
			() => this.tm689(),
			() => this.tm697()
		];
		for (const step of steps) {
			let result: CaseResult;
			try {
				result = await step();
				log(`  ${result.key} ${result.tc.padEnd(5)} ${result.status.padEnd(11)} ${result.verdict}`);
			} catch (e) {
				const msg = (e as Error).message ?? String(e);
				result = { key: 'ERROR', tc: '-', title: 'paso con excepcion', status: 'SIN_DATOS', verdict: `El paso lanzo: ${msg}` };
				log(`  EXCEPCION: ${msg}`);
			}
			out.push(result);
			// La captura se toma ACA, antes de que el paso siguiente cambie la pantalla.
			if (onCase) await onCase(result).catch(() => undefined);
		}
		await clearWebViewFaultInjection(this.driver).catch(() => undefined);
		return out;
	}
}
