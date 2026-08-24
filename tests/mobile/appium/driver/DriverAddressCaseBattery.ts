/**
 * MG-117 — batería de casos del buscador de direcciones de App Driver.
 *
 * Espeja `passenger/AddressCaseBattery.ts` y comparte su contrato (`CaseResult`, `runAll(onCase)`),
 * pero NO es una copia: el Driver tiene tres exigencias propias que el de PAX no necesita.
 *
 * 1. TECLEO CARÁCTER POR CARÁCTER PARA MEDIR EL DEBOUNCE. La batería de PAX escribe el valor de una
 *    sola vez con el setter nativo. Eso sirve para llegar a un estado, pero produce UN solo evento
 *    de input y por lo tanto NO puede medir un debounce: mide la latencia de una llamada. TM-654
 *    exige emitir N pulsaciones con intervalos por debajo de la ventana y comprobar que colapsan en
 *    una sola llamada. De ahí `typeCharByChar` y el sello `__mgLastKey`.
 *
 * 2. UN SOLO RELOJ. El delta "ms desde la última tecla" se calcula con `performance.now()` DENTRO
 *    de la página, no cruzando el reloj del host con el del dispositivo: por WebDriver hay decenas
 *    de ms de ida y vuelta y el desfase se comía la diferencia entre 300 y 400.
 *
 * 3. DOS CANALES PARA "NO LLAMÓ A GOOGLE". El SDK JS de Places consulta por inyección de script
 *    (JSONP), que no pasa por `fetch` ni por XHR. Un guard que sólo mire esos hooks da VERDE sobre
 *    una pantalla que está llamando a Google. El segundo canal es Resource Timing, vía
 *    `readWebViewGoogleActivity`. Medido en la iteración 1 de la campaña: el panel de red mostraba
 *    `AutocompletionService.GetPredictionsJson` con type `script`.
 *
 * ABORTA SI HAY MÁS DE UN BUSCADOR ABIERTO. Ionic deja montadas las páginas anteriores y cada modal
 * apilado mantiene su propia suscripción al tecleo, así que las llamadas se DUPLICAN. Un smoke de la
 * campaña reportó dos requests idénticas a 18 ms de distancia por esa causa y estuvo a punto de
 * quedar registrado como doble disparo del producto. Con dos buscadores la medición no sirve.
 */

import {
	installWebViewNetworkCapture,
	clearWebViewNetworkCapture,
	readWebViewNetworkCapture,
	readWebViewGoogleActivity,
	installWebViewFaultInjection,
	clearWebViewFaultInjection
} from '../helpers/webViewNetworkCapture';

export type CaseStatus = 'PASS' | 'FAIL' | 'SIN_DATOS' | 'NO_EJERCIDO';

export type CaseResult = {
	/** Clave del test case en Xray, o un marcador sin key cuando el caso todavía no tiene Test. */
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
const log = (m: string): void => console.log(`[driver-casos] ${m}`);

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
	const hv = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(hv));
}

export class DriverAddressCaseBattery {
	constructor(
		private readonly driver: WebdriverIO.Browser,
		/** Selector del campo editable del buscador. Se resuelve al primero VISIBLE y no readonly. */
		private readonly selector: string,
		private readonly settleMs = 4200
	) {}

	// ------------------------------------------------------------------ primitivas

	/** Cuántos buscadores editables hay abiertos. >1 invalida cualquier medición de frecuencia. */
	private async openSearchFields(): Promise<number> {
		return (await this.driver.execute((sel: string) => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			return Array.from(document.querySelectorAll(sel)).filter(vis).filter((e) => !(e as HTMLInputElement).readOnly).length;
		}, this.selector)) as number;
	}

	/** Escritura de una sola vez. Para llegar a un estado, NUNCA para medir debounce. */
	private async setValue(value: string): Promise<boolean> {
		return (await this.driver.execute(
			(sel: string, v: string) => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const t = Array.from(document.querySelectorAll(sel))
					.filter(vis)
					.find((e) => !(e as HTMLInputElement).readOnly) as HTMLInputElement | undefined;
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

	/**
	 * Tecleo real: una pulsación por carácter, con `gapMs` entre cada una, y sello del instante de
	 * la última tecla en el reloj de la página. Es la única forma de medir un debounce.
	 */
	private async typeCharByChar(term: string, gapMs = 90): Promise<boolean> {
		const ok = (await this.driver.execute((sel: string) => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const t = Array.from(document.querySelectorAll(sel))
				.filter(vis)
				.find((e) => !(e as HTMLInputElement).readOnly) as HTMLInputElement | undefined;
			if (!t) return false;
			(window as unknown as Record<string, unknown>).__mgLastKey = 0;
			return true;
		}, this.selector)) as boolean;
		if (!ok) return false;

		for (let i = 1; i <= term.length; i++) {
			await this.driver.execute(
				(sel: string, v: string) => {
					const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
					const t = Array.from(document.querySelectorAll(sel))
						.filter(vis)
						.find((e) => !(e as HTMLInputElement).readOnly) as HTMLInputElement | undefined;
					if (!t) return;
					const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
					setter?.call(t, v);
					t.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
					t.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
					// Sello en el reloj de la PÁGINA: el delta se calcula sin cruzar relojes.
					(window as unknown as Record<string, unknown>).__mgLastKey = performance.now();
				},
				this.selector,
				term.slice(0, i)
			);
			if (i < term.length) await this.driver.pause(gapMs);
		}
		return true;
	}

	/** ms transcurridos entre la última tecla y el inicio de la primera llamada, un solo reloj. */
	private async msSinceLastKey(): Promise<number | null> {
		return (await this.driver.execute(() => {
			const w = window as unknown as Record<string, unknown>;
			const last = Number(w.__mgLastKey ?? 0);
			if (!last) return null;
			const es = performance
				.getEntriesByType('resource')
				.filter((e) => e.name.includes('places/autocomplete'))
				.sort((a, b) => a.startTime - b.startTime);
			if (es.length === 0) return null;
			return Math.round(es[es.length - 1].startTime - last);
		})) as number | null;
	}

	private async reset(): Promise<void> {
		await this.setValue('');
		await this.driver.pause(600);
		await clearWebViewNetworkCapture(this.driver);
	}

	private async calls(): Promise<Entry[]> {
		const cap = await readWebViewNetworkCapture(this.driver);
		return (cap.entries as Entry[]).filter((e) => String(e.url).includes(AUTOCOMPLETE));
	}

	/** Escribe de una vez y devuelve requests + filas de la primera respuesta con cuerpo. */
	private async probe(term: string): Promise<{ entries: Entry[]; rows: Row[]; parseError: string | null }> {
		await this.reset();
		await this.setValue(term);
		await this.driver.pause(this.settleMs);
		return this.collect();
	}

	/** Teclea carácter por carácter — para los casos donde importa la FRECUENCIA, no el contenido. */
	private async probeTyped(term: string, gapMs = 90): Promise<{ entries: Entry[]; rows: Row[]; parseError: string | null }> {
		await this.reset();
		await this.typeCharByChar(term, gapMs);
		await this.driver.pause(this.settleMs);
		return this.collect();
	}

	private async collect(): Promise<{ entries: Entry[]; rows: Row[]; parseError: string | null }> {
		const entries = await this.calls();
		const withBody = entries.find((e) => (e.responseBody ?? '').trim().length > 0);
		if (!withBody) return { entries, rows: [], parseError: null };
		try {
			const parsed = JSON.parse(withBody.responseBody as string);
			return { entries, rows: Array.isArray(parsed) ? (parsed as Row[]) : [], parseError: null };
		} catch (e) {
			return { entries, rows: [], parseError: (e as Error).message };
		}
	}

	private async loaderVisible(): Promise<string[]> {
		return (await this.driver.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			return Array.from(document.querySelectorAll('ion-loading, .loading-wrapper, ion-spinner, .spinner'))
				.filter(vis)
				.map((e) => e.tagName.toLowerCase());
		})) as string[];
	}

	private async screenErrors(): Promise<string[]> {
		return (await this.driver.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			return Array.from(document.querySelectorAll('ion-toast, ion-alert, .error, .alert, [role="alert"]'))
				.filter(vis)
				.map((e) => (e.textContent ?? '').trim().slice(0, 140))
				.filter(Boolean);
		})) as string[];
	}

	private async predictionRows(): Promise<number> {
		return (await this.driver.execute(() => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			return Array.from(document.querySelectorAll('ion-item.prediction-item, [class*="prediction-item"]')).filter(vis).length;
		})) as number;
	}

	private mk(key: string, tc: string, title: string, status: CaseStatus, verdict: string, measured?: Record<string, unknown>): CaseResult {
		return { key, tc, title, status, verdict, measured };
	}

	// ------------------------------------------------------------------ casos

	/** TM-650 · TC1 — consulta el endpoint propio y CERO tráfico nuevo a Google. Dos canales. */
	async tm650(): Promise<CaseResult> {
		const before = await readWebViewGoogleActivity(this.driver);
		const { entries } = await this.probeTyped('corr');
		const after = await readWebViewGoogleActivity(this.driver);
		const byXhr = (await readWebViewNetworkCapture(this.driver)).entries.filter((e) => String(e.url).includes('maps.googleapis.com')).length;
		const nuevos = after.available && before.available ? after.resourceEntries.length - before.resourceEntries.length : -1;
		const measured = { term: 'corr', ownCalls: entries.length, googleByXhr: byXhr, googleNewResources: nuevos, probeAvailable: after.available };

		// Una captura vacía NO es prueba de nada: si la sonda no está disponible, el caso no se ejerció.
		if (!after.available) {
			return this.mk('TM-650', 'TC1', 'Cero llamadas a Google', 'SIN_DATOS', `La sonda de Resource Timing no está disponible (${after.unavailableReason ?? 'sin motivo'}): una lista vacía no distingue "no llamó" de "no se pudo medir".`, measured);
		}
		if (entries.length === 0) {
			return this.mk('TM-650', 'TC1', 'Cero llamadas a Google', 'SIN_DATOS', 'Cero requests al endpoint propio: el término no disparó nada y no hay nada que comparar.', measured);
		}
		if (byXhr > 0 || nuevos > 0) {
			return this.mk('TM-650', 'TC1', 'Cero llamadas a Google', 'FAIL', `Tráfico a Google durante la búsqueda: ${byXhr} por fetch/XHR y ${nuevos} recurso(s) nuevo(s) por Resource Timing.`, measured);
		}
		return this.mk('TM-650', 'TC1', 'Cero llamadas a Google', 'PASS', `${entries.length} llamada(s) al endpoint propio y cero tráfico nuevo a Google por los dos canales.`, measured);
	}

	/** TM-651 · TC2 — el request lleva address + coordenadas y NO lleva radius ni language. */
	async tm651(): Promise<CaseResult> {
		const { entries } = await this.probeTyped('corrientes');
		if (entries.length === 0) return this.mk('TM-651', 'TC2', 'Contrato del request', 'SIN_DATOS', 'Cero requests para inspeccionar.');
		const url = String(entries[entries.length - 1].url);
		const address = param(url, 'address');
		const lat = param(url, 'latitude');
		const lng = param(url, 'longitude');
		const radius = /[?&]radius=/.test(url);
		const language = /[?&]language=/.test(url);
		const measured = { address, latitude: lat, longitude: lng, radius, language, query: url.split('?')[1]?.slice(0, 160) };

		if (!address) return this.mk('TM-651', 'TC2', 'Contrato del request', 'FAIL', 'El request no lleva el parámetro address.', measured);
		if (!lat || !lng) return this.mk('TM-651', 'TC2', 'Contrato del request', 'FAIL', `Faltan coordenadas del origen (latitude="${lat}", longitude="${lng}"). El backend sólo aplica sesgo si llegan LAS DOS.`, measured);
		if (radius || language) return this.mk('TM-651', 'TC2', 'Contrato del request', 'FAIL', `El request lleva parámetros fuera de contrato: ${[radius ? 'radius' : '', language ? 'language' : ''].filter(Boolean).join(', ')}.`, measured);
		return this.mk('TM-651', 'TC2', 'Contrato del request', 'PASS', `address="${address}" con coordenadas ${lat},${lng}; sin radius ni language.`, measured);
	}

	/** TM-654 · TC5 — tecleo continuo colapsa en UNA llamada, ~300 ms tras la última tecla. */
	async tm654(): Promise<CaseResult> {
		const { entries } = await this.probeTyped('corrientes', 90);
		const delta = await this.msSinceLastKey();
		const measured = { term: 'corrientes', keystrokeGapMs: 90, calls: entries.length, msSinceLastKey: delta };

		if (entries.length === 0) return this.mk('TM-654', 'TC5', 'Debounce ~300 ms', 'SIN_DATOS', 'Cero requests: no hay debounce que medir.', measured);
		if (entries.length > 1) return this.mk('TM-654', 'TC5', 'Debounce ~300 ms', 'FAIL', `El tecleo continuo generó ${entries.length} llamadas. Con pulsaciones cada 90 ms deben colapsar en una sola.`, measured);
		if (delta === null) return this.mk('TM-654', 'TC5', 'Debounce ~300 ms', 'PASS', 'Una sola llamada. No se pudo medir el delta contra la última tecla (sin entrada de Resource Timing).', measured);
		// Ventana amplia a propósito: el objetivo es distinguir ~300 de 1500 (el valor viejo), no
		// perseguir milisegundos en un dispositivo físico.
		if (delta < 150 || delta > 900) return this.mk('TM-654', 'TC5', 'Debounce ~300 ms', 'FAIL', `Una sola llamada, pero a ${delta} ms de la última tecla. El criterio pide ~300 ms.`, measured);
		return this.mk('TM-654', 'TC5', 'Debounce ~300 ms', 'PASS', `Una sola llamada, ${delta} ms después de la última tecla.`, measured);
	}

	/** TM-655 · TC6 — repetir el mismo término no dispara una nueva llamada. */
	async tm655(): Promise<CaseResult> {
		await this.probeTyped('corrientes');
		await clearWebViewNetworkCapture(this.driver);
		// Se re-teclea el MISMO término sin pasar por vacío: el distinctUntilChanged no debe emitir.
		await this.typeCharByChar('corrientes', 60);
		await this.driver.pause(this.settleMs);
		const entries = await this.calls();
		const measured = { term: 'corrientes', callsOnRepeat: entries.length };
		if (entries.length === 0) return this.mk('TM-655', 'TC6', 'Término repetido no reconsulta', 'PASS', 'Repetir el término no disparó ninguna llamada.', measured);
		return this.mk('TM-655', 'TC6', 'Término repetido no reconsulta', 'FAIL', `Repetir el mismo término disparó ${entries.length} llamada(s).`, measured);
	}

	/** TM-656 · TC7 — con 2 caracteres NO se consulta. */
	async tm656(): Promise<CaseResult> {
		const { entries } = await this.probeTyped('ez');
		const measured = { term: 'ez', calls: entries.length };
		if (entries.length === 0) return this.mk('TM-656', 'TC7', 'Con 2 caracteres no consulta', 'PASS', 'Cero llamadas con 2 caracteres.', measured);
		return this.mk('TM-656', 'TC7', 'Con 2 caracteres no consulta', 'FAIL', `Con 2 caracteres se dispararon ${entries.length} llamada(s).`, measured);
	}

	/** TM-657 · TC8 — con exactamente 3 caracteres SÍ se consulta (habilita el IATA). */
	async tm657(): Promise<CaseResult> {
		const { entries, rows } = await this.probeTyped('eze');
		const measured = { term: 'eze', calls: entries.length, rows: rows.length, firstRow: rows[0] };
		if (entries.length === 0) return this.mk('TM-657', 'TC8', 'Con 3 caracteres sí consulta', 'FAIL', 'Con 3 caracteres no se disparó ninguna llamada: el guard de longitud mínima está de más.', measured);
		return this.mk('TM-657', 'TC8', 'Con 3 caracteres sí consulta', 'PASS', `Con 3 caracteres se disparó ${entries.length} llamada(s) y devolvió ${rows.length} fila(s).`, measured);
	}

	/** TM-662 · TC13 — todas las llamadas de una sesión comparten sessionToken. */
	async tm662(): Promise<CaseResult> {
		await this.reset();
		await this.typeCharByChar('corr', 90);
		await this.driver.pause(this.settleMs);
		await this.typeCharByChar('flori', 90);
		await this.driver.pause(this.settleMs);
		const entries = await this.calls();
		const tokens = Array.from(new Set(entries.map((e) => param(String(e.url), 'sessionToken')).filter(Boolean)));
		const measured = { calls: entries.length, tokens };

		if (entries.length < 2) return this.mk('TM-662', 'TC13', 'sessionToken compartido en la sesión', 'SIN_DATOS', `Se necesitan al menos 2 llamadas para comparar; hubo ${entries.length}.`, measured);
		if (tokens.length === 0) return this.mk('TM-662', 'TC13', 'sessionToken compartido en la sesión', 'FAIL', 'Ninguna llamada lleva sessionToken.', measured);
		if (tokens.length > 1) return this.mk('TM-662', 'TC13', 'sessionToken compartido en la sesión', 'FAIL', `${entries.length} llamadas con ${tokens.length} tokens distintos: la sesión se está fragmentando y Google la factura por request.`, measured);
		return this.mk('TM-662', 'TC13', 'sessionToken compartido en la sesión', 'PASS', `${entries.length} llamadas con un único token (${tokens[0]}).`, measured);
	}

	/**
	 * TM-663 · TC14 — tras seleccionar, la búsqueda siguiente usa un token nuevo.
	 *
	 * Depende de poder SELECCIONAR una predicción, lo que en Ionic exige tap nativo y reabrir el
	 * modal. Si no se puede completar, devuelve NO_EJERCIDO en vez de un verde vacío.
	 */
	async tm663(onSelect?: () => Promise<boolean>): Promise<CaseResult> {
		if (!onSelect) {
			return this.mk('TM-663', 'TC14', 'Token nuevo tras seleccionar', 'NO_EJERCIDO', 'El caso exige seleccionar una predicción; el runner no proveyó el enganche de selección.');
		}
		const { entries: before } = await this.probeTyped('corr');
		const tokenBefore = before.length ? param(String(before[before.length - 1].url), 'sessionToken') : '';
		const selected = await onSelect().catch(() => false);
		if (!selected) {
			return this.mk('TM-663', 'TC14', 'Token nuevo tras seleccionar', 'NO_EJERCIDO', 'No se pudo seleccionar una predicción, así que no hay rotación que medir.', { tokenBefore });
		}
		if ((await this.openSearchFields()) === 0) {
			return this.mk('TM-663', 'TC14', 'Token nuevo tras seleccionar', 'NO_EJERCIDO', 'El buscador se cerró al seleccionar y el runner no lo reabrió: el token nuevo se emite al volver a entrar.', { tokenBefore });
		}
		await clearWebViewNetworkCapture(this.driver);
		await this.typeCharByChar('flori', 90);
		await this.driver.pause(this.settleMs);
		const after = await this.calls();
		const tokenAfter = after.length ? param(String(after[after.length - 1].url), 'sessionToken') : '';
		const measured = { tokenBefore, tokenAfter };
		if (!tokenAfter) return this.mk('TM-663', 'TC14', 'Token nuevo tras seleccionar', 'SIN_DATOS', 'La búsqueda posterior no produjo ninguna llamada con token.', measured);
		if (tokenAfter === tokenBefore) return this.mk('TM-663', 'TC14', 'Token nuevo tras seleccionar', 'FAIL', `El token no rotó tras seleccionar (${tokenAfter}): la sesión anterior sigue abierta y Google la sigue contando.`, measured);
		return this.mk('TM-663', 'TC14', 'Token nuevo tras seleccionar', 'PASS', `El token rotó: ${tokenBefore} antes, ${tokenAfter} después.`, measured);
	}

	/** TM-664 · TC15 — término sin resultados: estado vacío controlado, sin error ni spinner. */
	async tm664(): Promise<CaseResult> {
		const { entries, rows } = await this.probeTyped('zzzqqqxxx');
		const items = await this.predictionRows();
		const loaders = await this.loaderVisible();
		const errors = await this.screenErrors();
		const usable = (await this.openSearchFields()) > 0;
		const status = entries.length ? entries[entries.length - 1].status : undefined;
		const measured = { term: 'zzzqqqxxx', calls: entries.length, httpStatus: status, rows: rows.length, itemsOnScreen: items, loaders, errors, fieldUsable: usable };

		if (entries.length === 0) return this.mk('TM-664', 'TC15', 'Estado vacío controlado', 'SIN_DATOS', 'Cero requests: no se ejerció la respuesta vacía.', measured);
		if (status !== undefined && status !== 200) return this.mk('TM-664', 'TC15', 'Estado vacío controlado', 'FAIL', `Un término sin coincidencias devolvió HTTP ${status}. La regla debe expresarse como CONTENIDO vacío, no como error.`, measured);
		if (rows.length > 0 || items > 0) return this.mk('TM-664', 'TC15', 'Estado vacío controlado', 'FAIL', `Se esperaba lista vacía y hubo ${rows.length} fila(s) en la respuesta y ${items} item(s) en pantalla.`, measured);
		if (errors.length > 0) return this.mk('TM-664', 'TC15', 'Estado vacío controlado', 'FAIL', `Apareció un aviso de error: ${errors.join(' | ')}`, measured);
		if (loaders.length > 0) return this.mk('TM-664', 'TC15', 'Estado vacío controlado', 'FAIL', `Quedó un indicador de carga visible: ${loaders.join(', ')}`, measured);
		if (!usable) return this.mk('TM-664', 'TC15', 'Estado vacío controlado', 'FAIL', 'El campo quedó inutilizable tras la respuesta vacía.', measured);
		return this.mk('TM-664', 'TC15', 'Estado vacío controlado', 'PASS', 'HTTP 200 con lista vacía: sin items, sin spinner, sin error, y el campo sigue operativo.', measured);
	}

	/**
	 * ORDEN — las direcciones cercanas de caché deben ir por delante de aeropuertos lejanos.
	 *
	 * SIN KEY DE XRAY A PROPÓSITO. El equivalente de PAX es TM-727; en el Driver el caso no existe
	 * como Test y no se inventa una clave. Es el hueco que este review dejó anotado en MG-931:
	 * el defecto se halló explorando, no con un caso diseñado. Cuando se cree el Test, reemplazar
	 * la clave acá.
	 */
	async orden(): Promise<CaseResult> {
		const KEY = 'ORDEN(sin-key)';
		const { entries, rows } = await this.probeTyped('caza');
		const iAirport = rows.findIndex((r) => r.source === 'AIRPORT' || r.airport === true);
		const iCache = rows.findIndex((r) => r.source === 'CACHE');
		const origin = entries.length ? { lat: Number(param(String(entries[0].url), 'latitude')), lng: Number(param(String(entries[0].url), 'longitude')) } : null;

		const withDist = rows.map((r) => {
			const la = Number(r.latitude);
			const lo = Number(r.longitude);
			const km = origin && Number.isFinite(la) && Number.isFinite(lo) && Number.isFinite(origin.lat) ? Math.round(distanceKm(origin.lat, origin.lng, la, lo)) : null;
			return { mainText: r.mainText, source: r.source, km };
		});
		const measured = { term: 'caza', calls: entries.length, rows: rows.length, firstAirport: iAirport, firstCache: iCache, origin, order: withDist };

		if (entries.length === 0) return this.mk(KEY, '—', 'Caché cercana por encima de aeropuertos lejanos', 'SIN_DATOS', 'Cero requests con "caza".', measured);
		if (rows.length === 0) return this.mk(KEY, '—', 'Caché cercana por encima de aeropuertos lejanos', 'SIN_DATOS', 'Respuesta vacía: no hay orden que evaluar.', measured);
		if (iAirport === -1) return this.mk(KEY, '—', 'Caché cercana por encima de aeropuertos lejanos', 'PASS', 'No se devolvieron aeropuertos, así que no hay precedencia que evaluar en este término.', measured);
		if (iCache === -1) return this.mk(KEY, '—', 'Caché cercana por encima de aeropuertos lejanos', 'FAIL', 'Sólo aeropuertos: ninguna dirección local en la lista.', measured);
		if (iAirport < iCache) {
			const a = withDist[iAirport];
			const cch = withDist[iCache];
			return this.mk(KEY, '—', 'Caché cercana por encima de aeropuertos lejanos', 'FAIL', `La posición ${iAirport} es el aeropuerto "${a.mainText}"${a.km !== null ? ` (a ${a.km} km)` : ''}, por delante de la primera dirección local "${cch.mainText}"${cch.km !== null ? ` (a ${cch.km} km)` : ''}, que aparece recién en la posición ${iCache}.`, measured);
		}
		return this.mk(KEY, '—', 'Caché cercana por encima de aeropuertos lejanos', 'PASS', `La primera dirección de caché está en la posición ${iCache}, antes del primer aeropuerto (${iAirport}).`, measured);
	}

	/**
	 * TM-665 · TC16 — ante 5xx o error de red degrada controlado y NO cae a Google.
	 *
	 * Va ÚLTIMO en `runAll` y limpia la inyección al salir: una regla que quedara enganchada
	 * contaminaría cualquier caso posterior con 503 fantasma.
	 */
	async tm665(): Promise<CaseResult> {
		const escenarios: Array<{ nombre: string; mode: 'status' | 'networkError'; status?: number }> = [
			{ nombre: '503 Service Unavailable', mode: 'status', status: 503 },
			{ nombre: '500 Internal Server Error', mode: 'status', status: 500 },
			{ nombre: 'error de red', mode: 'networkError' }
		];
		const observado: Array<Record<string, unknown>> = [];
		let googleTotal = 0;

		for (const esc of escenarios) {
			const before = await readWebViewGoogleActivity(this.driver);
			await installWebViewFaultInjection(this.driver, [
				{ id: `tm665-${esc.mode}-${esc.status ?? 'net'}`, urlPattern: AUTOCOMPLETE, mode: esc.mode, ...(esc.status ? { status: esc.status } : {}) }
			]);
			await this.reset();
			await this.typeCharByChar('corrien', 90);
			await this.driver.pause(this.settleMs);

			const after = await readWebViewGoogleActivity(this.driver);
			const nuevos = after.available && before.available ? after.resourceEntries.length - before.resourceEntries.length : -1;
			const items = await this.predictionRows();
			const loaders = await this.loaderVisible();
			const errors = await this.screenErrors();
			if (nuevos > 0) googleTotal += nuevos;
			observado.push({ escenario: esc.nombre, googleNewResources: nuevos, itemsOnScreen: items, loaderVisible: loaders.length > 0, avisoDeError: errors.length > 0 });
			await clearWebViewFaultInjection(this.driver).catch(() => undefined);
		}

		const measured = { escenarios: observado, googleTotal };
		if (googleTotal > 0) {
			return this.mk('TM-665', 'TC16', 'Degradación ante 5xx sin caer a Google', 'FAIL', `Ante el fallo del endpoint propio la app consultó Google: ${googleTotal} recurso(s) nuevo(s). Es exactamente el riesgo económico que la épica busca eliminar.`, measured);
		}
		const colgados = observado.filter((o) => o.loaderVisible).map((o) => o.escenario);
		const verdict =
			colgados.length > 0
				? `Cero tráfico a Google en los ${escenarios.length} escenarios. OBSERVACIÓN no bloqueante: el indicador de carga quedó visible en ${colgados.join(', ')}.`
				: `Cero tráfico a Google en los ${escenarios.length} escenarios, y el indicador de carga se liberó en todos.`;
		return this.mk('TM-665', 'TC16', 'Degradación ante 5xx sin caer a Google', 'PASS', verdict, measured);
	}

	// ------------------------------------------------------------------ corrida completa

	/**
	 * @param onCase se invoca INMEDIATAMENTE después de cada caso, con la pantalla todavía en el
	 *   estado que produjo ese veredicto. No es comodidad: si las capturas se toman al final, todas
	 *   retratan el mismo frame y se adjuntan como si fueran evidencia por caso. Una captura que no
	 *   corresponde al caso que dice ilustrar es peor que no tener captura, porque parece respaldo.
	 * @param onSelect enganche opcional para TM-663 (seleccionar una predicción y reabrir el buscador).
	 */
	async runAll(onCase?: (r: CaseResult) => Promise<void>, onSelect?: () => Promise<boolean>): Promise<CaseResult[]> {
		await installWebViewNetworkCapture(this.driver);

		const abiertos = await this.openSearchFields();
		if (abiertos !== 1) {
			const r = this.mk(
				'PRECONDICION',
				'—',
				'Un solo buscador abierto',
				'SIN_DATOS',
				`Se esperaba exactamente 1 buscador editable y hay ${abiertos}. Con modales apilados cada uno mantiene su propia suscripción al tecleo y las llamadas se duplican: ninguna medición de frecuencia sería válida.`,
				{ openSearchFields: abiertos }
			);
			log(`  ABORTA: ${r.verdict}`);
			if (onCase) await onCase(r).catch(() => undefined);
			return [r];
		}

		const out: CaseResult[] = [];
		// La inyección de fallos va al FINAL para no contaminar a los demás si algo queda enganchado.
		const steps: Array<() => Promise<CaseResult>> = [
			() => this.tm650(),
			() => this.tm651(),
			() => this.tm654(),
			() => this.tm655(),
			() => this.tm656(),
			() => this.tm657(),
			() => this.tm662(),
			() => this.tm664(),
			() => this.orden(),
			() => this.tm663(onSelect),
			() => this.tm665()
		];

		for (const step of steps) {
			let result: CaseResult;
			try {
				result = await step();
				log(`  ${result.key.padEnd(16)} ${result.tc.padEnd(5)} ${result.status.padEnd(11)} ${result.verdict}`);
			} catch (e) {
				const msg = (e as Error).message ?? String(e);
				result = { key: 'ERROR', tc: '—', title: 'paso con excepción', status: 'SIN_DATOS', verdict: `El paso lanzó: ${msg}` };
				log(`  EXCEPCION: ${msg}`);
			}
			out.push(result);
			if (onCase) await onCase(result).catch(() => undefined);
		}

		await clearWebViewFaultInjection(this.driver).catch(() => undefined);
		return out;
	}
}
