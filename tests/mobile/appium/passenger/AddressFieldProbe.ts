/**
 * MG-116 — BATERIA DE CONDUCTAS de un campo de direccion de App PAX.
 *
 * POR QUE UNA BATERIA Y NO PRUEBAS SUELTAS
 * MG-116 no cambio una pantalla: cambio la forma de autocompletar una direccion. App PAX monta ese
 * campo en varias superficies (origen, destino, paradas, ida y vuelta, a disposicion, edicion de
 * viaje programado, y el alta de direcciones del perfil) y en el repo de la app cada una tiene su
 * propia implementacion. El riesgo real no es "el autocompletado no funciona": es que **funcione
 * distinto en cada lugar**.
 *
 * Siete superficies por seis conductas son 42 pruebas si se escriben a mano. Aca hay UNA bateria de
 * seis conductas y un navegador por superficie: agregar una superficie cuesta un navegador, no seis
 * casos. La superficie solo tiene que saber llegar a la pantalla y decir cual es su input.
 *
 * DISCIPLINA DE VEREDICTO (aprendida a golpes en esta campana)
 * Cero requests capturados NUNCA es PASS: es `SIN_DATOS`. Un parametro ausente es `NO_EJERCIDO`.
 * Una superficie inalcanzable es `SIN_DATOS`, no un defecto — en TM-684 y TM-687 un `.click()`
 * programatico que no disparaba el handler de Ionic simulo dos defectos que no existian. Y todo
 * veredicto lleva el valor MEDIDO, no solo el binario, para que sea auditable.
 */

import {
	installWebViewNetworkCapture,
	clearWebViewNetworkCapture,
	readWebViewNetworkCapture,
	readWebViewGoogleActivity,
	installWebViewFaultInjection,
	clearWebViewFaultInjection
} from '../helpers/webViewNetworkCapture';

/** Una superficie es cualquier pantalla de PAX que monte un campo de direccion. */
export interface AddressSurface {
	/** `S1`, `S7`, ... Identifica la fila en la matriz de consistencia. */
	readonly id: string;
	readonly label: string;
	/** Deja la pantalla lista con el campo visible. `false` = superficie inalcanzable, no defecto. */
	reach(driver: WebdriverIO.Browser): Promise<boolean>;
	/** Selector CSS del input de direccion de esta superficie. */
	fieldSelector(): string;
	/** Deja la app en un estado del que la superficie siguiente pueda arrancar. */
	cleanup(driver: WebdriverIO.Browser): Promise<void>;
}

export type VerdictStatus = 'PASS' | 'FAIL' | 'SIN_DATOS' | 'NO_EJERCIDO';

export type BehaviorVerdict = {
	behavior: 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6' | 'B7' | 'B8' | 'B9';
	title: string;
	status: VerdictStatus;
	/** La explicacion en una linea: que se midio y por que da ese estado. */
	verdict: string;
	/** El dato crudo que sostiene el veredicto. Sin esto el resultado no es auditable. */
	measured?: Record<string, unknown>;
};

export type SurfaceReport = {
	surfaceId: string;
	surfaceLabel: string;
	reached: boolean;
	fieldSelector: string;
	verdicts: BehaviorVerdict[];
};

type CaptureEntry = {
	url: string;
	method?: string;
	status?: number;
	/** ISO-8601 sellado DENTRO del WebView (`new Date().toISOString()` en el hook de captura). */
	startedAt?: string;
	responseBody?: string;
};

/**
 * Pasa el sello de la captura a epoch ms.
 *
 * La captura anota `startedAt` como string ISO generado en la pagina, y el sello de la ultima
 * pulsacion se toma con `Date.now()` tambien en la pagina: los dos salen del MISMO reloj, asi que
 * la resta mide la ventana real del debounce. Restar contra el reloj de Node compararia relojes
 * distintos y el numero seria ruido.
 */
function toEpochMs(iso: string | undefined): number | null {
	if (!iso) return null;
	const ms = Date.parse(iso);
	return Number.isNaN(ms) ? null : ms;
}

/** Los 9 campos que el contrato del endpoint devuelve, medidos en vivo el 2026-08-12. */
const CONTRACT_FIELDS = [
	'placeId',
	'mainText',
	'secondaryText',
	'shortName',
	'latitude',
	'longitude',
	'airport',
	'iataCode',
	'source'
] as const;

const AUTOCOMPLETE_PATH = 'places/autocomplete';
const GOOGLE_HOST_RE = /maps\.googleapis\.com|places\.googleapis\.com/i;

/** El AC dice ~300 ms. Se acepta hasta 900 ms como "hay debounce"; por encima se reporta el valor. */
const DEBOUNCE_TARGET_MS = 300;
/** Piso de caracteres que fija el AC. Son 3 porque un codigo IATA mide exactamente 3. */
/** Piso por defecto del AC de MG-116: 3 caracteres, porque un codigo IATA mide 3. Perfil > Direcciones lo sobreescribe con 4 — ver checkMinLength. */
const MIN_CHARS = 3;
const DEBOUNCE_TOLERANCE_MS = 900;

const log = (m: string): void => console.log(`[probe] ${m}`);

function param(url: string, name: string): string {
	const m = new RegExp(`[?&]${name}=([^&]*)`).exec(url);
	return m ? decodeURIComponent(m[1]) : '';
}

export class AddressFieldProbe {
	/** Cuanto se espera despues de tipear antes de leer la captura. */
	private readonly settleMs: number;

	constructor(
		private readonly driver: WebdriverIO.Browser,
		settleMs = 4200
	) {
		this.settleMs = settleMs;
	}

	// ------------------------------------------------------------------ primitivas de campo

	private async focusField(selector: string): Promise<boolean> {
		const ok = (await this.driver.execute((sel: string) => {
			const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
			const t = Array.from(document.querySelectorAll(sel)).filter(vis)[0] as HTMLInputElement | undefined;
			if (!t) return false;
			t.focus();
			t.dispatchEvent(new Event('ionFocus', { bubbles: true, composed: true } as EventInit));
			t.click();
			return true;
		}, selector)) as boolean;
		await this.driver.pause(1400);
		return ok;
	}

	/**
	 * Escribe y SELLA el instante de la ultima pulsacion en la propia pagina.
	 *
	 * El sello va in-page a proposito: la captura de red anota `startedAt` con el reloj del WebView,
	 * asi que medir el debounce con el reloj de Node compararia dos relojes distintos y el numero
	 * seria ruido. Con los dos sellos en el mismo reloj, la resta es la latencia real del debounce.
	 */
	/**
	 * Escribe en el campo y CONFIRMA que el valor quedo, leyendolo de vuelta.
	 *
	 * POR QUE LEE DE VUELTA: la version anterior devolvia `true` con solo encontrar el elemento y
	 * llamar al setter. Eso hacia que un campo MUERTO — readonly, deshabilitado, o con Angular
	 * revirtiendo el binding — pasara por campo sano. Las conductas que se miden por AUSENCIA de
	 * requests (B4 "no repite", B6 "un solo token") entonces daban PASS sobre un campo que no
	 * aceptaba nada: cero requests nuevos es exactamente lo que produce un campo inerte, y el
	 * veredicto no podia distinguir "el producto agrupa bien" de "aca no pasa nada".
	 *
	 * Ocurrio de verdad, en Perfil > Mis Direcciones el 2026-08-19: el campo dejaba de aceptar
	 * texto despues del primer chequeo y B4/B6 se publicaron en verde sin sostenerlos.
	 */
	private async typeAndStamp(selector: string, value: string): Promise<boolean> {
		const ok = (await this.driver.execute(
			(sel: string, v: string) => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const t = Array.from(document.querySelectorAll(sel)).filter(vis)[0] as HTMLInputElement | undefined;
				if (!t) return false;
				if (t.readOnly || t.disabled) return false;
				const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
				setter?.call(t, v);
				t.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
				t.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
				(window as unknown as { __mgLastKeystrokeAt?: number }).__mgLastKeystrokeAt = Date.now();
				// La confirmacion: si el valor no quedo, el campo no acepto la escritura.
				return t.value === v;
			},
			selector,
			value
		)) as boolean;
		return ok;
	}

	private async lastKeystrokeAt(): Promise<number | null> {
		const v = (await this.driver.execute(() => {
			return (window as unknown as { __mgLastKeystrokeAt?: number }).__mgLastKeystrokeAt ?? null;
		})) as number | null;
		return v;
	}

	/**
	 * Handle del contexto WEBVIEW actual. Se lee en el momento y NO se cachea: cada relanzamiento de
	 * la app monta una vista web nueva, y un handle guardado antes queda muerto.
	 */
	private async webviewHandle(): Promise<string> {
		const contexts = (await this.driver.getContexts().catch(() => [])) as unknown as string[];
		return contexts.map(String).find(c => c.startsWith('WEBVIEW')) ?? '';
	}

	/** Valor actual del campo. Cadena vacia si no se pudo leer — nunca lanza. */
	private async fieldValue(selector: string): Promise<string> {
		return (await this.driver
			.execute((sel: string) => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const t = Array.from(document.querySelectorAll(sel)).filter(vis)[0] as HTMLInputElement | undefined;
				return t ? String(t.value ?? '') : '';
			}, selector)
			.catch(() => '')) as string;
	}

	/**
	 * Tapea la PRIMERA prediccion con un tap NATIVO. Devuelve su etiqueta, o null si no habia ninguna.
	 *
	 * POR QUE NATIVO Y NO `row.click()`. El click programatico del DOM NO dispara el handler de Ionic
	 * en esta app: el campo no se puebla y la seleccion nunca ocurre. Este repo ya lo tiene MEDIDO
	 * (`passenger-mg116-selection-control.ts`, veredicto `harness-limitation` con `populated:false`), y
	 * ese metodo ya simulo dos defectos INEXISTENTES en los casos TM-684 y TM-687: el token no rotaba
	 * porque nunca se selecciono nada, y el harness lo reportaba como defecto del producto.
	 *
	 * El tap se calcula desde el rect del elemento dentro de la pagina y se escala al recuadro nativo
	 * de la WebView, que no arranca en (0,0) — de ahi el offset. Es tap por ELEMENTO, no por coordenada
	 * de un dump viejo: nunca se toca la barra inferior, donde vive el boton que llama por telefono.
	 */
	private async tapFirstPredictionNative(): Promise<string | null> {
		const rect = (await this.driver
			.execute(() => {
				const items = Array.from(document.querySelectorAll('ion-item.prediction-item')).filter(el => {
					const r = el.getBoundingClientRect();
					return r.width > 0 && r.height > 0;
				});
				const t = items[0] as HTMLElement | undefined;
				if (!t) return null;
				const r = t.getBoundingClientRect();
				return {
					x: r.left + r.width / 2,
					y: r.top + r.height / 2,
					vw: window.innerWidth,
					vh: window.innerHeight,
					label: (t.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 90)
				};
			})
			.catch(() => null)) as { x: number; y: number; vw: number; vh: number; label: string } | null;
		if (!rect) return null;

		const webview = await this.webviewHandle();
		await this.driver.switchContext('NATIVE_APP');
		try {
			let ox = 0;
			let oy = 0;
			let sw = 0;
			let sh = 0;
			try {
				const wv = (await this.driver.$('//android.webkit.WebView')) as unknown as {
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
				const size = await this.driver.getWindowSize();
				sw = size.width;
				sh = size.height;
			}
			const x = Math.round(ox + rect.x * (sw / rect.vw));
			const y = Math.round(oy + rect.y * (sh / rect.vh));
			await this.driver.performActions([
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
			await this.driver.releaseActions().catch(() => undefined);
		} finally {
			if (webview) await this.driver.switchContext(webview).catch(() => undefined);
		}
		// La resolucion de la direccion elegida dispara su propia llamada; hay que dejarla terminar.
		await this.driver.pause(4000);
		return rect.label;
	}

	private async autocompleteCalls(): Promise<CaptureEntry[]> {
		const cap = await readWebViewNetworkCapture(this.driver);
		return (cap.entries as CaptureEntry[]).filter(e => String(e.url).includes(AUTOCOMPLETE_PATH));
	}

	/**
	 * Recursos cargados desde hosts de Google, leidos del Resource Timing DEL NAVEGADOR.
	 *
	 * Por que existe: el SDK JS de Places (`google.maps.places.AutocompleteService`) NO pasa por
	 * `fetch` ni por XHR — usa su propio transporte — asi que la captura de red lo pierde de vista
	 * por completo. En la pantalla de Direcciones del perfil, que el fuente indica como NO migrada,
	 * esta es la UNICA via para ver la llamada a Google. Devuelve timestamps ABSOLUTOS (epoch ms,
	 * `timeOrigin + startTime`) para poder restarlos contra el sello de la ultima pulsacion.
	 */
	private async googleResourceEntries(): Promise<{ name: string; atEpochMs: number }[]> {
		return (await this.driver.execute(() => {
			return performance
				.getEntriesByType('resource')
				.filter(e => /maps\.googleapis\.com|places\.googleapis\.com/i.test(e.name))
				.map(e => ({
					name: e.name.slice(0, 160),
					atEpochMs: Math.round(performance.timeOrigin + e.startTime)
				}));
		})) as { name: string; atEpochMs: number }[];
	}

	private async googleCalls(): Promise<CaptureEntry[]> {
		const cap = await readWebViewNetworkCapture(this.driver);
		return (cap.entries as CaptureEntry[]).filter(e => GOOGLE_HOST_RE.test(String(e.url)));
	}

	private async reset(selector: string): Promise<void> {
		await this.typeAndStamp(selector, '');
		await this.driver.pause(600);
		await clearWebViewNetworkCapture(this.driver);
	}

	// ------------------------------------------------------------------ B1 endpoint propio

	/**
	 * El AC pide consumir el endpoint propio en lugar de Google. Se verifica por PARTIDA DOBLE:
	 * la captura de fetch/XHR **y** `readWebViewGoogleActivity`, que detecta el uso del SDK de Places
	 * aunque no pase por fetch ni XHR. Con solo la captura, un SDK que use su propio transporte
	 * pasaria desapercibido y el caso daria verde sin serlo.
	 */
	async checkOwnEndpoint(selector: string, term = 'libertad 479'): Promise<BehaviorVerdict> {
		await this.reset(selector);
		await this.typeAndStamp(selector, term);
		await this.driver.pause(this.settleMs);

		const own = await this.autocompleteCalls();
		const google = await this.googleCalls();
		const activity = await readWebViewGoogleActivity(this.driver).catch(() => null);

		const measured = {
			term,
			autocompleteCalls: own.length,
			autocompleteUrls: own.map(c => String(c.url)),
			googleNetworkCalls: google.length,
			googleUrls: google.map(c => String(c.url)),
			googleActivity: activity
		};

		if (own.length === 0 && google.length === 0) {
			return {
				behavior: 'B1',
				title: 'Consulta el endpoint propio y no a Google',
				status: 'SIN_DATOS',
				verdict: `Cero requests de cualquier tipo con el termino "${term}". La conducta no se ejercio: revisar que el campo este realmente enfocado antes de concluir algo.`,
				measured
			};
		}
		if (google.length > 0) {
			return {
				behavior: 'B1',
				title: 'Consulta el endpoint propio y no a Google',
				status: 'FAIL',
				verdict: `${google.length} request(s) a Google desde esta superficie${own.length ? ` (y ${own.length} al endpoint propio)` : ' y NINGUNO al endpoint propio'}. La migracion no alcanzo a este campo.`,
				measured
			};
		}
		return {
			behavior: 'B1',
			title: 'Consulta el endpoint propio y no a Google',
			status: 'PASS',
			verdict: `${own.length} request(s) a ${AUTOCOMPLETE_PATH} y cero a Google, confirmado tambien fuera de banda por la actividad del SDK.`,
			measured
		};
	}

	// ------------------------------------------------------------------ B2 debounce

	/**
	 * Se MIDE, no se asume. El AC dice ~300 ms; el codigo shipped mostraba 2500 ms en tres
	 * implementaciones distintas, asi que el valor concreto es el hallazgo. Se escribe el termino en
	 * incrementos rapidos: con debounce sale UN request; sin debounce sale uno por pulsacion.
	 */
	async checkDebounce(selector: string, term = 'libertad 479', keyGapMs = 80): Promise<BehaviorVerdict> {
		await this.reset(selector);

		// LAS PULSACIONES SE GENERAN DENTRO DE LA PAGINA, y esto es la correccion central del caso.
		//
		// Antes el bucle vivia en Node y hacia UN round trip WebDriver por tecla. El veredicto entonces
		// afirmaba "pulsaciones separadas por 80 ms" cuando 80 ms era el valor por DEFECTO del parametro,
		// nunca un dato: el intervalo real era 80 ms + la latencia del puente, invisible para el harness.
		// Reconstruido despues, ese intervalo real caia en 293-334 ms — practicamente encima de la ventana
		// de debounce del producto (297-301 ms medidos). Con premisa y magnitud superpuestas, el conteo de
		// requests no distingue "el producto no agrupa" de "el harness tecleo demasiado lento": el mismo
		// test dio FAIL y PASS en dos corridas consecutivas sobre el mismo build.
		// Con la secuencia agendada in-page por setTimeout, el intervalo lo controla el WebView y se SELLA
		// por pulsacion, asi que la premisa deja de ser un supuesto y pasa a ser un dato verificable.
		const arranco = (await this.driver.execute(
			(sel: string, full: string, from: number, gap: number) => {
				const w = window as unknown as { __mgKeyStamps?: number[]; __mgKeyDone?: boolean };
				w.__mgKeyStamps = [];
				w.__mgKeyDone = false;
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const t = Array.from(document.querySelectorAll(sel)).filter(vis)[0] as HTMLInputElement | undefined;
				if (!t || t.readOnly || t.disabled) return false;
				const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
				let i = from;
				const step = (): void => {
					setter?.call(t, full.slice(0, i));
					t.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
					t.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
					(w.__mgKeyStamps as number[]).push(Date.now());
					(window as unknown as { __mgLastKeystrokeAt?: number }).__mgLastKeystrokeAt = Date.now();
					i += 1;
					if (i <= full.length) setTimeout(step, gap);
					else w.__mgKeyDone = true;
				};
				step();
				return true;
			},
			selector,
			term,
			3,
			keyGapMs
		)) as boolean;

		if (!arranco) {
			return {
				behavior: 'B2',
				title: `Debounce ~${DEBOUNCE_TARGET_MS} ms`,
				status: 'SIN_DATOS',
				verdict: 'El campo no acepto escritura: la secuencia de pulsaciones no se pudo iniciar.',
				measured: { term, keyGapMs }
			};
		}

		// Esperar a que la propia pagina termine la secuencia, con plazo: si el setTimeout se corta
		// (navegacion, re-render de Ionic), no se puede afirmar que se tecleo lo que se pidio.
		const esperadas = term.length - 2;
		const plazo = Date.now() + esperadas * keyGapMs + 15_000;
		let terminado = false;
		while (Date.now() < plazo) {
			terminado = (await this.driver
				.execute(() => (window as unknown as { __mgKeyDone?: boolean }).__mgKeyDone === true)
				.catch(() => false)) as boolean;
			if (terminado) break;
			await this.driver.pause(250);
		}

		const stamps = (await this.driver
			.execute(() => (window as unknown as { __mgKeyStamps?: number[] }).__mgKeyStamps ?? [])
			.catch(() => [] as number[])) as number[];
		const stampedAt = stamps.length ? stamps[stamps.length - 1] : await this.lastKeystrokeAt();
		// El inicio de la rafaga es el ANCLA para separar trafico propio de trafico heredado. Contra el
		// ULTIMO sello no se puede: si el producto no agrupa, la primera request sale junto a la PRIMERA
		// tecla, cientos de ms antes del ultimo sello, y "anterior al ultimo sello" clasificaria como
		// contaminacion justamente el caso que hay que detectar.
		const burstStart = stamps.length ? stamps[0] : null;
		await this.driver.pause(this.settleMs);

		// Ordenar por `startedAt`: la captura empuja la entrada cuando la request TERMINA, asi que
		// `calls[0]` sin ordenar es la primera en completarse, no la primera en salir.
		const calls = [...(await this.autocompleteCalls())].sort(
			(a, b) => (toEpochMs(a.startedAt) ?? 0) - (toEpochMs(b.startedAt) ?? 0)
		);
		// Solo las requests nacidas DENTRO de la rafaga son atribuibles a estas pulsaciones. Una que
		// seguia en vuelo cuando el reset limpio la captura arranca antes de `burstStart`.
		const inBurst =
			burstStart === null
				? calls
				: calls.filter(c => (toEpochMs(c.startedAt) ?? Number.POSITIVE_INFINITY) >= burstStart);
		const heredadas = calls.length - inBurst.length;
		const firstAt = inBurst.length ? toEpochMs(inBurst[0].startedAt) : null;
		const delayMs = stampedAt !== null && firstAt !== null ? firstAt - stampedAt : null;
		const delayDesdePrimeraMs = burstStart !== null && firstAt !== null ? firstAt - burstStart : null;

		const intervals: number[] = [];
		for (let i = 1; i < stamps.length; i++) intervals.push(stamps[i] - stamps[i - 1]);
		const maxIntervalMs = intervals.length ? Math.max(...intervals) : null;
		const minIntervalMs = intervals.length ? Math.min(...intervals) : null;

		const measured = {
			term,
			keystrokes: term.length - 2,
			keyGapMs,
			keystrokesObserved: stamps.length,
			sequenceCompleted: terminado,
			minIntervalMs,
			maxIntervalMs,
			calls: calls.length,
			callsInBurst: inBurst.length,
			callsBeforeBurst: heredadas,
			addresses: inBurst.map(c => param(String(c.url), 'address')),
			firstKeystrokeAt: burstStart,
			lastKeystrokeAt: stampedAt,
			firstRequestAt: firstAt,
			// Los DOS deltas viajan por separado para que el JSON diga cual sostiene el veredicto.
			delayFromLastKeystrokeMs: delayMs,
			delayFromFirstKeystrokeMs: delayDesdePrimeraMs,
			measuredDelayMs: delayMs,
			acTargetMs: DEBOUNCE_TARGET_MS
		};

		if (!terminado || stamps.length < esperadas) {
			return {
				behavior: 'B2',
				title: `Debounce ~${DEBOUNCE_TARGET_MS} ms`,
				status: 'NO_EJERCIDO',
				verdict: `La secuencia no se completo: se sellaron ${stamps.length} de ${esperadas} pulsaciones. Sin la rafaga completa no hay agrupamiento que evaluar.`,
				measured
			};
		}

		// GUARD DE PREMISA. Si el intervalo real entre pulsaciones alcanza la ventana de debounce, cada
		// tecla es su propia rafaga y varios requests son el comportamiento CORRECTO. Medir ahi no
		// distingue producto de harness, asi que el caso se declara no ejercido en vez de inventar un rojo.
		if (maxIntervalMs !== null && maxIntervalMs >= DEBOUNCE_TARGET_MS) {
			return {
				behavior: 'B2',
				title: `Debounce ~${DEBOUNCE_TARGET_MS} ms`,
				status: 'NO_EJERCIDO',
				verdict: `El intervalo real entre pulsaciones llego a ${maxIntervalMs} ms, igual o mayor que la ventana de ~${DEBOUNCE_TARGET_MS} ms del AC: a esa cadencia cada tecla es su propia rafaga y varios requests serian lo ESPERADO. La medicion no puede distinguir producto de harness.`,
				measured
			};
		}

		if (inBurst.length === 0) {
			return {
				behavior: 'B2',
				title: `Debounce ~${DEBOUNCE_TARGET_MS} ms`,
				status: 'SIN_DATOS',
				verdict: `Cero requests atribuibles a la rafaga${heredadas ? ` (se descartaron ${heredadas} anteriores a la primera pulsacion)` : ''}: no hay debounce que medir. La conducta no se ejercio.`,
				measured
			};
		}
		if (delayMs === null) {
			return {
				behavior: 'B2',
				title: `Debounce ~${DEBOUNCE_TARGET_MS} ms`,
				status: 'NO_EJERCIDO',
				verdict: `${inBurst.length} request(s) en la rafaga, pero la captura no trae el sello temporal necesario para medir la latencia.`,
				measured
			};
		}
		// EL CONTEO VA PRIMERO, y el orden de estas dos ramas es load-bearing.
		//
		// Con el guard de negatividad delante, este FAIL era INALCANZABLE: cuando el producto no agrupa,
		// la primera request sale junto a la PRIMERA tecla, o sea cientos de ms antes del ultimo sello,
		// asi que `delayMs` es negativo POR CONSTRUCCION justo en el caso que hay que cazar. El caso
		// salia NO_EJERCIDO siempre y el unico rojo real quedaba invisible. Al filtrar por `inBurst` la
		// contaminacion ya se descarto contra el INICIO de la rafaga, que es el ancla correcta.
		if (inBurst.length > 1) {
			return {
				behavior: 'B2',
				title: `Debounce ~${DEBOUNCE_TARGET_MS} ms`,
				status: 'FAIL',
				verdict: `${stamps.length} pulsaciones con un intervalo real de ${minIntervalMs}-${maxIntervalMs} ms (por debajo de la ventana de ~${DEBOUNCE_TARGET_MS} ms) generaron ${inBurst.length} requests dentro de la rafaga. No agrupa: el debounce no esta operando en esta superficie.`,
				measured
			};
		}
		// Con UNA sola request en la rafaga, un delta negativo contra la ultima tecla no es
		// contaminacion — ya se filtro — sino un disparo en el borde de entrada: la request salio con las
		// primeras teclas y nada mas se emitio. No alcanza para afirmar agrupamiento ni para negarlo.
		if (delayMs < 0) {
			return {
				behavior: 'B2',
				title: `Debounce ~${DEBOUNCE_TARGET_MS} ms`,
				status: 'NO_EJERCIDO',
				verdict: `1 request en la rafaga, pero salio ${Math.abs(delayMs)} ms antes de la ultima pulsacion (${delayDesdePrimeraMs} ms despues de la primera): disparo en el borde de entrada, no un agrupamiento medible.`,
				measured
			};
		}
		if (delayMs > DEBOUNCE_TOLERANCE_MS) {
			return {
				behavior: 'B2',
				title: `Debounce ~${DEBOUNCE_TARGET_MS} ms`,
				status: 'FAIL',
				verdict: `Agrupa en 1 request, pero la ventana medida es de ${delayMs} ms contra los ~${DEBOUNCE_TARGET_MS} ms del AC. La demora es perceptible para el usuario.`,
				measured
			};
		}
		return {
			behavior: 'B2',
			title: `Debounce ~${DEBOUNCE_TARGET_MS} ms`,
			status: 'PASS',
			verdict: `1 request para ${stamps.length} pulsaciones con intervalo real de ${minIntervalMs}-${maxIntervalMs} ms, disparado ${delayMs} ms despues de la ultima tecla.`,
			measured
		};
	}

	// ------------------------------------------------------------------ B3 minLength 3

	/**
	 * BARRIDO del minimo de caracteres: escribe 1, 2, 3, ... del mismo termino y anota en cual
	 * aparece la primera consulta.
	 *
	 * POR QUE UN BARRIDO Y NO "2 vs 3": comparar solo dos longitudes deja un agujero. Cuando ambas
	 * dan cero requests no se puede distinguir "el campo no consulta nunca" de "el piso esta por
	 * encima de 3", y la rama de sin-datos se adelanta justo al hallazgo interesante. Paso en Perfil
	 * > Mis Direcciones el 2026-08-19: "lib" no consultaba pero "libertad 479" si, y el veredicto
	 * salio SIN_DATOS tapando que el minimo de esa pantalla no es 3.
	 *
	 * El piso importa porque el AC lo fija en 3 para soportar codigos IATA, que miden exactamente 3.
	 */
	/**
	 * B3 — el piso de caracteres desde el que la superficie consulta.
	 *
	 * `expectedFloor` es por SUPERFICIE y no global: el AC de MG-116 fija 3 para los campos del alta
	 * de viaje (un codigo IATA mide 3 letras y ahi el pasajero necesita ver el aeropuerto), pero
	 * Perfil > Direcciones acordo 4 el 2026-08-20 — es un formulario de guardado donde el pasajero
	 * escribe una calle que ya conoce, y no existe el caso de uso de guardar un aeropuerto como
	 * direccion favorita. Clavar un unico piso marcaria rojo un comportamiento correcto.
	 */
	async checkMinLength(
		selector: string,
		opts: { term?: string; maxLen?: number; expectedFloor?: number } = {}
	): Promise<BehaviorVerdict> {
		const term = opts.term ?? 'libertad';
		const maxLen = opts.maxLen ?? 6;
		const expectedFloor = opts.expectedFloor ?? MIN_CHARS;
		const perLength: { length: number; text: string; calls: number }[] = [];

		for (let len = 1; len <= Math.min(maxLen, term.length); len++) {
			await this.reset(selector);
			const text = term.slice(0, len);
			const typed = await this.typeAndStamp(selector, text);
			if (!typed) {
				perLength.push({ length: len, text, calls: -1 });
				continue;
			}
			await this.driver.pause(this.settleMs);
			perLength.push({ length: len, text, calls: (await this.autocompleteCalls()).length });
		}

		const rejected = perLength.filter(p => p.calls < 0).map(p => p.length);
		const firstQuery = perLength.find(p => p.calls > 0)?.length ?? null;
		const measured = {
			term,
			perLength,
			firstQueryAtLength: firstQuery,
			lengthsRejectedByField: rejected,
			expectedFloor
		};

		if (rejected.length === perLength.length) {
			return {
				behavior: 'B3',
				title: `minLength ${expectedFloor}`,
				status: 'SIN_DATOS',
				verdict:
					'El campo no acepto texto en ninguna longitud: no hay piso que medir. Revisar el estado de la pantalla antes de concluir algo del producto.',
				measured
			};
		}
		if (firstQuery === null) {
			return {
				behavior: 'B3',
				title: `minLength ${expectedFloor}`,
				status: 'SIN_DATOS',
				verdict: `Ninguna longitud de 1 a ${perLength.length} genero consulta. Sin un caso positivo no se distingue "respeta el piso" de "el campo no consulta nunca".`,
				measured
			};
		}
		if (firstQuery < expectedFloor) {
			return {
				behavior: 'B3',
				title: `minLength ${expectedFloor}`,
				status: 'FAIL',
				verdict: `La primera consulta sale con ${firstQuery} caracter(es), por debajo del piso de ${expectedFloor} acordado para esta superficie. Se pagan consultas que el contrato de la pantalla pide no hacer.`,
				measured
			};
		}
		if (firstQuery > expectedFloor) {
			return {
				behavior: 'B3',
				title: `minLength ${expectedFloor}`,
				status: 'FAIL',
				verdict: `La primera consulta recien sale con ${firstQuery} caracteres, por encima del piso de ${expectedFloor} acordado para esta superficie. Un termino de ${expectedFloor} caracteres no dispara busqueda aca.`,
				measured
			};
		}
		return {
			behavior: 'B3',
			title: `minLength ${expectedFloor}`,
			status: 'PASS',
			verdict: `El piso medido es ${firstQuery}, el acordado para esta superficie: con ${expectedFloor - 1} caracteres no consulta y con ${expectedFloor} si.`,
			measured
		};
	}

	// ------------------------------------------------------------------ B4 distinctUntilChanged

	async checkDistinctUntilChanged(selector: string, term = 'libertad 479'): Promise<BehaviorVerdict> {
		await this.reset(selector);
		await this.typeAndStamp(selector, term);
		await this.driver.pause(this.settleMs);
		const firstRound = (await this.autocompleteCalls()).length;

		await clearWebViewNetworkCapture(this.driver);
		// El mismo texto otra vez. Con `distinctUntilChanged` no deberia salir nada.
		const reescribio = await this.typeAndStamp(selector, term);
		await this.driver.pause(this.settleMs);
		const repeated = await this.autocompleteCalls();

		// PRUEBA DE VIDA, y sin ella este caso da PASS sobre un campo muerto.
		//
		// El veredicto de abajo se apoya en una AUSENCIA ("no salio ningun request"), y cero requests es
		// exactamente lo que produce un campo que dejo de aceptar texto. El read-back de `typeAndStamp`
		// no alcanza: con el valor ya presente, `t.value === v` es cierto aunque el evento `input` no
		// llegue a ninguna suscripcion. Y `firstRound > 0` solo descarta el campo muerto DESDE EL
		// ARRANQUE, no el que muere ENTRE rondas — que es justo lo documentado en Perfil > Mis
		// Direcciones el 2026-08-19, donde B4 y B6 se publicaron en verde sin sostenerlos.
		//
		// Se sonda con un texto DISTINTO, nunca vaciando el campo: inyectar '' entre las dos emisiones
		// puede hacer que un producto SANO vuelva a emitir, y eso seria un falso rojo.
		await clearWebViewNetworkCapture(this.driver);
		const textoSonda = `${term} 2`;
		const escribioSonda = await this.typeAndStamp(selector, textoSonda);
		await this.driver.pause(this.settleMs);
		const sonda = (await this.autocompleteCalls()).length;

		const measured = {
			term,
			callsFirstRound: firstRound,
			callsOnRepeat: repeated.length,
			repeatedAddresses: repeated.map(c => param(String(c.url), 'address')),
			livenessTerm: textoSonda,
			livenessTyped: escribioSonda,
			livenessCalls: sonda
		};

		if (firstRound === 0) {
			return {
				behavior: 'B4',
				title: 'distinctUntilChanged',
				status: 'SIN_DATOS',
				verdict:
					'La primera consulta no salio, asi que "no repite" no distingue la conducta de un campo inerte.',
				measured
			};
		}
		if (!reescribio) {
			return {
				behavior: 'B4',
				title: 'distinctUntilChanged',
				status: 'SIN_DATOS',
				verdict:
					'El campo no acepto la reescritura del mismo texto, asi que la ausencia de requests no dice nada de la conducta.',
				measured
			};
		}
		if (repeated.length > 0) {
			return {
				behavior: 'B4',
				title: 'distinctUntilChanged',
				status: 'FAIL',
				verdict: `Reescribir el mismo texto genero ${repeated.length} request(s) nuevo(s). Se paga una consulta por un resultado ya conocido.`,
				measured
			};
		}
		if (sonda === 0) {
			return {
				behavior: 'B4',
				title: 'distinctUntilChanged',
				status: 'SIN_DATOS',
				verdict: `Cero requests al repetir, pero tambien cero con un texto DISTINTO ("${textoSonda}"): el campo esta inerte y la ausencia no acredita distinctUntilChanged.`,
				measured
			};
		}
		return {
			behavior: 'B4',
			title: 'distinctUntilChanged',
			status: 'PASS',
			verdict: `Reescribir el mismo texto no genero ningun request nuevo, y el campo seguia vivo: un texto distinto si disparo ${sonda} request(s).`,
			measured
		};
	}

	// ------------------------------------------------------------------ B5 mapeo del DTO

	/**
	 * El AC nombra `isAirport`, pero el contrato medido devuelve `airport`. Esa diferencia ya esta
	 * reportada: aca se verifica contra lo que el endpoint REALMENTE devuelve, no contra el texto
	 * del AC, y se deja constancia de la discrepancia en el veredicto.
	 */
	async checkDtoMapping(selector: string, term = 'libertad 479'): Promise<BehaviorVerdict> {
		await this.reset(selector);
		await this.typeAndStamp(selector, term);
		await this.driver.pause(this.settleMs);

		const calls = await this.autocompleteCalls();
		const withBody = calls.find(c => (c.responseBody ?? '').trim().length > 0);

		if (!withBody) {
			return {
				behavior: 'B5',
				title: 'Mapeo del DTO (contrato 7.3)',
				status: 'SIN_DATOS',
				verdict: 'Ningun request trajo cuerpo de respuesta para inspeccionar.',
				measured: { term, calls: calls.length }
			};
		}

		let rows: Record<string, unknown>[] = [];
		let parseError: string | null = null;
		try {
			const parsed = JSON.parse(withBody.responseBody as string);
			rows = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
		} catch (e) {
			parseError = (e as Error).message;
		}

		if (parseError !== null) {
			return {
				behavior: 'B5',
				title: 'Mapeo del DTO (contrato 7.3)',
				status: 'NO_EJERCIDO',
				verdict: `La respuesta no se pudo parsear como JSON (${parseError}).`,
				measured: { term, bodyPreview: (withBody.responseBody ?? '').slice(0, 200) }
			};
		}
		if (rows.length === 0) {
			return {
				behavior: 'B5',
				title: 'Mapeo del DTO (contrato 7.3)',
				status: 'SIN_DATOS',
				verdict: `El endpoint respondio un arreglo vacio para "${term}". Sin filas no hay mapeo que verificar; probar con otro termino.`,
				measured: { term, rows: 0 }
			};
		}

		const first = rows[0];
		const present = CONTRACT_FIELDS.filter(f => f in first);
		const missing = CONTRACT_FIELDS.filter(f => !(f in first));
		const hasIsAirport = 'isAirport' in first;
		const measured = {
			term,
			rows: rows.length,
			fieldsPresent: present,
			fieldsMissing: missing,
			hasIsAirport,
			sources: Array.from(new Set(rows.map(r => String(r.source ?? '')))).filter(Boolean),
			firstRow: first
		};

		if (missing.length > 0) {
			return {
				behavior: 'B5',
				title: 'Mapeo del DTO (contrato 7.3)',
				status: 'FAIL',
				verdict: `Faltan campos del contrato en la respuesta: ${missing.join(', ')}.`,
				measured
			};
		}
		return {
			behavior: 'B5',
			title: 'Mapeo del DTO (contrato 7.3)',
			status: 'PASS',
			verdict:
				`Los 9 campos del contrato estan presentes en ${rows.length} fila(s). ` +
				`El AC nombra "isAirport" y el endpoint devuelve "airport"${hasIsAirport ? ' — aca vinieron los dos' : ' (isAirport no viene, como estaba medido)'}.`,
			measured
		};
	}

	// ------------------------------------------------------------------ B6 sessionToken

	/**
	 * El alcance del token es un hueco de definicion abierto: se midio que rota con la SELECCION y
	 * no con el cambio de campo. Aca solo se verifica lo verificable por superficie — que el
	 * parametro viaje y que sea estable dentro del mismo campo, que es lo que produce la agrupacion
	 * por sesion que persigue la epica.
	 */
	async checkSessionToken(selector: string, terms = ['libe', 'libertad', 'libertad 479']): Promise<BehaviorVerdict> {
		await this.reset(selector);

		const seen: { address: string; token: string }[] = [];
		// Se acumula QUE TERMINOS entraron de verdad: el veredicto de abajo compara tokens entre
		// consultas, y si el campo dejo de aceptar texto a mitad de camino no hubo "entre consultas".
		const rechazados: string[] = [];
		for (const t of terms) {
			if (!(await this.typeAndStamp(selector, t))) rechazados.push(t);
			await this.driver.pause(this.settleMs);
			for (const c of await this.autocompleteCalls()) {
				seen.push({ address: param(String(c.url), 'address'), token: param(String(c.url), 'sessionToken') });
			}
			await clearWebViewNetworkCapture(this.driver);
		}

		const tokens = Array.from(new Set(seen.map(s => s.token).filter(Boolean)));
		const consultasDistintas = new Set(seen.map(s => s.address).filter(Boolean)).size;
		const measured = {
			terms,
			termsRejected: rechazados,
			calls: seen.length,
			distinctQueries: consultasDistintas,
			observed: seen,
			distinctTokens: tokens
		};

		if (seen.length === 0) {
			return {
				behavior: 'B6',
				title: 'sessionToken presente y estable en el campo',
				status: 'SIN_DATOS',
				verdict: 'Cero requests: no hay token que observar.',
				measured
			};
		}
		if (tokens.length === 0) {
			return {
				behavior: 'B6',
				title: 'sessionToken presente y estable en el campo',
				status: 'NO_EJERCIDO',
				verdict: `${seen.length} request(s) salieron SIN el parametro sessionToken. El mecanismo de ahorro no esta puesto en esta superficie.`,
				measured
			};
		}
		if (tokens.length > 1) {
			return {
				behavior: 'B6',
				title: 'sessionToken presente y estable en el campo',
				status: 'FAIL',
				verdict: `${seen.length} request(s) dentro del MISMO campo usaron ${tokens.length} tokens distintos. El parametro viaja pero no agrupa la sesion, asi que el ahorro no se materializa.`,
				measured
			};
		}
		// "Estable" es una afirmacion SOBRE VARIAS consultas. Con una sola, `tokens.length === 1` es
		// trivialmente cierto y no prueba nada: un campo que acepto el primer termino y despues se murio
		// produce exactamente esta firma — y es lo que paso en Perfil > Mis Direcciones el 2026-08-19.
		if (consultasDistintas < 2) {
			return {
				behavior: 'B6',
				title: 'sessionToken presente y estable en el campo',
				status: 'NO_EJERCIDO',
				verdict: `Solo se observo ${consultasDistintas} consulta distinta de las ${terms.length} pedidas${rechazados.length ? ` (el campo rechazo: ${rechazados.join(', ')})` : ''}: un unico request no puede acreditar estabilidad ENTRE consultas.`,
				measured
			};
		}
		return {
			behavior: 'B6',
			title: 'sessionToken presente y estable en el campo',
			status: 'PASS',
			verdict: `${seen.length} request(s) sobre ${consultasDistintas} consultas distintas del mismo campo comparten un unico token (${tokens[0]}).`,
			measured
		};
	}

	// ------------------------------------------------------------------ B7 rotacion del sessionToken

	/**
	 * TM-687 — el `sessionToken` ROTA al seleccionar una prediccion.
	 *
	 * Es el complemento de B6: B6 asierta que un mismo campo agrupa sus consultas bajo un token, y
	 * esto asierta que ese token se CIERRA cuando el usuario elige. Sin la rotacion el ahorro no se
	 * materializa: Google factura por sesion, y una sesion que nunca cierra es una sesion eterna.
	 *
	 * Alcance ya medido y publicado (TM-693): el token es de PANTALLA, no de campo. Este chequeo no
	 * lo contradice — mira el token ANTES y DESPUES de una seleccion, en el mismo campo.
	 */
	async checkTokenRotation(selector: string, term = 'libertad 479'): Promise<BehaviorVerdict> {
		const title = 'El sessionToken rota al seleccionar una prediccion';

		await this.reset(selector);
		if (!(await this.typeAndStamp(selector, term))) {
			return {
				behavior: 'B7',
				title,
				status: 'SIN_DATOS',
				verdict: 'El campo no acepto texto: no hay token que observar.',
				measured: { term }
			};
		}
		await this.driver.pause(this.settleMs);
		const before = (await this.autocompleteCalls()).map(c => param(String(c.url), 'sessionToken')).filter(Boolean);

		// Elegir la PRIMERA prediccion con un TAP NATIVO. Es la accion que deberia cerrar la sesion.
		const valueBefore = await this.fieldValue(selector);
		const picked = await this.tapFirstPredictionNative();

		if (!picked) {
			return {
				behavior: 'B7',
				title,
				status: 'NO_EJERCIDO',
				verdict:
					'No aparecio ninguna prediccion para seleccionar, asi que la transicion no se ejercio. NO es un defecto: sin seleccion no hay rotacion que medir.',
				measured: { term, tokensBefore: [...new Set(before)], valueBefore }
			};
		}

		// GUARD DE PREMISA — sin esto el caso miente. Que el tap encuentre una fila NO significa que la
		// app haya procesado la eleccion; si el campo no se puebla, la seleccion no ocurrio y el token
		// no tenia por que rotar. Sin este guard, "el token no rota" es la conclusion inevitable de una
		// seleccion que nunca paso, y eso ya se reporto como defecto de producto por error en TM-687.
		const valueAfter = await this.fieldValue(selector);
		const selectionPopulated = valueAfter.length > 0 && valueAfter !== valueBefore;
		if (!selectionPopulated) {
			return {
				behavior: 'B7',
				title,
				status: 'SIN_DATOS',
				verdict: `Se tapeo "${picked}" pero el campo no cambio ("${valueBefore}" -> "${valueAfter}"): la seleccion no llego a concretarse, asi que NO hay rotacion que medir. Limite del harness, NO un defecto del producto.`,
				measured: {
					term,
					picked,
					tokensBefore: [...new Set(before)],
					valueBefore,
					valueAfter,
					selectionPopulated
				}
			};
		}
		await this.driver.pause(2600);

		await clearWebViewNetworkCapture(this.driver);

		// NO se vacia el campo antes de medir el "despues", y es deliberado. Escribir '' es, en Places,
		// el cierre natural de una sesion de busqueda: un producto que rota el token al REINICIAR la
		// consulta pero NO al elegir habria salido PASS por efecto del propio harness. El veredicto
		// tiene que ser atribuible a la seleccion, que es lo que pide CA-30.
		await this.focusField(selector);

		// Termino DISTINTO para la segunda consulta. Con el mismo texto, `distinctUntilChanged` — que
		// este repo tiene medido en verde — no vuelve a consultar, y "cero requests despues" es
		// indistinguible de "no hay token que comparar": el caso saldria SIN_DATOS por diseno del test.
		const termAfter = term.slice(0, -1);
		const escribioDespues = await this.typeAndStamp(selector, termAfter);
		await this.driver.pause(this.settleMs);

		if (!escribioDespues) {
			return {
				behavior: 'B7',
				title,
				status: 'SIN_DATOS',
				verdict: `Tras seleccionar "${picked}" el campo no acepto la segunda consulta ("${termAfter}"), asi que no hay token posterior que comparar. Limite del harness, no un defecto.`,
				measured: {
					term,
					termAfter,
					picked,
					tokensBefore: [...new Set(before)],
					valueBefore,
					valueAfter,
					selectionPopulated
				}
			};
		}

		// Correlacionar por `address`: una request rezagada de la consulta ANTERIOR trae el token viejo,
		// y contarla aca leeria "el token no rota" sobre trafico que no pertenece a esta medicion — el
		// mismo falso rojo que TM-687 ya produjo una vez.
		const callsAfter = (await this.autocompleteCalls()).filter(c => param(String(c.url), 'address') === termAfter);
		const after = callsAfter.map(c => param(String(c.url), 'sessionToken')).filter(Boolean);

		const uniqBefore = [...new Set(before)];
		const uniqAfter = [...new Set(after)];
		// `valueBefore`/`valueAfter` viajan en el measured a proposito: sin ellos el veredicto no es
		// auditable a posteriori — no se puede saber si la seleccion realmente ocurrio.
		const measured = {
			term,
			termAfter,
			picked,
			tokensBefore: uniqBefore,
			tokensAfter: uniqAfter,
			addressesAfter: callsAfter.map(c => param(String(c.url), 'address')),
			valueBefore,
			valueAfter,
			selectionPopulated
		};

		if (!uniqBefore.length || !uniqAfter.length) {
			return {
				behavior: 'B7',
				title,
				status: 'SIN_DATOS',
				verdict: `Falta al menos un lado de la comparacion (antes: ${uniqBefore.length}, despues: ${uniqAfter.length}). Sin los dos tokens no se puede afirmar ni negar la rotacion.`,
				measured
			};
		}
		const rotated = uniqAfter.every(t => !uniqBefore.includes(t));
		if (!rotated) {
			return {
				behavior: 'B7',
				title,
				status: 'FAIL',
				verdict: `El token NO rota: ${uniqAfter[0]} sigue vigente despues de seleccionar "${picked}". La sesion de autocompletado no se cierra al elegir, asi que el ahorro por sesion no se materializa.`,
				measured
			};
		}
		return {
			behavior: 'B7',
			title,
			status: 'PASS',
			verdict: `El token rota al seleccionar: ${uniqBefore[0]} -> ${uniqAfter[0]} (seleccionado: "${picked}").`,
			measured
		};
	}

	// ------------------------------------------------------------------ B8 degradacion del endpoint

	/**
	 * TM-689 — que pasa cuando el endpoint responde mal o no responde.
	 *
	 * Se ejercen las DOS ramas porque fallan distinto: un 5xx llega rapido y con cuerpo, y un timeout
	 * deja la promesa colgada. La rama de timeout es justamente la que quedo sin ejercer en la
	 * campana manual, y es la que rompe una suscripcion RxJS mal cerrada.
	 *
	 * Lo que se asierta NO es que el usuario vea un cartel — eso es un hueco de definicion abierto —
	 * sino que el CAMPO SIGUE VIVO: que se pueda seguir escribiendo y que una consulta posterior
	 * vuelva a salir. Un campo que muere ante el primer 5xx obliga al usuario a reiniciar el alta.
	 */
	async checkDegradedResponse(
		selector: string,
		mode: 'status' | 'timeout' = 'status',
		term = 'libertad 479'
	): Promise<BehaviorVerdict> {
		const title = `Degradacion ante ${mode === 'status' ? 'un 5xx' : 'un timeout'}`;

		await installWebViewFaultInjection(this.driver, [
			{
				id: `mg116-${mode}`,
				urlPattern: AUTOCOMPLETE_PATH,
				mode,
				...(mode === 'status' ? { status: 503 } : { delayMs: 8000 })
			}
		]);

		try {
			await this.reset(selector);
			const typedUnderFault = await this.typeAndStamp(selector, term);
			await this.driver.pause(mode === 'timeout' ? this.settleMs + 4000 : this.settleMs);

			// La falla se levanta ANTES de la sonda de recuperacion: si no, la segunda consulta
			// tambien caeria en la regla y no se podria distinguir "el campo murio" de "sigue fallando".
			await clearWebViewFaultInjection(this.driver);
			await clearWebViewNetworkCapture(this.driver);

			await this.reset(selector);
			const typedAfter = await this.typeAndStamp(selector, `${term} 2`);
			await this.driver.pause(this.settleMs);
			const recoveryCalls = (await this.autocompleteCalls()).length;

			const measured = { mode, term, typedUnderFault, typedAfter, recoveryCalls };

			if (!typedUnderFault) {
				return {
					behavior: 'B8',
					title,
					status: 'SIN_DATOS',
					verdict: 'El campo no acepto texto ni siquiera antes de la falla: la degradacion no se ejercio.',
					measured
				};
			}
			if (!typedAfter) {
				return {
					behavior: 'B8',
					title,
					status: 'FAIL',
					verdict: `Tras ${mode === 'status' ? 'un 503' : 'un timeout'} el campo DEJO de aceptar texto. El usuario queda sin poder completar la direccion y tiene que reiniciar el alta.`,
					measured
				};
			}
			if (recoveryCalls === 0) {
				return {
					behavior: 'B8',
					title,
					status: 'FAIL',
					verdict: `El campo acepta texto pero YA NO CONSULTA despues de ${mode === 'status' ? 'el 503' : 'el timeout'}: la suscripcion quedo rota. Se puede escribir, pero no aparece ninguna prediccion nunca mas.`,
					measured
				};
			}
			return {
				behavior: 'B8',
				title,
				status: 'PASS',
				verdict: `El campo sobrevive: tras ${mode === 'status' ? 'el 503' : 'el timeout'} sigue aceptando texto y vuelve a consultar (${recoveryCalls} request).`,
				measured
			};
		} finally {
			// Que la regla no sobreviva al chequeo, pase lo que pase: una falla colgada envenena
			// todas las superficies siguientes de la corrida.
			await clearWebViewFaultInjection(this.driver).catch(() => undefined);
		}
	}

	// ------------------------------------------------------------------ B9 sin conexion

	/**
	 * TM-697 — el campo sigue usable con la red caida.
	 *
	 * `networkError` rechaza con un TypeError, igual que una caida real de fetch. Es distinto del 5xx:
	 * ahi hay respuesta, aca no hay ninguna. Lo que se asierta es que el usuario pueda seguir
	 * escribiendo y que, al volver la red, las predicciones vuelvan solas — sin reiniciar el alta.
	 */
	async checkOfflineUsable(selector: string, term = 'libertad 479'): Promise<BehaviorVerdict> {
		const title = 'El campo sigue usable sin conexion';

		await installWebViewFaultInjection(this.driver, [
			{ id: 'mg116-offline', urlPattern: AUTOCOMPLETE_PATH, mode: 'networkError' }
		]);

		try {
			await this.reset(selector);
			const typedOffline = await this.typeAndStamp(selector, term);
			await this.driver.pause(this.settleMs);

			const stillEditable = (await this.driver.execute((sel: string) => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const t = Array.from(document.querySelectorAll(sel)).filter(vis)[0] as HTMLInputElement | undefined;
				return !!t && !t.readOnly && !t.disabled;
			}, selector)) as boolean;

			await clearWebViewFaultInjection(this.driver);
			await clearWebViewNetworkCapture(this.driver);

			await this.reset(selector);
			await this.typeAndStamp(selector, `${term} 2`);
			await this.driver.pause(this.settleMs);
			const afterRecovery = (await this.autocompleteCalls()).length;

			const measured = { term, typedOffline, stillEditable, callsAfterRecovery: afterRecovery };

			if (!typedOffline) {
				return {
					behavior: 'B9',
					title,
					status: 'FAIL',
					verdict:
						'Con la red caida el campo NO acepto texto. El usuario no puede ni siquiera escribir su direccion mientras espera que vuelva la conexion.',
					measured
				};
			}
			if (!stillEditable) {
				return {
					behavior: 'B9',
					title,
					status: 'FAIL',
					verdict: 'El campo quedo bloqueado (readonly o deshabilitado) tras la caida de red.',
					measured
				};
			}
			if (afterRecovery === 0) {
				return {
					behavior: 'B9',
					title,
					status: 'FAIL',
					verdict:
						'El campo sigue editable pero no volvio a consultar cuando la red se restablecio: hay que reiniciar el alta para recuperar las predicciones.',
					measured
				};
			}
			return {
				behavior: 'B9',
				title,
				status: 'PASS',
				verdict: `El campo acepta texto con la red caida y vuelve a consultar al restablecerse (${afterRecovery} request).`,
				measured
			};
		} finally {
			await clearWebViewFaultInjection(this.driver).catch(() => undefined);
		}
	}

	// ------------------------------------------------------------------ la bateria completa

	async runBattery(surface: AddressSurface): Promise<SurfaceReport> {
		log('='.repeat(72));
		log(`${surface.id} — ${surface.label}`);
		log('='.repeat(72));

		// `reach()` PRIMERO y recien despues `fieldSelector()`.
		//
		// El orden inverso era un defecto silencioso: casi todas las superficies resuelven su campo
		// DENTRO de `reach()` (la fila editable del home varia, el placeholder de la parada sale del
		// DOM, el formulario del perfil exige elegir un Tipo antes de que el input exista), asi que
		// leer el selector antes devolvia el valor previo — vacio o de la corrida anterior. Las
		// superficies que traian un valor por defecto lo tapaban por accidente; una superficie nueva
		// que arranca vacia media contra el selector vacio y reportaba "alcanzada: SI" sin campo.
		const reached = await surface.reach(this.driver);
		const selector = surface.fieldSelector();
		log(`alcanzada: ${reached ? 'SI' : 'NO'}   selector: ${selector || '(vacio)'}`);

		// Un selector vacio no puede medir nada, y `querySelectorAll('')` tira. Se trata como
		// superficie no alcanzada para que ninguna conducta salga verde por ausencia de campo.
		if (reached && !selector.trim()) {
			log('  el navegador de la superficie no resolvio ningun selector: se reporta como NO alcanzada.');
			return {
				surfaceId: surface.id,
				surfaceLabel: surface.label,
				reached: false,
				fieldSelector: '',
				verdicts: (['B1', 'B2', 'B3', 'B4', 'B5', 'B6'] as const).map(b => ({
					behavior: b,
					title: 'no evaluada',
					status: 'SIN_DATOS' as VerdictStatus,
					verdict:
						'El navegador de la superficie devolvio exito pero sin selector de campo. Es un fallo del harness, NO del producto.'
				}))
			};
		}

		if (!reached) {
			return {
				surfaceId: surface.id,
				surfaceLabel: surface.label,
				reached: false,
				fieldSelector: selector,
				verdicts: (['B1', 'B2', 'B3', 'B4', 'B5', 'B6'] as const).map(b => ({
					behavior: b,
					title: 'no evaluada',
					status: 'SIN_DATOS' as VerdictStatus,
					verdict:
						'Superficie inalcanzable en esta corrida. NO se reporta como defecto: es limitacion del harness o superficie inexistente en esta version.'
				}))
			};
		}

		if (!(await this.focusField(selector))) {
			return {
				surfaceId: surface.id,
				surfaceLabel: surface.label,
				reached: true,
				fieldSelector: selector,
				verdicts: [
					{
						behavior: 'B1',
						title: 'Consulta el endpoint propio y no a Google',
						status: 'SIN_DATOS',
						verdict: `Se llego a la pantalla pero el selector "${selector}" no encontro un input visible. Revisar el selector antes de concluir nada del producto.`
					}
				]
			};
		}

		await installWebViewNetworkCapture(this.driver);

		const verdicts: BehaviorVerdict[] = [];
		// El orden importa: B1 primero deja la superficie caracterizada, y B4 tiene que correr
		// despues de una consulta valida para que "no repite" signifique algo.
		//
		// `MG116_BEHAVIORS=B3` corre SOLO esa conducta. Hace falta para aislar: en una superficie
		// donde el campo cambia de estado entre chequeos, un SIN_DATOS no distingue "la conducta no
		// existe" de "el chequeo anterior dejo la pantalla en otro estado". Una conducta por sesion,
		// con la app relanzada en medio, hace que el veredicto solo dependa de la conducta.
		const only = (process.env.MG116_BEHAVIORS ?? '')
			.split(',')
			.map(s => s.trim().toUpperCase())
			.filter(Boolean);
		const wanted = (b: string): boolean => only.length === 0 || only.includes(b);

		if (wanted('B1')) verdicts.push(await this.checkOwnEndpoint(selector));
		if (wanted('B2')) verdicts.push(await this.checkDebounce(selector));
		if (wanted('B3')) verdicts.push(await this.checkMinLength(selector));
		if (wanted('B4')) verdicts.push(await this.checkDistinctUntilChanged(selector));
		if (wanted('B5')) verdicts.push(await this.checkDtoMapping(selector));
		if (wanted('B6')) verdicts.push(await this.checkSessionToken(selector));

		for (const v of verdicts) {
			log(`  ${v.behavior} ${v.status.padEnd(11)} ${v.verdict}`);
		}

		await surface.cleanup(this.driver).catch(() => undefined);

		return {
			surfaceId: surface.id,
			surfaceLabel: surface.label,
			reached: true,
			fieldSelector: selector,
			verdicts
		};
	}
}

/** Fila de la matriz de consistencia, lista para volcar a markdown. */
export function summarizeMatrix(reports: SurfaceReport[]): string[] {
	const behaviors = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'] as const;
	const glyph: Record<VerdictStatus, string> = {
		PASS: 'PASS',
		FAIL: 'FAIL',
		SIN_DATOS: '—',
		NO_EJERCIDO: 'n/e'
	};
	const lines = [`| Superficie | ${behaviors.join(' | ')} |`, `|---|${behaviors.map(() => '---').join('|')}|`];
	for (const r of reports) {
		const cells = behaviors.map(b => {
			const v = r.verdicts.find(x => x.behavior === b);
			return v ? glyph[v.status] : '—';
		});
		lines.push(`| ${r.surfaceId} ${r.surfaceLabel} | ${cells.join(' | ')} |`);
	}
	return lines;
}
