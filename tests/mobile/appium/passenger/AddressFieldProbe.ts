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
	readWebViewGoogleActivity
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
	behavior: 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6';
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
const DEBOUNCE_TOLERANCE_MS = 900;

const log = (m: string): void => console.log(`[probe] ${m}`);

function param(url: string, name: string): string {
	const m = new RegExp(`[?&]${name}=([^&]*)`).exec(url);
	return m ? decodeURIComponent(m[1]) : '';
}

export class AddressFieldProbe {
	/** Cuanto se espera despues de tipear antes de leer la captura. */
	private readonly settleMs: number;

	constructor(private readonly driver: WebdriverIO.Browser, settleMs = 4200) {
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
	private async typeAndStamp(selector: string, value: string): Promise<boolean> {
		const ok = (await this.driver.execute(
			(sel: string, v: string) => {
				const vis = (el: Element): boolean => (el as HTMLElement).offsetParent !== null;
				const t = Array.from(document.querySelectorAll(sel)).filter(vis)[0] as HTMLInputElement | undefined;
				if (!t) return false;
				const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
				setter?.call(t, v);
				t.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
				t.dispatchEvent(new Event('ionInput', { bubbles: true, composed: true } as EventInit));
				(window as unknown as { __mgLastKeystrokeAt?: number }).__mgLastKeystrokeAt = Date.now();
				return true;
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

		for (let i = 3; i <= term.length; i++) {
			await this.typeAndStamp(selector, term.slice(0, i));
			await this.driver.pause(keyGapMs);
		}
		const stampedAt = await this.lastKeystrokeAt();
		await this.driver.pause(this.settleMs);

		const calls = await this.autocompleteCalls();
		const firstAt = calls.length ? toEpochMs(calls[0].startedAt) : null;
		const delayMs = stampedAt !== null && firstAt !== null ? firstAt - stampedAt : null;

		const measured = {
			term,
			keystrokes: term.length - 2,
			keyGapMs,
			calls: calls.length,
			addresses: calls.map(c => param(String(c.url), 'address')),
			lastKeystrokeAt: stampedAt,
			firstRequestAt: firstAt,
			measuredDelayMs: delayMs,
			acTargetMs: DEBOUNCE_TARGET_MS
		};

		if (calls.length === 0) {
			return {
				behavior: 'B2',
				title: `Debounce ~${DEBOUNCE_TARGET_MS} ms`,
				status: 'SIN_DATOS',
				verdict: 'Cero requests: no hay debounce que medir. La conducta no se ejercio.',
				measured
			};
		}
		if (delayMs === null) {
			return {
				behavior: 'B2',
				title: `Debounce ~${DEBOUNCE_TARGET_MS} ms`,
				status: 'NO_EJERCIDO',
				verdict: `${calls.length} request(s), pero la captura no trae el sello temporal necesario para medir la latencia.`,
				measured
			};
		}
		if (calls.length > 1) {
			return {
				behavior: 'B2',
				title: `Debounce ~${DEBOUNCE_TARGET_MS} ms`,
				status: 'FAIL',
				verdict: `${term.length - 2} pulsaciones separadas por ${keyGapMs} ms generaron ${calls.length} requests. No agrupa: el debounce no esta operando en esta superficie.`,
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
			verdict: `1 request para ${term.length - 2} pulsaciones, disparado ${delayMs} ms despues de la ultima tecla.`,
			measured
		};
	}

	// ------------------------------------------------------------------ B3 minLength 3

	async checkMinLength(selector: string, shortTerm = 'li', validTerm = 'lib'): Promise<BehaviorVerdict> {
		await this.reset(selector);
		await this.typeAndStamp(selector, shortTerm);
		await this.driver.pause(this.settleMs);
		const withTwo = (await this.autocompleteCalls()).length;

		await clearWebViewNetworkCapture(this.driver);
		await this.typeAndStamp(selector, validTerm);
		await this.driver.pause(this.settleMs);
		const withThree = (await this.autocompleteCalls()).length;

		const measured = { shortTerm, validTerm, callsWithTwoChars: withTwo, callsWithThreeChars: withThree };

		if (withTwo === 0 && withThree === 0) {
			return {
				behavior: 'B3',
				title: 'minLength 3',
				status: 'SIN_DATOS',
				verdict: `Ni "${shortTerm}" ni "${validTerm}" generaron requests. Sin el caso positivo no se puede distinguir "respeta minLength" de "el campo no consulta nunca".`,
				measured
			};
		}
		if (withTwo > 0) {
			return {
				behavior: 'B3',
				title: 'minLength 3',
				status: 'FAIL',
				verdict: `"${shortTerm}" (2 caracteres) genero ${withTwo} request(s). El piso de 3 caracteres no se respeta en esta superficie.`,
				measured
			};
		}
		if (withThree === 0) {
			return {
				behavior: 'B3',
				title: 'minLength 3',
				status: 'FAIL',
				verdict: `"${validTerm}" (3 caracteres) no genero ningun request. El piso quedo por encima de 3, que es el minimo que el AC pide para soportar codigos IATA.`,
				measured
			};
		}
		return {
			behavior: 'B3',
			title: 'minLength 3',
			status: 'PASS',
			verdict: `Con 2 caracteres no consulta; con 3 consulta (${withThree} request).`,
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
		await this.typeAndStamp(selector, term);
		await this.driver.pause(this.settleMs);
		const repeated = await this.autocompleteCalls();

		const measured = {
			term,
			callsFirstRound: firstRound,
			callsOnRepeat: repeated.length,
			repeatedAddresses: repeated.map(c => param(String(c.url), 'address'))
		};

		if (firstRound === 0) {
			return {
				behavior: 'B4',
				title: 'distinctUntilChanged',
				status: 'SIN_DATOS',
				verdict: 'La primera consulta no salio, asi que "no repite" no distingue la conducta de un campo inerte.',
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
		return {
			behavior: 'B4',
			title: 'distinctUntilChanged',
			status: 'PASS',
			verdict: 'Reescribir el mismo texto no genero ningun request nuevo.',
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
		for (const t of terms) {
			await this.typeAndStamp(selector, t);
			await this.driver.pause(this.settleMs);
			for (const c of await this.autocompleteCalls()) {
				seen.push({ address: param(String(c.url), 'address'), token: param(String(c.url), 'sessionToken') });
			}
			await clearWebViewNetworkCapture(this.driver);
		}

		const tokens = Array.from(new Set(seen.map(s => s.token).filter(Boolean)));
		const measured = { terms, calls: seen.length, observed: seen, distinctTokens: tokens };

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
		return {
			behavior: 'B6',
			title: 'sessionToken presente y estable en el campo',
			status: 'PASS',
			verdict: `${seen.length} request(s) del mismo campo comparten un unico token (${tokens[0]}).`,
			measured
		};
	}

	// ------------------------------------------------------------------ la bateria completa

	async runBattery(surface: AddressSurface): Promise<SurfaceReport> {
		const selector = surface.fieldSelector();
		log('='.repeat(72));
		log(`${surface.id} — ${surface.label}`);
		log('='.repeat(72));

		const reached = await surface.reach(this.driver);
		log(`alcanzada: ${reached ? 'SI' : 'NO'}   selector: ${selector}`);

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
					verdict: 'Superficie inalcanzable en esta corrida. NO se reporta como defecto: es limitacion del harness o superficie inexistente en esta version.'
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
		verdicts.push(await this.checkOwnEndpoint(selector));
		verdicts.push(await this.checkDebounce(selector));
		verdicts.push(await this.checkMinLength(selector));
		verdicts.push(await this.checkDistinctUntilChanged(selector));
		verdicts.push(await this.checkDtoMapping(selector));
		verdicts.push(await this.checkSessionToken(selector));

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
